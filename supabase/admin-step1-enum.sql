-- ============================================================
-- AzimutFinance — Admin · ETAPE 1 / 2 : extension de l'enum app_role
-- ============================================================
--
-- A executer EN PREMIER dans : Supabase Dashboard > SQL Editor > New query
-- Cliquer "Run" pour commiter cette etape.
-- Ensuite, ouvrir admin.sql et lancer la 2e etape.
--
-- Pourquoi 2 etapes ? PostgreSQL refuse d'UTILISER une nouvelle valeur
-- d'enum dans la meme transaction ou elle est ajoutee. Il faut donc
-- COMMITER l'extension de l'enum avant de pouvoir creer les fonctions
-- qui s'en servent (my_admin_level utilise 'adminlevel1', etc.).
--
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

alter type public.app_role add value if not exists 'adminlevel3';
alter type public.app_role add value if not exists 'adminlevel2';
alter type public.app_role add value if not exists 'adminlevel1';

-- ============================================================
-- Maintenant, ouvrir admin.sql et executer l'etape 2.
-- ============================================================
