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

-- ------------------------------------------------------------
-- 3. Le rapprochement de l'ORDRE.
-- ------------------------------------------------------------
--
-- AU PRIMAIRE, ON REGLE AVANT D'ETRE SERVI. On verse sa soumission, et
-- l'adjudication dit ensuite ce qu'on obtient : au moment ou le cash part, il
-- n'existe aucune execution sur laquelle poser le lettrage.
--
-- Partout ailleurs c'est l'inverse — rien n'est a regler tant que rien n'est
-- servi — et le rapprochement vit sur l'execution
-- (fund_market_executions.rapproche_le). Les deux colonnes coexistent donc,
-- chacune pour un moment different du cycle.
--
-- Une fois l'ordre rapproche, il sort des postes de flux du point de
-- tresorerie : le solde bancaire saisi le contient deja. C'est un lettrage,
-- pas une annulation — l'ordre reste, avec sa date.
alter table public.fund_market_operations
  add column if not exists rapproche_le date;

comment on column public.fund_market_operations.rapproche_le is
  'Reglement de l''ordre constate sur le releve. Marche primaire uniquement : '
  'ailleurs, c''est chaque execution qui porte son rapprochement.';
