-- ============================================================
-- AzimutFinance — Réglages de l'analyse de performance (par fonds)
-- Persiste tous les champs saisis sur l'onglet Analyse : dates de période,
-- taux sans risque, pondérations objectives, cibles breakeven (classe et
-- secteur), allocation validée du rééquilibrage, etc.
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Un enregistrement de réglages par fonds et par utilisateur. `settings` est un
-- sac de clefs/valeurs (jsonb) : le schéma est piloté côté application.
create table if not exists public.fund_analysis_settings (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  fund_id    uuid not null references public.managed_funds(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, owner_id)
);

create index if not exists fund_analysis_settings_fund_idx
  on public.fund_analysis_settings (fund_id, owner_id);

drop trigger if exists fund_analysis_settings_set_updated_at on public.fund_analysis_settings;
create trigger fund_analysis_settings_set_updated_at
  before update on public.fund_analysis_settings
  for each row execute procedure public.set_updated_at();

alter table public.fund_analysis_settings enable row level security;

drop policy if exists "fund_analysis_settings_all_own" on public.fund_analysis_settings;
create policy "fund_analysis_settings_all_own"
  on public.fund_analysis_settings for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
