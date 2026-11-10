-- ============================================================================
-- 005_harden_dispatch_items.sql
-- Ensures dispatch line items cannot reference products from another tenant.
-- ============================================================================
drop policy if exists "org members can manage dispatch_items" on public.dispatch_items;

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
