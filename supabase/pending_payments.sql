-- ============================================================
-- AzimutFinance — Paiements manuels en attente (Wave / OM / MTN / Moov)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Prerequis : avoir deja execute supabase/subscriptions.sql
--
-- Workflow :
--   1. User clique "Démarrer le paiement" sur /premium
--   2. Il paie depuis son tel sur le numéro affiché
--   3. Il declare le paiement (numéro émetteur, ref transaction, screenshot)
--      -> insert dans pending_payments (status='pending')
--   4. Admin verifie sur son tel, valide -> RPC admin_validate_pending_payment
--      -> insert payments + subscriptions + update pending_payments
--   5. Si invalide -> admin_reject_pending_payment avec motif
-- ============================================================

-- ============================================================
-- 1) Enums
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pending_payment_method') then
    create type public.pending_payment_method as enum ('wave', 'orange_money', 'mtn_momo', 'moov_money');
  end if;
  if not exists (select 1 from pg_type where typname = 'pending_payment_status') then
    create type public.pending_payment_status as enum ('pending', 'validated', 'rejected');
  end if;
end$$;

-- ============================================================
-- 2) Table pending_payments
-- ============================================================

create table if not exists public.pending_payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan                public.subscription_plan not null,
  amount_fcfa         bigint not null,
  payment_method      public.pending_payment_method not null,
  payer_phone         text not null,
  transaction_ref     text,
  proof_path          text,        -- chemin Supabase Storage dans le bucket payment-proofs
  status              public.pending_payment_status not null default 'pending',
  rejection_reason    text,
  subscription_id     uuid references public.subscriptions(id) on delete set null,
  payment_id          uuid references public.payments(id) on delete set null,
  validated_by        uuid references auth.users(id) on delete set null,
  validated_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists pending_payments_status_idx
  on public.pending_payments(status, created_at desc);
create index if not exists pending_payments_user_idx
  on public.pending_payments(user_id, created_at desc);

-- ============================================================
-- 3) RLS
-- ============================================================

alter table public.pending_payments enable row level security;

drop policy if exists pending_payments_select_own on public.pending_payments;
create policy pending_payments_select_own
  on public.pending_payments
  for select
  using (auth.uid() = user_id);

drop policy if exists pending_payments_insert_own on public.pending_payments;
create policy pending_payments_insert_own
  on public.pending_payments
  for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Admin (L1 / L2) : lecture + update via RPC security definer ci-dessous,
-- pas de policy directe necessaire pour les RPC.
-- Mais on autorise quand meme select admin pour lister depuis le client si besoin.
drop policy if exists pending_payments_select_admin on public.pending_payments;
create policy pending_payments_select_admin
  on public.pending_payments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- ============================================================
-- 4) Storage bucket payment-proofs (idempotent)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Policies sur storage.objects
-- Path convention : <user_id>/<random>.<ext>

drop policy if exists "payment_proofs_upload_own" on storage.objects;
create policy "payment_proofs_upload_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_select_own" on storage.objects;
create policy "payment_proofs_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_select_admin" on storage.objects;
create policy "payment_proofs_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('adminlevel1', 'adminlevel2')
    )
  );

-- ============================================================
-- 5) Helper : duree d'un plan en interval
-- ============================================================

create or replace function public.plan_duration(p_plan public.subscription_plan)
returns interval
language sql
immutable
as $$
  select case p_plan
    when 'm1' then interval '1 month'
    when 'm6' then interval '6 months'
    when 'y1' then interval '12 months'
  end
$$;

-- ============================================================
-- 6) RPC admin_validate_pending_payment
-- Cree atomiquement :
--   - 1 ligne payments (provider='manual', transaction_id=pending.id)
--   - 1 ligne subscriptions (current_period_end = max(now, sub_existante) + duree)
--   - update pending_payments (status, subscription_id, payment_id, validated_*)
-- Le trigger sync_profile_role_from_subscription se charge de profiles.role.
-- ============================================================

create or replace function public.admin_validate_pending_payment(
  p_pending_id uuid
)
returns table (
  subscription_id uuid,
  payment_id      uuid,
  premium_until   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_pending public.pending_payments%rowtype;
  v_payment_id uuid;
  v_subscription_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Non authentifie';
  end if;

  select level into v_level from public.user_admin_level(v_actor);
  if v_level is null or v_level > 2 then
    raise exception 'Reserve aux administrateurs L1 / L2';
  end if;

  select * into v_pending from public.pending_payments where id = p_pending_id for update;
  if not found then
    raise exception 'Paiement en attente introuvable';
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'Ce paiement a deja ete traite';
  end if;

  -- Si l'utilisateur a deja un abonnement actif futur, on prolonge a partir de sa fin
  select coalesce(max(current_period_end), now())
    into v_period_start
    from public.subscriptions
    where user_id = v_pending.user_id
      and status = 'active'
      and current_period_end > now();

  v_period_end := v_period_start + public.plan_duration(v_pending.plan);

  insert into public.payments (
    user_id, plan, amount_fcfa, provider,
    provider_transaction_id, status, confirmed_at
  ) values (
    v_pending.user_id, v_pending.plan, v_pending.amount_fcfa, 'manual',
    p_pending_id::text, 'succeeded', now()
  )
  returning id into v_payment_id;

  insert into public.subscriptions (
    user_id, plan, status, amount_fcfa,
    started_at, current_period_end, provider, last_payment_id
  ) values (
    v_pending.user_id, v_pending.plan, 'active', v_pending.amount_fcfa,
    now(), v_period_end, 'manual', v_payment_id
  )
  returning id into v_subscription_id;

  update public.payments
    set subscription_id = v_subscription_id
    where id = v_payment_id;

  update public.pending_payments
    set status = 'validated',
        validated_by = v_actor,
        validated_at = now(),
        subscription_id = v_subscription_id,
        payment_id = v_payment_id
    where id = p_pending_id;

  return query select v_subscription_id, v_payment_id, v_period_end;
end$$;

-- ============================================================
-- 7) RPC admin_reject_pending_payment
-- ============================================================

create or replace function public.admin_reject_pending_payment(
  p_pending_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Non authentifie';
  end if;

  select level into v_level from public.user_admin_level(v_actor);
  if v_level is null or v_level > 2 then
    raise exception 'Reserve aux administrateurs L1 / L2';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Motif de rejet requis';
  end if;

  update public.pending_payments
    set status = 'rejected',
        rejection_reason = trim(p_reason),
        validated_by = v_actor,
        validated_at = now()
    where id = p_pending_id
      and status = 'pending';

  if not found then
    raise exception 'Paiement en attente introuvable ou deja traite';
  end if;
end$$;

-- ============================================================
-- 8) Helper : user_admin_level(user_id) -> level (1..3) ou null
-- Necessaire pour security definer (auth.uid() pas accessible dans certains contextes RPC).
-- Idempotent : on remplace si existe deja.
-- ============================================================

create or replace function public.user_admin_level(p_user_id uuid)
returns table (level int)
language sql
stable
security definer
set search_path = public
as $$
  select case role
    when 'adminlevel1' then 1
    when 'adminlevel2' then 2
    when 'adminlevel3' then 3
    else null::int
  end
  from public.profiles
  where id = p_user_id
  limit 1
$$;
