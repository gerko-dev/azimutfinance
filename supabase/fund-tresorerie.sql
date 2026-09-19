-- ============================================================
-- AzimutFinance — Point de tresorerie : soldes bancaires saisis
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql.
-- ============================================================
--
-- POURQUOI UNE SAISIE PLUTOT QUE L'INVENTAIRE. Le solde comptable d'un compte
-- a l'inventaire et son solde bancaire reel different presque toujours : les
-- operations en cours de denouement, les commissions prelevees et les flux de
-- monnaie electronique non encore rapproches passent par la banque avant
-- d'atteindre l'inventaire. Le tresorier travaille sur le solde BANCAIRE ;
-- l'inventaire reste affiche en regard, comme point de comparaison.
--
-- Un jeu de soldes par fonds et par date. `soldes` associe le nom canonique
-- d'etablissement (cf. tresorerie-banques.ts) au montant en FCFA.

create table if not exists public.fund_treasury_balances (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  fund_id     uuid not null references public.managed_funds(id) on delete cascade,
  as_of_date  date not null,
  soldes      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (fund_id, as_of_date)
);

create index if not exists fund_treasury_balances_fund_idx
  on public.fund_treasury_balances (fund_id, as_of_date desc);

drop trigger if exists fund_treasury_balances_updated_at on public.fund_treasury_balances;
create trigger fund_treasury_balances_updated_at
  before update on public.fund_treasury_balances
  for each row execute function public.set_updated_at();

alter table public.fund_treasury_balances enable row level security;

-- Le proprietaire du fonds, et lui seul.
drop policy if exists fund_treasury_balances_select on public.fund_treasury_balances;
create policy fund_treasury_balances_select on public.fund_treasury_balances
  for select using (owner_id = auth.uid());

drop policy if exists fund_treasury_balances_insert on public.fund_treasury_balances;
create policy fund_treasury_balances_insert on public.fund_treasury_balances
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_treasury_balances_update on public.fund_treasury_balances;
create policy fund_treasury_balances_update on public.fund_treasury_balances
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_treasury_balances_delete on public.fund_treasury_balances;
create policy fund_treasury_balances_delete on public.fund_treasury_balances
  for delete using (owner_id = auth.uid());
