-- ============================================================
-- AzimutFinance — Tarification Premium (admin L1)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS :
--   - supabase/admin.sql  (admin_audit_log, _admin_log, is_admin_at_least)
--   - supabase/subscriptions.sql  (enum subscription_plan, table subscriptions)
--
-- Idempotent. A executer apres les autres migrations admin/abonnements.
--
-- Tables :
--   public.pricing_plans         (1 ligne par plan disponible — remplace lib/premium/plans.ts)
--   public.promo_codes           (codes promo : %, montant fixe, validite, quotas)
--   public.promo_code_redemptions(historique d'utilisation des codes promo)
--   public.trial_configs         (config de l'essai gratuit — 1 ligne par "preset")
--   public.user_trials           (qui a deja consomme son essai gratuit)
--
-- RPCs (L1 uniquement) :
--   admin_upsert_pricing_plan, admin_toggle_pricing_plan, admin_delete_pricing_plan
--   admin_create_promo_code,   admin_update_promo_code,  admin_toggle_promo_code
--   admin_set_trial_config,    admin_grant_trial_to_user
-- ============================================================

-- ============================================================
-- 0) Seed : insere les 3 plans actuels (m1, m6, y1) si la table est vide
--    Doit etre fait apres la creation de la table — voir section 7 plus bas.
-- ============================================================

-- ============================================================
-- 1) Table pricing_plans
-- ============================================================

create table if not exists public.pricing_plans (
  -- code identifie le plan (m1, m6, y1, ou tout futur code). On ne contraint pas
  -- a l'enum subscription_plan pour pouvoir creer des plans avant de migrer l'enum.
  code              text primary key,
  label             text not null,
  duration_label    text not null,             -- "1 mois", "6 mois", etc.
  duration_months   int  not null check (duration_months > 0),
  price_fcfa        bigint not null check (price_fcfa >= 0),
  -- discount_pct est la reduction AFFICHEE sur la carte plan (vs prix mensuel)
  discount_pct      int  not null default 0 check (discount_pct between 0 and 100),
  tagline           text,
  highlight         boolean not null default false,
  active            boolean not null default true,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists pricing_plans_active_idx
  on public.pricing_plans (active, sort_order);

-- ============================================================
-- 2) Table promo_codes
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'promo_discount_type') then
    create type public.promo_discount_type as enum ('percent', 'fixed');
  end if;
end$$;

create table if not exists public.promo_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  description         text,
  discount_type       public.promo_discount_type not null,
  -- percent : 0..100  |  fixed : montant FCFA a deduire
  discount_value      bigint not null check (discount_value >= 0),
  -- Restreint a certains plans ; null = tous les plans
  applicable_plans    text[],
  valid_from          timestamptz not null default now(),
  valid_until         timestamptz,
  max_uses            int,  -- null = illimite
  max_uses_per_user   int not null default 1,
  current_uses        int not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);

create index if not exists promo_codes_code_idx on public.promo_codes (code);
create index if not exists promo_codes_active_idx on public.promo_codes (active, valid_until);

-- ============================================================
-- 3) Table promo_code_redemptions
-- ============================================================

create table if not exists public.promo_code_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  promo_code_id         uuid not null references public.promo_codes(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  pending_payment_id    uuid references public.pending_payments(id) on delete set null,
  subscription_id       uuid references public.subscriptions(id) on delete set null,
  plan                  text not null,
  amount_before_fcfa    bigint not null,
  amount_after_fcfa     bigint not null,
  amount_discounted_fcfa bigint not null,
  redeemed_at           timestamptz not null default now()
);

create index if not exists promo_redemptions_user_idx
  on public.promo_code_redemptions (user_id, redeemed_at desc);
create index if not exists promo_redemptions_code_idx
  on public.promo_code_redemptions (promo_code_id, redeemed_at desc);

-- ============================================================
-- 4) Table trial_configs
-- ============================================================

create table if not exists public.trial_configs (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  duration_days         int  not null check (duration_days > 0),
  auto_grant_on_signup  boolean not null default false,
  active                boolean not null default true,
  description           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- 5) Table user_trials (1 essai par user)
-- ============================================================

create table if not exists public.user_trials (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  trial_config_id uuid references public.trial_configs(id) on delete set null,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  source        text not null default 'admin_grant', -- 'signup' | 'admin_grant'
  granted_by    uuid references auth.users(id) on delete set null
);

create index if not exists user_trials_expires_idx
  on public.user_trials (expires_at desc);

-- ============================================================
-- 6) Triggers updated_at
-- ============================================================

create or replace function public.touch_pricing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_pricing_plans_updated_at on public.pricing_plans;
create trigger trg_pricing_plans_updated_at
  before update on public.pricing_plans
  for each row execute function public.touch_pricing_updated_at();

