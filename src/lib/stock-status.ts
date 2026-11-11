/**
 * Shared stock status derivation.
 *
 * Every surface that labels a product's stock (inventory table, dashboard
 * alerts, CSV export) must agree, so the rule lives here instead of being
 * re-inlined per page.
 *
 * Three states, evaluated in order:
 *   1. Nothing on hand            -> out_of_stock
 *   2. On hand below the reorder
 *      level (threshold is set)   -> low_stock
 *   3. Otherwise                  -> in_stock
 */

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";

export type StockStatusTone = "danger" | "warn" | "brand";

export type StockStatusInfo = {
  status: StockStatus;
  label: string;
  tone: StockStatusTone;
};

function toNumber(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Derive the stock status for a product.
 *
 * A product is out of stock whenever its quantity on hand reaches zero,
 * regardless of whether a reorder level has been configured. "Low stock"
 * requires a positive reorder level that the current quantity falls under.
 */
export function getStockStatus(
  onHand: number | null | undefined,
  reorderLevel: number | null | undefined,
): StockStatusInfo {
  const quantity = toNumber(onHand);
  const reorder = toNumber(reorderLevel);

  if (quantity <= 0) {
    return { status: "out_of_stock", label: "Out of stock", tone: "danger" };
  }

  if (reorder > 0 && quantity < reorder) {
    return { status: "low_stock", label: "Low stock", tone: "warn" };
  }

  return { status: "in_stock", label: "In stock", tone: "brand" };
}

/** True when the product has no units on hand. */
export function isOutOfStock(
  onHand: number | null | undefined,
): boolean {
  return toNumber(onHand) <= 0;
}

/** True when the product has stock but sits below its reorder level. */
export function isLowStock(
  onHand: number | null | undefined,
  reorderLevel: number | null | undefined,
): boolean {
  const quantity = toNumber(onHand);
  const reorder = toNumber(reorderLevel);
  return quantity > 0 && reorder > 0 && quantity < reorder;
}
