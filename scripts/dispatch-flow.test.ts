/**
 * Regression tests for the dispatch state machine.
 *
 * Run with:  npm run test:dispatch
 *
 * The contract these lock down:
 *   - A driver can only ever move their OWN run forward, one step at a time.
 *   - "assigned" is never a status a user can set — it is a side-effect of
 *     attaching a driver, and only the owner may do that.
 *   - "delivered_pending" is never a status a user can set either — it is the
 *     side-effect of uploading evidence.
 *   - A driver can never close a delivery. Confirming is an office sign-off on
 *     evidence the driver supplied.
 */

import assert from "node:assert/strict";
import {
  transitionsFor,
  checkTransition,
  transitionRequiresPod,
  transitionRequiresExistingPod,
} from "../src/lib/dispatch-flow.ts";
import type { TransitionContext } from "../src/lib/dispatch-flow.ts";
import { can } from "../src/lib/permissions.ts";

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

const DRIVER = { canUpdateAny: false, canUpdateOwn: true, canConfirm: false };
const OFFICE = { canUpdateAny: true, canUpdateOwn: true, canConfirm: true };
const OFFICE_NO_CONFIRM = {
  canUpdateAny: true,
  canUpdateOwn: true,
  canConfirm: false,
};
const NOBODY = { canUpdateAny: false, canUpdateOwn: false, canConfirm: false };

const STATUSES = [
  "created",
  "assigned",
  "in_transit",
  "delivered_pending",
  "delivered",
  "failed",
  "cancelled",
];

type Ctx = Omit<TransitionContext, "status" | "isMine">;

const targetsFor = (status: string, ctx: Ctx, isMine = true) =>
  transitionsFor({ status, isMine, ...ctx }).map((t) => t.to);

// ---------------------------------------------------------------------------
// A driver can never create an "assigned" state
// ---------------------------------------------------------------------------

test("driver gets no actions on a created dispatch", () => {
  assert.deepEqual(transitionsFor({ status: "created", isMine: true, ...DRIVER }), []);
});

test("driver cannot set assigned from any state", () => {
  for (const status of STATUSES) {
    for (const isMine of [true, false]) {
      assert.ok(
        !targetsFor(status, DRIVER, isMine).includes("assigned"),
        `driver could reach "assigned" from "${status}" (isMine=${isMine})`,
      );
    }
  }
});

test("checkTransition rejects a driver trying to set assigned", () => {
  const error = checkTransition(
    { status: "created", isMine: true, ...DRIVER },
    "assigned",
  );
  assert.ok(error, "expected an error");
});

test("checkTransition rejects a driver on someone else's run", () => {
  const error = checkTransition(
    { status: "assigned", isMine: false, ...DRIVER },
    "in_transit",
  );
  assert.ok(error, "expected an error");
});

// ---------------------------------------------------------------------------
// The driver's two moves
// ---------------------------------------------------------------------------

test("driver on an assigned run can only mark picked up", () => {
  const t = transitionsFor({ status: "assigned", isMine: true, ...DRIVER });
  assert.equal(t.length, 1);
  assert.equal(t[0].to, "in_transit");
  assert.equal(t[0].label, "Mark picked up");
  assert.ok(!t[0].danger);
});

test("driver on a picked-up run can only send proof, which requires a photo", () => {
  const t = transitionsFor({ status: "in_transit", isMine: true, ...DRIVER });
  assert.equal(t.length, 1);
  assert.equal(t[0].to, "delivered_pending");
  assert.equal(t[0].requiresPod, true);
  // Sending proof must not itself require pre-existing evidence — the photo is
  // what the driver is about to take.
  assert.ok(!t[0].requiresExistingPod);
});

test("driver never gets cancel or fail", () => {
  for (const status of STATUSES) {
    const targets = targetsFor(status, DRIVER);
    assert.ok(!targets.includes("cancelled"), `driver could cancel from "${status}"`);
    assert.ok(!targets.includes("failed"), `driver could fail from "${status}"`);
  }
});

test("a role with no status capability gets nothing", () => {
  for (const status of STATUSES) {
    assert.deepEqual(transitionsFor({ status, isMine: true, ...NOBODY }), []);
  }
});

