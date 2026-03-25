-- Frontend (anon key + login) usa o role "authenticated" no PostgREST.
-- Se as listas no dashboard vierem vazias sem erro, rode este script no SQL Editor.
-- Idempotente: pode executar mais de uma vez.

drop policy if exists "apps_authenticated_all" on public.apps;
create policy "apps_authenticated_all"
  on public.apps
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "asaas_subaccounts_authenticated_all" on public.asaas_subaccounts;
create policy "asaas_subaccounts_authenticated_all"
  on public.asaas_subaccounts
  for all
  to authenticated
  using (true)
  with check (true);
