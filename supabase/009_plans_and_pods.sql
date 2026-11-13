-- ============================================================================
-- Transaxis — migration 009: subscription plans + proof-of-delivery photos
--
-- Paste this ENTIRE block into the Supabase SQL Editor and click "Run".
-- Safe to run more than once.
--
-- What it does:
--   1. Adds plan / trial / Paystack columns to organizations.
--   2. Creates the dispatch_pods table (one row per delivery photo).
--   3. Creates a PRIVATE storage bucket "pod" with org-scoped RLS.
--   4. Makes stock "adjustment" movements carry a signed quantity, so a
--      stocktake shortfall actually reduces stock.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Plans on organizations
--
--   free        permanent, capped
--   trial       14 days of everything, granted on signup
--   growth      paid
--   operations  paid
--
-- Existing organizations are grandfathered onto "operations" so nothing that
-- is already running loses a feature the day this migration lands.
-- ----------------------------------------------------------------------------
alter table public.organizations add column if not exists plan text;
alter table public.organizations add column if not exists trial_ends_at timestamptz;
alter table public.organizations add column if not exists plan_renews_at timestamptz;
alter table public.organizations add column if not exists billing_cycle text;
alter table public.organizations add column if not exists paystack_customer_code text;
alter table public.organizations add column if not exists paystack_subscription_code text;
alter table public.organizations add column if not exists paystack_reference text;

update public.organizations
set plan = 'operations'
where plan is null;

alter table public.organizations alter column plan set default 'trial';
alter table public.organizations alter column plan set not null;
alter table public.organizations alter column trial_ends_at set default (now() + interval '14 days');

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'trial', 'growth', 'operations'));

alter table public.organizations drop constraint if exists organizations_billing_cycle_check;
alter table public.organizations
  add constraint organizations_billing_cycle_check
  check (billing_cycle is null or billing_cycle in ('monthly', 'annual'));

-- ----------------------------------------------------------------------------
-- 2. Proof-of-delivery photos
--
-- One row per photo. The binary lives in the "pod" storage bucket; this table
-- holds the path plus the evidence that makes the photo trustworthy:
-- when it was captured and where.
-- ----------------------------------------------------------------------------
create table if not exists public.dispatch_pods (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  dispatch_id  uuid not null references public.dispatches(id) on delete cascade,
  storage_path text not null,
  captured_at  timestamptz not null default now(),
  lat          double precision,
  lng          double precision,
  uploaded_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (storage_path)
);

create index if not exists idx_dispatch_pods_org      on public.dispatch_pods(org_id, created_at);
create index if not exists idx_dispatch_pods_dispatch on public.dispatch_pods(dispatch_id);

alter table public.dispatch_pods enable row level security;

drop policy if exists "org members can view pods"   on public.dispatch_pods;
drop policy if exists "org members can insert pods" on public.dispatch_pods;
drop policy if exists "admins can delete pods"      on public.dispatch_pods;

create policy "org members can view pods"
  on public.dispatch_pods for select
  using (org_id = public.current_org_id());

create policy "org members can insert pods"
  on public.dispatch_pods for insert
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.dispatches d
      where d.id = public.dispatch_pods.dispatch_id
        and d.org_id = public.current_org_id()
    )
  );

create policy "admins can delete pods"
  on public.dispatch_pods for delete
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- 3. Private storage bucket for POD photos
--
-- Object path convention:  {org_id}/{dispatch_id}/{uuid}.jpg
-- The first folder segment must equal the caller's org, which is what the
-- storage policies below enforce. The bucket is private, so the UI renders
-- short-lived signed URLs instead of public links.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pod', 'pod', false)
on conflict (id) do nothing;

drop policy if exists "pod objects readable by org members" on storage.objects;
drop policy if exists "pod objects insertable by org members" on storage.objects;
drop policy if exists "pod objects deletable by org members" on storage.objects;

create policy "pod objects readable by org members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pod'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "pod objects insertable by org members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pod'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "pod objects deletable by org members"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pod'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_role(array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- 4. Signed stock adjustments
--
-- The product_stock view already computes `sum(quantity)` for 'adjustment'
-- rows, so a negative quantity is subtracted correctly. This comment block
-- documents the contract; no view change is needed:
--
--   adjustment +5  -> stock goes up by 5   (found stock)
--   adjustment -5  -> stock goes down by 5 (shrinkage / miscount)
--
-- Application code must therefore send the SIGNED variance, never abs().
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. VERIFY — should return one row per column below.
-- ----------------------------------------------------------------------------
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'organizations'
  and column_name in ('plan', 'trial_ends_at', 'plan_renews_at', 'billing_cycle')
order by column_name;
