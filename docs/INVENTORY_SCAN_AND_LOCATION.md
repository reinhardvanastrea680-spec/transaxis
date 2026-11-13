# Inventory: scan modes and storage locations

Two related features that answer the same question — *"where is this thing, and
what do I do with it?"*

- **Scan modes** decide what a scanned barcode *means*.
- **Storage location** is the free-text answer to *"where is it?"*.

---

## 1. Scan modes

A barcode is just a string. What it means depends on what the user is trying to
do, so the mode is **explicit**, chosen in the scanner's segmented picker — never
guessed from context.

| Mode | Button | Barcode matches a product | Barcode matches nothing |
| --- | --- | --- | --- |
| **Find** | *Scan to find* | Opens the product detail panel, filtered to that item | Opens **Add product** with the code as the SKU and the name looked up |
| **Receive** | *Scan to receive* | Opens the stock-in form, quantity 1, barcode recorded as reference | Opens **Add product** with the code as the SKU and the name looked up |
| **Add new** | *Scan to add* | Warns that the SKU exists and opens the existing product instead of duplicating it | Opens **Add product** with the code as the SKU and the name looked up |

The default mode is **Find**, because a stock check or a pick is the most common
reason to point a scanner at a shelf.

### Why the picker exists

The original button was called *Scan*, and it always pre-filled the stock-movement
form — which quietly meant "scan to receive". That is dishonest for someone doing
a stock check, who only wants to know where the item lives. Renaming to
**Scan to receive** and adding the other two modes makes each button say exactly
what it does.

The **unknown barcode** case used to dead-end in an error. It now closes the loop
for onboarding new stock: the code is carried straight into the Add product form
as the SKU, so nobody retypes a 13-digit number.

### Implementation

The behaviour lives in a **pure function**, `resolveScan()` in
`src/lib/scan.ts`, so all three modes are testable without a camera, a browser, or
a database:

```ts
export type ScanOutcome =
  | { action: "ignore" }
  | { action: "open-detail"; productId: string }
  | { action: "prefill-movement"; productId: string }
  | { action: "prefill-new-product"; sku: string }
  | { action: "duplicate-sku"; productId: string; sku: string };
```

`inventory-client.tsx` only translates the outcome into UI state. SKU matching
(`matchProductBySku`) trims and lowercases both sides, because hardware scanners
commonly append a newline and SKUs are conventionally case-insensitive.

Tests: `scripts/scan-modes.test.ts` (12 cases), run by `npm run test:scan`.

### Filling the product name

A barcode carries a number, never a name, so "scan to add" used to land on a form
with the SKU filled and the name blank. The scan now resolves the name too.

| Code | What happens |
| --- | --- |
| Matches an existing product | Its name is already known — nothing to look up |
| 8 / 12 / 13 / 14 digits | Looked up in a public product database; the Name field is prefilled |
| Anything else (`PROD-001`, `WIDGET-9`) | No lookup. The Name field takes focus with a hint |
| Lookup misses, times out, or the provider is down | Same as above — the name is typed, nothing is blocked |

**Providers** (`src/app/api/barcode/[code]/route.ts`, server-side so no CORS and
one User-Agent): Open Food Facts first, then the UPCitemdb trial endpoint. Both
are free and key-less. Responses are cached — hits for a week at the edge, misses
for an hour — because a barcode's product never changes and a shelf gets scanned
repeatedly.

**Name assembly** (`composeProductName`) is not a plain concat: Open Food Facts
returns `brands: "Ferrero, Nutella"` for a jar already called `Nutella`, and
`"COCA-COLA SERVICES SA/NV"` for a Coke. The brand is only prefixed when none of
its meaningful words already appears in the name, corporate suffixes (`SA`,
`Ltd`, `GmbH`, …) are dropped, and names are capped at 120 characters.

**Guardrails**

- Only real GTIN lengths are sent to a third party — an internal SKU never leaves
  the device.
- The lookup result only fills an editable field; nothing is written until the
  form is submitted.
- A result that arrives after the user has typed a name, closed the form, or
  scanned again is discarded (a sequence counter, not a timer).
- A miss is not an error: the cursor moves to the Name field and the form
  submits exactly as before.

Tests: `scripts/barcode-lookup.test.ts` (22 cases), run by `npm run test:barcode`.

### Camera handling notes

- Detection runs on a **220 ms throttle**, not every animation frame — decoding
  every frame wasted CPU and produced duplicate scans.
- `onScan` / `onClose` are held in refs so a parent re-render cannot tear down and
  restart the camera mid-scan.
- Camera failures map to readable messages (permission denied, no camera, camera
  busy) instead of a raw `DOMException`.
- `BarcodeDetector` is Chromium-only. On browsers without it the scanner shows an
  unsupported message and the manual search box still works.

---

## 2. Storage location

Each product has an optional, editable **`location`** field — free text, because
every warehouse numbers its shelves differently:

> `Aisle B, Rack 3, Shelf 2`

It is deliberately not a structured (aisle/rack/shelf) schema: that would force
every site into one numbering convention and make the common case slower to enter.

### Where it appears

- **Add / edit product** — a *Storage location (optional)* input.
- **Inventory table** — a Location column (hidden below `md` to protect the
  layout on phones).
- **Product detail panel** — the loudest element on the panel, in a brand-tinted
  block, with inline **Edit / Save / Cancel / Clear**. Enter saves, Escape
  cancels.

The detail panel is what a **Scan to find** lands on, so a scan answers
*"where is it?"* in one step: scan the label → see name, description, SKU, stock
status, warehouse, and shelf position.

### Permissions

Writing the location requires `inventory.manage` — the same capability as any
other product edit. Reading it is available to anyone who can see the product.
The UI hides the edit affordance for other roles, and
`updateProductLocation()` re-checks the capability server-side.

Every change is written to the audit log as `product.location_updated` with the
new value.

### Migration

`supabase/012_product_location.sql` adds the column:

```sql
alter table public.products add column if not exists location text;
```

**This migration must be applied before locations can be saved.** Until it is:

- the inventory page still loads — `page.tsx` selects `*` and maps
  `location: p.location ?? null`, so a missing column degrades instead of crashing;
- saving shows *"Storage locations are not enabled on this database yet. An
  administrator needs to run migration 012."* rather than a raw Postgres error.

---

## Test coverage

| Suite | Command | Cases |
| --- | --- | --- |
| Stock status | `npm run test:stock` | 15 |
| Dispatch flow | `npm run test:dispatch` | 23 |
| Password policy | `npm run test:password` | 14 |
| Scan modes | `npm run test:scan` | 12 |
| Barcode → name | `npm run test:barcode` | 22 |

`npm test` runs all five.
