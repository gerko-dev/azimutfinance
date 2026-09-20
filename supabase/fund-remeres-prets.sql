-- ============================================================
-- AzimutFinance — Remeres et prets de titres
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-executions.sql.
-- ============================================================
--
-- UN REMERE ET UN PRET SONT DES ORDRES MTP AUGMENTES, pas des objets a part.
-- Ils portent deja un fonds, un ISIN, une quantite, un prix et un compte de
-- reglement — tout cela vit sur l'ordre. Seul ce qui leur est PROPRE tient
-- dans ces deux tables satellites, une ligne au plus par ordre.
--
-- Des tables satellites plutot que des colonnes sur l'ordre : une quinzaine de
-- colonnes nulles sur chaque ordre ordinaire aurait rendu la table illisible,
-- et un ordre ne peut etre qu'un remere OU un pret, jamais les deux.

-- ------------------------------------------------------------
-- Remeres — feuille « Remeres » du classeur.
-- ------------------------------------------------------------
--
-- CASH-IN / CASH-OUT decrit le sens du PREMIER flux, et le poste de tresorerie
-- porte l'obligation FUTURE, qui est l'inverse :
--
--   cash_in  : le fonds encaisse aujourd'hui, il devra rembourser
--              -> REMERES_CASH_IN, dans « Autres engagements »
--   cash_out : le fonds decaisse aujourd'hui, il sera rembourse
--              -> REMERES_CASH_OUT, dans « Cash a recevoir »
--
-- C'est contre-intuitif, et c'est le classeur : le nom dit le passe, le poste
-- dit l'avenir.
--
-- Ce sens ne figure PAS en colonne : il decoule du sens de l'ordre. Vendre a
-- remere fait encaisser (cash-in), acheter fait decaisser (cash-out).
create table if not exists public.fund_market_repos (
  operation_id  uuid primary key references public.fund_market_operations(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,

  date_fin      date not null,
  contrepartie  text not null default '',
  -- Prix de rachat, par titre. Le prix d'entree est celui de l'ordre.
  prix_sortie   numeric not null default 0,

  -- L'operation MTP de sens inverse qui DENOUE ce remere. Le lien n'est
  -- stocke que de ce cote : le sens inverse — « cette operation denoue tel
  -- remere » — se reconstruit a la lecture, ce qui interdit aux deux bouts de
  -- se contredire.
  --
  -- `on delete set null` et non `cascade` : supprimer l'operation de
  -- denouement doit rouvrir le remere, pas l'effacer.
  denoue_par    uuid references public.fund_market_operations(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- SENS, STATUT ET DATE DE DENOUEMENT NE SE STOCKENT PAS.
--
-- Le sens decoule du sens de l'ordre : acheter a remere decaisse (cash-out),
-- vendre encaisse (cash-in). Le statut et la date de denouement decoulent de
-- l'operation de denouement et de son execution. Les avoir en colonnes, c'etait
-- permettre a un remere de se dire « denoue » sans qu'aucune operation ne
-- l'ait solde — un statut qu'on saisit a la main est un statut qui ment.
--
-- Rejouable : ces trois colonnes n'existent que si la premiere version du
-- script a deja tourne.
alter table public.fund_market_repos drop constraint if exists fund_market_repos_sens_chk;
alter table public.fund_market_repos drop constraint if exists fund_market_repos_statut_chk;
alter table public.fund_market_repos drop column if exists sens;
alter table public.fund_market_repos drop column if exists statut;
alter table public.fund_market_repos drop column if exists date_denouement;
alter table public.fund_market_repos
  add column if not exists denoue_par uuid
  references public.fund_market_operations(id) on delete set null;

create index if not exists fund_market_repos_denoue_par_idx
  on public.fund_market_repos (denoue_par);

-- ------------------------------------------------------------
-- Prets de titres — feuille « Titres pretes » du classeur.
-- ------------------------------------------------------------
--
-- N'ALIMENTE AUCUN POSTE du point de tresorerie : le classeur n'en a pas, et
-- un pret de titres ne deplace pas de cash au moment ou il se noue. C'est un
-- REGISTRE, pas un flux. La commission a recevoir y figure pour memoire.
create table if not exists public.fund_market_loans (
  operation_id  uuid primary key references public.fund_market_operations(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,

  -- Etablissement emprunteur, choisi parmi les banques agreees de l'UMOA
  -- (referentiel BCEAO deja embarque cote applicatif).
  contrepartie      text not null default '',
  date_fin          date,
  -- Taux du pret, en DECIMAL.
  taux_commission   numeric not null default 0,
  -- Date a laquelle les titres sont revenus, ou null tant qu'ils sont dehors.
  date_reprise      date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- STATUT ET INTERET NE SE STOCKENT PAS — meme regle que pour le remere.
--
-- Le statut decoule de la reprise : les titres sont revenus, ou ils ne le sont
-- pas. L'interet a recevoir decoule du taux et de la duree :
--
--   valeur des titres prete x taux x jours / 360
--
-- de la date du pret a sa fin, ou a la reprise quand elle a eu lieu. Les
-- garder en colonnes, c'etait accepter qu'ils divergent du taux saisi juste a
-- cote, sans que rien ne le signale.
--
-- Rejouable : ces colonnes n'existent que si une version precedente du script
-- a deja tourne.
alter table public.fund_market_loans drop constraint if exists fund_market_loans_statut_chk;
alter table public.fund_market_loans drop column if exists statut;
alter table public.fund_market_loans drop column if exists interet_a_recevoir;
alter table public.fund_market_loans
  add column if not exists contrepartie text not null default '';

create index if not exists fund_market_repos_owner_idx on public.fund_market_repos (owner_id);
create index if not exists fund_market_loans_owner_idx on public.fund_market_loans (owner_id);

drop trigger if exists fund_market_repos_updated_at on public.fund_market_repos;
create trigger fund_market_repos_updated_at
  before update on public.fund_market_repos
  for each row execute function public.set_updated_at();

drop trigger if exists fund_market_loans_updated_at on public.fund_market_loans;
create trigger fund_market_loans_updated_at
  before update on public.fund_market_loans
  for each row execute function public.set_updated_at();

alter table public.fund_market_repos enable row level security;
alter table public.fund_market_loans enable row level security;

drop policy if exists fund_market_repos_all on public.fund_market_repos;
create policy fund_market_repos_all on public.fund_market_repos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_market_loans_all on public.fund_market_loans;
create policy fund_market_loans_all on public.fund_market_loans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());


-- ------------------------------------------------------------
-- Contreparties de remere au referentiel des partenaires.
-- ------------------------------------------------------------
--
-- Une contrepartie de remere se choisit dans le formulaire au lieu de se
-- retaper : saisie a la main, elle divergeait d'un remere a l'autre et tout
-- regroupement devenait faux.
--
-- Elle ne porte NI courtage NI TPS : ce sont les conditions d'un
-- intermediaire de bourse, et une contrepartie n'intermedie rien — elle est en
-- face. Ce qui se negocie avec elle, le prix de sortie, se saisit sur
-- l'operation, remere par remere.
alter table public.market_partners drop constraint if exists market_partners_kind_chk;
alter table public.market_partners
  add constraint market_partners_kind_chk
  check (kind in ('sgi', 'btcc', 'remere', 'autre'));
