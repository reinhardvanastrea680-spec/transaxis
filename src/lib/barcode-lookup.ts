/**
 * Barcode → product name.
 *
 * A barcode carries a number, never a name. When a scan resolves to a code we
 * have never seen, the only way to fill in the product name without making the
 * user type it is to ask a public product database.
 *
 * Three rules keep that safe:
 *
 *   1. Only real retail GTINs are looked up (8, 12, 13 or 14 digits). An
 *      internal code like `PROD-001` never leaves the device.
 *   2. A lookup is always best-effort. Every failure comes back as a status the
 *      UI renders as a hint — never as an error that blocks creating the
 *      product.
 *   3. The result is only a *suggestion*. It fills an editable field; nothing is
 *      written to the database until the user submits the form.
 *
 * The pure helpers live here (no imports) so `scripts/barcode-lookup.test.ts`
 * can exercise them under plain `node`.
 */

/** GTIN lengths in the wild: EAN-8, UPC-A, EAN-13, GTIN-14 (case codes). */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Product names are stored in a `text` column, but a 400-character label
 * scraped from a crowd-sourced database is not a product name. */
const MAX_NAME_LENGTH = 120;

export type BarcodeLookup =
  | { status: "found"; name: string; brand: string | null; source: string }
  | { status: "not-found" }
  /** Not a retail GTIN — nothing sensible to query. */
  | { status: "unsupported" }
  | { status: "error"; message: string };

/**
 * True when the code is worth sending to a product database.
 *
 * Deliberately does **not** validate the GS1 check digit: plenty of suppliers
 * print codes that fail it, and a failed check digit is not a reason to deny
 * the user a name. A numeric length check is enough to stop the endpoint being
 * used as a general-purpose proxy.
 */
export function isLookupableCode(raw: string): boolean {
  const code = raw.trim();
  if (!/^\d+$/.test(code)) return false;
  return GTIN_LENGTHS.has(code.length);
}

/**
 * UPC-A is stored in EAN-13 space with a leading zero, so a 12-digit code has
 * to be padded before it can be queried. Everything else is queried as printed.
 */
export function toGtin13(raw: string): string | null {
  const code = raw.trim();
  if (!isLookupableCode(code)) return null;
  return code.length === 12 ? `0${code}` : code;
}

/**
 * Corporate words that appear in `brands` but are never part of what a person
 * calls the product: "COCA-COLA SERVICES SA/NV" is the bottler, "Coca-Cola" is
 * the drink.
 */
const CORPORATE_WORDS = new Set([
  "sa",
  "nv",
  "bv",
  "ag",
  "ab",
  "as",
  "oy",
  "plc",
  "ltd",
  "limited",
  "inc",
  "llc",
  "gmbh",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "holdings",
  "international",
  "services",
  "distribution",
  "industries",
  "spa",
  "srl",
  "sas",
  "sarl",
  "pte",
  "kk",
]);

/** Meaningful tokens: 3+ characters, not a corporate suffix. */
function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !CORPORATE_WORDS.has(word));
}

/** Drop trailing corporate words so the prefix reads like a brand. */
function displayBrand(brand: string): string | null {
  const words = (cleanText(brand) ?? "").split(" ").filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, "");
    if (!CORPORATE_WORDS.has(last)) break;
    words.pop();
  }
  const label = words.join(" ").trim();
  return label.length > 0 ? label : null;
}

/**
 * Build a single display name from the fields a product database returns.
 *
 * The `brands` field is a list, not a name: Open Food Facts returns
 * `"Ferrero, Nutella"` for a jar whose product name is already `"Nutella"`.
 * Prefixing blindly produces "Ferrero, Nutella Nutella", so the brand is only
 * added when none of its meaningful words already appears in the name.
 */
export function composeProductName(input: {
  name?: string | null;
  brand?: string | null;
  fallback?: string | null;
}): string | null {
  const name = cleanText(input.name) ?? cleanText(input.fallback);
  if (!name) return null;

  const brands = (input.brand ?? "")
    .split(/[,/|]+/)
    .map((part) => cleanText(part))
    .filter((part): part is string => Boolean(part));

  if (brands.length === 0) return truncate(name);

  const brandWords = brands.flatMap(tokens);
  if (brandWords.length === 0) return truncate(name); // e.g. brand "Ltd"

  const nameWords = new Set(tokens(name));
  if (brandWords.some((word) => nameWords.has(word))) return truncate(name);

  const label = displayBrand(brands[0]);
  return truncate(label ? `${label} ${name}` : name);
}

/** Strip markup and collapse whitespace — crowd-sourced names are messy. */
function cleanText(value?: string | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function truncate(value: string): string {
  if (value.length <= MAX_NAME_LENGTH) return value;
  return `${value.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`;
}

/** The lookup is a nicety; never let it hold up the form for long. */
const LOOKUP_TIMEOUT_MS = 7000;

/**
 * Ask the app's own route handler (which talks to the databases server-side, so
 * keys and rate limits stay off the client).
 *
 * Never throws — callers switch on `status`.
 */
export async function lookupProductName(raw: string): Promise<BarcodeLookup> {
  const code = raw.trim();
  if (!isLookupableCode(code)) return { status: "unsupported" };

  try {
    const response = await fetch(`/api/barcode/${encodeURIComponent(code)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | BarcodeLookup
      | null;

    if (body && typeof body.status === "string") return body;

    return {
      status: "error",
      message: "The product database returned an unexpected response.",
    };
  } catch {
    return { status: "error", message: "Could not reach the product database." };
  }
}
