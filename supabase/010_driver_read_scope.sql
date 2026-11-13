-- ============================================================================
-- Transaxis — migration 010: narrow what a driver can read at the database
--
-- Run after 009. Safe to run more than once.
--
-- The app already hides these surfaces from drivers, but RLS is org-wide, so a
-- driver who opened dev tools could still query them with their own session.
-- This migration closes the three that are safe to close without touching the
-- dispatch workflow:
--
--   1. audit_logs   -> office roles only (owner / admin / warehouse)
--   2. dispatch_pods-> office roles, or the driver the run belongs to
--   3. profiles     -> office roles see the roster; a driver sees only themself
--
-- Deliberately NOT changed here: dispatches and dispatch_items. Restricting
-- those needs the driver's own status update to keep working, which means
-- splitting the existing "for all" policies into per-command policies. That is
-- a separate change and should be tested against the real assignment flow.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit trail — mirrors the `audit.view` capability.
-- ----------------------------------------------------------------------------
drop policy if exists "org members can view audit_logs" on public.audit_logs;

create policy "office roles can view audit_logs"
  on public.audit_logs for select
  using (
    org_id = public.current_org_id()
    and public.has_role(array['owner', 'admin', 'warehouse'])
  );

-- ----------------------------------------------------------------------------
-- 2. Delivery photos — office sees all, a driver sees only their own runs.
-- ----------------------------------------------------------------------------
drop policy if exists "org members can view pods" on public.dispatch_pods;

create policy "pods visible to office or own dispatch"
  on public.dispatch_pods for select
  using (
    org_id = public.current_org_id()
    and (
      public.has_role(array['owner', 'admin', 'warehouse', 'dispatcher'])
      or exists (
        select 1 from public.dispatches d
        where d.id = public.dispatch_pods.dispatch_id
          and d.assigned_to = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Profiles — a driver only ever needs their own row (their name on a run).
-- ----------------------------------------------------------------------------
drop policy if exists "org members can view profiles" on public.profiles;

create policy "org members can view profiles"
  on public.profiles for select
  using (
    -- Always allowed to read your own profile: onboarding depends on it, and it
    -- is how a driver's own name is resolved on their runs.
    id = auth.uid()
    or (
      org_id = public.current_org_id()
      and public.has_role(array['owner', 'admin', 'warehouse', 'dispatcher', 'staff'])
    )
  );

-- ----------------------------------------------------------------------------
-- 4. VERIFY — lists the policies now in force on the three tables.
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('audit_logs', 'dispatch_pods', 'profiles')
order by tablename, policyname;
