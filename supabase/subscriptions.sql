-- ============================================================
-- AzimutFinance — Abonnements Premium
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Tables :
--   public.subscriptions  (1 ligne par cycle d'abonnement)
--   public.payments       (1 ligne par transaction CinetPay, idempotence)
--
-- Trigger :
--   sync_profile_role_from_subscription  (member <-> premium, ne touche jamais pro/admin)
-- ============================================================

-- ============================================================
-- 1) Enums
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type public.subscription_plan as enum ('m1', 'm6', 'y1');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('active', 'expired', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
  end if;
end$$;

-- ============================================================
-- 2) Table subscriptions
-- ============================================================

create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  plan                  public.subscription_plan not null,
  status                public.subscription_status not null default 'active',
  amount_fcfa           bigint not null,
  started_at            timestamptz not null default now(),
  current_period_end    timestamptz not null,
  provider              text not null default 'cinetpay',
  last_payment_id       uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions(user_id);

-- Index partiel pour la requete "abonnement actif courant"
create index if not exists subscriptions_user_active_idx
  on public.subscriptions(user_id, current_period_end desc)
  where status = 'active';

-- ============================================================
-- 3) Table payments (idempotence webhook)
-- ============================================================

create table if not exists public.payments (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete restrict,
  subscription_id             uuid references public.subscriptions(id) on delete set null,
  plan                        public.subscription_plan not null,
  amount_fcfa                 bigint not null,
  provider                    text not null default 'cinetpay',
  -- transaction_id genere cote AzimutFinance, envoye a CinetPay comme reference
  provider_transaction_id     text not null unique,
  -- payment_token retourne par CinetPay a l'init du checkout
  provider_payment_token      text,
  status                      public.payment_status not null default 'pending',
  raw_payload                 jsonb,
  created_at                  timestamptz not null default now(),
  confirmed_at                timestamptz
);

create index if not exists payments_user_id_idx
  on public.payments(user_id);
create index if not exists payments_status_idx
  on public.payments(status);

-- FK retardive : last_payment_id -> payments.id
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'subscriptions_last_payment_id_fkey'
      and table_schema = 'public'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_last_payment_id_fkey
      foreign key (last_payment_id) references public.payments(id) on delete set null;
  end if;
end$$;

-- ============================================================
-- 4) Trigger updated_at
-- ============================================================

create or replace function public.touch_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_subscriptions_updated_at();

-- ============================================================
-- 5) Trigger : synchroniser profiles.role
-- - Si abonnement actif et periode courante -> 'premium' (sauf si deja 'pro' ou 'adminlevel*')
-- - Si abonnement passe a 'expired'/'cancelled' -> retour a 'member' (uniquement si etait 'premium')
-- ============================================================

create or replace function public.sync_profile_role_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  select role into current_role from public.profiles where id = new.user_id;
  if current_role is null then
    return new;
  end if;

  -- Ne jamais ecraser un role pro / admin
  if current_role = 'pro' or current_role like 'adminlevel%' then
    return new;
  end if;

  if new.status = 'active' and new.current_period_end > now() then
    if current_role <> 'premium' then
      update public.profiles set role = 'premium' where id = new.user_id;
    end if;
  else
    if current_role = 'premium' then
      update public.profiles set role = 'member' where id = new.user_id;
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_sync_profile_role_from_subscription on public.subscriptions;
create trigger trg_sync_profile_role_from_subscription
  after insert or update on public.subscriptions
  for each row execute function public.sync_profile_role_from_subscription();

-- ============================================================
-- 6) RLS — lecture seule par l'utilisateur, ecriture via service_role
-- ============================================================

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own
  on public.payments
  for select
  using (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE : seules les routes serveur utilisant
-- la cle service_role peuvent muter ces tables (webhook CinetPay).
