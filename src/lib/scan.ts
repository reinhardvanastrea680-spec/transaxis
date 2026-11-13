/**
 * Barcode scan resolution.
 *
 * A scan is just a string. What it *means* depends on what the user is trying to
 * do, so the mode is explicit rather than guessed:
 *
 *   find    — locate the item and show where it is stored
 *   receive — record stock in for it
 *   create  — onboard a new product using the code as its SKU
 *
 * This is a pure function so the three behaviours can be tested without a
 * camera, a browser, or a database.
 */

export type ScanMode = "find" | "receive" | "create";

export type ScanOutcome =
  /** Nothing usable was scanned (empty string). */
  | { action: "ignore" }
  /** `find` mode, SKU matched: open the detail panel. */
  | { action: "open-detail"; productId: string }
  /** `receive` mode, SKU matched: prefill the stock movement form. */
  | { action: "prefill-movement"; productId: string }
  /** No match, or `create` mode: start a new product with this SKU. */
  | { action: "prefill-new-product"; sku: string }
  /** `create` mode but the SKU already exists. */
  | { action: "duplicate-sku"; productId: string; sku: string };

export const SCAN_MODES: {
  id: ScanMode;
  label: string;
  /** Shown on the button that opens the scanner, so it names what will happen. */
  buttonLabel: string;
  hint: string;
}[] = [
  {
    id: "find",
    label: "Find",
    buttonLabel: "Scan to find",
    hint: "Locate the item and show where it is stored.",
  },
  {
    id: "receive",
    label: "Receive",
    buttonLabel: "Scan to receive",
    hint: "Add stock in for the scanned item.",
  },
  {
    id: "create",
    label: "Add new",
    buttonLabel: "Scan to add",
    hint: "Create a product using the scanned code as its SKU.",
  },
];

/** Label for the button that opens the scanner in the given mode. */
export function scanButtonLabel(mode: ScanMode): string {
  return SCAN_MODES.find((m) => m.id === mode)?.buttonLabel ?? "Scan";
}

/**
 * SKUs are compared trimmed and case-insensitively: a barcode scanner often
 * appends a newline or carriage return, and SKUs are conventionally
 * case-insensitive.
 */
export function matchProductBySku<T extends { id: string; sku: string }>(
  products: readonly T[],
  value: string,
): T | undefined {
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  return products.find((p) => p.sku.trim().toLowerCase() === needle);
}

export function resolveScan<T extends { id: string; sku: string }>(
  products: readonly T[],
  rawValue: string,
  mode: ScanMode,
): ScanOutcome {
  // Hardware scanners commonly emit a trailing newline; some emit whitespace
  // padding. Normalise before comparing.
  const sku = rawValue.trim();
  if (!sku) return { action: "ignore" };

  const found = matchProductBySku(products, sku);

  if (mode === "create") {
    return found
      ? { action: "duplicate-sku", productId: found.id, sku: found.sku }
      : { action: "prefill-new-product", sku };
  }

  // An unrecognised barcode used to dead-end in an error. Offer to create the
  // product instead, with the code already filled in as the SKU.
  if (!found) return { action: "prefill-new-product", sku };

  return mode === "find"
    ? { action: "open-detail", productId: found.id }
    : { action: "prefill-movement", productId: found.id };
}
