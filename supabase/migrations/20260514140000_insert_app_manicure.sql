-- App adicional: manicure
insert into public.apps (code, name) values
  ('MANICURE', 'Sistema de Manicure')
on conflict (code) do update set name = excluded.name;
