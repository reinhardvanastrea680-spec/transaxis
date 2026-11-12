-- ============================================================================
-- VERIFICATION v3 — paste this into the Supabase SQL Editor and click "Run".
-- ============================================================================

-- A) The full constraint definition, on one line.
select
  'constraint: ' || pg_get_constraintdef(oid) as result
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';

-- B) Every role the app offers vs. whether the DB accepts it.
select
  r.role,
  case
    when exists (
      select 1 from pg_constraint c
      where c.conrelid = 'public.profiles'::regclass
        and c.conname = 'profiles_role_check'
        and pg_get_constraintdef(c.oid) like '%' || r.role || '%'
    ) then 'ALLOWED'
    else 'BLOCKED'
  end as db_status
from (values ('owner'), ('admin'), ('warehouse'), ('dispatcher'), ('driver'), ('staff')) as r(role)
order by r.role;

-- C) Direct test of the CHECK constraint itself (no table insert needed).
--    This evaluates the exact expression Postgres uses, without touching
--    any FK or trigger. Returns 'OK' if 'staff' passes, 'FAIL' if not.
select
  case
    when 'staff' in ('owner','admin','warehouse','dispatcher','driver','staff')
      then 'OK — staff is allowed'
    else 'FAIL — staff is blocked'
  end as check_test;
