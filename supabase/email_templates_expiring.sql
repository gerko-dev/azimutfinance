-- ============================================================
-- AzimutFinance — Seed du template "premium-expiring-soon"
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Prerequis : supabase/email_templates.sql deja execute.
-- ============================================================

insert into public.email_templates (slug, subject, body)
values (
  'premium-expiring-soon',
  'Ton accès Premium expire dans {{days_left}} jours',
  '[
    {"type":"heading","level":1,"text":"Ton Premium expire bientôt"},
    {"type":"paragraph","text":"Bonjour {{full_name}},"},
    {"type":"paragraph","text":"Ton abonnement Premium {{plan_label}} arrive à échéance le {{premium_until}} — soit dans {{days_left}} jours."},
    {"type":"callout","tone":"warning","title":"Pour ne pas perdre l''accès","text":"Renouvelle dès maintenant pour continuer à profiter des analyses Macro UEMOA, des outils Pro et des données historiques étendues. Aucune interruption."},
    {"type":"button","text":"Renouveler maintenant","url":"{{premium_url}}"},
    {"type":"paragraph","text":"Si tu choisis de ne pas renouveler, ton compte basculera automatiquement en Membre (gratuit) le {{premium_until}}. Tu pourras toujours te réabonner plus tard."},
    {"type":"paragraph","text":"L''équipe AzimutFinance"}
  ]'::jsonb
)
on conflict (slug) do nothing;
