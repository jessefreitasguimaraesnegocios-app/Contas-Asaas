-- Apps (suas plataformas: barbearia, sorveteria, club, etc.)
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz default now()
);

comment on table public.apps is 'Plataformas que usam subcontas Asaas (ex: barbearia, sorveteria, club)';
comment on column public.apps.code is 'Código único do app: BARBEARIA, 0101, SORVETERIA, CLUB, etc.';

-- Subcontas Asaas vinculadas a um app
create table if not exists public.asaas_subaccounts (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete restrict,
  environment text not null check (environment in ('sandbox', 'production')),

  asaas_subaccount_id text not null,
  asaas_wallet_id text,
  api_key text not null,

  email text not null,
  login_email text,
  name text,
  cpf_cnpj text,
  status text,
  phone text,
  mobile_phone text,
  address text,
  address_number text,
  complement text,
  province text,
  postal_code text,
  city_name text,
  state text,

  bank_number text,
  agency text,
  account_number text,

  raw_creation_response jsonb,
  raw_key_response jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (asaas_subaccount_id, environment)
);

create index if not exists idx_asaas_subaccounts_app_id on public.asaas_subaccounts(app_id);
create index if not exists idx_asaas_subaccounts_environment on public.asaas_subaccounts(environment);
create index if not exists idx_asaas_subaccounts_email on public.asaas_subaccounts(email);

alter table public.apps enable row level security;
alter table public.asaas_subaccounts enable row level security;

create policy "Allow all for service" on public.apps for all using (true);
create policy "Allow all for service" on public.asaas_subaccounts for all using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger asaas_subaccounts_updated_at
  before update on public.asaas_subaccounts
  for each row execute function public.set_updated_at();

insert into public.apps (code, name) values
  ('BARBEARIA', 'Sistema de Barbearias'),
  ('SORVETERIA', 'Sistema de Sorveterias'),
  ('CLUB', 'Sistema de Clubes')
on conflict (code) do nothing;
