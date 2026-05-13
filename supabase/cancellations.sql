-- ============================================================
-- AzimutFinance — Annulation d'abonnement Premium
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/subscriptions.sql et supabase/admin.sql
-- Idempotent.
--
-- Politique :
--   - Acces coupe immediatement : status='cancelled' ET current_period_end=now()
--   - Le trigger sync_profile_role_from_subscription redescend le role a 'member'
--     (sauf 'pro' ou 'adminlevel*' qui sont preserves)
--   - Audit log cote admin
-- ============================================================

-- ============================================================
-- 0) RLS : permettre aux admins L1/L2 de LIRE la table subscriptions
--    (necessaire pour /admin/abonnements onglet Valides afin d'afficher
--    le bouton "Annuler l'abonnement" uniquement sur les subs encore actives)
-- ============================================================

drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin
  on public.subscriptions for select
  to authenticated
  using (public.is_admin_at_least(2));

-- ============================================================
-- 1) RPC cancel_my_premium : l'utilisateur annule son propre abonnement
-- ============================================================

create or replace function public.cancel_my_premium()
returns table (
  cancelled_subscription_id uuid,
  cancelled_at              timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_sub_id uuid;
  v_now timestamptz := now();
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Non authentifie';
  end if;

  -- Recherche la subscription active courante (current_period_end > now)
  select id into v_sub_id
  from public.subscriptions
  where user_id = v_user
    and status = 'active'
    and current_period_end > v_now
  order by current_period_end desc
  limit 1;

  if v_sub_id is null then
    raise exception 'Aucun abonnement actif a annuler';
  end if;

  update public.subscriptions
    set status = 'cancelled',
        current_period_end = v_now
    where id = v_sub_id;

  -- Defensive : redescendre profiles.role a 'member' meme si le trigger
  -- sync_profile_role_from_subscription n'est pas (re)installe. On preserve
  -- 'pro' et les roles admin.
  update public.profiles
    set role = 'member'
    where id = v_user
      and role = 'premium';

  return query select v_sub_id, v_now;
end$$;

grant execute on function public.cancel_my_premium() to authenticated;

-- ============================================================
-- 2) RPC admin_cancel_subscription : admin (L1/L2) annule une sub donnee
-- ============================================================

create or replace function public.admin_cancel_subscription(
  p_subscription_id uuid,
  p_reason          text
)
returns table (
  cancelled_subscription_id uuid,
  cancelled_user_id         uuid,
  cancelled_at              timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_level int;
  v_sub public.subscriptions%rowtype;
  v_now timestamptz := now();
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Non authentifie';
  end if;

  select level into v_level from public.user_admin_level(v_actor);
  if v_level is null or v_level > 1 then
    raise exception 'Reserve aux super-administrateurs (L1)';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Motif d''annulation requis';
  end if;

  select * into v_sub
    from public.subscriptions
    where id = p_subscription_id
    for update;

  if not found then
    raise exception 'Abonnement introuvable';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'Cet abonnement n''est pas actif (statut : %)', v_sub.status;
  end if;

  update public.subscriptions
    set status = 'cancelled',
        current_period_end = v_now
    where id = p_subscription_id;

  -- Defensive : redescendre le role de l'utilisateur a 'member' meme si
  -- le trigger sync_profile_role_from_subscription n'est pas (re)installe.
  -- On preserve 'pro' et les roles admin.
  update public.profiles
    set role = 'member'
    where id = v_sub.user_id
      and role = 'premium';

  perform public._admin_log(
    'subscription_cancel',
    'subscription',
    p_subscription_id::text,
    jsonb_build_object(
      'user_id', v_sub.user_id,
      'plan', v_sub.plan,
      'cancelled_at', v_now
    ),
    p_reason
  );

  return query select v_sub.id, v_sub.user_id, v_now;
end$$;

grant execute on function public.admin_cancel_subscription(uuid, text) to authenticated;
