-- ============================================================
-- AzimutFinance — Portefeuille des fonds gérés (import d'inventaire)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- Prerequis : fund-management.sql (table managed_funds).
-- ============================================================

-- Fonction utilitaire updated_at (deja definie ailleurs ; recreee pour
-- rendre ce script autonome).
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- custom_securities : titres crees manuellement quand le code/symbole
-- importe n'est reconnu par aucune source du site. Reutilisables entre
-- imports et entre fonds (rattaches a l'utilisateur).
-- ------------------------------------------------------------
create table if not exists public.custom_securities (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'autre',
  code        text not null,
  name        text not null default '',
  isin        text not null default '',
  currency    text not null default 'XOF',
  sector      text not null default '',
  country     text not null default '',
  attributes  jsonb not null default '{}'::jsonb, -- parametres specifiques au type
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint custom_securities_kind_chk
    check (kind in ('action','obligation','opcvm','dat','tresorerie','autre'))
);

-- Mises a jour idempotentes pour les bases deja creees.
alter table public.custom_securities
  add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.custom_securities
  drop constraint if exists custom_securities_kind_chk;
alter table public.custom_securities
  add constraint custom_securities_kind_chk
  check (kind in ('action','obligation','opcvm','dat','tresorerie','autre'));

-- Un meme utilisateur ne cree qu'un titre custom par code (insensible a la casse).
create unique index if not exists custom_securities_owner_code_uidx
  on public.custom_securities (owner_id, lower(code));

drop trigger if exists custom_securities_set_updated_at on public.custom_securities;
create trigger custom_securities_set_updated_at
  before update on public.custom_securities
  for each row execute procedure public.set_updated_at();

-- ------------------------------------------------------------
-- fund_portfolio_snapshots : un inventaire importe pour un fonds a une date.
-- ------------------------------------------------------------
-- slot : position de l'inventaire dans la periode d'analyse
--   'debut' | 'intermediaire' | 'fin'. Un inventaire par slot et par fonds
--   (le reimport d'un slot remplace le precedent).
create table if not exists public.fund_portfolio_snapshots (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  fund_id         uuid not null references public.managed_funds(id) on delete cascade,
  slot            text not null default 'fin',
  as_of_date      date not null default current_date,
  label           text not null default '',
  total_valuation numeric not null default 0,
  created_at      timestamptz not null default now(),
  constraint fund_portfolio_snapshots_slot_chk
    check (slot in ('debut','intermediaire','fin'))
);

-- Ajout idempotent du slot pour les bases deja creees.
alter table public.fund_portfolio_snapshots
  add column if not exists slot text not null default 'fin';
alter table public.fund_portfolio_snapshots
  drop constraint if exists fund_portfolio_snapshots_slot_chk;
alter table public.fund_portfolio_snapshots
  add constraint fund_portfolio_snapshots_slot_chk
  check (slot in ('debut','intermediaire','fin'));

create index if not exists fund_portfolio_snapshots_fund_idx
  on public.fund_portfolio_snapshots (fund_id, as_of_date desc);

-- ------------------------------------------------------------
-- fund_portfolio_positions : les lignes d'un inventaire importe.
-- match_kind : type de rattachement au referentiel du site.
--   'stock' | 'listed-bond' | 'sovereign' | 'fund' | 'custom' | 'cash' | 'unmatched'
-- match_id  : identifiant cote site (code ticker, isin, id fonds, id custom...).
-- ------------------------------------------------------------
create table if not exists public.fund_portfolio_positions (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_id        uuid not null references public.fund_portfolio_snapshots(id) on delete cascade,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  section            text not null default 'action',
  raw_code           text not null default '',
  raw_label          text not null default '',
  quantity           numeric,
  pru                numeric,
  cost               numeric,
  price              numeric,
  accrued_interest   numeric,
  valuation          numeric,
  match_kind         text not null default 'unmatched',
  match_id           text not null default '',
  custom_security_id uuid references public.custom_securities(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint fund_portfolio_positions_section_chk
    check (section in ('action','obligation','opcvm','dat','tresorerie','autre')),
  constraint fund_portfolio_positions_match_chk
    check (match_kind in ('stock','listed-bond','sovereign','fund','custom','dat','cash','unmatched'))
);

-- Mise a jour des contraintes pour les bases deja creees (ajout de 'dat' en
-- section ET en match_kind). Idempotent.
alter table public.fund_portfolio_positions
  drop constraint if exists fund_portfolio_positions_section_chk;
alter table public.fund_portfolio_positions
  add constraint fund_portfolio_positions_section_chk
  check (section in ('action','obligation','opcvm','dat','tresorerie','autre'));

alter table public.fund_portfolio_positions
  drop constraint if exists fund_portfolio_positions_match_chk;
alter table public.fund_portfolio_positions
  add constraint fund_portfolio_positions_match_chk
  check (match_kind in ('stock','listed-bond','sovereign','fund','custom','dat','cash','unmatched'));

create index if not exists fund_portfolio_positions_snapshot_idx
  on public.fund_portfolio_positions (snapshot_id);

-- ============================================================
-- Row Level Security : chaque utilisateur ne voit/gere QUE ses donnees.
-- ============================================================
alter table public.custom_securities        enable row level security;
alter table public.fund_portfolio_snapshots enable row level security;
alter table public.fund_portfolio_positions enable row level security;

-- custom_securities
drop policy if exists "custom_securities_all_own" on public.custom_securities;
create policy "custom_securities_all_own"
  on public.custom_securities for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- fund_portfolio_snapshots
drop policy if exists "fps_all_own" on public.fund_portfolio_snapshots;
create policy "fps_all_own"
  on public.fund_portfolio_snapshots for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- fund_portfolio_positions
drop policy if exists "fpp_all_own" on public.fund_portfolio_positions;
create policy "fpp_all_own"
  on public.fund_portfolio_positions for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ============================================================
-- fund_securities : appartenance d'un titre (custom_securities, partage au
-- niveau utilisateur) au referentiel d'un fonds donne. Le titre reste mutualise
-- (reutilisable), mais son affichage/gestion se fait par fonds.
-- ============================================================
create table if not exists public.fund_securities (
  fund_id            uuid not null references public.managed_funds(id) on delete cascade,
  custom_security_id uuid not null references public.custom_securities(id) on delete cascade,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (fund_id, custom_security_id)
);

create index if not exists fund_securities_fund_idx on public.fund_securities (fund_id);

alter table public.fund_securities enable row level security;

drop policy if exists "fund_securities_all_own" on public.fund_securities;
create policy "fund_securities_all_own"
  on public.fund_securities for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
