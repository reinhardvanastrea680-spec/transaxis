-- 012: Storage location for products
--
-- Warehouse staff need to answer "where is this actually sitting?" — aisle,
-- rack, shelf, bin. That is per product, not per warehouse, so it belongs on
-- the product row.
--
-- Optional by design: existing products keep working with a null location, and
-- nothing in the app requires it to be filled in.
--
-- Run in the Supabase SQL Editor. Safe to re-run.

alter table public.products
  add column if not exists location text;

comment on column public.products.location is
  'Free-text physical storage position, e.g. "Aisle B, Rack 3, Shelf 2". Optional.';
