-- ============================================================================
-- 004_fix_profile_escalation.sql
-- Hardens the profiles update policy so a user cannot self-escalate role or
-- move themselves into another organization (multi-tenant isolation fix).
-- Run in Supabase SQL Editor.
-- ============================================================================
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and org_id is not distinct from (select org_id from public.profiles where id = auth.uid())
  );
