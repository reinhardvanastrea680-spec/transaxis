-- ============================================================================
-- Transaxis migration 007 — allow the 'staff' role in profiles
--
-- BUG: the `profiles_role_check` constraint allowed only
--        ('owner','admin','warehouse','dispatcher','driver')
--      but the application uses 'staff' in four places:
--        1. `profiles.role` column DEFAULT   -> 'staff'   (schema.sql)
--        2. `joinOrganization`               -> role: "staff"  (onboarding/actions.ts)
--        3. `removeStaffFromOrg`             -> role: "staff"  (staff/actions.ts)
--        4. the Add-member + role dropdowns  -> 'staff'    (staff/staff-client.tsx)
--
--      Any insert or update that set role='staff' therefore failed with:
--        new row for relation "profiles" violates check constraint
--        "profiles_role_check"
--
--      The column DEFAULT was 'staff', so even a plain INSERT that omitted the
--      role would fail. The sign-up trigger `handle_new_user()` inserts
--      (id, full_name) only — relying on the default — so new sign-ups broke
--      as soon as this constraint was in place.
--
-- FIX: widen the constraint to include 'staff'.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 1. Drop the old constraint (named automatically as profiles_role_check).
--    `if exists` keeps this idempotent and safe to re-run.
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- 2. Re-create it with the full role set the application actually uses.
--    The constraint name is kept identical so RLS policies, error messages,
--    and any tooling that references it by name keep working.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','admin','warehouse','dispatcher','driver','staff'));

-- 3. Repair any rows that were left in an invalid state. This should be a
--    no-op (the constraint would have prevented them), but it is safe to run
--    and protects against rows inserted before the constraint existed.
update public.profiles
set role = 'staff'
where role is null
   or role not in ('owner','admin','warehouse','dispatcher','driver','staff');

-- 4. Keep the column default aligned with the allowed set.
alter table public.profiles
  alter column role set default 'staff';

-- 5. Verification query (run manually):
--    select conname, pg_get_constraintdef(oid)
--    from pg_constraint
--    where conrelid = 'public.profiles'::regclass
--      and conname = 'profiles_role_check';
--
--    Expected:
--      CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'warehouse'::text,
--                  'dispatcher'::text, 'driver'::text, 'staff'::text]))
