-- ============================================================
-- AzimutFinance — Operations de marche d'un fonds
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql, fund-tresorerie.sql.
-- ============================================================
--
-- CE QUE CETTE TABLE ALIMENTE. Le point de tresorerie porte des postes
-- « ACHATS MFR VALIDES », « VENTES MTP REALISEES »… qui valaient zero faute de
-- source. Chaque ligne d'ici est UNE operation de marche ; le point les somme
-- par (fonds, description, compte de reglement, denouement <= date d'arrete).
--
-- LE MONTANT N'EST PAS STOCKE. Il se deduit exactement de la quantite, du prix,
-- des trois taux et des interets courus — le stocker le laisserait deriver de
-- ses composantes des qu'une correction porte sur l'une d'elles. Il est calcule
-- a la lecture, par operations-marche-types.ts, qui en est la seule definition.

create table if not exists public.fund_market_operations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  fund_id          uuid not null references public.managed_funds(id) on delete cascade,

  -- Date de negociation, et date a laquelle les fonds bougent reellement.
  -- Le denouement est calcule a la saisie (J+2 ouvres pour les actions, J+0
  -- sinon) mais reste MODIFIABLE : un reglement peut deraper.
  date_operation   date not null,
  date_denouement  date not null,

  -- Poste du point de tresorerie. Le libelle est celui du classeur, a
  -- l'identique, pour que le rapprochement avec lui reste immediat.
  description      text not null,
  -- actions | obligations | mtp — gouverne le delai de denouement.
  instrument       text not null,

  code             text not null default '',
  libelle          text not null default '',
  quantite         numeric not null default 0,
  prix             numeric not null default 0,

  sgi              text not null default '',
  taux_courtage    numeric not null default 0,
  taux_tps         numeric not null default 0,
  taux_brvm        numeric not null default 0,
  interets_courus  numeric not null default 0,

  -- Clef de la colonne du point de tresorerie (« NSIA Banque CI · Cote
  -- d'Ivoire »), et non un nom libre : c'est ce qui garantit qu'une operation
  -- tombe dans une colonne qui existe.
  compte_reglement text not null default '',
  statut           text not null default 'en_cours',
  note             text not null default '',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fund_market_operations_description_chk check (description in (
    'ACHATS_MFR_VALIDES',
    'ACHATS_MTP_VALIDES',
    'ACHATS_A_REMERE_VALIDES',
    'ACHATS_MFR_REALISES',
    'ACHATS_MTP_REALISES',
    'VENTES_MFR_REALISEES',
    'VENTES_MTP_REALISEES'
  )),
  constraint fund_market_operations_instrument_chk
    check (instrument in ('actions', 'obligations', 'mtp')),
  constraint fund_market_operations_statut_chk
    check (statut in ('en_cours', 'ok', 'annule'))
);

-- L'index sert la requete du point de tresorerie, qui filtre sur le fonds puis
-- sur la date de denouement.
create index if not exists fund_market_operations_fund_idx
  on public.fund_market_operations (fund_id, date_denouement);

drop trigger if exists fund_market_operations_updated_at on public.fund_market_operations;
create trigger fund_market_operations_updated_at
  before update on public.fund_market_operations
  for each row execute function public.set_updated_at();

alter table public.fund_market_operations enable row level security;

-- Le proprietaire du fonds, et lui seul.
drop policy if exists fund_market_operations_select on public.fund_market_operations;
create policy fund_market_operations_select on public.fund_market_operations
  for select using (owner_id = auth.uid());

drop policy if exists fund_market_operations_insert on public.fund_market_operations;
create policy fund_market_operations_insert on public.fund_market_operations
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_market_operations_update on public.fund_market_operations;
create policy fund_market_operations_update on public.fund_market_operations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_market_operations_delete on public.fund_market_operations;
create policy fund_market_operations_delete on public.fund_market_operations
  for delete using (owner_id = auth.uid());
