-- Garante app Manicure no painel com o nome exibido "Sistema de Manicura"
insert into public.apps (code, name) values
  ('MANICURE', 'Sistema de Manicura')
on conflict (code) do update set name = excluded.name;
