-- ============================================================
-- AzimutFinance — Suivi de compte titre (real money tracking)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Modele : 1 user peut avoir N comptes chez differents brokers.
-- Chaque compte a un journal de transactions.
-- Owner-only (RLS).
-- ============================================================

-- 1) Enum type de transaction
do $$
begin
  if not exists (select 1 from pg_type where typname = 'brokerage_txn_type') then
    create type public.brokerage_txn_type as enum
      ('deposit','withdrawal','buy','sell','dividend','fee','interest','split');
  end if;
end$$;

-- 2) Enum type de security
do $$
begin
  if not exists (select 1 from pg_type where typname = 'brokerage_security_type') then
    create type public.brokerage_security_type as enum
      ('stock','bond','fcp','other');
  end if;
end$$;

-- 3) Comptes-titres
create table if not exists public.brokerage_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  broker              text not null default '',
  currency            text not null default 'XOF',
  opening_date        date not null,
  default_fee_pct     numeric not null default 0.01,
  default_fee_min     numeric not null default 0,
  default_stamp_pct   numeric not null default 0,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint brokerage_accounts_currency_chk check (currency in ('XOF')),
  constraint brokerage_accounts_fees_chk check (
    default_fee_pct >= 0 and default_fee_min >= 0 and default_stamp_pct >= 0
  )
);

create index if not exists brokerage_accounts_user_idx
  on public.brokerage_accounts (user_id, created_at desc);

drop trigger if exists brokerage_accounts_set_updated_at on public.brokerage_accounts;
create trigger brokerage_accounts_set_updated_at
  before update on public.brokerage_accounts
  for each row execute procedure public.set_updated_at();

-- 4) Transactions
create table if not exists public.brokerage_transactions (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.brokerage_accounts(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  txn_date        date not null,
  type            public.brokerage_txn_type not null,
  security_code   text,
  security_name   text,
  security_type   public.brokerage_security_type,
  quantity        numeric,
  price           numeric,
  gross_amount    numeric not null default 0,
  fees            numeric not null default 0,
  taxes           numeric not null default 0,
  net_amount      numeric not null,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint brokerage_txn_amounts_chk check (
    fees >= 0 and taxes >= 0
  )
);

create index if not exists brokerage_txns_account_idx
  on public.brokerage_transactions (account_id, txn_date, created_at);
create index if not exists brokerage_txns_user_idx
  on public.brokerage_transactions (user_id, txn_date desc);
create index if not exists brokerage_txns_security_idx
  on public.brokerage_transactions (account_id, security_code) where security_code is not null;

drop trigger if exists brokerage_txns_set_updated_at on public.brokerage_transactions;
create trigger brokerage_txns_set_updated_at
  before update on public.brokerage_transactions
  for each row execute procedure public.set_updated_at();

-- 5) RLS — owner-only
alter table public.brokerage_accounts     enable row level security;
alter table public.brokerage_transactions enable row level security;

drop policy if exists "brokerage_accounts_owner" on public.brokerage_accounts;
create policy "brokerage_accounts_owner"
  on public.brokerage_accounts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "brokerage_txns_owner" on public.brokerage_transactions;
create policy "brokerage_txns_owner"
  on public.brokerage_transactions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 6) Trigger : remplir automatiquement user_id sur les transactions
--    a partir du compte parent (defense en profondeur si on oublie cote app).
create or replace function public.brokerage_txns_fill_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select user_id into new.user_id
      from public.brokerage_accounts
      where id = new.account_id;
  end if;
  return new;
end;
$$;

drop trigger if exists brokerage_txns_fill_user_id on public.brokerage_transactions;
create trigger brokerage_txns_fill_user_id
  before insert on public.brokerage_transactions
  for each row execute procedure public.brokerage_txns_fill_user_id();
