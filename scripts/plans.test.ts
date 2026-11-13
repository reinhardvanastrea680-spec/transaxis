/**
 * Regression tests for plans, cycles and the demo.
 *
 * Run with:  npm run test:plans
 *
 * The contract: the pricing page, the checkout and the webhook can never
 * disagree — every price comes from one table, every "save X%" badge is
 * computed from that table, and the demo falls back to free instead of
 * locking the door.
 */

import assert from "node:assert/strict";
import {
  PLAN_LIMITS,
  SELLABLE_PLANS,
  formatNaira,
  isPaidPlan,
  limitsFor,
  priceFor,
  resolvePlanId,
  savingsPct,
  trialDaysLeft,
  trialExpired,
} from "../src/lib/plans.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

test("three sellable plans, Max included", () => {
  assert.deepEqual(SELLABLE_PLANS, ["standard", "pro", "max"]);
});

test("the monthly prices are the agreed ones", () => {
  assert.equal(priceFor("standard", "monthly"), 3_500_000); // ₦35,000
  assert.equal(priceFor("pro", "monthly"), 6_000_000); // ₦60,000
  assert.equal(priceFor("max", "monthly"), 8_500_000); // ₦85,000
});

test("every plan × cycle has a positive price", () => {
  for (const plan of SELLABLE_PLANS) {
    for (const cycle of ["monthly", "quarterly", "annual"] as const) {
      assert.ok(priceFor(plan, cycle) > 0, `${plan}:${cycle}`);
    }
  }
});

test("quarterly and yearly are cheaper per month than monthly", () => {
  for (const plan of SELLABLE_PLANS) {
    assert.ok(priceFor(plan, "quarterly") / 3 < priceFor(plan, "monthly"));
    assert.ok(priceFor(plan, "annual") / 12 < priceFor(plan, "monthly"));
  }
});

test("the yearly discount is bigger than the quarterly one", () => {
  for (const plan of SELLABLE_PLANS) {
    assert.ok(savingsPct(plan, "annual") > savingsPct(plan, "quarterly"), plan);
  }
});

test("quarterly saves 10% and yearly saves 20%, for every plan", () => {
  for (const plan of SELLABLE_PLANS) {
    assert.equal(savingsPct(plan, "quarterly"), 10, plan);
    assert.equal(savingsPct(plan, "annual"), 20, plan);
    assert.equal(savingsPct(plan, "monthly"), 0, plan);
  }
});

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

test("formats naira readably", () => {
  assert.equal(formatNaira(3_500_000), "₦35,000");
  assert.equal(formatNaira(9_450_000), "₦94,500");
  assert.equal(formatNaira(81_600_000), "₦816,000");
});

// ---------------------------------------------------------------------------
// Limits: Standard and Pro are capped, Max is not
// ---------------------------------------------------------------------------

test("Standard and Pro carry real limits", () => {
  assert.equal(PLAN_LIMITS.standard.seats, 5);
  assert.equal(PLAN_LIMITS.standard.skus, 500);
  assert.ok(Number.isFinite(PLAN_LIMITS.standard.warehouses));
  assert.ok(Number.isFinite(PLAN_LIMITS.pro.seats));
  assert.ok(Number.isFinite(PLAN_LIMITS.pro.skus));
});

test("Max is unlimited everywhere", () => {
  assert.equal(PLAN_LIMITS.max.seats, Number.POSITIVE_INFINITY);
  assert.equal(PLAN_LIMITS.max.skus, Number.POSITIVE_INFINITY);
  assert.equal(PLAN_LIMITS.max.warehouses, Number.POSITIVE_INFINITY);
  assert.equal(PLAN_LIMITS.max.historyDays, null);
  assert.equal(PLAN_LIMITS.max.podRetentionDays, null);
});

test("the demo runs on Standard's limits — what you try is what you buy", () => {
  for (const key of ["seats", "skus", "warehouses", "exports", "historyDays", "podRetentionDays"] as const) {
    assert.deepEqual(PLAN_LIMITS.trial[key], PLAN_LIMITS.standard[key], key);
  }
});

test("unknown plans fall back to free limits", () => {
  assert.deepEqual(limitsFor("nope" as never), PLAN_LIMITS.free);
});

// ---------------------------------------------------------------------------
// Plan resolution over time
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

test("a paid plan with no renewal date counts as active (grandfathered)", () => {
  assert.equal(resolvePlanId({ plan: "max", trial_ends_at: null, plan_renews_at: null }), "max");
});

test("an expired renewal drops to free", () => {
  assert.equal(
    resolvePlanId({ plan: "pro", trial_ends_at: null, plan_renews_at: new Date(Date.now() - DAY).toISOString() }),
    "free",
  );
});

test("a live renewal stays on the paid plan", () => {
  assert.equal(
    resolvePlanId({ plan: "standard", trial_ends_at: null, plan_renews_at: new Date(Date.now() + 30 * DAY).toISOString() }),
    "standard",
  );
});

test("the demo runs while it has time left, then falls back to free", () => {
  const live = { plan: "trial", trial_ends_at: new Date(Date.now() + 5 * DAY).toISOString(), plan_renews_at: null };
  const dead = { plan: "trial", trial_ends_at: new Date(Date.now() - DAY).toISOString(), plan_renews_at: null };

  assert.equal(resolvePlanId(live), "trial");
  assert.equal(resolvePlanId(dead), "free");
  assert.equal(trialExpired(live), false);
  assert.equal(trialExpired(dead), true);
  assert.ok(trialDaysLeft(live) >= 4 && trialDaysLeft(live) <= 5);
  assert.equal(trialDaysLeft(dead), 0);
});

test("an org whose demo expired still reports the expired moment", () => {
  // resolvePlanId returns "free" for it, but the UI needs to know the demo
  // ended — that is why trialExpired reads the raw row.
  const dead = { plan: "trial", trial_ends_at: new Date(Date.now() - 3 * DAY).toISOString(), plan_renews_at: null };
  assert.equal(resolvePlanId(dead), "free");
  assert.equal(trialExpired(dead), true);
});

test("null rows resolve to free", () => {
  assert.equal(resolvePlanId(null), "free");
  assert.equal(resolvePlanId(undefined), "free");
});

test("isPaidPlan recognises only the sellable tiers", () => {
  for (const plan of SELLABLE_PLANS) assert.ok(isPaidPlan(plan));
  for (const plan of ["free", "trial"] as const) assert.equal(isPaidPlan(plan), false);
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
