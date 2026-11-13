# Plans, billing and proof of delivery

Everything needed to turn this on in production, in the order it has to happen.

## 1. Plan matrix

| | Free | Trial (14 days) | Growth | Operations |
|---|---|---|---|---|
| Warehouses | 1 | ∞ | 3 | ∞ |
| Team members | 3 | ∞ | 15 | ∞ |
| Products | 100 | ∞ | ∞ | ∞ |
| Dispatches | **∞** | ∞ | ∞ | ∞ |
| Stock ledger, stocktaking | ✅ | ✅ | ✅ | ✅ |
| Driver assignment, POD photos | ✅ | ✅ | ✅ | ✅ |
| History / audit trail | 30 days | ∞ | ∞ | ∞ |
| POD photo retention | 30 days | ∞ | ∞ | ∞ |
| CSV export | ❌ | ✅ | ✅ | ✅ |
| Price | ₦0 | — | ₦25,000/mo | ₦60,000/mo |

Annual billing charges 10 months for 12.

The rule behind the matrix: **charge for team size and catalog size, never for
activity.** Dispatch volume is the daily habit, so it is unlimited everywhere.
Accuracy features (stocktaking, POD) are never gated, because a product that
cannot keep stock correct is a product the customer leaves.

Definitions live in `src/lib/plans.ts`. Change limits there, not in the pages.

## 2. Database

Run `supabase/009_plans_and_pods.sql` in the Supabase SQL Editor. It:

1. Adds `plan`, `trial_ends_at`, `plan_renews_at`, `billing_cycle` and the
   Paystack reference columns to `organizations`.
2. Grandfathers **every existing organization onto `operations`** so nobody
   loses a feature the day this lands.
3. Creates `dispatch_pods` with org-scoped RLS.
4. Creates a **private** storage bucket `pod` with policies that only allow
   writes into the caller's own `{org_id}/` prefix.
5. Documents the signed-adjustment contract (no view change needed).

New organizations get `plan = 'trial'` and `trial_ends_at = now() + 14 days` from
the column defaults — no application code required.

Then run `supabase/011_delivery_confirmation.sql`, which adds the
`delivered_pending` status and the `confirmed_at` / `confirmed_by` columns. **The
app will not work without it**: inserting the new status violates the old
`dispatches_status_check` constraint, so a driver's "Send delivery proof" would
fail at the status update.

## 3. Environment

Copy the new keys from `.env.local.example`:

```
SUPABASE_SERVICE_ROLE_KEY   # staff admin lookups, POD retention
PAYSTACK_SECRET_KEY         # server-only
PAYSTACK_PLAN_CODE_GROWTH   # optional, PLN_xxx
PAYSTACK_PLAN_CODE_OPERATIONS
CRON_SECRET                 # protects the retention job
```

Without the `PAYSTACK_PLAN_CODE_*` values the checkout still works, but it is a
one-off charge rather than a recurring subscription.

## 4. Paystack

1. Settings → API Keys & Webhooks → copy the **secret key** into
   `PAYSTACK_SECRET_KEY`.
2. Products → Plans → create two plans in **NGN** matching the prices above,
   then copy their `PLN_...` codes into the env vars.
3. Settings → API Keys & Webhooks → **Webhook URL**:

   ```
   https://<your-domain>/api/paystack/webhook
   ```

4. Test with a `sk_test_` key first, using Paystack's test cards.

The webhook is the **only** thing that activates a plan. It verifies
`x-paystack-signature` as HMAC-SHA512 over the raw body before touching the
database, so a forged request cannot grant access.

Handled events: `charge.success`, `subscription.create`,
`subscription.disable`, `subscription.not_renew`, `invoice.payment_failed`.

## 5. Retention job

`/api/cron/purge-pods` runs daily at 03:00 (see `vercel.json`). It deletes POD
storage objects and rows past the plan's retention window, storage first so a
failure never leaves a row pointing at a missing file. Protect it with
`CRON_SECRET` — Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically.

Manual run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/purge-pods
```

## 6. How proof of delivery works

Two phases, so the dispatch only changes state once the evidence exists:

```
driver taps "Send delivery proof"
  → beginPodCapture()        server mints {org_id}/{dispatch_id}/{uuid}.jpg
                             and checks the dispatch is assigned to this driver
  → browser compresses to ~300 KB (canvas, max edge 1600px, q=0.82)
  → browser uploads straight to the private bucket
  → confirmPodUpload()       probes that the object exists, inserts the row,
                             and only then sets status = delivered_pending
```

The row records `captured_at`, `lat`, `lng` and `uploaded_by`. Photos are
displayed through one-hour signed URLs generated in a single batch per page
load; the bucket is never public.

`delivered_pending` is not a finished delivery — it is evidence waiting for the
office to sign off. The run becomes `delivered` only when someone in the office
confirms it against that photo (migration 011, `dispatch.confirm`). See
`docs/DISPATCH_FLOW.md`.

A failed upload leaves the dispatch untouched and shows a retry — it never marks
something delivered with a dangling link.

Known limitation: there is no offline queue. A driver with no signal at the
doorstep has to retry. That needs an IndexedDB outbox and is the next piece of
work for field reliability.

## 7. Where limits are enforced

| Limit | Enforced in |
|---|---|
| Products | `createProduct`, `importProducts` |
| Warehouses | `createWarehouse` |
| Seats | `assignStaffToOrg`, `joinOrganization` |
| CSV export | `/reports` page |
| History window | `/reports`, `/staff` queries |
| POD retention | `/api/cron/purge-pods` |

Re-assigning an existing member does **not** consume a new seat. A join code
cannot bypass the seat limit.

## 8. CSV import

Inventory → **Import CSV**. Header row required; column order does not matter.
Recognised headers: `sku`, `name`, `unit`, `reorder_level`, `description`,
`warehouse`. Only `sku` and `name` are mandatory.

Duplicate SKUs are skipped, malformed rows are counted and reported, and rows
beyond the plan's product limit are refused rather than silently dropped.
