/**
 * Regression tests for barcode → product name resolution.
 *
 * Run with:  npm run test:barcode
 *
 * The contract: a scan fills in a name when the code is a real retail GTIN,
 * never sends an internal SKU to a third party, and never lets a messy
 * crowd-sourced name into the form unedited.
 */

import assert from "node:assert/strict";
import {
  composeProductName,
  isLookupableCode,
  lookupProductName,
  toGtin13,
} from "../src/lib/barcode-lookup.ts";

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

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Which codes are worth looking up
// ---------------------------------------------------------------------------

test("accepts the four real GTIN lengths", () => {
  assert.equal(isLookupableCode("12345670"), true); // EAN-8
  assert.equal(isLookupableCode("036000291452"), true); // UPC-A
  assert.equal(isLookupableCode("6001234567890"), true); // EAN-13
  assert.equal(isLookupableCode("16001234567890"), true); // GTIN-14
});

test("trims the newline a hardware scanner appends", () => {
  assert.equal(isLookupableCode("  6001234567890\n"), true);
});

test("refuses internal SKUs so they never reach a third party", () => {
  for (const code of ["PROD-001", "WIDGET-9", "ABC1234567890", "600 123 456"]) {
    assert.equal(isLookupableCode(code), false, code);
  }
});

test("refuses numeric codes that are not GTIN lengths", () => {
  for (const code of ["", "   ", "1234", "123456789", "600123456789012"]) {
    assert.equal(isLookupableCode(code), false, code);
  }
});

// ---------------------------------------------------------------------------
// Normalising for the lookup
// ---------------------------------------------------------------------------

test("pads a UPC-A into EAN-13 space", () => {
  assert.equal(toGtin13("036000291452"), "0036000291452");
});

test("passes EAN-13, EAN-8 and GTIN-14 through untouched", () => {
  assert.equal(toGtin13("6001234567890"), "6001234567890");
  assert.equal(toGtin13("12345670"), "12345670");
  assert.equal(toGtin13("16001234567890"), "16001234567890");
});

test("has nothing to normalise for a non-GTIN", () => {
  assert.equal(toGtin13("PROD-001"), null);
  assert.equal(toGtin13(""), null);
});

// ---------------------------------------------------------------------------
// Building the name that lands in the form
// ---------------------------------------------------------------------------

test("prefixes the brand when the name does not already carry it", () => {
  assert.equal(
    composeProductName({ name: "Instant Noodles Chicken", brand: "Indomie" }),
    "Indomie Instant Noodles Chicken",
  );
});

test("does not repeat a brand the name already starts with", () => {
  assert.equal(
    composeProductName({ name: "Indomie Chicken", brand: "indomie" }),
    "Indomie Chicken",
  );
});

test("does not prefix a co-brand list that the name already contains", () => {
  // The real Open Food Facts payload for Nutella.
  assert.equal(
    composeProductName({ name: "Nutella", brand: "Ferrero, Nutella" }),
    "Nutella",
  );
});

test("uses only the leading brand when the list has several", () => {
  assert.equal(
    composeProductName({ name: "Gold Blend 200g", brand: "Nestlé, Nescafé" }),
    "Nestlé Gold Blend 200g",
  );
});

test("ignores a brand that is only the legal entity", () => {
  // The real Open Food Facts payload for Coca-Cola.
  assert.equal(
    composeProductName({
      name: "Coca-Cola Original",
      brand: "COCA-COLA SERVICES SA/NV",
    }),
    "Coca-Cola Original",
  );
});

test("drops a corporate suffix from the brand it does prefix", () => {
  assert.equal(
    composeProductName({ name: "Rice 5kg", brand: "ACME FOODS LTD" }),
    "ACME FOODS Rice 5kg",
  );
});

test("falls back to the generic name when there is no product name", () => {
  assert.equal(
    composeProductName({ name: null, fallback: "Sparkling water", brand: "Perrier" }),
    "Perrier Sparkling water",
  );
});

test("collapses whitespace and strips markup from crowd-sourced names", () => {
  assert.equal(
    composeProductName({ name: "  Whole   Milk <b>1L</b>  ", brand: " Peak " }),
    "Peak Whole Milk 1L",
  );
});

test("returns null when the database gave us nothing usable", () => {
  assert.equal(composeProductName({}), null);
  assert.equal(composeProductName({ name: "   ", brand: "Peak" }), null);
  assert.equal(composeProductName({ name: null, brand: null }), null);
});

test("caps a runaway label at a name-sized string", () => {
  const name = composeProductName({ name: "x".repeat(400) });
  assert.ok(name);
  assert.equal(name.length, 120);
  assert.ok(name.endsWith("…"));
});

// ---------------------------------------------------------------------------
// Talking to the app's own route handler
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;

function stubFetch(
  handler: (url: string) => Response | Promise<Response>,
): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return calls;
}

await testAsync("returns the name the route found", async () => {
  stubFetch(() =>
    Response.json({
      status: "found",
      name: "Nutella",
      brand: "Ferrero, Nutella",
      source: "openfoodfacts",
    }),
  );

  const result = await lookupProductName("3017620422003");
  assert.equal(result.status, "found");
  assert.equal(result.status === "found" ? result.name : null, "Nutella");
});

await testAsync("does not call the network for an internal SKU", async () => {
  const calls = stubFetch(() => {
    throw new Error("should not be called");
  });

  const result = await lookupProductName("PROD-001");
  assert.equal(result.status, "unsupported");
  assert.equal(calls.length, 0);
});

await testAsync("reports a miss as not-found", async () => {
  stubFetch(() => Response.json({ status: "not-found" }));
  assert.equal((await lookupProductName("6001234567890")).status, "not-found");
});

await testAsync("treats a non-JSON response as an error, not a name", async () => {
  stubFetch(
    () =>
      new Response("<html>gateway timeout</html>", {
        status: 504,
        headers: { "content-type": "text/html" },
      }),
  );
  assert.equal((await lookupProductName("6001234567890")).status, "error");
});

await testAsync("treats an unreachable route as an error", async () => {
  stubFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal((await lookupProductName("6001234567890")).status, "error");
});

globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