// ---------------------------------------------------------------------------
// Two-stage delivery: the driver can never close a run
// ---------------------------------------------------------------------------

test("driver cannot reach delivered from any status", () => {
  for (const status of STATUSES) {
    for (const isMine of [true, false]) {
      assert.ok(
        !targetsFor(status, DRIVER, isMine).includes("delivered"),
        `driver could close a delivery from "${status}" (isMine=${isMine})`,
      );
    }
  }
});

test("a driver's own pending delivery offers no further action", () => {
  assert.deepEqual(
    transitionsFor({ status: "delivered_pending", isMine: true, ...DRIVER }),
    [],
  );
});

test("checkTransition tells a driver why they cannot confirm", () => {
  const error = checkTransition(
    { status: "delivered_pending", isMine: true, ...DRIVER },
    "delivered",
  );
  assert.ok(error, "expected an error");
  assert.match(error!, /office/i);
});

test("delivered_pending is not a status a driver can set directly", () => {
  // Only reachable via evidence upload (pod-actions.ts), never via a status tap.
  for (const status of STATUSES) {
    if (status === "in_transit") continue; // the legitimate evidence path
    assert.ok(
      !targetsFor(status, DRIVER).includes("delivered_pending"),
      `driver could jump to "delivered_pending" from "${status}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// Office path
// ---------------------------------------------------------------------------

test("assigned is never a transition target for any role", () => {
  for (const status of STATUSES) {
    for (const ctx of [DRIVER, OFFICE]) {
      assert.ok(
        !targetsFor(status, ctx).includes("assigned"),
        `"assigned" was offered as a transition from "${status}"`,
      );
    }
  }
});

test("office can pick up and cancel an assigned run", () => {
  assert.deepEqual(targetsFor("assigned", OFFICE, false), ["in_transit", "cancelled"]);
});

test("office records proof rather than closing directly from in transit", () => {
  assert.deepEqual(targetsFor("in_transit", OFFICE, false), [
    "delivered_pending",
    "failed",
  ]);
  assert.equal(
    transitionRequiresPod({ status: "in_transit", isMine: false, ...OFFICE }, "delivered_pending"),
    true,
  );
});

test("office confirms a pending delivery, and only with evidence on file", () => {
  assert.deepEqual(targetsFor("delivered_pending", OFFICE, false), [
    "delivered",
    "failed",
  ]);
  assert.equal(
    transitionRequiresExistingPod(
      { status: "delivered_pending", isMine: false, ...OFFICE },
      "delivered",
    ),
    true,
  );
});

test("office without the confirm capability cannot close a delivery", () => {
  assert.deepEqual(targetsFor("delivered_pending", OFFICE_NO_CONFIRM, false), [
    "failed",
  ]);
});

test("delivered, failed and cancelled are terminal", () => {
  for (const status of ["delivered", "failed", "cancelled"]) {
    assert.deepEqual(transitionsFor({ status, isMine: true, ...OFFICE }), []);
  }
});

test("delivered_pending is not terminal — it still needs a decision", () => {
  assert.ok(
    transitionsFor({ status: "delivered_pending", isMine: true, ...OFFICE }).length > 0,
  );
});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

test("only the owner can assign a driver", () => {
  assert.equal(can("owner", "dispatch.assign"), true);
  assert.equal(can("admin", "dispatch.assign"), false);
  assert.equal(can("dispatcher", "dispatch.assign"), false);
  assert.equal(can("warehouse", "dispatch.assign"), false);
  assert.equal(can("driver", "dispatch.assign"), false);
  assert.equal(can("staff", "dispatch.assign"), false);
});

test("a driver cannot create a dispatch either", () => {
  assert.equal(can("driver", "dispatch.create"), false);
  assert.equal(can("driver", "dispatch.delete"), false);
});

test("a driver cannot confirm deliveries", () => {
  assert.equal(can("driver", "dispatch.confirm"), false);
});

test("the office can confirm deliveries", () => {
  assert.equal(can("owner", "dispatch.confirm"), true);
  assert.equal(can("admin", "dispatch.confirm"), true);
  assert.equal(can("dispatcher", "dispatch.confirm"), true);
  assert.equal(can("staff", "dispatch.confirm"), false);
  assert.equal(can("warehouse", "dispatch.confirm"), false);
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
