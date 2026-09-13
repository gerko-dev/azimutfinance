-- ============================================================
-- AzimutFinance — Ouvre les watchlists et les alertes aux FCP / OPCVM
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/watchlists.sql
-- Idempotent : rejouable sans effet de bord.
--
-- POURQUOI CE FICHIER
-- `watchlist_items.target_type` et `alerts.target_type` portent chacun une
-- contrainte CHECK qui enumere les types de cible autorises. Tant que 'fcp'
-- n'y figure pas, toute insertion cote application est rejetee par Postgres,
-- quel que soit le code TypeScript. La contrainte est la source de verite : il
-- faut donc l'elargir avant que la fonctionnalite puisse exister.
--
-- Le `target_code` d'un FCP est son slug stable (`Fund.id` dans lib/fcp.ts,
-- construit par slugify(`${gestionnaire}-${nom}`)), en minuscules — meme
-- convention que les matieres premieres.
-- ============================================================

-- ------------------------------------------------------------
-- 1) watchlist_items : ajout de 'fcp'
-- ------------------------------------------------------------
alter table public.watchlist_items
  drop constraint if exists watchlist_items_target_type_check;

alter table public.watchlist_items
  add constraint watchlist_items_target_type_check
  check (target_type in
    ('stock', 'bond', 'index', 'currency', 'commodity', 'fcp'));

-- ------------------------------------------------------------
-- 2) alerts : ajout de 'fcp'
-- ------------------------------------------------------------
alter table public.alerts
  drop constraint if exists alerts_target_type_check;

alter table public.alerts
  add constraint alerts_target_type_check
  check (target_type in
    ('stock', 'bond', 'index', 'currency', 'commodity', 'fcp', 'any'));

-- ------------------------------------------------------------
-- 3) Verification
-- ------------------------------------------------------------
-- Doit renvoyer deux lignes, chacune mentionnant 'fcp'.
select
  rel.relname  as table_name,
  con.conname  as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and con.conname in (
    'watchlist_items_target_type_check',
    'alerts_target_type_check'
  )
order by rel.relname;
