/**
 * Regression tests for the shared stock-status rule.
 *
 * Run with:  npm run test:stock
 *
 * These assert the user-visible contract:
 *   - quantity 0                     -> "Out of stock"  (never "Low stock")
 *   - quantity below a set level     -> "Low stock"
 *   - quantity at/above the level    -> "In stock"
 */

import assert from "node:assert/strict";
import { getStockStatus, isLowStock, isOutOfStock } from "../src/lib/stock-status.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
  }
}

// --- Out of stock wins over every other state -------------------------------

test("zero stock is Out of stock, not Low stock", () => {
  const result = getStockStatus(0, 10);
  assert.equal(result.status, "out_of_stock");
  assert.equal(result.label, "Out of stock");
});

test("zero stock with a set reorder level is Out of stock", () => {
  const result = getStockStatus(0, 5);
  assert.equal(result.status, "out_of_stock");
  assert.equal(result.label, "Out of stock");
  assert.equal(result.tone, "danger");
});

test("zero stock with NO reorder level is Out of stock (not OK)", () => {
  // The old inlined rule was `reorder_level > 0 && onHand < reorder_level`,
  // which rendered a green "OK" badge for an empty product.
  const result = getStockStatus(0, 0);
  assert.equal(result.status, "out_of_stock");
  assert.equal(result.label, "Out of stock");
});

test("missing stock record (undefined) is treated as out of stock", () => {
  const result = getStockStatus(undefined, 10);
  assert.equal(result.status, "out_of_stock");
});

test("null stock is treated as out of stock", () => {
  const result = getStockStatus(null, 10);
  assert.equal(result.status, "out_of_stock");
});

test("negative stock is treated as out of stock", () => {
  const result = getStockStatus(-3, 10);
  assert.equal(result.status, "out_of_stock");
});

// --- Low stock --------------------------------------------------------------

test("stock below the reorder level is Low stock", () => {
  const result = getStockStatus(4, 10);
  assert.equal(result.status, "low_stock");
  assert.equal(result.label, "Low stock");
  assert.equal(result.tone, "warn");
});

test("stock one below the reorder level is Low stock", () => {
  const result = getStockStatus(9, 10);
  assert.equal(result.status, "low_stock");
});

test("stock equal to the reorder level is In stock", () => {
  const result = getStockStatus(10, 10);
  assert.equal(result.status, "in_stock");
  assert.equal(result.label, "In stock");
});

test("stock above the reorder level is In stock", () => {
  const result = getStockStatus(120, 10);
  assert.equal(result.status, "in_stock");
});

test("positive stock with no reorder level is In stock", () => {
  const result = getStockStatus(5, 0);
  assert.equal(result.status, "in_stock");
});

test("positive stock with undefined reorder level is In stock", () => {
  const result = getStockStatus(5, undefined);
  assert.equal(result.status, "in_stock");
});

// --- Predicates -------------------------------------------------------------

test("isOutOfStock is true only at zero or below", () => {
  assert.equal(isOutOfStock(0), true);
  assert.equal(isOutOfStock(-1), true);
  assert.equal(isOutOfStock(undefined), true);
  assert.equal(isOutOfStock(1), false);
});

test("isLowStock excludes zero and excludes missing thresholds", () => {
  assert.equal(isLowStock(4, 10), true);
  assert.equal(isLowStock(0, 10), false);
  assert.equal(isLowStock(5, 0), false);
  assert.equal(isLowStock(50, 10), false);
});

// --- Boundary sweep ---------------------------------------------------------

test("boundary sweep: status is ordered out -> low -> in", () => {
  const expectations: Array<[number, number, string]> = [
    [0, 10, "out_of_stock"],
    [1, 10, "low_stock"],
    [9, 10, "low_stock"],
    [10, 10, "in_stock"],
    [11, 10, "in_stock"],
    [0, 1, "out_of_stock"],
    [1, 1, "in_stock"],
  ];
  for (const [qty, reorder, expected] of expectations) {
    assert.equal(
      getStockStatus(qty, reorder).status,
      expected,
      `qty=${qty} reorder=${reorder} should be ${expected}`,
    );
  }
});

// --- Report -----------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nFAIL  ${failures.length} failing, ${passed} passing\n`);
  for (const f of failures) console.error(`  x ${f}\n`);
  process.exit(1);
}

console.log(`PASS  ${passed} assertions groups passed`);
