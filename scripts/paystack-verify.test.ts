/**
 * Regression tests for the checkout return trip.
 *
 * Run with:  npm run test:verify
 *
 * The contract: a reference in the URL is a hint, never an entitlement. The
 * plan, the amount and the organization all come from Paystack's verify
 * endpoint, and the transaction must belong to the organization that is
 * signed in. Get this wrong and any owner can paste a reference from someone
 * else's payment — or invent one — and take a paid plan for free.
 *
 * The webhook and the return trip share this assessment, so these tests cover
 * both paths at once.
 */

import assert from "node:assert/strict";
import {
  assessVerifiedCharge,
  metadataOf,
  normaliseCycle,
  renewalDate,
} from "../src/lib/paystack-charge.ts";

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

const ORG = "90b5d904-a3b6-4d43-b96e-d2c731b58e88";
const OTHER_ORG = "11111111-2222-3333-4444-555555555555";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    reference: "T601352516513342",
    amount: 6_000_000,
    customer: { customer_code: "CUS_xsbaq2a8cu9mao0" },
    plan: { plan_code: "PLN_4dajfdaclyqmwlv" },
    subscription: { subscription_code: "SUB_g63ynt19ktq3zsc" },
    metadata: { org_id: ORG, plan: "pro", cycle: "monthly" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

test("a successful charge for this org becomes a plan", () => {
  const result = assessVerifiedCharge({ transaction: transaction(), orgId: ORG });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.charge.plan, "pro");
  assert.equal(result.charge.cycle, "monthly");
  assert.equal(result.charge.reference, "T601352516513342");
  assert.equal(result.charge.customerCode, "CUS_xsbaq2a8cu9mao0");
  assert.equal(result.charge.subscriptionCode, "SUB_g63ynt19ktq3zsc");
  assert.equal(result.charge.planCode, "PLN_4dajfdaclyqmwlv");
});

test("the plan comes from Paystack's metadata, not the request", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ metadata: { org_id: ORG, plan: "max" } }),
    orgId: ORG,
  });
  assert.equal(result.ok && result.charge.plan, "max");
});

// ---------------------------------------------------------------------------
// The ways it must refuse
// ---------------------------------------------------------------------------

test("a transaction belonging to another organization is refused", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ metadata: { org_id: OTHER_ORG, plan: "max" } }),
    orgId: ORG,
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "wrong_org");
});

test("missing metadata is refused, not treated as a match", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ metadata: undefined }),
    orgId: ORG,
  });
  assert.equal(!result.ok && result.reason, "wrong_org");
});

test("a reference that was never paid is refused", () => {
  for (const status of ["abandoned", "failed", "reversed", "ongoing", undefined]) {
    const result = assessVerifiedCharge({
      transaction: transaction({ status }),
      orgId: ORG,
    });
    assert.equal(result.ok, false, `status ${status} must not upgrade`);
    assert.equal(!result.ok && result.reason, "not_success");
  }
});

test("a free or trial plan in metadata is not a paid plan", () => {
  for (const plan of ["free", "trial", "", undefined, 7]) {
    const result = assessVerifiedCharge({
      transaction: transaction({ metadata: { org_id: ORG, plan } }),
      orgId: ORG,
    });
    assert.equal(result.ok, false, `plan ${String(plan)} must not upgrade`);
    assert.equal(!result.ok && result.reason, "no_plan");
  }
});

test("the same reference twice does not extend the plan again", () => {
  const result = assessVerifiedCharge({
    transaction: transaction(),
    orgId: ORG,
    currentReference: "T601352516513342",
  });
  assert.equal(!result.ok && result.reason, "already_applied");
});

test("an empty reference cannot be applied", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ reference: undefined }),
    orgId: ORG,
  });
  assert.equal(!result.ok && result.reason, "no_reference");
});

test("a null or non-object transaction is malformed, not a pass", () => {
  for (const value of [null, undefined, "success", 42]) {
    const result = assessVerifiedCharge({ transaction: value, orgId: ORG });
    assert.equal(result.ok, false);
  }
});

// ---------------------------------------------------------------------------
// Shapes Paystack actually sends
// ---------------------------------------------------------------------------

test("metadata sent as a JSON string is parsed", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({
      metadata: JSON.stringify({ org_id: ORG, plan: "standard", cycle: "annual" }),
    }),
    orgId: ORG,
  });
  assert.equal(result.ok && result.charge.cycle, "annual");
});

test("a one-off charge has no subscription code and none is invented", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ subscription: undefined }),
    orgId: ORG,
  });
  assert.equal(result.ok && result.charge.subscriptionCode, null);
});

test("subscription_code at the top level is accepted too", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({
      subscription: undefined,
      subscription_code: "SUB_top_level",
    }),
    orgId: ORG,
  });
  assert.equal(result.ok && result.charge.subscriptionCode, "SUB_top_level");
});

test("plan sent as a bare string still yields a code", () => {
  const result = assessVerifiedCharge({
    transaction: transaction({ plan: "PLN_bare_string" }),
    orgId: ORG,
  });
  assert.equal(result.ok && result.charge.planCode, "PLN_bare_string");
});

// ---------------------------------------------------------------------------
// Cycle and renewal date
// ---------------------------------------------------------------------------

test("only the three known cycles survive, everything else is monthly", () => {
  assert.equal(normaliseCycle("annual"), "annual");
  assert.equal(normaliseCycle("quarterly"), "quarterly");
  assert.equal(normaliseCycle("monthly"), "monthly");
  assert.equal(normaliseCycle(undefined), "monthly");
  assert.equal(normaliseCycle("yearly"), "monthly");
  assert.equal(normaliseCycle(12), "monthly");
});

test("the renewal date lands one cycle ahead", () => {
  const from = new Date("2026-11-15T12:00:00.000Z");
  assert.equal(renewalDate("monthly", from).slice(0, 10), "2026-12-15");
  assert.equal(renewalDate("quarterly", from).slice(0, 10), "2027-02-15");
  assert.equal(renewalDate("annual", from).slice(0, 10), "2027-11-15");
});

test("the renewal date does not mutate the date it was given", () => {
  const from = new Date("2026-11-15T12:00:00.000Z");
  renewalDate("annual", from);
  assert.equal(from.toISOString(), "2026-11-15T12:00:00.000Z");
});

test("a broken metadata string is empty, not a crash", () => {
  assert.deepEqual(metadataOf("{not json"), {});
  assert.deepEqual(metadataOf(""), {});
  assert.deepEqual(metadataOf(null), {});
  assert.deepEqual(metadataOf(42), {});
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