drop trigger if exists trg_promo_codes_updated_at on public.promo_codes;
create trigger trg_promo_codes_updated_at
  before update on public.promo_codes
  for each row execute function public.touch_pricing_updated_at();

drop trigger if exists trg_trial_configs_updated_at on public.trial_configs;
create trigger trg_trial_configs_updated_at
  before update on public.trial_configs
  for each row execute function public.touch_pricing_updated_at();

-- ============================================================
-- 7) Seed initial (idempotent : ne re-seed pas si deja des lignes)
-- ============================================================

insert into public.pricing_plans
  (code, label, duration_label, duration_months, price_fcfa, discount_pct, tagline, highlight, sort_order)
values
  ('m1', 'Mensuel',    '1 mois',  1,  9999,  0,  'Pour découvrir Premium',   false, 10),
  ('m6', 'Semestriel', '6 mois',  6,  54999, 8,  'Économisez 4 995 FCFA',    false, 20),
  ('y1', 'Annuel',     '12 mois', 12, 99999, 17, 'Économisez 19 989 FCFA',   true,  30)
on conflict (code) do nothing;

insert into public.trial_configs
  (name, duration_days, auto_grant_on_signup, active, description)
values
  ('default', 7, false, false,
   'Essai gratuit standard. Active "auto_grant_on_signup" pour offrir automatiquement a chaque nouveau membre.')
on conflict (name) do nothing;

-- ============================================================
-- 8) RLS — Lecture publique pour pricing_plans actifs.
--    Promos et trial : admin uniquement (validation runtime via RPC).
-- ============================================================

alter table public.pricing_plans            enable row level security;
alter table public.promo_codes              enable row level security;
alter table public.promo_code_redemptions   enable row level security;
alter table public.trial_configs            enable row level security;
alter table public.user_trials              enable row level security;

-- pricing_plans : lecture publique des plans actifs (pour /premium)
drop policy if exists pricing_plans_select_public on public.pricing_plans;
create policy pricing_plans_select_public
  on public.pricing_plans for select
  using (active = true);

-- pricing_plans : lecture complete pour admin (meme inactifs)
drop policy if exists pricing_plans_select_admin on public.pricing_plans;
create policy pricing_plans_select_admin
  on public.pricing_plans for select
  to authenticated
  using (public.is_admin_at_least(1));

-- promo_codes : admin L1 only en lecture
drop policy if exists promo_codes_select_admin on public.promo_codes;
create policy promo_codes_select_admin
  on public.promo_codes for select
  to authenticated
  using (public.is_admin_at_least(1));

-- promo_code_redemptions : admin L1 voit tout ; user voit les siennes
drop policy if exists promo_redemptions_select_own on public.promo_code_redemptions;
create policy promo_redemptions_select_own
  on public.promo_code_redemptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists promo_redemptions_select_admin on public.promo_code_redemptions;
create policy promo_redemptions_select_admin
  on public.promo_code_redemptions for select
  to authenticated
  using (public.is_admin_at_least(1));

-- trial_configs : lecture publique des configs actives (utile pour afficher
-- "essai gratuit de X jours" cote utilisateur)
drop policy if exists trial_configs_select_public on public.trial_configs;
create policy trial_configs_select_public
  on public.trial_configs for select
  using (active = true);

drop policy if exists trial_configs_select_admin on public.trial_configs;
create policy trial_configs_select_admin
  on public.trial_configs for select
  to authenticated
  using (public.is_admin_at_least(1));

-- user_trials : user lit son trial, admin lit tout
drop policy if exists user_trials_select_own on public.user_trials;
create policy user_trials_select_own
  on public.user_trials for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_trials_select_admin on public.user_trials;
create policy user_trials_select_admin
  on public.user_trials for select
  to authenticated
  using (public.is_admin_at_least(1));

-- Aucune policy INSERT/UPDATE/DELETE : tout passe par les RPC security definer.

-- ============================================================
-- 9) RPC admin_upsert_pricing_plan (L1)
-- ============================================================

