# Transaxis — Function Document

**Version:** 0.1.0 (MVP scaffold)
**Last updated:** 2026-10-29
**Project path:** `C:\Users\User\Downloads\Anderx_Steve`
**Repository:** Git (local), branch `main`

---

## 1. Product Overview

**Transaxis** is a web-based operations platform for logistics businesses. It
provides three core capabilities:

1. **Accurate inventory** — track stock levels, movements, and adjustments with
   an event-sourced ledger.
2. **Reliable dispatch control** — create orders, assign drivers and vehicles,
   track status from creation to proof of delivery.
3. **Staff accountability** — role-based access, audit logs, and activity trails.

### Target market
- **Primary:** Small-to-medium logistics, distribution, and courier businesses
  in **Nigeria**.
- **Expansion:** Ghana, Kenya, and other African markets (Stage 4).

### Business model
- Subscription pricing (monthly/annual).
- Bootstrap-funded during validation; angel/seed funding only after
  demonstrating paying customers, retention, measurable value, and a credible
  acquisition plan.

### Core principle
> First prove that customers will pay for accurate inventory, reliable dispatch
> control, and staff accountability. Everything else is postponed.

---

## 2. Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | Framework: pages, routing, server components, server actions, API routes |
| **React 19** | Interactive UI |
| **TypeScript** (strict) | Type safety, maintainability |
| **Tailwind CSS v4** | Styling |
| **Supabase Auth** | Employee sign-in, sessions, JWT |
| **Supabase (PostgreSQL)** | Managed database, RLS, real-time (future) |
| **Vercel** | Hosting, edge functions, CI/CD |
| **Git / GitHub** | Version control, remote backup |

### Supporting libraries
- `@supabase/supabase-js` — Supabase client SDK
- `@supabase/ssr` — SSR helpers for Next.js (cookie-based sessions)
- Geist font (sans + mono) via `next/font/google`

---

## 3. Architecture (5 Layers)

```
┌─────────────────────────────────────┐
│  1. USER INTERFACE                  │  React + Next.js (App Router)
│     Browser → Server Components     │
├─────────────────────────────────────┤
│  2. APPLICATION LOGIC               │  Validation, permissions,
│     Server Actions / Route Handlers │  stock calculations, approvals
├─────────────────────────────────────┤
│  3. DATABASE ACCESS                 │  Supabase client (server/browser)
│     Secure server operations        │  RLS-enforced queries
├─────────────────────────────────────┤
│  4. POSTGRESQL DATABASE             │  Products, stock movements,
│     (Supabase)                      │  dispatches, users, reports
├─────────────────────────────────────┤
│  5. MONITORING & SECURITY           │  Audit logs, backups,
│                                     │  error tracking, access control
└─────────────────────────────────────┘
```

### Request flow
1. Browser requests a page → Next.js Server Component renders.
2. Server Component calls Supabase (server client, reads session from cookies).
3. Supabase enforces RLS → only the user's org data is returned.
4. HTML streams to the browser.
5. Client Components hydrate for interactivity.

### Auth flow
1. User signs up/in via `/login` (Supabase Auth, email+password).
2. Session stored in HTTP-only cookies (managed by `@supabase/ssr`).
3. Middleware (`src/middleware.ts`) refreshes the session on every request.
4. Protected pages call `supabase.auth.getUser()` → redirect to `/login` if no session.
5. Onboarding check: if `profile.org_id` is null → redirect to `/onboarding`.

---

## 4. Project Structure

