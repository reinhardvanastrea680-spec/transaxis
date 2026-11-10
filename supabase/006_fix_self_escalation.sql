-- ============================================================================
-- Transaxis migration 006 — fix self-escalation (multi-tenant isolation)
--
-- Migration 004 attempted to prevent users from changing their own role/org_id
-- using an RLS WITH CHECK subquery:
--
--   role = (select role from profiles where id = auth.uid())
--
-- This is BROKEN: the subquery reads the row being updated, so it sees the
-- NEW value and the check passes trivially (new_role = new_role). A driver
-- could therefore promote themselves to owner. This was verified live.
--
-- Fix: enforce immutability of role/org_id on self-update with a BEFORE UPDATE
-- trigger that compares NEW against OLD (OLD is correct in a trigger, unlike
-- in an RLS WITH CHECK). RLS alone cannot reference OLD.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 1. Replace the broken RLS policy with one that allows self-edits of
--    non-sensitive columns. Role/org immutability is enforced by the trigger.
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2. Trigger: a user may not change their own role or org_id.
--    (Admins/owners changing OTHER users' roles are unaffected because
--     auth.uid() != OLD.id in that case, and has_role gates them.)
create or replace function public.guard_profile_update()
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

  -- Admins/owners have full control over other users.
  if public.has_role(array['owner','admin']) and new.id is distinct from auth.uid() then
    return new;
  end if;

  -- Self-update: role and org_id must not change.
  if new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'You may not change your own role.';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'You may not change your own organization.';
    end if;
  end if;

  -- Non-admin, non-self (shouldn't reach here given RLS), deny role/org changes.
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

-- 3. Verification query (run manually):
--    As a driver, attempt:
--      update profiles set role='owner' where id = auth.uid();
--    Expected: error "You may not change your own role."