create or replace function public.admin_upsert_pricing_plan(
  p_code              text,
  p_label             text,
  p_duration_label    text,
  p_duration_months   int,
  p_price_fcfa        bigint,
  p_discount_pct      int,
  p_tagline           text,
  p_highlight         boolean,
  p_active            boolean,
  p_sort_order        int
) returns public.pricing_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.pricing_plans;
  v_row      public.pricing_plans;
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if coalesce(trim(p_code), '') = '' then
    raise exception 'Code plan requis';
  end if;

  select * into v_existing from public.pricing_plans where code = p_code;

  insert into public.pricing_plans
    (code, label, duration_label, duration_months, price_fcfa, discount_pct,
     tagline, highlight, active, sort_order)
  values
    (lower(trim(p_code)), p_label, p_duration_label, p_duration_months, p_price_fcfa,
     coalesce(p_discount_pct, 0), p_tagline, coalesce(p_highlight, false),
     coalesce(p_active, true), coalesce(p_sort_order, 0))
  on conflict (code) do update set
    label           = excluded.label,
    duration_label  = excluded.duration_label,
    duration_months = excluded.duration_months,
    price_fcfa      = excluded.price_fcfa,
    discount_pct    = excluded.discount_pct,
    tagline         = excluded.tagline,
    highlight       = excluded.highlight,
    active          = excluded.active,
    sort_order      = excluded.sort_order
  returning * into v_row;

  perform public._admin_log(
    case when v_existing.code is null then 'pricing_plan_create' else 'pricing_plan_update' end,
    'pricing_plan',
    v_row.code,
    jsonb_build_object(
      'price_fcfa', v_row.price_fcfa,
      'duration_months', v_row.duration_months,
      'active', v_row.active
    ),
    null
  );

  return v_row;
end$$;
grant execute on function public.admin_upsert_pricing_plan(text, text, text, int, bigint, int, text, boolean, boolean, int) to authenticated;

-- ============================================================
-- 10) RPC admin_toggle_pricing_plan (L1)
-- ============================================================

create or replace function public.admin_toggle_pricing_plan(
  p_code   text,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.pricing_plans set active = p_active where code = p_code;
  if not found then
    raise exception 'Plan introuvable';
  end if;
  perform public._admin_log('pricing_plan_toggle', 'pricing_plan', p_code,
    jsonb_build_object('active', p_active), null);
end$$;
grant execute on function public.admin_toggle_pricing_plan(text, boolean) to authenticated;

-- ============================================================
-- 11) RPC admin_delete_pricing_plan (L1)
-- ============================================================

create or replace function public.admin_delete_pricing_plan(
  p_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  delete from public.pricing_plans where code = p_code;
  if not found then
    raise exception 'Plan introuvable';
  end if;
  perform public._admin_log('pricing_plan_delete', 'pricing_plan', p_code, null, null);
end$$;
grant execute on function public.admin_delete_pricing_plan(text) to authenticated;

-- ============================================================
-- 12) RPC admin_upsert_promo_code (L1)
-- ============================================================

create or replace function public.admin_upsert_promo_code(
  p_id                 uuid,
  p_code               text,
  p_description        text,
  p_discount_type      public.promo_discount_type,
  p_discount_value     bigint,
  p_applicable_plans   text[],
  p_valid_from         timestamptz,
  p_valid_until        timestamptz,
  p_max_uses           int,
  p_max_uses_per_user  int,
  p_active             boolean
) returns public.promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.promo_codes;
  v_code  text;
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  v_code := upper(trim(p_code));
  if v_code = '' then
    raise exception 'Code promo requis';
  end if;
  if p_discount_type = 'percent' and (p_discount_value < 0 or p_discount_value > 100) then
    raise exception 'Pourcentage invalide (0..100)';
  end if;

  if p_id is null then
    insert into public.promo_codes
      (code, description, discount_type, discount_value, applicable_plans,
       valid_from, valid_until, max_uses, max_uses_per_user, active, created_by)
    values
      (v_code, p_description, p_discount_type, p_discount_value, p_applicable_plans,
       coalesce(p_valid_from, now()), p_valid_until, p_max_uses,
       coalesce(p_max_uses_per_user, 1), coalesce(p_active, true), auth.uid())
    returning * into v_row;

    perform public._admin_log('promo_code_create', 'promo_code', v_row.id::text,
      jsonb_build_object('code', v_row.code, 'discount_type', v_row.discount_type,
                         'discount_value', v_row.discount_value), null);
  else
    update public.promo_codes set
      code              = v_code,
      description       = p_description,
      discount_type     = p_discount_type,
      discount_value    = p_discount_value,
      applicable_plans  = p_applicable_plans,
      valid_from        = coalesce(p_valid_from, valid_from),
      valid_until       = p_valid_until,
      max_uses          = p_max_uses,
      max_uses_per_user = coalesce(p_max_uses_per_user, max_uses_per_user),
      active            = coalesce(p_active, active)
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Code promo introuvable';
    end if;

    perform public._admin_log('promo_code_update', 'promo_code', v_row.id::text,
      jsonb_build_object('code', v_row.code, 'active', v_row.active), null);
  end if;

  return v_row;
