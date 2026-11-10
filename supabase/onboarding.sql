-- Allow authenticated users to create organizations (onboarding)
drop policy if exists "authenticated can create orgs" on public.organizations;
create policy "authenticated can create orgs"
  on public.organizations for insert
  with check (auth.uid() is not null);
