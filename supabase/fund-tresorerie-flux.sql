-- ============================================================
-- AzimutFinance - Flux saisis et operations spot du point de tresorerie
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-tresorerie.sql.
-- ============================================================
--
-- DEUX TABLES, POUR DEUX NATURES DE FLUX.
--
-- 1. LES « AUTRES » LIGNES. Quatre postes du classeur ne viennent d'aucune
--    source du site et n'en viendront jamais : ce sont precisement les lignes
--    ou le tresorier porte ce que le systeme ne sait pas deduire - un appel de
--    marge, une regularisation, une commission exceptionnelle, un flux annonce
--    par la banque. Elles se SAISISSENT, et il faut donc un endroit ou les
--    mettre.
--
--    Un flux porte un POSTE (la ligne du tableau), un COMPTE (la colonne), une
--    DATE et un MONTANT TOUJOURS POSITIF : c'est le poste qui dit le sens,
--    puisqu'il decide deja de quel cote du solde il tombe. Autoriser un
--    montant negatif aurait permis d'ecrire un encaissement dans la ligne des
--    decaissements, et le tableau aurait eu raison contre le bon sens.
--
-- 2. LES OPERATIONS SPOT. Un spot est un placement ou un emprunt de tresorerie
--    a tres court terme, entre deux etablissements. Il ne se saisit pas comme
--    un flux isole parce qu'il en produit DEUX : la mise en place aujourd'hui,
--    le denouement a l'echeance, interets compris. Les tenir comme une ligne
--    de flux aurait oblige a saisir les deux et a ne jamais se tromper sur
--    leur coherence.
--
--    Le SENS est celui du fonds : il PLACE (il sort du cash et le recuperera,
--    majore des interets) ou il EMPRUNTE (il encaisse et devra rembourser).
--    Le poste alimente en decoule, il ne se choisit pas.