end$$;
grant execute on function public.admin_upsert_promo_code(
  uuid, text, text, public.promo_discount_type, bigint, text[],
  timestamptz, timestamptz, int, int, boolean
) to authenticated;

-- ============================================================
-- 13) RPC admin_toggle_promo_code (L1)
-- ============================================================

create or replace function public.admin_toggle_promo_code(
  p_id     uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.promo_codes set active = p_active where id = p_id;
  if not found then raise exception 'Code promo introuvable'; end if;
  perform public._admin_log('promo_code_toggle', 'promo_code', p_id::text,
    jsonb_build_object('active', p_active), null);
end$$;
grant execute on function public.admin_toggle_promo_code(uuid, boolean) to authenticated;

-- ============================================================
-- 14) RPC admin_delete_promo_code (L1)
-- ============================================================

create or replace function public.admin_delete_promo_code(
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  delete from public.promo_codes where id = p_id;
  if not found then raise exception 'Code promo introuvable'; end if;
  perform public._admin_log('promo_code_delete', 'promo_code', p_id::text, null, null);
end$$;
grant execute on function public.admin_delete_promo_code(uuid) to authenticated;

-- ============================================================
-- 15) RPC admin_upsert_trial_config (L1)
-- ============================================================

create or replace function public.admin_upsert_trial_config(
  p_id                   uuid,
  p_name                 text,
  p_duration_days        int,
  p_auto_grant_on_signup boolean,
  p_active               boolean,
  p_description          text
) returns public.trial_configs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trial_configs;
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_id is null then
    insert into public.trial_configs
      (name, duration_days, auto_grant_on_signup, active, description)
    values
      (lower(trim(p_name)), p_duration_days,
       coalesce(p_auto_grant_on_signup, false),
       coalesce(p_active, true), p_description)
    returning * into v_row;

    perform public._admin_log('trial_config_create', 'trial_config', v_row.id::text,
      jsonb_build_object('name', v_row.name, 'duration_days', v_row.duration_days,
                         'auto_grant_on_signup', v_row.auto_grant_on_signup), null);
  else
    update public.trial_configs set
      name                  = lower(trim(p_name)),
      duration_days         = p_duration_days,
      auto_grant_on_signup  = coalesce(p_auto_grant_on_signup, auto_grant_on_signup),
      active                = coalesce(p_active, active),
      description           = p_description
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Config essai introuvable';
    end if;

    perform public._admin_log('trial_config_update', 'trial_config', v_row.id::text,
      jsonb_build_object('name', v_row.name, 'duration_days', v_row.duration_days,
                         'auto_grant_on_signup', v_row.auto_grant_on_signup,
                         'active', v_row.active), null);
  end if;

  return v_row;
end$$;
grant execute on function public.admin_upsert_trial_config(
  uuid, text, int, boolean, boolean, text
) to authenticated;

-- ============================================================
-- 16) RPC admin_grant_trial_to_user (L1)
--    Octroie manuellement un essai a un utilisateur, en se basant
--    sur une trial_config. Refuse si l'utilisateur a deja un trial.
-- ============================================================

create or replace function public.admin_grant_trial_to_user(
  p_user_id          uuid,
  p_trial_config_id  uuid
) returns public.user_trials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.trial_configs;
  v_existing public.user_trials;
  v_row public.user_trials;
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_existing from public.user_trials where user_id = p_user_id;
  if found then
    raise exception 'Cet utilisateur a deja consomme son essai gratuit';
  end if;

  select * into v_config from public.trial_configs where id = p_trial_config_id;
  if not found then
    raise exception 'Config essai introuvable';
  end if;
  if not v_config.active then
    raise exception 'Cette config d''essai est desactivee';
  end if;

  insert into public.user_trials
    (user_id, trial_config_id, granted_at, expires_at, source, granted_by)
  values
    (p_user_id, v_config.id, now(), now() + (v_config.duration_days || ' days')::interval,
     'admin_grant', auth.uid())
  returning * into v_row;

  perform public._admin_log('trial_grant', 'user_trial', p_user_id::text,
    jsonb_build_object('duration_days', v_config.duration_days,
                       'expires_at', v_row.expires_at), null);

  return v_row;
end$$;
grant execute on function public.admin_grant_trial_to_user(uuid, uuid) to authenticated;

-- ============================================================
-- 17) RPC admin_revoke_trial (L1) — utile si offert par erreur
-- ============================================================

create or replace function public.admin_revoke_trial(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  delete from public.user_trials where user_id = p_user_id;
  if not found then raise exception 'Aucun essai trouve pour cet utilisateur'; end if;
  perform public._admin_log('trial_revoke', 'user_trial', p_user_id::text, null, null);
end$$;
grant execute on function public.admin_revoke_trial(uuid) to authenticated;