```
Anderx_Steve/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (Navbar + main)
│   │   ├── globals.css             # Tailwind + design tokens
│   │   ├── page.tsx                # Landing page
│   │   ├── login/page.tsx          # Sign in / sign up
│   │   ├── auth/callback/route.ts  # OAuth/magic-link callback
│   │   ├── onboarding/
│   │   │   ├── page.tsx            # Create organization
│   │   │   └── actions.ts          # Server action: create org + link profile
│   │   ├── dashboard/page.tsx      # Dashboard (stats + module cards)
│   │   ├── inventory/page.tsx      # Inventory module (placeholder)
│   │   ├── dispatch/page.tsx       # Dispatch module (placeholder)
│   │   └── staff/page.tsx          # Staff module (placeholder)
│   ├── components/
│   │   └── navbar.tsx              # Top navigation (client component)
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts           # Browser Supabase client
│   │       ├── server.ts           # Server Supabase client (cookies)
│   │       ├── middleware.ts       # Session refresh helper
│   │       └── config.ts           # isSupabaseConfigured() guard
│   └── middleware.ts               # Next.js middleware (session refresh)
├── supabase/
│   ├── schema.sql                  # Full DB schema + RLS policies
│   └── onboarding.sql              # Org creation INSERT policy
├── public/                         # Static assets
├── .env.local                      # Secrets (gitignored)
├── .env.local.example              # Template for env vars
├── next.config.ts                  # Next.js config
├── tsconfig.json                   # TypeScript config
├── package.json                    # Dependencies & scripts
├── README.md                       # Quick start guide
└── docs/
    └── TRANSAXIS_FUNCTION.md       # This document
```

---

## 5. User Roles & Permissions

### Roles (stored in `profiles.role`)
| Role | Description |
|---|---|
| `owner` | Full access. Created automatically when a user creates an organization. |
| `admin` | Full access except billing/org deletion. |
| `warehouse` | Inventory management, stock movements, warehouse operations. |
| `dispatcher` | Dispatch creation, assignment, status updates. |
| `driver` | View assigned dispatches, update status, capture proof of delivery. |
| `staff` | Default role on signup. Limited access until promoted. |

### Current RLS model (MVP)
- All data is scoped to `org_id` (multi-tenant).
- Any org member can read/write all tables in their org.
- Granular role-based policies (e.g., drivers only see assigned dispatches) are **planned for Stage 3**.

### Security model
- Row Level Security (RLS) enabled on **every** table.
- `current_org_id()` helper function extracts the user's org from their profile.
- All queries are filtered by `org_id = current_org_id()`.
- `auth.uid()` identifies the authenticated user.
- Service role key is used **only** server-side (onboarding) and never exposed to the browser.

---

## 6. Database Schema

### Tables

#### `organizations` (tenants)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() |
| `name` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL, default now() |

#### `profiles` (1:1 with auth.users)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → auth.users(id) ON DELETE CASCADE |
| `org_id` | uuid | FK → organizations(id) ON DELETE CASCADE, nullable |
| `full_name` | text | |
| `role` | text | NOT NULL, default 'staff', CHECK in (owner, admin, warehouse, dispatcher, driver) |
| `created_at` | timestamptz | NOT NULL, default now() |

#### `warehouses`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NOT NULL, FK → organizations |
| `name` | text | NOT NULL |
| `location` | text | |
| `created_at` | timestamptz | NOT NULL, default now() |

#### `products`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NOT NULL, FK → organizations |
| `warehouse_id` | uuid | FK → warehouses (ON DELETE SET NULL) |
| `sku` | text | NOT NULL |
| `name` | text | NOT NULL |
| `description` | text | |
| `unit` | text | NOT NULL, default 'unit' |
| `reorder_level` | int | NOT NULL, default 0 |
| `created_at` | timestamptz | NOT NULL, default now() |
| | | UNIQUE (org_id, sku) |

#### `stock_movements` (event-sourced ledger)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NOT NULL, FK → organizations |
| `product_id` | uuid | NOT NULL, FK → products (ON DELETE CASCADE) |
| `warehouse_id` | uuid | FK → warehouses (ON DELETE SET NULL) |
| `movement_type` | text | NOT NULL, CHECK in (in, out, adjustment, transfer) |
| `quantity` | int | NOT NULL |
| `reason` | text | |
| `reference` | text | e.g. dispatch id, PO number |
| `performed_by` | uuid | FK → profiles |
| `created_at` | timestamptz | NOT NULL, default now() |

