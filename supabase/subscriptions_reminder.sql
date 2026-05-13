-- ============================================================
-- AzimutFinance — Tracking des relances J-3 avant expiration Premium
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Prerequis : supabase/subscriptions.sql deja execute.
--
-- Ajoute une colonne reminder_sent_at sur subscriptions pour eviter d'envoyer
-- la relance deux fois. La route /api/cron/premium-expiry-reminder ne traite
-- que les lignes ou cette colonne est NULL.
-- ============================================================

alter table public.subscriptions
  add column if not exists reminder_sent_at timestamptz;

-- Index partiel pour la requete cron : "abonnements actifs expirant bientot,
-- pas encore relances"
create index if not exists subscriptions_reminder_pending_idx
  on public.subscriptions(current_period_end)
  where status = 'active' and reminder_sent_at is null;
