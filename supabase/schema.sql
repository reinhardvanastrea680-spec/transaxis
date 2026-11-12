-- ============================================================================
-- Logistics Platform — initial schema (MVP)
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run only on a fresh project (uses create ... if not exists where
-- possible; drop/recreate is NOT done automatically).
-- ============================================================================

-- Required extensions
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Organizations (tenants). Every business record is scoped to an org.
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null default upper(substr(md5(random()::text), 1, 8)),
  created_at timestamptz not null default now(),
  unique (join_code)
);

-- ----------------------------------------------------------------------------
-- 2. Profiles (1:1 with auth.users). Holds role + org membership.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  full_name  text,
  role       text not null default 'staff'
             check (role in ('owner','admin','warehouse','dispatcher','driver','staff')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Warehouses
-- ----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  location   text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Products (per warehouse, unique SKU within an org)
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  sku           text not null,
  name          text not null,
  description   text,
  unit          text not null default 'unit',
  reorder_level int  not null default 0,
  created_at    timestamptz not null default now(),
  unique (org_id, sku)
);

-- ----------------------------------------------------------------------------
-- 5. Stock movements (event-sourced ledger). Current stock = sum of movements.
-- ----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  movement_type text not null check (movement_type in ('in','out','adjustment','transfer')),
  quantity      int  not null,
  reason        text,
  reference     text,        -- e.g. dispatch id, PO number
  performed_by  uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. Dispatches (orders)
-- ----------------------------------------------------------------------------
create table if not exists public.dispatches (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  warehouse_id          uuid references public.warehouses(id) on delete set null,
  status               text not null default 'created'
                       check (status in ('created','assigned','in_transit','delivered','failed','cancelled')),
  customer_name        text,
  customer_address     text,
  assigned_to          uuid references public.profiles(id),   -- driver
  vehicle              text,
  notes                text,
  proof_of_delivery_url text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. Dispatch items (line items)
-- ----------------------------------------------------------------------------
create table if not exists public.dispatch_items (
  id          uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  quantity    int  not null check (quantity > 0)
);

-- ----------------------------------------------------------------------------
-- 8. Vehicles
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  plate_number text not null,
  description  text,
  created_at   timestamptz not null default now(),
  unique (org_id, plate_number)
);

-- ----------------------------------------------------------------------------
-- 9. Audit logs (append-only trail for staff accountability)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_products_org            on public.products(org_id);
create index if not exists idx_stock_movements_org     on public.stock_movements(org_id);
create index if not exists idx_stock_movements_product on public.stock_movements(product_id);
create index if not exists idx_dispatches_org          on public.dispatches(org_id);
create index if not exists idx_dispatches_status      on public.dispatches(org_id, status);
create index if not exists idx_audit_logs_org          on public.audit_logs(org_id);

-- ----------------------------------------------------------------------------
-- View: current stock per product (security_invoker so RLS applies)
-- ----------------------------------------------------------------------------
create or replace view public.product_stock
with (security_invoker = true) as
select
  p.id                                                 as product_id,
  p.org_id,
  p.name,
  p.sku,
  coalesce(sum(
    case
      when sm.movement_type in ('in','adjustment') then sm.quantity
      when sm.movement_type = 'out'               then -sm.quantity
      else 0
    end
  ), 0)::int                                           as quantity_on_hand
from public.products p
left join public.stock_movements sm on sm.product_id = p.id
group by p.id, p.org_id, p.name, p.sku;

-- ----------------------------------------------------------------------------
-- Helper: current user's org_id (used by RLS policies)
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS on every table
-- ----------------------------------------------------------------------------
alter table public.organizations    enable row level security;
alter table public.profiles         enable row level security;
alter table public.warehouses       enable row level security;
alter table public.products         enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.dispatches       enable row level security;
alter table public.dispatch_items   enable row level security;
alter table public.vehicles         enable row level security;
alter table public.audit_logs       enable row level security;

-- ----------------------------------------------------------------------------
-- RLS policies (org-scoped). Drop first so re-runs are idempotent.
-- ----------------------------------------------------------------------------
drop policy if exists "org members can view own org"       on public.organizations;
drop policy if exists "org members can view profiles"       on public.profiles;
drop policy if exists "users can update own profile"       on public.profiles;
drop policy if exists "org members can manage warehouses"   on public.warehouses;
drop policy if exists "org members can manage products"     on public.products;
drop policy if exists "org members can manage stock_moves"  on public.stock_movements;
drop policy if exists "org members can manage dispatches"   on public.dispatches;
drop policy if exists "org members can manage dispatch_items" on public.dispatch_items;
drop policy if exists "org members can manage vehicles"     on public.vehicles;
drop policy if exists "org members can view audit_logs"     on public.audit_logs;
drop policy if exists "authenticated can insert audit_logs" on public.audit_logs;

create policy "org members can view own org"
  on public.organizations for select
  using (id = public.current_org_id());

create policy "org members can view profiles"
  on public.profiles for select
  using (org_id = public.current_org_id());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Trigger: a user may not change their own role or org_id (see migration 006).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.has_role(array['owner','admin']) and new.id is distinct from auth.uid() then
    return new;
  end if;
  if new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'You may not change your own role.';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'You may not change your own organization.';
    end if;
  end if;
  if not public.has_role(array['owner','admin']) then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change roles.';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'Only admins can change organizations.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create policy "org members can manage warehouses"
  on public.warehouses for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members can manage products"
  on public.products for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members can manage stock_moves"
  on public.stock_movements for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members can manage dispatches"
  on public.dispatches for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members can manage dispatch_items"
  on public.dispatch_items for all
  using (exists (
    select 1 from public.dispatches d
    where d.id = public.dispatch_items.dispatch_id
      and d.org_id = public.current_org_id()
  ))
  with check (
    exists (
      select 1 from public.dispatches d
      where d.id = public.dispatch_items.dispatch_id
        and d.org_id = public.current_org_id()
    )
    and exists (
      select 1 from public.products p
      where p.id = public.dispatch_items.product_id
        and p.org_id = public.current_org_id()
    )
  );

create policy "org members can manage vehicles"
  on public.vehicles for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members can view audit_logs"
  on public.audit_logs for select
  using (org_id = public.current_org_id());

create policy "authenticated can insert audit_logs"
  on public.audit_logs for insert
  with check (org_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- org_id stays null until the user creates/joins an organization in-app.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Done. Next steps:
--   1. Run this script in Supabase SQL Editor.
--   2. In the app, create an organization on first login and link the profile.
--   3. Add more granular role-based policies (e.g. drivers can only update
--      their assigned dispatches) as needed.
-- ----------------------------------------------------------------------------
