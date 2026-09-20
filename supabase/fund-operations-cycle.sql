-- ============================================================
-- AzimutFinance — Cycle de vie d'un ordre de marche
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-marche.sql.
-- ============================================================
--
-- UN ORDRE VALIDE N'EST PAS UN FAIT, C'EST UNE INTENTION. Il pese sur la
-- tresorerie tant qu'il peut etre execute, puis il se realise — en totalite ou
-- en partie — ou il tombe. Le modele ne connaissait que l'etat final ; il
-- fallait donc saisir deux lignes, l'une validee et l'autre realisee, et rien
-- ne les reliait.
--
-- UNE SEULE LIGNE PAR ORDRE, desormais, avec la quantite deja executee. La
-- part restante pese sur « ACHATS VALIDES », la part executee bascule sur
-- « ACHATS REALISES ». Deux lignes concurrentes auraient fini par diverger, et
-- rien n'aurait dit laquelle faisait foi.

alter table public.fund_market_operations
  add column if not exists quantite_executee numeric not null default 0;

-- Validite de l'ordre, pour le marche financier uniquement.
--
-- « jour » : l'ordre vaut pour la seance et tombe le lendemain.
-- « revocation90 » : il reste au carnet quatre-vingt-dix jours.
--
-- Le marche des titres publics ne connait pas cette distinction : une
-- adjudication est servie ou ne l'est pas. La colonne y reste a « jour », sans
-- effet, plutot que d'etre nullable — un NULL aurait oblige chaque lecteur a
-- decider ce qu'il signifie.
alter table public.fund_market_operations
  add column if not exists validite text not null default 'jour';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fund_market_operations_validite_chk'
  ) then
    alter table public.fund_market_operations
      add constraint fund_market_operations_validite_chk
      check (validite in ('jour', 'revocation90'));
  end if;
end $$;

-- La quantite executee ne peut pas depasser la quantite ordonnee.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fund_market_operations_executee_chk'
  ) then
    alter table public.fund_market_operations
      add constraint fund_market_operations_executee_chk
      check (quantite_executee >= 0 and quantite_executee <= quantite);
  end if;
end $$;

-- ------------------------------------------------------------
-- Statuts : « ok » devient « en_cours », et « realise » apparait.
-- ------------------------------------------------------------
--
-- « ok » decrivait une saisie confirmee, pas un ordre execute — l'ambiguite
-- aurait ete intenable des lors qu'un ordre peut etre partiellement servi.
update public.fund_market_operations set statut = 'en_cours' where statut = 'ok';

alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_statut_chk;
alter table public.fund_market_operations
  add constraint fund_market_operations_statut_chk
  check (statut in ('en_cours', 'realise', 'annule'));
