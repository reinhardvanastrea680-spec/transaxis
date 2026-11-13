/**
 * Regression tests for barcode scan resolution.
 *
 * Run with:  npm run test:scan
 *
 * The contract: a scan never silently does the wrong thing. Each mode has one
 * job, an unknown code is recoverable rather than a dead end, and duplicate
 * SKUs are detected instead of creating a constraint error.
 */

import assert from "node:assert/strict";
import {
  resolveScan,
  matchProductBySku,
  scanButtonLabel,
  SCAN_MODES,
} from "../src/lib/scan.ts";

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

const PRODUCTS = [
  { id: "p1", sku: "PROD-001" },
  { id: "p2", sku: "WIDGET-9" },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

test("matches a SKU case-insensitively and trims scanner whitespace", () => {
  assert.equal(matchProductBySku(PRODUCTS, "prod-001")?.id, "p1");
  assert.equal(matchProductBySku(PRODUCTS, "  WIDGET-9\n")?.id, "p2");
});

test("an empty scan matches nothing", () => {
  assert.equal(matchProductBySku(PRODUCTS, "   "), undefined);
});

// ---------------------------------------------------------------------------
// find mode
// ---------------------------------------------------------------------------

test("find mode opens the detail panel for a known item", () => {
  assert.deepEqual(resolveScan(PRODUCTS, "PROD-001", "find"), {
    action: "open-detail",
    productId: "p1",
  });
});

test("find mode never touches stock", () => {
  const outcome = resolveScan(PRODUCTS, "PROD-001", "find");
  assert.notEqual(outcome.action, "prefill-movement");
});

// ---------------------------------------------------------------------------
// receive mode
// ---------------------------------------------------------------------------

test("receive mode prefills a stock movement for a known item", () => {
  assert.deepEqual(resolveScan(PRODUCTS, "WIDGET-9", "receive"), {
    action: "prefill-movement",
    productId: "p2",
  });
});

test("receive mode does not open the detail panel", () => {
  const outcome = resolveScan(PRODUCTS, "WIDGET-9", "receive");
  assert.notEqual(outcome.action, "open-detail");
});

// ---------------------------------------------------------------------------
// Unknown codes are recoverable, not dead ends
// ---------------------------------------------------------------------------

test("an unknown code offers to create the product in every mode", () => {
  for (const mode of ["find", "receive", "create"] as const) {
    assert.deepEqual(resolveScan(PRODUCTS, "NEW-CODE-42", mode), {
      action: "prefill-new-product",
      sku: "NEW-CODE-42",
    });
  }
});

test("the prefilled SKU is trimmed", () => {
  assert.deepEqual(resolveScan(PRODUCTS, "  NEW-CODE-42\n", "find"), {
    action: "prefill-new-product",
    sku: "NEW-CODE-42",
  });
});

// ---------------------------------------------------------------------------
// create mode
// ---------------------------------------------------------------------------

test("create mode refuses to duplicate an existing SKU", () => {
  assert.deepEqual(resolveScan(PRODUCTS, "PROD-001", "create"), {
    action: "duplicate-sku",
    productId: "p1",
    sku: "PROD-001",
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("a blank scan is ignored rather than treated as a new SKU", () => {
  assert.deepEqual(resolveScan(PRODUCTS, "", "create"), { action: "ignore" });
  assert.deepEqual(resolveScan(PRODUCTS, "   ", "find"), { action: "ignore" });
});

test("every mode has a label and a hint for the picker", () => {
  assert.equal(SCAN_MODES.length, 3);
  for (const mode of SCAN_MODES) {
    assert.ok(mode.label.length > 0);
    assert.ok(mode.hint.length > 0);
  }
});

test("the opening button names the current mode, never a bare 'Scan'", () => {
  assert.equal(scanButtonLabel("find"), "Scan to find");
  assert.equal(scanButtonLabel("receive"), "Scan to receive");
  assert.equal(scanButtonLabel("create"), "Scan to add");
  for (const mode of SCAN_MODES) {
    assert.notEqual(scanButtonLabel(mode.id), "Scan");
  }
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
