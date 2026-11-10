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

## Roadmap (deliberately scoped MVP)

Stage 2 (months 3-12): refine onboarding, subscription pricing, 10-20 customers.
Stage 3: multi-warehouse, procurement, accounting integrations, AI forecasting (after PMF).
Stage 4: Nigeria first, then Ghana and Kenya.

### Deliberately postponed

AI forecasting/route optimization, advanced GPS/fleet, full accounting,
customer marketplace, native mobile apps. First prove customers pay for
accurate inventory, reliable dispatch control, and staff accountability.
