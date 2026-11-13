-- ============================================================================
-- Transaxis — migration 013: Standard / Pro / Max plans + quarterly cycle
--
-- Paste this ENTIRE block into the Supabase SQL Editor and click "Run".
-- Safe to run more than once.
--
-- What it does:
--   1. Renames the old paid plans: growth -> pro, operations -> max.
--      Existing (grandfathered) organizations therefore land on Max and lose
--      nothing they already have.
--   2. Replaces the plan check constraint with the new set:
--      free | trial | standard | pro | max.
--   3. Adds 'quarterly' to the billing_cycle check.
--
-- The application reads plan names through src/lib/plans.ts; old values would
-- fail the new constraint, hence the rename MUST run before deploying the new
-- code against this database.
-- ============================================================================

-- IMPORTANT: the old constraint must be dropped BEFORE renaming the values.
-- Writing 'pro'/'max' while `plan in ('free','trial','growth','operations')`
-- is still enforced would fail with 23514.

-- 1. Drop the old plan constraint first.
alter table public.organizations drop constraint if exists organizations_plan_check;

-- 2. Rename old paid plans to the new tiers.
update public.organizations set plan = 'pro' where plan = 'growth';
update public.organizations set plan = 'max' where plan = 'operations';

-- 3. Install the new plan set.
alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'trial', 'standard', 'pro', 'max'));

-- 4. Quarterly billing.
alter table public.organizations drop constraint if exists organizations_billing_cycle_check;
alter table public.organizations
  add constraint organizations_billing_cycle_check
  check (billing_cycle is null or billing_cycle in ('monthly', 'quarterly', 'annual'));

-- ----------------------------------------------------------------------------
-- VERIFY — expect: plan constraint lists the five new ids and the cycle
-- constraint lists three cycles.
-- ----------------------------------------------------------------------------
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.organizations'::regclass
  and conname in ('organizations_plan_check', 'organizations_billing_cycle_check');