#### `dispatches`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NOT NULL, FK → organizations |
| `warehouse_id` | uuid | FK → warehouses (ON DELETE SET NULL) |
| `status` | text | NOT NULL, default 'created', CHECK in (created, assigned, in_transit, delivered, failed, cancelled) |
| `customer_name` | text | |
| `customer_address` | text | |
| `assigned_to` | uuid | FK → profiles (driver) |
| `vehicle` | text | |
| `notes` | text | |
| `proof_of_delivery_url` | text | |
| `created_by` | uuid | FK → profiles |
| `created_at` | timestamptz | NOT NULL, default now() |
| `updated_at` | timestamptz | NOT NULL, default now() |

#### `dispatch_items` (line items)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `dispatch_id` | uuid | NOT NULL, FK → dispatches (ON DELETE CASCADE) |
| `product_id` | uuid | NOT NULL, FK → products (ON DELETE RESTRICT) |
| `quantity` | int | NOT NULL, CHECK (> 0) |

#### `vehicles`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NOT NULL, FK → organizations |
| `plate_number` | text | NOT NULL |
| `description` | text | |
| `created_at` | timestamptz | NOT NULL, default now() |
| | | UNIQUE (org_id, plate_number) |

#### `audit_logs` (append-only trail)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → organizations (ON DELETE CASCADE) |
| `actor_id` | uuid | FK → profiles |
| `action` | text | NOT NULL |
| `entity_type` | text | |
| `entity_id` | uuid | |
| `metadata` | jsonb | NOT NULL, default '{}' |
| `created_at` | timestamptz | NOT NULL, default now() |

### Views
- **`product_stock`** (security_invoker = true): derives current stock per product by summing stock_movements. `quantity_on_hand = sum(in + adjustment) - sum(out)`.

### Functions
- **`current_org_id()`**: returns the org_id of the currently authenticated user.
- **`handle_new_user()`**: trigger function that auto-creates a profile row on signup.

### Triggers
- **`on_auth_user_created`**: fires after insert on `auth.users`, calls `handle_new_user()`.

### Indexes
- `idx_products_org` on products(org_id)
- `idx_stock_movements_org` on stock_movements(org_id)
- `idx_stock_movements_product` on stock_movements(product_id)
- `idx_dispatches_org` on dispatches(org_id)
- `idx_dispatches_status` on dispatches(org_id, status)
- `idx_audit_logs_org` on audit_logs(org_id)

---

## 7. User Flows

### 7.1 Sign Up
1. User visits `/login` → enters email + password → clicks "Sign up".
2. Supabase Auth creates the user in `auth.users`.
3. Trigger `on_auth_user_created` fires → inserts a row in `profiles` (id, full_name, role='staff', org_id=null).
4. App switches to sign-in mode with email/password pre-filled.
5. User clicks "Sign in" → session established → redirected to `/dashboard`.
6. Dashboard checks `profile.org_id` → null → redirects to `/onboarding`.

### 7.2 Onboarding (Create Organization)
1. User enters organization name → submits.
2. Server action (`createOrganization`) runs:
   a. Verifies user is authenticated (server client).
   b. Checks if profile already has an org_id (if yes, redirect to dashboard).
   c. Creates organization row (service role, bypasses RLS).
   d. Upserts profile with org_id + role='owner'.
   e. Returns `{ success: true }`.
3. Client navigates to `/dashboard`.
4. Dashboard reads profile → org_id present → renders dashboard.

### 7.3 Sign In (returning user)
1. User visits `/login` → enters credentials → clicks "Sign in".
2. Supabase Auth verifies → session cookie set.
3. Middleware refreshes session on next request.
4. Redirect to `/dashboard`.
5. Dashboard checks org_id → if present, renders; if null, redirects to `/onboarding`.

### 7.4 Inventory Management (planned)
1. User navigates to `/inventory`.
2. Views product list with current stock (from `product_stock` view).
3. Can add/edit products (SKU, name, unit, reorder level, warehouse).
4. Can record stock movements (in/out/adjustment/transfer) with reason + reference.
5. System derives current stock from movement ledger.
6. Low-stock alerts when quantity_on_hand < reorder_level.