create table if not exists public.fund_treasury_flows (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  fund_id     uuid not null references public.managed_funds(id) on delete cascade,
  -- Clef de ligne du classeur : AUTRES, AUTRES_CASH_A_RECEVOIR,
  -- AUTRES_FLUX_SORTANT, AUTRES_FLUX_ENTRANT. Verifie cote applicatif contre
  -- le gabarit du tableau : une contrainte figee ici aurait demande une
  -- migration a chaque poste ouvert a la saisie.
  poste       text not null,
  -- Clef d'etablissement : la COLONNE du point. Un flux sans colonne n'a nulle
  -- part ou s'inscrire.
  compte      text not null,
  date_flux   date not null,
  montant     numeric not null check (montant >= 0),
  libelle     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists fund_treasury_flows_fund_idx
  on public.fund_treasury_flows (fund_id, date_flux desc);

drop trigger if exists fund_treasury_flows_updated_at on public.fund_treasury_flows;
create trigger fund_treasury_flows_updated_at
  before update on public.fund_treasury_flows
  for each row execute function public.set_updated_at();

alter table public.fund_treasury_flows enable row level security;

drop policy if exists fund_treasury_flows_select on public.fund_treasury_flows;
create policy fund_treasury_flows_select on public.fund_treasury_flows
  for select using (owner_id = auth.uid());

drop policy if exists fund_treasury_flows_insert on public.fund_treasury_flows;
create policy fund_treasury_flows_insert on public.fund_treasury_flows
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_treasury_flows_update on public.fund_treasury_flows;
create policy fund_treasury_flows_update on public.fund_treasury_flows
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_treasury_flows_delete on public.fund_treasury_flows;
create policy fund_treasury_flows_delete on public.fund_treasury_flows
  for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Operations spot
-- ------------------------------------------------------------

create table if not exists public.fund_treasury_spots (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  fund_id        uuid not null references public.managed_funds(id) on delete cascade,
  -- 'placement' : le fonds sort du cash et le recuperera majore des interets.
  -- 'emprunt'   : le fonds encaisse et devra rembourser.
  sens           text not null check (sens in ('placement', 'emprunt')),
  contrepartie   text not null default '',
  compte         text not null,
  montant        numeric not null check (montant > 0),
  -- Taux ANNUEL en decimal, comme partout dans le module. Base 360, comme les
  -- prets de titres : c'est la convention du marche monetaire UEMOA.
  taux           numeric not null default 0,
  date_valeur    date not null,
  date_echeance  date not null,
  -- Renseignee quand le spot est effectivement denoue. Tant qu'elle est nulle,
  -- le flux d'echeance est attendu. Elle ne se saisit pas au formulaire : elle
  -- se pose d'un bouton sur la ligne, le jour ou le denouement a lieu - meme
  -- regle que la reprise d'un pret de titres.
  date_denouement date,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists fund_treasury_spots_fund_idx
  on public.fund_treasury_spots (fund_id, date_echeance);

drop trigger if exists fund_treasury_spots_updated_at on public.fund_treasury_spots;
create trigger fund_treasury_spots_updated_at
  before update on public.fund_treasury_spots
  for each row execute function public.set_updated_at();

alter table public.fund_treasury_spots enable row level security;

drop policy if exists fund_treasury_spots_select on public.fund_treasury_spots;
create policy fund_treasury_spots_select on public.fund_treasury_spots
  for select using (owner_id = auth.uid());

drop policy if exists fund_treasury_spots_insert on public.fund_treasury_spots;
create policy fund_treasury_spots_insert on public.fund_treasury_spots
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_treasury_spots_update on public.fund_treasury_spots;
create policy fund_treasury_spots_update on public.fund_treasury_spots
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_treasury_spots_delete on public.fund_treasury_spots;
create policy fund_treasury_spots_delete on public.fund_treasury_spots
  for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Nivellements entre comptes
-- ------------------------------------------------------------
--
-- UN NIVELLEMENT N'EST PAS UN FLUX, C'EST UN DEPLACEMENT. L'argent ne quitte
-- pas le fonds : il change de compte. Le solde consolide ne doit donc pas
-- bouger d'un franc.
--
-- Il produit pourtant DEUX ECRITURES, et c'est ce qui le rend juste :
--
--   le compte qui ENVOIE est greve dans « Autres decaissements » ;
--   le compte qui RECOIT est credite dans « Autres encaissements ».
--
-- Les deux se compensent exactement au total - l'un est retranche du solde
-- reel, l'autre y est ajoute - si bien que le nivellement est neutre tant
-- qu'il est en cours, tout en montrant correctement ou l'argent se trouve.
--
-- DEUX RAPPROCHEMENTS, ET NON UN SEUL. Le debit et le credit ne tombent pas le
-- meme jour : l'argent part aujourd'hui et arrive demain. Chaque jambe se
-- rapproche donc pour son compte, et sort du point des que le releve de SA
-- banque la contient. Entre les deux, le point affiche l'argent en transit -
-- qui est exactement la situation reelle.
--
-- N'en tenir qu'un aurait force a choisir entre deux mensonges : faire
-- disparaitre les deux jambes quand l'argent n'est arrive nulle part, ou les
-- garder toutes deux quand il a deja quitte le compte emetteur.

create table if not exists public.fund_treasury_transfers (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  fund_id           uuid not null references public.managed_funds(id) on delete cascade,
  -- Clefs d'etablissement : les COLONNES du point.
  compte_source     text not null,
  compte_destination text not null,
  montant           numeric not null check (montant > 0),
  date_nivellement  date not null,
  -- Constate sur le releve de la banque emettrice : la jambe sort du point.
  rapproche_debit   date,
  -- Constate sur le releve de la banque destinataire : idem.
  rapproche_credit  date,
  libelle           text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Un nivellement d'un compte vers lui-meme ne deplace rien et produirait
  -- deux ecritures qui s'annulent sur la meme colonne.
  constraint fund_treasury_transfers_comptes_distincts
    check (compte_source <> compte_destination)
);

create index if not exists fund_treasury_transfers_fund_idx
  on public.fund_treasury_transfers (fund_id, date_nivellement desc);

drop trigger if exists fund_treasury_transfers_updated_at on public.fund_treasury_transfers;
create trigger fund_treasury_transfers_updated_at
  before update on public.fund_treasury_transfers
  for each row execute function public.set_updated_at();

alter table public.fund_treasury_transfers enable row level security;

drop policy if exists fund_treasury_transfers_select on public.fund_treasury_transfers;
create policy fund_treasury_transfers_select on public.fund_treasury_transfers
  for select using (owner_id = auth.uid());

drop policy if exists fund_treasury_transfers_insert on public.fund_treasury_transfers;
create policy fund_treasury_transfers_insert on public.fund_treasury_transfers
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_treasury_transfers_update on public.fund_treasury_transfers;
create policy fund_treasury_transfers_update on public.fund_treasury_transfers
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_treasury_transfers_delete on public.fund_treasury_transfers;
create policy fund_treasury_transfers_delete on public.fund_treasury_transfers
  for delete using (owner_id = auth.uid());
