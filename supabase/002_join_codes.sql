-- ============================================================================
-- Transaxis migration 002 — organization join codes
--
-- Staff members need a way to join an existing organization instead of
-- creating their own. The organization owner shares a join code; staff sign
-- up, then enter the code on the onboarding screen.
--
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- 1. Add the join_code column (idempotent)
alter table public.organizations
  add column if not exists join_code text;

-- 2. Backfill existing organizations with a code
update public.organizations
set join_code = upper(substr(md5(random()::text || id::text), 1, 8))
where join_code is null;

-- 3. Enforce not-null + unique
alter table public.organizations
  alter column join_code set not null;

create unique index if not exists idx_organizations_join_code
  on public.organizations (join_code);

-- 4. Default for new orgs (so inserts that don't specify one still work)
alter table public.organizations
  alter column join_code set default upper(substr(md5(random()::text), 1, 8));

-- 5. Helper to regenerate a join code for an org
create or replace function public.regenerate_join_code(target_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  new_code := upper(substr(md5(random()::text || target_org::text), 1, 8));
  update public.organizations set join_code = new_code where id = target_org;
  return new_code;
end;
$$;

-- 6. Allow org members to read their own org's join code.
--    (The existing "org members can view own org" policy already covers this,
--     but we drop/recreate it so it stays explicit.)
drop policy if exists "org members can view own org" on public.organizations;

create policy "org members can view own org"
  on public.organizations for select
  using (id = public.current_org_id());

-- 7. Note: lookups by join_code are done server-side with the service role
--    key, because the anon key must not be able to enumerate organizations.

-- Done. Next: restart the app, then share the join code from /staff.