### 7.5 Dispatch Management (planned)
1. User navigates to `/dispatch`.
2. Creates dispatch order: customer name/address, line items (product + quantity).
3. Assigns driver + vehicle.
4. Status transitions: created → assigned → in_transit → delivered/failed/cancelled.
5. Driver captures proof of delivery (photo/signature URL).
6. Stock movements auto-generated on dispatch creation (out) and delivery (confirmed).

### 7.6 Staff Management (planned)
1. User navigates to `/staff`.
2. Owner/admin invites new staff (creates profile with org_id + role).
3. Role assignment: owner, admin, warehouse, dispatcher, driver.
4. Audit log viewer: filter by action, entity, date range.
5. Activity trail: who did what, when.

---

## 8. Page Reference

| Route | Type | Auth | Description |
|---|---|---|---|
| `/` | Server | Public | Landing page (hero, features, CTA) |
| `/login` | Client | Public | Sign in / sign up form |
| `/auth/callback` | Route handler | Public | OAuth/magic-link callback |
| `/onboarding` | Client | Auth required | Create organization |
| `/dashboard` | Server | Auth + org | Dashboard with stats + module cards |
| `/inventory` | Server | Auth + org | Inventory module (placeholder) |
| `/dispatch` | Server | Auth + org | Dispatch module (placeholder) |
| `/staff` | Server | Auth + org | Staff module (placeholder) |

---

## 9. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Service role key (server-only, bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | Yes (OAuth) | Canonical public origin of the app, e.g. `https://transaxis.vercel.app`. Used to build the OAuth `redirectTo`. Must also be listed in Supabase's Redirect URL allowlist. |

Stored in `.env.local` (gitignored). Template in `.env.local.example`.

### OAuth redirect configuration (required)

Supabase validates the OAuth `redirectTo` against its **Redirect URL allowlist**. If the
app's origin is missing from that list, Supabase silently falls back to the project
**Site URL** (`https://<project-ref>.supabase.co`), and Google then displays the
Supabase domain on its consent screen instead of the app's domain.

Setup in the Supabase Dashboard → **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `https://transaxis.vercel.app` |
| Redirect URLs | `https://transaxis.vercel.app/auth/callback` |
| Redirect URLs | `http://localhost:3000/auth/callback` |

Also set `NEXT_PUBLIC_SITE_URL=https://transaxis.vercel.app` in Vercel env vars.
The app resolves its canonical origin in this order (`src/lib/supabase/site-url.ts`):
`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `window.location.origin`.

---

## 10. Security

### Row Level Security (RLS)
- Enabled on **every** table.
- All policies are org-scoped via `current_org_id()`.
- Default deny: no access unless a policy explicitly grants it.
- Automatic RLS enabled on new tables (recommended Supabase setting).

### Authentication
- Email/password via Supabase Auth.
- Sessions stored in HTTP-only cookies (managed by `@supabase/ssr`).
- Middleware refreshes sessions on every request.
- Service role key is **never** exposed to the browser (server-only).

### Data isolation
- Multi-tenant: every business record has `org_id`.
- Users can only access data within their organization.
- `current_org_id()` extracts org from the authenticated user's profile.

### Audit trail
- `audit_logs` table records who did what, when, on which entity.
- Append-only (no update/delete policies).

---

## 11. Roadmap (Stages)

### Stage 1 — MVP (current)
- ✅ Project scaffold (Next.js + Supabase + Tailwind)
- ✅ Auth (sign up, sign in, session management)
- ✅ Onboarding (organization creation)
- ✅ Professional UI (navbar, landing, dashboard, module pages)
- ✅ Database schema (9 tables + RLS + views + triggers)
- ⬜ Inventory CRUD (products + stock movements)
- ⬜ Dispatch CRUD (orders + line items + status)
- ⬜ Staff management (invite + roles + audit log viewer)

### Stage 2 — Repeatable sales (months 3–12)
- Refine onboarding UX
- Subscription pricing (Paystack/Flutterwave for NGN)
- Target 10–20 paying customers
- Customer feedback loop
- Basic reporting/analytics

### Stage 3 — Expand platform (after PMF evidence)
- Multi-warehouse support
- Procurement (purchase orders, suppliers)
- Accounting integrations
- Advanced fleet/delivery management
- AI-assisted forecasting (only where customers need it)
- Granular role-based permissions

### Stage 4 — Regional expansion
- Strong Nigerian customer base
- Expand to Ghana and Kenya
- Localization (currency, language)

### Deliberately postponed
- AI forecasting and route optimization
- Advanced GPS and fleet integrations
- Full accounting software
- Customer marketplace
- Separate native Android/iOS apps
- **Reason:** First prove customers will pay for accurate inventory,
  reliable dispatch control, and staff accountability.

---

## 12. Deployment

### Vercel (recommended)
1. Push code to GitHub.
2. Import project in Vercel dashboard.
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` → `https://transaxis.vercel.app`
4. Deploy. Vercel auto-detects Next.js.
5. Add custom domain (optional).
6. Configure Supabase Redirect URLs as described in §9 (OAuth redirect configuration).

