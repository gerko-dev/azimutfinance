-- ============================================================
-- AzimutFinance — Plusieurs comptes de reglement par operation
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql, fund-operations-cycle.sql.
-- ============================================================
--
-- UN REGLEMENT NE PASSE PAS TOUJOURS PAR UN SEUL COMPTE.
--
-- Un rachat de parts a sept chiffres se paie sur ce qu'on a, et ce qu'on a est
-- reparti entre plusieurs banques. Une soumission au marche primaire se verse
-- de meme : le fonds rassemble ce qui dort chez deux ou trois depositaires
-- plutot que de nivelerer la veille pour tout sortir du meme endroit.
--
-- Jusqu'ici le site n'acceptait qu'un compte. Le gerant posait donc tout le
-- montant sur une seule colonne du point de tresorerie, et cette colonne
-- affichait un decaissement que son releve ne portait pas.
--
-- CE N'EST PAS UNE COLONNE DE PLUS, C'EST UNE TABLE FILLE. Trois colonnes de
-- compte sur la table mere auraient fixe une limite arbitraire, rempli de
-- NULL la quasi-totalite des lignes, et oblige chaque lecteur a tester trois
-- fois la meme chose.
--
-- LE COMPTE DE LA TABLE MERE RESTE. Il porte le compte PRINCIPAL — celui de la
-- premiere ligne — et c'est ce que lisent l'export, les ecrans de liste et
-- tout ce qui n'a besoin que de nommer une banque. La ventilation ne vaut que
-- pour ce qui repartit des montants, c'est-a-dire le point de tresorerie.

-- ------------------------------------------------------------
-- Rachats et souscriptions de parts
-- ------------------------------------------------------------
create table if not exists public.fund_unit_flow_accounts (
  flow_id   uuid not null references public.fund_unit_flows(id) on delete cascade,
  owner_id  uuid not null references auth.users(id) on delete cascade,

  -- L'ORDRE DE SAISIE EST L'IDENTITE DE LA LIGNE. Il n'y a rien d'autre a
  -- identifier : une ventilation se reecrit en entier a chaque enregistrement,
  -- jamais ligne a ligne. Une clef technique n'aurait servi a personne.
  rang      smallint not null,

  -- Clef d'etablissement, la meme que `compte_reglement` de la table mere :
  -- c'est elle qui nomme la COLONNE du point de tresorerie.
  compte    text not null,

  -- Ce qui se regle sur ce compte, en francs. Pour un rachat, la somme des
  -- lignes vaut le montant du flux -- il est connu d'avance. Ailleurs, les
  -- montants valent CLEF DE REPARTITION : cf. le commentaire de la table
  -- suivante.
  montant   numeric not null,

  created_at timestamptz not null default now(),

  primary key (flow_id, rang)
);

-- ------------------------------------------------------------
-- Souscriptions au marche primaire
-- ------------------------------------------------------------
--
-- MEME FORME, MAIS LES MONTANTS NE S'Y LISENT PAS PAREIL.
--
-- Un ordre de marche ne pese pas un montant fixe : sa part non servie et
-- chacune de ses executions se reglent separement, et leurs montants bougent
-- a mesure que l'ordre est servi. Figer « 300 millions sur BOA » aurait donc
-- menti des la premiere execution partielle.
--
-- Les montants saisis valent donc CLEF DE REPARTITION : ce qui tombe au point
-- de tresorerie est reparti au prorata, part non servie comme executions. Quand
-- la somme des lignes egale le montant de l'ordre -- le cas normal --, la
-- repartition rend exactement ce que le gerant a saisi.
create table if not exists public.fund_market_operation_accounts (
  operation_id uuid not null references public.fund_market_operations(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  rang         smallint not null,
  compte       text not null,
  montant      numeric not null,
  created_at   timestamptz not null default now(),
  primary key (operation_id, rang)
);

-- UN MONTANT NUL OU NEGATIF N'EST PAS UNE CLEF DE REPARTITION. Il ferait
-- entrer une colonne dans le partage sans rien lui donner, ou pire,
-- retrancherait d'un compte ce qu'un autre recevrait.
alter table public.fund_unit_flow_accounts
  drop constraint if exists fund_unit_flow_accounts_montant_chk;
alter table public.fund_unit_flow_accounts
  add constraint fund_unit_flow_accounts_montant_chk check (montant > 0);

alter table public.fund_market_operation_accounts
  drop constraint if exists fund_market_operation_accounts_montant_chk;
alter table public.fund_market_operation_accounts
  add constraint fund_market_operation_accounts_montant_chk check (montant > 0);

-- UN MEME COMPTE NE PEUT PAS FIGURER DEUX FOIS dans une ventilation : deux
-- lignes sur la meme banque sont une saisie en double, pas une repartition.
create unique index if not exists fund_unit_flow_accounts_unique
  on public.fund_unit_flow_accounts (flow_id, compte);
create unique index if not exists fund_market_operation_accounts_unique
  on public.fund_market_operation_accounts (operation_id, compte);

create index if not exists fund_unit_flow_accounts_owner_idx
  on public.fund_unit_flow_accounts (owner_id);
create index if not exists fund_market_operation_accounts_owner_idx
  on public.fund_market_operation_accounts (owner_id);

alter table public.fund_unit_flow_accounts enable row level security;
alter table public.fund_market_operation_accounts enable row level security;

drop policy if exists fund_unit_flow_accounts_all on public.fund_unit_flow_accounts;
create policy fund_unit_flow_accounts_all on public.fund_unit_flow_accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_market_operation_accounts_all
  on public.fund_market_operation_accounts;
create policy fund_market_operation_accounts_all on public.fund_market_operation_accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
