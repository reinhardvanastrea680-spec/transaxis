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
  FREE_DISPATCHES_PER_MONTH,
  formatLimit,
  formatNaira,
  isPaidPlan,
  limitMessage,
  limitsFor,
  monthStartIso,
  priceFor,
  resolvePlanId,
  savingsPct,
  trialDaysLeft,
  trialExpired,
  withinLimit,
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
// Dispatch quota
//
// The free plan is capped per calendar month; the demo and every paid tier are
// not. Getting this backwards would either give the product away or block a
// paying customer mid-shift, so both directions are asserted.
// ---------------------------------------------------------------------------

test("only the free plan caps dispatches", () => {
  assert.equal(PLAN_LIMITS.free.dispatchesPerMonth, FREE_DISPATCHES_PER_MONTH);
  for (const plan of ["trial", "standard", "pro", "max"] as const) {
    assert.equal(
      PLAN_LIMITS[plan].dispatchesPerMonth,
      Number.POSITIVE_INFINITY,
      `${plan} should not cap dispatches`,
    );
  }
});

test("the free cap is a positive whole number", () => {
  assert.ok(Number.isInteger(FREE_DISPATCHES_PER_MONTH));
  assert.ok(FREE_DISPATCHES_PER_MONTH > 0);
});

test("the quota blocks at the limit, not before it", () => {
  const limit = limitsFor("free").dispatchesPerMonth;
  assert.equal(withinLimit(limit - 1, limit), true, "one short is allowed");
  assert.equal(withinLimit(limit, limit), false, "at the limit is blocked");
  assert.equal(withinLimit(limit + 1, limit), false, "over is blocked");
});

test("an unlimited plan never blocks", () => {
  const limit = limitsFor("standard").dispatchesPerMonth;
  for (const used of [0, 100, 1_000_000]) {
    assert.equal(withinLimit(used, limit), true);
  }
});

test("the quota message names the number and the plan", () => {
  const msg = limitMessage("free", "dispatches");
  assert.match(msg, new RegExp(String(FREE_DISPATCHES_PER_MONTH)));
  assert.match(msg, /dispatches a month/);
  assert.match(msg, /Free/);
  // Never "Infinity" — that is what formatLimit exists to prevent.
  assert.ok(!msg.includes("Infinity"));
});

test("formatLimit prints a word for unlimited, a number otherwise", () => {
  assert.equal(formatLimit(20), "20");
  assert.equal(formatLimit(0), "0");
  assert.equal(formatLimit(Number.POSITIVE_INFINITY), "Unlimited");
});

test("the month window starts on the 1st at 00:00 UTC", () => {
  const mid = monthStartIso(new Date("2026-11-14T13:25:00.000Z"));
  assert.equal(mid, "2026-11-01T00:00:00.000Z");

  // Last day, last hour: still the same month, not the next one.
  assert.equal(
    monthStartIso(new Date("2026-11-30T23:59:59.999Z")),
    "2026-11-01T00:00:00.000Z",
  );

  // January must not roll back into December of the previous year.
  assert.equal(
    monthStartIso(new Date("2027-01-01T00:00:00.000Z")),
    "2027-01-01T00:00:00.000Z",
  );
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