### Environment
- Node.js 20+ required.
- `npm run build` must succeed before deploy.
- `npm run dev` for local development (port 3000).

---

## 13. Development Workflow

### Scripts
| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

### Git
- Branch: `main`
- Commits follow conventional-ish messages.
- `.env.local` is gitignored (never commit secrets).

### Adding a new feature
1. Create the page in `src/app/<feature>/page.tsx`.
2. Create server actions in `src/app/<feature>/actions.ts` if needed.
3. Add RLS policies in `supabase/schema.sql`.
4. Run SQL in Supabase SQL Editor.
5. Test locally, then commit.

---

## 14. Known Issues / Tech Debt

1. **Middleware deprecation**: Next.js 16 prefers `proxy.ts` over `middleware.ts`. Non-blocking; migrate later.
2. **No tests**: Unit/integration tests not yet set up.
3. **No error boundaries**: Unhandled errors show default Next.js error page.
4. **No loading states**: Pages don't show skeletons during data fetch.
5. **No toast notifications**: Using inline messages; `sonner` is installed but not wired.
6. **Org creation uses service role**: Bypasses RLS. Acceptable for onboarding but should be audited.
7. **No granular RBAC**: All org members have full access. Role-based policies needed in Stage 3.
8. **No pagination**: Lists will need pagination for large datasets.
9. **No real-time**: Supabase real-time subscriptions not yet implemented.

---

## 15. File Reference (Quick Lookup)

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout, navbar, metadata |
| `src/app/globals.css` | Tailwind + design tokens |
| `src/app/page.tsx` | Landing page |
| `src/app/login/page.tsx` | Auth (sign in / sign up) |
| `src/app/auth/callback/route.ts` | OAuth callback handler |
| `src/app/onboarding/page.tsx` | Organization creation |
| `src/app/onboarding/actions.ts` | Server action: create org + link profile |
| `src/app/dashboard/page.tsx` | Dashboard (stats + modules) |
| `src/app/inventory/page.tsx` | Inventory module |
| `src/app/dispatch/page.tsx` | Dispatch module |
| `src/app/staff/page.tsx` | Staff module |
| `src/components/navbar.tsx` | Top navigation bar |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client |
| `src/lib/supabase/middleware.ts` | Session refresh helper |
| `src/lib/supabase/config.ts` | isSupabaseConfigured() guard |
| `src/middleware.ts` | Next.js middleware (session refresh) |
| `supabase/schema.sql` | Full DB schema + RLS |
| `supabase/onboarding.sql` | Org creation INSERT policy |
| `.env.local` | Secrets (gitignored) |
| `.env.local.example` | Env var template |
| `next.config.ts` | Next.js configuration |
| `README.md` | Quick start guide |

---

*End of document.*
