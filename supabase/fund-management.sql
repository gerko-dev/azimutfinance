-- ============================================================
-- AzimutFinance — Fund management (fonds gérés par une SGO)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

-- Fonction utilitaire updated_at (deja presente dans d'autres migrations ;
-- recreee ici pour rendre ce script autonome).
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Table managed_funds : un fonds cree depuis le module Fund management.
-- Rattache a l'utilisateur connecte (owner_id). Donnees privees a la SGO.
-- benchmark : tableau JSONB de composantes ponderees
--   ex. [{"weight": 35, "ref": "BRVMC"}, {"weight": 65, "ref": "Rendement souverain UMOA-Titres"}]
create table if not exists public.managed_funds (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  nom           text not null,
  abreviation   text not null default '',
  categorie     text not null,
  type          text not null,
  vl_initiale   numeric,
  devise        text not null default 'XOF',
  objectif_perf text not null default '',
  benchmark     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint managed_funds_categorie_chk
    check (categorie in ('Obligataire','Monétaire','Diversifié','Actions','Actifs non cotés')),
  constraint managed_funds_type_chk
    check (type in ('FCP','FCPE','SICAV','FCPR')),
  constraint managed_funds_devise_chk
    check (devise in ('XOF','EUR','USD')),
  constraint managed_funds_vl_pos
    check (vl_initiale is null or vl_initiale > 0)
);

-- ratios : tableau JSONB des ratios reglementaires (Instruction 66) et
-- contractuels rattaches au fonds. Chaque element :
--   {"categorie":"REGLEMENTAIRE"|"CONTRACTUEL","groupe":..,"libelle":..,
--    "metrique":..,"base":..,"seuil_min":num|null,"seuil_max":num|null,
--    "unite":"%"|"ans","article":..}
-- Ajout idempotent pour les bases deja creees.
alter table public.managed_funds
  add column if not exists ratios jsonb not null default '[]'::jsonb;

create index if not exists managed_funds_owner_idx
  on public.managed_funds (owner_id, created_at desc);

drop trigger if exists managed_funds_set_updated_at on public.managed_funds;
create trigger managed_funds_set_updated_at
  before update on public.managed_funds
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security : chaque utilisateur ne voit/gere QUE ses fonds.
-- ============================================================
alter table public.managed_funds enable row level security;

drop policy if exists "managed_funds_select_own" on public.managed_funds;
create policy "managed_funds_select_own"
  on public.managed_funds for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "managed_funds_insert_own" on public.managed_funds;
create policy "managed_funds_insert_own"
  on public.managed_funds for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "managed_funds_update_own" on public.managed_funds;
create policy "managed_funds_update_own"
  on public.managed_funds for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "managed_funds_delete_own" on public.managed_funds;
create policy "managed_funds_delete_own"
  on public.managed_funds for delete
  to authenticated
  using (auth.uid() = owner_id);

-- ============================================================
-- Table sgo_profiles : identité de la société de gestion.
-- 1 profil par utilisateur (owner_id = clé primaire => relation 1:1).
-- ============================================================
create table if not exists public.sgo_profiles (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  name          text not null default '',
  agrement      text not null default '',
  contact_email text not null default '',
  base_currency text not null default 'XOF',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sgo_profiles_currency_chk check (base_currency in ('XOF','EUR','USD'))
);

drop trigger if exists sgo_profiles_set_updated_at on public.sgo_profiles;
create trigger sgo_profiles_set_updated_at
  before update on public.sgo_profiles
  for each row execute procedure public.set_updated_at();

alter table public.sgo_profiles enable row level security;

drop policy if exists "sgo_profiles_select_own" on public.sgo_profiles;
create policy "sgo_profiles_select_own"
  on public.sgo_profiles for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "sgo_profiles_insert_own" on public.sgo_profiles;
create policy "sgo_profiles_insert_own"
  on public.sgo_profiles for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "sgo_profiles_update_own" on public.sgo_profiles;
create policy "sgo_profiles_update_own"
  on public.sgo_profiles for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
