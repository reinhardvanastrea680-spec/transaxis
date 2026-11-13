/**
 * Barcode → product name, server-side.
 *
 * The browser sends the digits it read off the label; this route asks one or
 * two public product databases what they are, and returns a single display
 * name. It lives on the server for three reasons: no CORS negotiation with
 * third parties, one place to set a User-Agent (Open Food Facts rejects
 * requests without one), and the response can be cached at the edge so
 * repeated scans of the same shelf cost nothing.
 *
 * Providers, in order:
 *   1. Open Food Facts — free, no key, strong on groceries and packaged goods.
 *   2. UPCitemdb trial — free tier, no key, broader retail coverage.
 *
 * Anything else is reported as `not-found`, which the UI treats as "type the
 * name yourself" rather than an error.
 */

import {
  composeProductName,
  isLookupableCode,
  toGtin13,
} from "@/lib/barcode-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each upstream gets its own budget so one slow provider cannot eat the other. */
const TIMEOUT_MS = 4000;
const USER_AGENT = "Transaxis/1.0 (inventory barcode lookup)";

type Found = { name: string; brand: string | null; source: string };

/** Long-lived: a barcode's product does not change. Misses expire quickly. */
const HIT_CACHE = "public, max-age=86400, s-maxage=604800";
const MISS_CACHE = "public, max-age=300, s-maxage=3600";

async function fromOpenFoodFacts(code: string): Promise<Found | null> {
  const gtin = toGtin13(code);
  if (!gtin) return null;

  const url =
    `https://world.openfoodfacts.org/api/v2/product/${gtin}.json` +
    "?fields=product_name,product_name_en,generic_name,brands";

  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Cache the upstream call, not just our own response.
    next: { revalidate: 86_400 },
  });

  if (!response.ok) return null;

  const json = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      product_name_en?: string;
      generic_name?: string;
      brands?: string;
    };
  };

  if (json.status !== 1 || !json.product) return null;

  const name = composeProductName({
    name: json.product.product_name || json.product.product_name_en,
    fallback: json.product.generic_name,
    brand: json.product.brands,
  });

  return name ? { name, brand: json.product.brands ?? null, source: "openfoodfacts" } : null;
}

async function fromUpcItemDb(code: string): Promise<Found | null> {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`;

  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 86_400 },
  });

  // 429 means the daily trial quota is spent — a miss, not a failure.
  if (!response.ok) return null;

  const json = (await response.json()) as {
    code?: string;
    items?: { title?: string; brand?: string }[];
  };

  const item = json.items?.[0];
  if (!item) return null;

  const name = composeProductName({ name: item.title, brand: item.brand });
  return name ? { name, brand: item.brand ?? null, source: "upcitemdb" } : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = (raw ?? "").trim();

  if (!isLookupableCode(code)) {
    return Response.json(
      { status: "unsupported" },
      { status: 400, headers: { "cache-control": MISS_CACHE } },
    );
  }

  try {
    const found =
      (await fromOpenFoodFacts(code)) ?? (await fromUpcItemDb(code));

    if (!found) {
      return Response.json(
        { status: "not-found" },
        { headers: { "cache-control": MISS_CACHE } },
      );
    }

    return Response.json(
      { status: "found", ...found },
      { headers: { "cache-control": HIT_CACHE } },
    );
  } catch {
    // A dead provider must not look like a broken app: the caller falls back to
    // "type the name" exactly as it does for a miss.
    return Response.json(
      { status: "error", message: "Could not reach the product database." },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
