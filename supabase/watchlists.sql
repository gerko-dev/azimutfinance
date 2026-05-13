-- ============================================================
-- AzimutFinance — Watchlists + Alertes
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/admin.sql (is_admin_at_least), supabase/sanctions.sql (is_user_suspended)
-- Idempotent.
--
-- Modele :
--   watchlists                : N listes nommees par user
--   watchlist_items           : items (titres, obligations, indices, devises, matieres)
--   alerts                    : definitions d'alertes (gating Premium+ cote app)
--   alert_triggers            : historique des declenchements (badge + email)
--
-- Types de cible : 'stock', 'bond', 'index', 'currency', 'commodity'
-- Types d'alertes : 'price_threshold', 'daily_pct_change', 'bond_maturity_approach',
--                   'news_mention', 'index_threshold', 'fx_threshold', 'custom'
-- ============================================================

-- ============================================================
-- 1) Watchlists
-- ============================================================

create table if not exists public.watchlists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  description  text check (description is null or char_length(description) <= 300),
  sort_order   int  not null default 0,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists watchlists_user_idx
  on public.watchlists (user_id, sort_order, created_at);

-- ============================================================
-- 2) Items
-- ============================================================

create table if not exists public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  target_type   text not null check (target_type in
    ('stock', 'bond', 'index', 'currency', 'commodity')),
  target_code   text not null,
  target_label  text,
  note          text check (note is null or char_length(note) <= 280),
  added_at      timestamptz not null default now(),
  unique (watchlist_id, target_type, target_code)
);

create index if not exists watchlist_items_list_idx
  on public.watchlist_items (watchlist_id, added_at desc);

-- ============================================================
-- 3) Alertes
-- ============================================================

create table if not exists public.alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  alert_type       text not null check (alert_type in (
    'price_threshold',
    'daily_pct_change',
    'bond_maturity_approach',
    'news_mention',
    'index_threshold',
    'fx_threshold',
    'custom'
  )),
  target_type      text not null check (target_type in
    ('stock', 'bond', 'index', 'currency', 'commodity', 'any')),
  target_code      text not null,
  params           jsonb not null default '{}'::jsonb,
  active           boolean not null default true,
  last_triggered_at timestamptz,
  snooze_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists alerts_user_idx
  on public.alerts (user_id, active, alert_type);
create index if not exists alerts_target_idx
  on public.alerts (target_type, target_code)
  where active = true;

-- ============================================================
-- 4) Triggers (historique + queue notifs)
-- ============================================================

create table if not exists public.alert_triggers (
  id                uuid primary key default gen_random_uuid(),
  alert_id          uuid not null references public.alerts(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  triggered_at      timestamptz not null default now(),
  value_at_trigger  jsonb,
  message           text,
  read_at           timestamptz,
  email_sent_at     timestamptz
);

create index if not exists alert_triggers_user_unread_idx
  on public.alert_triggers (user_id, triggered_at desc)
  where read_at is null;
create index if not exists alert_triggers_alert_idx
  on public.alert_triggers (alert_id, triggered_at desc);

-- ============================================================
-- 5) Triggers updated_at
-- ============================================================

create or replace function public.touch_watchlists_updated_at()
returns trigger
language plpgsql
as $$
begin new.updated_at = now(); return new; end$$;

drop trigger if exists trg_watchlists_updated_at on public.watchlists;
create trigger trg_watchlists_updated_at
  before update on public.watchlists
  for each row execute function public.touch_watchlists_updated_at();

drop trigger if exists trg_alerts_updated_at on public.alerts;
create trigger trg_alerts_updated_at
  before update on public.alerts
  for each row execute function public.touch_watchlists_updated_at();

-- ============================================================
-- 6) RLS — user voit/edit uniquement ses propres lignes
-- ============================================================

alter table public.watchlists       enable row level security;
alter table public.watchlist_items  enable row level security;
alter table public.alerts           enable row level security;
alter table public.alert_triggers   enable row level security;

-- watchlists : owner only
drop policy if exists watchlists_select_own on public.watchlists;
create policy watchlists_select_own on public.watchlists for select
  to authenticated using (auth.uid() = user_id);
drop policy if exists watchlists_insert_own on public.watchlists;
create policy watchlists_insert_own on public.watchlists for insert
  to authenticated with check (auth.uid() = user_id);
drop policy if exists watchlists_update_own on public.watchlists;
create policy watchlists_update_own on public.watchlists for update
  to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists watchlists_delete_own on public.watchlists;
create policy watchlists_delete_own on public.watchlists for delete
  to authenticated using (auth.uid() = user_id);

-- watchlist_items : via la watchlist parente
drop policy if exists watchlist_items_select_own on public.watchlist_items;
create policy watchlist_items_select_own on public.watchlist_items for select
  to authenticated using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
drop policy if exists watchlist_items_insert_own on public.watchlist_items;
create policy watchlist_items_insert_own on public.watchlist_items for insert
  to authenticated with check (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
drop policy if exists watchlist_items_update_own on public.watchlist_items;
create policy watchlist_items_update_own on public.watchlist_items for update
  to authenticated using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
drop policy if exists watchlist_items_delete_own on public.watchlist_items;
create policy watchlist_items_delete_own on public.watchlist_items for delete
  to authenticated using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );

-- alerts : owner only
drop policy if exists alerts_select_own on public.alerts;
create policy alerts_select_own on public.alerts for select
  to authenticated using (auth.uid() = user_id);
drop policy if exists alerts_insert_own on public.alerts;
create policy alerts_insert_own on public.alerts for insert
  to authenticated with check (auth.uid() = user_id);
drop policy if exists alerts_update_own on public.alerts;
create policy alerts_update_own on public.alerts for update
  to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists alerts_delete_own on public.alerts;
create policy alerts_delete_own on public.alerts for delete
  to authenticated using (auth.uid() = user_id);

-- alert_triggers : lecture owner, update owner (pour read_at)
drop policy if exists alert_triggers_select_own on public.alert_triggers;
create policy alert_triggers_select_own on public.alert_triggers for select
  to authenticated using (auth.uid() = user_id);
drop policy if exists alert_triggers_update_own on public.alert_triggers;
create policy alert_triggers_update_own on public.alert_triggers for update
  to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Pas d'INSERT user : seul le cron (service_role) insère les triggers.

-- ============================================================
-- 7) RPC : badge in-app — compteur alert_triggers non lus
-- ============================================================

create or replace function public.alerts_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
  from public.alert_triggers
  where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.alerts_unread_count() to authenticated;

-- RPC : marque tous les triggers comme lus
create or replace function public.alerts_mark_all_read()
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.alert_triggers
      set read_at = now()
      where user_id = auth.uid() and read_at is null
      returning 1
  )
  select coalesce(count(*)::int, 0) from upd;
$$;

grant execute on function public.alerts_mark_all_read() to authenticated;
