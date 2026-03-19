-- Split (percentual do que você ganha) e mensalidade por subconta

alter table public.asaas_subaccounts
  add column if not exists split_percent numeric(6,3) not null default 0,
  add column if not exists monthly_fee_cents bigint not null default 0;

alter table public.asaas_subaccounts
  add constraint asaas_subaccounts_split_percent_range
  check (split_percent >= 0 and split_percent <= 100);

alter table public.asaas_subaccounts
  add constraint asaas_subaccounts_monthly_fee_cents_non_negative
  check (monthly_fee_cents >= 0);

