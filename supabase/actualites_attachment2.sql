-- ============================================================
-- AzimutFinance — Seconde pièce jointe pour les actualités
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Ajoute un second jeu de colonnes "attachment2_*" a public.actualites,
-- en miroir de la pièce jointe principale. Meme bucket Storage
-- (actualites-attachments) et memes policies RLS — aucune modif storage.
-- ============================================================

alter table public.actualites
  add column if not exists attachment2_path        text,
  add column if not exists attachment2_name        text,
  add column if not exists attachment2_size_bytes  bigint;
