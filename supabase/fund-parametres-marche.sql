-- ============================================================
-- AzimutFinance — Parametres des operations de marche
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql, fund-operations-marche.sql.
-- ============================================================
--
-- POURQUOI CES VALEURS SORTENT DU CODE. Le delai de denouement et les
-- commissions de place sont des regles de MARCHE, pas des constantes de
-- programme : elles changent par decision de la BRVM ou du DC/BR, et le
-- gerant l'apprend avant nous. Codees en dur, chaque revision imposait un
-- deploiement ; et, plus grave, les operations deja saisies restaient
-- calculees avec l'ancienne valeur sans que rien ne le dise.
--
-- UNE SEULE LIGNE PAR GERANT. Ces regles valent pour toute la societe de
-- gestion, pas par fonds : un titre ne se denoue pas plus vite parce qu'il est
-- achete pour un portefeuille plutot qu'un autre.

create table if not exists public.market_settings (
  owner_id            uuid primary key references auth.users(id) on delete cascade,

  -- Delai de denouement, en jours, et base de comptage. Deux marches, deux
  -- conventions : le marche financier regional regle a J+2 OUVRES, le marche
  -- des titres publics le jour meme.
  denouement_mfr_jours  integer not null default 2,
  denouement_mfr_base   text    not null default 'ouvres',
  denouement_mtp_jours  integer not null default 0,
  denouement_mtp_base   text    not null default 'calendaires',

  -- Commissions de PLACE, en decimal (0.003 = 0,3 %). Separees parce qu'elles
  -- sont percues par deux institutions distinctes — la Bourse et le
  -- depositaire central — et revisees independamment. Les additionner dans un
  -- seul champ interdisait de corriger l'une sans toucher l'autre.
  taux_brvm           numeric not null default 0.003,
  taux_dcbr           numeric not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint market_settings_base_mfr_chk
    check (denouement_mfr_base in ('ouvres', 'calendaires')),
  constraint market_settings_base_mtp_chk
    check (denouement_mtp_base in ('ouvres', 'calendaires')),
  -- Un delai negatif n'a pas de sens ; au-dela d'un mois non plus.
  constraint market_settings_jours_chk
    check (denouement_mfr_jours between 0 and 30
       and denouement_mtp_jours between 0 and 30)
);

drop trigger if exists market_settings_updated_at on public.market_settings;
create trigger market_settings_updated_at
  before update on public.market_settings
  for each row execute function public.set_updated_at();

alter table public.market_settings enable row level security;

drop policy if exists market_settings_select on public.market_settings;
create policy market_settings_select on public.market_settings
  for select using (owner_id = auth.uid());

drop policy if exists market_settings_insert on public.market_settings;
create policy market_settings_insert on public.market_settings
  for insert with check (owner_id = auth.uid());

drop policy if exists market_settings_update on public.market_settings;
create policy market_settings_update on public.market_settings
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ------------------------------------------------------------
-- La commission DC/BR devient une colonne a part sur les operations.
-- ------------------------------------------------------------
--
-- Elle etait jusqu'ici confondue avec la commission BRVM dans `taux_brvm`,
-- comme dans le classeur. Les separer permet de les reviser independamment ;
-- la somme entrant dans le montant reste la meme, donc AUCUNE operation deja
-- saisie ne change de valeur : le defaut a zero laisse `taux_brvm` porter le
-- cumul historique.
alter table public.fund_market_operations
  add column if not exists taux_dcbr numeric not null default 0;
