-- ============================================================
-- AzimutFinance — Frais du fonds
-- A executer dans : Supabase Dashboard > SQL Editor. Idempotent.
-- ============================================================
--
-- TROIS TAUX, EN DECIMAL comme partout dans le module (0,02 = 2 %).
--
-- Les droits d'entree et de sortie ont une raison d'etre precise : ils se
-- REPORTENT a la saisie d'une souscription ou d'un rachat. Les retaper a
-- chaque ligne d'un bordereau de collecte etait la porte ouverte au taux d'un
-- autre fonds. Ils restent modifiables ligne a ligne — un gros souscripteur
-- les negocie, et figer celui du fonds aurait oblige a corriger ailleurs.
--
-- Les frais de gestion sont un taux annuel preleve sur l'actif net. Ils ne
-- touchent pas encore le point de tresorerie ; ils vivent ici parce que c'est
-- la fiche du fonds qui les porte.
alter table public.managed_funds
  add column if not exists droit_entree numeric;
alter table public.managed_funds
  add column if not exists droit_sortie numeric;
alter table public.managed_funds
  add column if not exists frais_gestion numeric;
