-- ============================================================
-- AzimutFinance — Allocation validée (module gestion de portefeuille)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/fund-management.sql (managed_funds)
-- Idempotent.
--
-- L'allocation validee est la cible d'allocation ARRETEE EN COMITE. Elle ne se
-- deduit d'aucun calcul : c'est une decision. Le portefeuille reel s'en ecarte,
-- et c'est precisement cet ecart qui produit les operations a realiser.
--
-- Reprend la logique de la feuille « Allocations validees » du fichier de suivi
-- NFD, ou la cible est saisie par classe d'actif puis declinee en montants a
-- acheter ou vendre.
-- ============================================================

create table if not exists public.fund_allocation_targets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  fund_id      uuid not null references public.managed_funds(id) on delete cascade,
  -- Axe d'allocation. La granularite suit la nature de la poche :
  --   classe              actions / obligations / OPCVM / DAT / liquidites
  --   action_secteur      dans la poche actions, par secteur BRVM
  --   action_titre        dans la poche actions, valeur par valeur
  --   obligation_emetteur dans la poche obligataire, par emetteur
  --   obligation_maturite dans la poche obligataire, par maturite residuelle
  -- OPCVM, DAT et liquidites restent au niveau de la classe : le detail n'y
  -- apporte rien a la decision du comite.
  dimension    text not null default 'classe'
               check (dimension in (
                 'classe',
                 'action_secteur',
                 'action_titre',
                 'obligation_emetteur',
                 'obligation_maturite'
               )),
  -- Poste sur cet axe : une section pour 'classe', un secteur, un code titre,
  -- un nom d'emetteur ou une cle de tranche de maturite ('0-1', '1-3'...).
  -- L'univers vient du REFERENTIEL DE MARCHE et non du portefeuille : une
  -- cible peut porter sur une valeur que le fonds ne detient pas encore, ce
  -- qui est precisement la facon de decider d'y entrer.
  bucket       text not null check (char_length(bucket) between 1 and 120),
  -- Cible en DECIMAL (0,35 pour 35 %). Bornee a [0,1] : une allocation
  -- negative ou superieure a 100 % n'a pas de sens sans levier, que le fonds
  -- n'a pas.
  cible        numeric(8, 6) not null check (cible >= 0 and cible <= 1),
  -- Date du comite qui a arrete cette cible. Sans elle, personne ne sait de
  -- quelle seance la decision releve.
  decide_le    date,
  note         text check (note is null or char_length(note) <= 400),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Une seule cible par poste et par axe : une deuxieme ligne serait une
  -- decision contradictoire, pas un complement.
  unique (fund_id, dimension, bucket)
);

-- ============================================================
-- Mise a niveau des contraintes sur une table DEJA CREEE
-- ============================================================
--
-- `create table if not exists` ne touche pas une table existante : une
-- contrainte CHECK modifiee ici ne s'appliquerait jamais a une base ou la
-- premiere version du script a deja tourne. On la redefinit donc
-- explicitement, ce qui rend le fichier rejouable ET capable de mettre a jour.
--
-- Symptome sans ce bloc : « new row violates check constraint
-- fund_allocation_targets_dimension_check » des qu'on enregistre une cible sur
-- un axe ajoute apres la creation de la table.

alter table public.fund_allocation_targets
  drop constraint if exists fund_allocation_targets_dimension_check;

-- Une ligne portant un axe abandonne ferait echouer l'ajout de la contrainte
-- (« check constraint is violated by some row »). Les axes 'secteur' et
-- 'emetteur' de la premiere version n'existent plus : ils ont ete remplaces
-- par action_secteur, action_titre, obligation_emetteur et
-- obligation_maturite. On les supprime — ce sont des cibles saisies sur des
-- axes qui n'ont plus d'ecran.
delete from public.fund_allocation_targets
  where dimension not in (
    'classe',
    'action_secteur',
    'action_titre',
    'obligation_emetteur',
    'obligation_maturite'
  );

alter table public.fund_allocation_targets
  add constraint fund_allocation_targets_dimension_check
  check (dimension in (
    'classe',
    'action_secteur',
    'action_titre',
    'obligation_emetteur',
    'obligation_maturite'
  ));

-- Les noms d'emetteurs depassent les 80 caracteres d'origine.
alter table public.fund_allocation_targets
  drop constraint if exists fund_allocation_targets_bucket_check;
alter table public.fund_allocation_targets
  add constraint fund_allocation_targets_bucket_check
  check (char_length(bucket) between 1 and 120);

-- Bornes de la cible, au cas ou la table viendrait d'une version anterieure.
alter table public.fund_allocation_targets
  drop constraint if exists fund_allocation_targets_cible_check;
alter table public.fund_allocation_targets
  add constraint fund_allocation_targets_cible_check
  check (cible >= 0 and cible <= 1);

create index if not exists fund_allocation_targets_fund_idx
  on public.fund_allocation_targets (fund_id, dimension);

create or replace function public.touch_fund_allocation_targets()
returns trigger
language plpgsql
as $$
begin new.updated_at = now(); return new; end$$;

drop trigger if exists trg_fund_allocation_targets_updated on public.fund_allocation_targets;
create trigger trg_fund_allocation_targets_updated
  before update on public.fund_allocation_targets
  for each row execute function public.touch_fund_allocation_targets();

-- ============================================================
-- RLS — proprietaire uniquement, comme le reste du module
-- ============================================================

alter table public.fund_allocation_targets enable row level security;

drop policy if exists fund_allocation_targets_select_own on public.fund_allocation_targets;
create policy fund_allocation_targets_select_own on public.fund_allocation_targets for select
  to authenticated using (auth.uid() = owner_id);
drop policy if exists fund_allocation_targets_insert_own on public.fund_allocation_targets;
create policy fund_allocation_targets_insert_own on public.fund_allocation_targets for insert
  to authenticated with check (auth.uid() = owner_id);
drop policy if exists fund_allocation_targets_update_own on public.fund_allocation_targets;
create policy fund_allocation_targets_update_own on public.fund_allocation_targets for update
  to authenticated using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
drop policy if exists fund_allocation_targets_delete_own on public.fund_allocation_targets;
create policy fund_allocation_targets_delete_own on public.fund_allocation_targets for delete
  to authenticated using (auth.uid() = owner_id);
