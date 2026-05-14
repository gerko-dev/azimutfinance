-- ============================================================
-- AzimutFinance — Suivi de compte titre v2
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent. A passer APRES compte-titre.sql.
--
-- Apporte :
--  - initial_cash + recurring_fees sur les comptes
--  - 3 frais explicites par transaction (courtage / BRVM / DCBR / autres)
--  - Table brokerage_market_fees (admin) avec seed BRVM + DCBR
--  - Validation no-short-selling + withdrawal validation cote app
--    (la table reste open-ended, mais l'app refuse les ventes a decouvert)
-- ============================================================

-- ============================================================
-- 1) brokerage_accounts : nouveaux champs
-- ============================================================

alter table public.brokerage_accounts
  add column if not exists initial_cash numeric not null default 0;

alter table public.brokerage_accounts
  add column if not exists recurring_fees jsonb not null default '[]'::jsonb;

alter table public.brokerage_accounts
  add column if not exists initial_deposit_txn_id uuid;

-- ============================================================
-- 2) brokerage_transactions : decomposition des frais
--    (fees_courtage / fees_brvm / fees_dcbr / fees_other)
--    + migration des anciens "fees" + "taxes" vers fees_other.
-- ============================================================

alter table public.brokerage_transactions
  add column if not exists fees_courtage numeric not null default 0;
alter table public.brokerage_transactions
  add column if not exists fees_brvm numeric not null default 0;
alter table public.brokerage_transactions
  add column if not exists fees_dcbr numeric not null default 0;
alter table public.brokerage_transactions
  add column if not exists fees_other numeric not null default 0;

-- Migration : si l'ancienne colonne 'fees' existe, on la copie dans fees_other
-- (on additionne 'fees' + 'taxes' dans fees_other).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'brokerage_transactions'
      and column_name = 'fees'
  ) then
    execute '
      update public.brokerage_transactions
      set fees_other = coalesce(fees, 0) + coalesce(taxes, 0)
      where fees_other = 0
        and (coalesce(fees, 0) > 0 or coalesce(taxes, 0) > 0)
    ';
  end if;
end$$;

-- Suppression des anciennes colonnes (idempotent)
alter table public.brokerage_transactions
  drop column if exists fees;
alter table public.brokerage_transactions
  drop column if exists taxes;

-- Le check sur les anciens fees/taxes n'est plus pertinent
alter table public.brokerage_transactions
  drop constraint if exists brokerage_txn_amounts_chk;

alter table public.brokerage_transactions
  add constraint brokerage_txn_fees_chk check (
    fees_courtage >= 0 and fees_brvm >= 0 and fees_dcbr >= 0 and fees_other >= 0
  );

-- ============================================================
-- 3) Table brokerage_market_fees
--    Source unique des frais BRVM et DCBR (admin only).
-- ============================================================

create table if not exists public.brokerage_market_fees (
  code         text primary key,         -- 'BRVM' | 'DCBR'
  label        text not null,
  fee_pct      numeric not null default 0,
  min_amount   numeric not null default 0,
  description  text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

-- Trigger updated_at
drop trigger if exists brokerage_market_fees_set_updated_at on public.brokerage_market_fees;
create trigger brokerage_market_fees_set_updated_at
  before update on public.brokerage_market_fees
  for each row execute procedure public.set_updated_at();

-- Seed BRVM + DCBR (uniquement si non present)
insert into public.brokerage_market_fees (code, label, fee_pct, min_amount, description)
values
  ('BRVM', 'Frais BRVM (commission de bourse)', 0.0085, 0,
   'Commission de la Bourse Régionale des Valeurs Mobilières prélevée sur chaque transaction.'),
  ('DCBR', 'Frais DC/BR (dépositaire central)', 0.0035, 0,
   'Frais du Dépositaire Central / Banque de Règlement de l''UEMOA.')
on conflict (code) do nothing;

-- ============================================================
-- 4) RLS
-- ============================================================

alter table public.brokerage_market_fees enable row level security;

-- Lecture : tous les authenticated peuvent voir les frais en vigueur
drop policy if exists "brokerage_market_fees_select_all" on public.brokerage_market_fees;
create policy "brokerage_market_fees_select_all"
  on public.brokerage_market_fees for select
  to authenticated, anon
  using (true);

-- Ecriture : admin L2+
drop policy if exists "brokerage_market_fees_write_admin" on public.brokerage_market_fees;
create policy "brokerage_market_fees_write_admin"
  on public.brokerage_market_fees for all
  to authenticated
  using (public.is_admin_at_least(2))
  with check (public.is_admin_at_least(2));

-- ============================================================
-- 5) RPC admin : mise a jour des frais marche
-- ============================================================

create or replace function public.admin_update_market_fee(
  p_code text,
  p_fee_pct numeric,
  p_min_amount numeric,
  p_description text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_fee_pct < 0 or p_min_amount < 0 then
    raise exception 'NEGATIVE_FEE';
  end if;
  update public.brokerage_market_fees
    set fee_pct = p_fee_pct,
        min_amount = p_min_amount,
        description = coalesce(p_description, description),
        updated_by = auth.uid()
    where code = p_code;
  if not found then
    raise exception 'FEE_CODE_NOT_FOUND';
  end if;
end;
$$;

grant execute on function public.admin_update_market_fee(text, numeric, numeric, text)
  to authenticated;
