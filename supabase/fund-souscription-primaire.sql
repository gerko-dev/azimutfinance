-- ============================================================
-- AzimutFinance — Souscriptions au marche primaire
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-marche.sql.
-- ============================================================
--
-- SOUSCRIRE, C'EST ACHETER au primaire — a l'emission plutot qu'a un vendeur.
-- C'est donc une cinquieme description d'operation, et non un module a part :
-- elle porte un fonds, un titre, une quantite, un prix et un compte de
-- reglement comme les quatre autres.
--
-- Au point de tresorerie, son engagement alimente « OPERATIONS MARCHE
-- PRIMAIRE » — une ligne que le classeur prevoyait et que rien ne remplissait.
-- Une fois servie, elle se regle comme un achat de titres publics.

-- ------------------------------------------------------------
-- 1. La contrainte AVANT la colonne.
-- ------------------------------------------------------------
--
-- On leve la contrainte d'abord : la lever apres avoir insere une ligne
-- 'SOUSCRIPTION_MP' aurait fait echouer l'insertion, et une contrainte qui
-- refuse ce qu'on vient d'ecrire est la panne la plus deroutante qui soit.
alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_description_chk;

alter table public.fund_market_operations
  add constraint fund_market_operations_description_chk
  check (description in (
    'ACHAT_MFR', 'ACHAT_MTP', 'VENTE_MFR', 'VENTE_MTP', 'SOUSCRIPTION_MP'
  ));

-- ------------------------------------------------------------
-- 2. La modalite.
-- ------------------------------------------------------------
--
-- DEUX FACONS DE SOUSCRIRE, et elles ne se saisissent pas pareil :
--
--   adjudication : l'emission figure au calendrier UMOA-Titres. On la choisit
--                  dans une liste, et il n'y a rien a decrire — le titre
--                  n'existe pas encore, il naitra de l'adjudication. Ni ISIN
--                  ni taux facial, donc aucun interet couru : on souscrit au
--                  pair, a la date de valeur.
--   syndication  : le placement est de gre a gre et ne figure a aucun
--                  calendrier. Le gerant decrit donc le titre lui-meme.
--
-- Null pour toute autre operation : la modalite n'a de sens qu'au primaire, et
-- une valeur par defaut aurait laisse croire que les achats MTP en ont une.
alter table public.fund_market_operations
  add column if not exists modalite text;

alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_modalite_chk;

alter table public.fund_market_operations
  add constraint fund_market_operations_modalite_chk
  check (
    (description = 'SOUSCRIPTION_MP' and modalite in ('adjudication', 'syndication'))
    or (description <> 'SOUSCRIPTION_MP' and modalite is null)
  );
