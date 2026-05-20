-- ============================================================
-- AzimutFinance — Catégorie des actualités
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Ajoute une colonne `category` a public.actualites pour classer chaque
-- actualite parmi les 6 types exploites par la fiche titre :
--   resultats, dividende, assemblee, operation, communique, presse
-- Les lignes existantes prennent 'communique' par defaut (comportement
-- historique). La RPC admin_list_actualites renvoie `setof actualites`,
-- la nouvelle colonne y est donc automatiquement incluse.
-- ============================================================

alter table public.actualites
  add column if not exists category text not null default 'communique';

-- Contrainte : uniquement les 6 categories connues (cf. lib/newsTypes.ts).
alter table public.actualites
  drop constraint if exists actualites_category_check;
alter table public.actualites
  add constraint actualites_category_check
  check (category in (
    'resultats',
    'dividende',
    'assemblee',
    'operation',
    'communique',
    'presse'
  ));
