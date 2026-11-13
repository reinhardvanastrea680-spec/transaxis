-- 011: Two-stage delivery confirmation
--
-- The driver no longer closes a delivery. They *submit evidence* for it, and the
-- office confirms what they can see:
--
--   in_transit --(driver takes photo)--> delivered_pending --(office confirms)--> delivered
--
-- That is why a new status is needed rather than a flag: "delivered_pending" is
-- a real place in the workflow, it has its own actions, and it must never be
-- mistaken for a finished delivery in any report or count.
--
-- Run in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Widen the status constraint.
-- ---------------------------------------------------------------------------

-- The constraint was declared inline in schema.sql, so Postgres generated its
-- name. Rather than guess, find every check constraint on dispatches that looks
-- like the status list and drop it, then add one with a name we control.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.dispatches'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%''in_transit''%'
      and pg_get_constraintdef(oid) ilike '%''created''%'
  loop
    execute format('alter table public.dispatches drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.dispatches
  drop constraint if exists dispatches_status_check;

alter table public.dispatches
  add constraint dispatches_status_check
  check (
    status in (
      'created',
      'assigned',
      'in_transit',
      'delivered_pending',
      'delivered',
      'failed',
      'cancelled'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Record who closed the delivery, and when.
--
-- The driver submits the evidence; the office owns the confirmation. When a
-- customer disputes a delivery six months later, "who signed this off" is the
-- question that matters, and it should not have to be reconstructed from the
-- audit log.
-- ---------------------------------------------------------------------------

alter table public.dispatches
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;

-- Existing rows that are already 'delivered' were closed under the old
-- one-step model. They stay 'delivered' and are deliberately left with a null
-- confirmer — backfilling them with the driver's id would be a lie.

-- ---------------------------------------------------------------------------
-- 3. Keep the work queue cheap to query.
-- ---------------------------------------------------------------------------

create index if not exists idx_dispatches_pending
  on public.dispatches(org_id, confirmed_at)
  where status = 'delivered_pending';

comment on column public.dispatches.confirmed_at is
  'When the office confirmed the driver''s proof of delivery. Null while delivered_pending.';
comment on column public.dispatches.confirmed_by is
  'Office user who confirmed delivery. Null for rows delivered under the old one-step model.';
