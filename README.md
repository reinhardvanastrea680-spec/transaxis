# Logistics Platform (MVP)

Web-based operations platform for logistics businesses: accurate inventory,
reliable dispatch control, and staff accountability. Built for the Nigerian
market first, with regional expansion (Ghana, Kenya) planned after
product-market fit.

## Stack

- Framework: Next.js (App Router) + React 19 + TypeScript
- Styling: Tailwind CSS v4
- Auth: Supabase Auth (email/password, OAuth-ready)
- Database: PostgreSQL via Supabase
- Hosting: Vercel

## Getting started

1. Copy .env.local.example to .env.local and fill in your Supabase
   project URL and anon key.
2. Install dependencies: npm install
3. Run the dev server: npm run dev (http://localhost:3000)
4. Build for production: npm run build

## Project structure

src/
  app/            # Next.js App Router pages & route handlers
    login/        # sign in / sign up
    auth/callback # OAuth/magic-link callback
    dashboard/    # protected dashboard
    inventory/    # stock levels, movements (placeholder)
    dispatch/     # orders, assignment, POD (placeholder)
    staff/        # accounts, roles, audit logs (placeholder)
  lib/
    supabase/     # browser + server clients + middleware
  middleware.ts   # session refresh

## Architecture (5 layers)

1. User interface - React + Next.js
2. Application logic - validation, permissions, stock calculations, approvals
3. Database access - secure server operations (Server Components / Route Handlers)
4. PostgreSQL - products, stock movements, dispatches, users, reports
5. Monitoring & security - audit logs, backups, error tracking, access control

## Environments and domains

Production is served at **https://transaxis.com.ng** (Vercel, region `lhr1`).

| Host | Behaviour |
| --- | --- |
| `transaxis.com.ng` | canonical, serves the app |
| `www.transaxis.com.ng` | 308 → apex, path preserved |
| `http://…` | 308 → `https://` |
| `transaxis.vercel.app` | still serves the app (deployment URL) |

DNS is delegated to Vercel (`ns1/ns2.vercel-dns.com`); TLS is a Vercel-managed
Let's Encrypt certificate, renewed automatically.

`NEXT_PUBLIC_SITE_URL` is the canonical origin that `getSiteUrl()` reads, and it
is what every absolute URL in the app is built from — auth callbacks, password
reset links, Paystack callbacks. It is set per environment:

| Environment | Value | Why |
| --- | --- | --- |
| Production | `https://transaxis.com.ng` | real users |
| Preview | `https://transaxis.com.ng` | preview URLs are dynamic and cannot be allowlisted in Supabase, so auth flows must land on an allowlisted host |
| Development | `http://localhost:3000` | `vercel dev` and `vercel env pull` read this; pointing it at production would make local testing emit production links |

Because `NEXT_PUBLIC_*` values are inlined at build time, **changing this variable
requires a redeploy** to take effect. Locally, `.env.local` overrides it to
`http://localhost:3000`.

Supabase must be told about these hosts separately — see
[docs/AUTH.md](docs/AUTH.md#prerequisites-supabase-dashboard).

## Roadmap (deliberately scoped MVP)

Stage 2 (months 3-12): refine onboarding, subscription pricing, 10-20 customers.
Stage 3: multi-warehouse, procurement, accounting integrations, AI forecasting (after PMF).
Stage 4: Nigeria first, then Ghana and Kenya.

### Deliberately postponed

AI forecasting/route optimization, advanced GPS/fleet, full accounting,
customer marketplace, native mobile apps. First prove customers pay for
accurate inventory, reliable dispatch control, and staff accountability.
