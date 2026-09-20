-- ============================================================
-- AzimutFinance — Cloture d'un ordre, rapprochement d'une execution
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-executions.sql.
-- ============================================================
--
-- DEUX SORTIES DU POINT DE TRESORERIE, QUI N'ONT RIEN A VOIR.
--
-- CLOTURER UN ORDRE. Un ordre partiellement servi que le gerant renonce a
-- faire executer cesse d'engager la tresorerie pour sa part restante. Ce qui a
-- ete servi, lui, reste : il a ete regle, ou le sera. La peremption faisait
-- deja cela automatiquement ; la cloture le fait a la main, avant terme.
--
-- RAPPROCHER UNE EXECUTION. Une fois le reglement passe sur le releve, le
-- solde bancaire saisi le contient DEJA. Le laisser dans les postes de flux le
-- compterait une seconde fois. Le rapprochement est donc un lettrage : il dit
-- « ceci est desormais dans le solde », pas « ceci est annule ».
--
-- Des DATES et non des booleens : savoir QUAND un ordre a ete clos ou une
-- execution rapprochee est ce qu'on cherche des qu'on veut comprendre un
-- ecart. Un booleen aurait repondu « oui » sans dire depuis quand.

alter table public.fund_market_operations
  add column if not exists cloture_le date;

alter table public.fund_market_executions
  add column if not exists rapproche_le date;

comment on column public.fund_market_operations.cloture_le is
  'Date de cloture manuelle. Null tant que l''ordre est ouvert. La part non servie cesse de peser a partir de cette date.';

comment on column public.fund_market_executions.rapproche_le is
  'Date a laquelle le reglement a ete constate sur le releve bancaire. Null tant qu''il ne l''a pas ete. Une execution rapprochee sort des postes de flux : le solde saisi la contient deja.';
