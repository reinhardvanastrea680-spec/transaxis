-- ============================================================================
-- Transaxis migration 003 — role-based access control (RBAC)
--
-- Until now, RLS only scoped data by organization, so every member (including
-- a driver) could do anything any member could. This migration replaces the
-- permissive policies with role-aware ones.
--
-- Role capabilities enforced at the database level:
--   owner      — everything
--   admin      — everything except org deletion
--   warehouse  — products, stock movements, warehouses; read staff list
--   dispatcher — create/assign dispatches, manage vehicles; read inventory
--   driver     — READ ONLY on inventory/products; may update ONLY dispatches
--                assigned to them, and only status + proof of delivery
--   staff      — read-only
--
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: current user's role
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. Helper: roles allowed to manage a given table
-- ---------------------------------------------------------------------------
create or replace function public.has_role(any_of text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') = any(any_of);
$$;

-- ---------------------------------------------------------------------------
-- 3. Helper: is this dispatch assigned to the current user?
-- ---------------------------------------------------------------------------
create or replace function public.is_assigned_dispatch(target_dispatch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dispatches d
    where d.id = target_dispatch
      and d.assigned_to = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. WAREHOUSES — owner/admin/warehouse can manage, everyone else reads
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage warehouses" on public.warehouses;

create policy "org members can view warehouses"
  on public.warehouses for select
  using (org_id = public.current_org_id());

create policy "warehouse managers can manage warehouses"
  on public.warehouses for all
  using (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']))
  with check (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']));

-- ---------------------------------------------------------------------------
-- 5. PRODUCTS — only owner/admin/warehouse can write. Everyone else reads.
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage products" on public.products;

create policy "org members can view products"
  on public.products for select
  using (org_id = public.current_org_id());

create policy "warehouse managers can manage products"
  on public.products for all
  using (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']))
  with check (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']));

-- ---------------------------------------------------------------------------
-- 6. STOCK MOVEMENTS — owner/admin/warehouse can write. Everyone else reads.
--    (Drivers must not be able to inflate stock.)
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage stock_moves" on public.stock_movements;

create policy "org members can view stock movements"
  on public.stock_movements for select
  using (org_id = public.current_org_id());

create policy "warehouse managers can manage stock movements"
  on public.stock_movements for all
  using (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']))
  with check (org_id = public.current_org_id() and public.has_role(array['owner','admin','warehouse']));

-- ---------------------------------------------------------------------------
-- 7. DISPATCHES — the important one.
--    - everyone in the org can READ
--    - owner/admin/dispatcher can CREATE, UPDATE, DELETE
--    - driver can UPDATE ONLY dispatches assigned to them,
--      and ONLY the status + proof_of_delivery_url columns
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage dispatches" on public.dispatches;

create policy "org members can view dispatches"
  on public.dispatches for select
  using (org_id = public.current_org_id());

create policy "dispatchers can create dispatches"
  on public.dispatches for insert
  with check (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin','dispatcher'])
  );

-- Dispatchers/owners/admins: full update of any dispatch in their org.
create policy "dispatchers can update dispatches"
  on public.dispatches for update
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin','dispatcher'])
  )
  with check (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin','dispatcher'])
  );

-- Drivers: may update ONLY dispatches assigned to them.
create policy "drivers can update assigned dispatches"
  on public.dispatches for update
  using (public.is_assigned_dispatch(id))
  with check (public.is_assigned_dispatch(id));

-- Only owner/admin can delete a dispatch.
create policy "admins can delete dispatches"
  on public.dispatches for delete
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin'])
  );

-- ---------------------------------------------------------------------------
-- 8. DISPATCH ITEMS — readable by all; written only by dispatchers.
--    Drivers may NOT add or change line items.
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage dispatch_items" on public.dispatch_items;

create policy "org members can view dispatch items"
  on public.dispatch_items for select
  using (exists (
    select 1 from public.dispatches d
    where d.id = public.dispatch_items.dispatch_id
      and d.org_id = public.current_org_id()
  ));

create policy "dispatchers can manage dispatch items"
  on public.dispatch_items for all
  using (exists (
    select 1 from public.dispatches d
    where d.id = public.dispatch_items.dispatch_id
      and d.org_id = public.current_org_id()
      and public.has_role(array['owner','admin','dispatcher'])
  ))
  with check (exists (
    select 1 from public.dispatches d
    where d.id = public.dispatch_items.dispatch_id
      and d.org_id = public.current_org_id()
      and public.has_role(array['owner','admin','dispatcher'])
  ));

-- ---------------------------------------------------------------------------
-- 9. VEHICLES — owner/admin/dispatcher manage; everyone else reads.
-- ---------------------------------------------------------------------------
drop policy if exists "org members can manage vehicles" on public.vehicles;

create policy "org members can view vehicles"
  on public.vehicles for select
  using (org_id = public.current_org_id());

create policy "dispatchers can manage vehicles"
  on public.vehicles for all
  using (org_id = public.current_org_id() and public.has_role(array['owner','admin','dispatcher']))
  with check (org_id = public.current_org_id() and public.has_role(array['owner','admin','dispatcher']));

-- ---------------------------------------------------------------------------
-- 10. PROFILES — read org roster; only admins can change roles.
--     (The separate "users can update own profile" policy stays for self-edits.)
-- ---------------------------------------------------------------------------
drop policy if exists "org members can view profiles" on public.profiles;

create policy "org members can view profiles"
  on public.profiles for select
  using (org_id = public.current_org_id());

drop policy if exists "admins can update staff roles" on public.profiles;

create policy "admins can update staff roles"
  on public.profiles for update
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin'])
  )
  with check (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin'])
  );

-- ---------------------------------------------------------------------------
-- 11. AUDIT LOGS — owner/admin/warehouse can read; everyone can insert
--     their own actions (with their own org_id).
-- ---------------------------------------------------------------------------
drop policy if exists "org members can view audit_logs" on public.audit_logs;

create policy "supervisors can view audit logs"
  on public.audit_logs for select
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner','admin','warehouse'])
  );

drop policy if exists "authenticated can insert audit_logs" on public.audit_logs;

create policy "authenticated can insert audit_logs"
  on public.audit_logs for insert
  with check (
    org_id = public.current_org_id()
    and actor_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 12. Column-level guard: drivers may only change status/proof on an
--     assigned dispatch. Enforced with a trigger because RLS is row-level.
-- ---------------------------------------------------------------------------
create or replace function public.guard_dispatch_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (server-side trusted writes) has no auth.uid(); allow it.
  if auth.uid() is null then
    return new;
  end if;

  -- Dispatchers/admins/owners have full control.
  if public.has_role(array['owner','admin','dispatcher']) then
    return new;
  end if;

  -- Everyone else: only allowed to move an ASSIGNED dispatch, and only
  -- may modify status + proof_of_delivery_url + updated_at.
  if not public.is_assigned_dispatch(new.id) then
    raise exception 'You are not assigned to this dispatch.';
  end if;

  if new.customer_name is distinct from old.customer_name
     or new.customer_address is distinct from old.customer_address
     or new.assigned_to is distinct from old.assigned_to
     or new.vehicle is distinct from old.vehicle
     or new.notes is distinct from old.notes
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.org_id is distinct from old.org_id
     or new.warehouse_id is distinct from old.warehouse_id then
    raise exception 'Drivers may only update status and proof of delivery.';
  end if;

  -- Drivers can only move forward through the delivery workflow.
  if new.status not in ('in_transit','delivered','failed') then
    raise exception 'Invalid status for this role.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_dispatch_update on public.dispatches;

create trigger guard_dispatch_update
  before update on public.dispatches
  for each row execute function public.guard_dispatch_update();

-- ---------------------------------------------------------------------------
-- 13. Drivers only ever see dispatches assigned to them.
--     Implemented as a SELECT policy that narrows rows for the driver role.
-- ---------------------------------------------------------------------------
drop policy if exists "org members can view dispatches" on public.dispatches;

create policy "org members can view dispatches"
  on public.dispatches for select
  using (
    org_id = public.current_org_id()
    and (
      public.has_role(array['owner','admin','dispatcher','warehouse','staff'])
      or (public.has_role(array['driver']) and assigned_to = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Done. Test checklist:
--   1. Sign in as a driver -> /inventory shows no Add/Edit/Delete buttons.
--   2. Driver -> /dispatch shows only their assigned dispatches.
--   3. Driver cannot see /staff (page redirects).
--   4. Driver updating an unassigned dispatch fails with an RLS error.
-- ============================================================================
