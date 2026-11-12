-- ============================================================================
-- Transaxis — one-shot fix for the "profiles_role_check" constraint
--
-- Paste this ENTIRE block into the Supabase SQL Editor and click "Run".
-- Supabase's SQL Editor runs multi-statement scripts fine (unlike the
-- Management API, which is limited to one statement per call).
--
-- Symptom this fixes:
--   new row for relation "profiles" violates check constraint
--   "profiles_role_check"
--
-- Cause: the constraint allowed only
--   ('owner','admin','warehouse','dispatcher','driver')
-- but the app uses the 'staff' role in four places (the profiles.role column
-- DEFAULT, join-by-code, remove-from-team, and the Add-member dropdown).
--
-- This is safe to run more than once.
-- ============================================================================

-- 1. Widen the constraint to include 'staff'.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','admin','warehouse','dispatcher','driver','staff'));

-- 2. Repair any rows that ended up in an invalid state (usually a no-op).
update public.profiles
set role = 'staff'
where role is null
   or role not in ('owner','admin','warehouse','dispatcher','driver','staff');

-- 3. Make sure the column default is still 'staff'.
alter table public.profiles
  alter column role set default 'staff';

-- 4. VERIFY — this should list one row showing all six roles.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';
