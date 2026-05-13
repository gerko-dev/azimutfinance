-- ============================================================
-- AzimutFinance — Templates emails éditables côté admin
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Workflow :
--   1. Au premier appel, la table est seedee avec les 2 templates par defaut
--      (premium-validated, premium-rejected) — voir lib/email/defaults.ts cote app.
--   2. L'admin modifie via /admin/email-templates : sujet, branding header,
--      logo, couleur d'accent, footer, blocs body.
--   3. A l'envoi, le code charge depuis cette table, ou fallback sur les
--      defaults en cas d'absence / erreur.
-- ============================================================

create table if not exists public.email_templates (
  slug                 text primary key,
  subject              text not null,
  header_brand_name    text not null default 'AzimutFinance',
  header_brand_tagline text not null default 'Le portail BRVM / UEMOA',
  header_logo_url      text,
  footer_text          text not null default 'Une question ? Réponds à cet email ou écris-nous à contact@azimutfinance.com.',
  accent_color         text not null default '#1d4ed8',
  body                 jsonb not null default '[]'::jsonb,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null
);

-- updated_at touch
create or replace function public.touch_email_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_email_templates_updated_at on public.email_templates;
create trigger trg_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.touch_email_templates_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.email_templates enable row level security;

-- Lecture admin L1/L2 (les envois utilisent service_role qui bypasse RLS,
-- mais on autorise aussi les lecteurs admin pour le panneau d'edition).
drop policy if exists email_templates_select_admin on public.email_templates;
create policy email_templates_select_admin
  on public.email_templates
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- Update admin L2+
drop policy if exists email_templates_update_admin on public.email_templates;
create policy email_templates_update_admin
  on public.email_templates
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- Insert reserve a admin L1/L2 (cas seed manuel ou ajout futur de template)
drop policy if exists email_templates_insert_admin on public.email_templates;
create policy email_templates_insert_admin
  on public.email_templates
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- ============================================================
-- Storage bucket email-images (public, lecture directe via URL)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('email-images', 'email-images', true)
on conflict (id) do nothing;

-- Path convention : templates/<slug>/<timestamp>-<random>.<ext>
drop policy if exists "email_images_upload_admin" on storage.objects;
create policy "email_images_upload_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'email-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

drop policy if exists "email_images_select_public" on storage.objects;
create policy "email_images_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'email-images');

drop policy if exists "email_images_delete_admin" on storage.objects;
create policy "email_images_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'email-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- ============================================================
-- Seed initial des 2 templates Premium (idempotent via on conflict do nothing)
-- Le contenu detaille (blocs) est aussi maintenu dans lib/email/defaults.ts
-- cote app pour servir de fallback en cas d'absence de la ligne en DB.
-- ============================================================

insert into public.email_templates (slug, subject, body)
values
  (
    'premium-validated',
    'Ton abonnement Premium AzimutFinance est actif',
    '[
      {"type":"heading","level":1,"text":"✓ Bienvenue dans Premium"},
      {"type":"paragraph","text":"Bonjour {{full_name}},"},
      {"type":"paragraph","text":"Merci ! Nous avons bien reçu ton paiement et ton abonnement Premium est désormais actif."},
      {"type":"callout","tone":"success","title":"Détails de ton abonnement","text":"Plan : {{plan_label}} — {{amount}}\nAccès valide jusqu''au {{premium_until}}"},
      {"type":"paragraph","text":"Tu peux maintenant profiter de toutes les analyses macro UEMOA, des outils Pro (YTM, screener, alertes), et des données historiques étendues sur la BRVM."},
      {"type":"button","text":"Accéder à mon compte","url":"{{account_url}}"},
      {"type":"paragraph","text":"L''équipe AzimutFinance"}
    ]'::jsonb
  ),
  (
    'premium-rejected',
    'Ton paiement AzimutFinance n''a pas pu être validé',
    '[
      {"type":"heading","level":1,"text":"Paiement non validé"},
      {"type":"paragraph","text":"Bonjour {{full_name}},"},
      {"type":"paragraph","text":"Nous avons examiné la déclaration de paiement que tu nous as transmise pour l''abonnement Premium {{plan_label}} ({{amount}}), mais nous n''avons pas pu la valider."},
      {"type":"callout","tone":"warning","title":"Motif","text":"{{rejection_reason}}"},
      {"type":"paragraph","text":"Si tu penses qu''il s''agit d''une erreur, réponds simplement à cet email en joignant la référence de ta transaction et une capture d''écran. Tu peux aussi relancer un paiement depuis ton compte."},
      {"type":"button","text":"Refaire un paiement","url":"{{premium_url}}","color":"#0f172a"},
      {"type":"paragraph","text":"L''équipe AzimutFinance"}
    ]'::jsonb
  )
on conflict (slug) do nothing;
