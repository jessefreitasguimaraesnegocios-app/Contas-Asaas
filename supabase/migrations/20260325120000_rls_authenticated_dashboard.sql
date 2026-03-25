-- Frontend (anon key + login) usa o role "authenticated" no PostgREST.
-- Se as listas no dashboard vierem vazias sem erro, aplique esta migration no projeto Supabase.

create policy "apps_authenticated_all"
  on public.apps
  for all
  to authenticated
  using (true)
  with check (true);

create policy "asaas_subaccounts_authenticated_all"
  on public.asaas_subaccounts
  for all
  to authenticated
  using (true)
  with check (true);
