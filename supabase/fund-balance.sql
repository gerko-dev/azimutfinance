-- ============================================================
-- AzimutFinance — Balance générale importée (répartition comptable)
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Une balance importee par fonds et par date d'arrete. allocation = valeur de
-- marche par classe (jsonb), income = produits de la periode par classe.
create table if not exists public.fund_balances (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  fund_id     uuid not null references public.managed_funds(id) on delete cascade,
  as_of_date  date not null,
  allocation  jsonb not null default '{}'::jsonb,
  gain        jsonb not null default '{}'::jsonb,
  performance jsonb not null default '{}'::jsonb,
  income      jsonb not null default '{}'::jsonb,
  total       numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (fund_id, as_of_date)
);

-- Ajouts idempotents pour les bases déjà créées.
alter table public.fund_balances
  add column if not exists performance jsonb not null default '{}'::jsonb;
alter table public.fund_balances
  add column if not exists gain jsonb not null default '{}'::jsonb;

create index if not exists fund_balances_fund_idx
  on public.fund_balances (fund_id, as_of_date desc);

drop trigger if exists fund_balances_set_updated_at on public.fund_balances;
create trigger fund_balances_set_updated_at
  before update on public.fund_balances
  for each row execute procedure public.set_updated_at();

alter table public.fund_balances enable row level security;

drop policy if exists "fund_balances_all_own" on public.fund_balances;
create policy "fund_balances_all_own"
  on public.fund_balances for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
