-- ============================================================
-- AzimutFinance — Sanctions graduées : avertissement, suspension, ban
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Hierarchie :
--   - Avertissement : trace dans warning_count + audit. Pas d'effet bloquant.
--                     Visible cote membre via banner.
--   - Suspension temporaire : suspended_until = date future. Membre ne peut
--                             pas acceder aux routes protegees.
--   - Ban permanent : suspended_until = 'infinity'. Idem suspension mais
--                     sans date de fin. Reservé L1.
--
-- Niveaux requis :
--   - admin_warn_user : L2+
--   - admin_suspend_user : L2+ (L2 max 30 jours, L1 illimité)
--   - admin_unsuspend_user : L2+
--   - admin_ban_user : L1 only
-- ============================================================

-- 1) Colonnes profiles
alter table public.profiles
  add column if not exists suspended_until    timestamptz,
  add column if not exists suspension_reason  text,
  add column if not exists warning_count      int not null default 0;

create index if not exists profiles_suspended_until_idx
  on public.profiles (suspended_until)
  where suspended_until is not null;

-- 2) Helper public : statut suspension de l'utilisateur courant
create or replace function public.my_suspension_status()
returns table (
  is_suspended       boolean,
  suspended_until    timestamptz,
  suspension_reason  text,
  warning_count      int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(suspended_until > now(), false) as is_suspended,
    suspended_until,
    suspension_reason,
    warning_count
  from public.profiles
  where id = auth.uid();
$$;

grant execute on function public.my_suspension_status() to authenticated;

-- ============================================================
-- 3) RPC admin : WARN USER (L2+)
-- ============================================================

create or replace function public.admin_warn_user(
  p_user_id uuid,
  p_reason  text,
  p_message text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_MODIFY_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.profiles
    set warning_count = warning_count + 1
    where id = p_user_id;

  perform public._admin_log(
    'warn_user', 'user', p_user_id::text,
    jsonb_build_object('message', coalesce(p_message, '')),
    p_reason
  );
end;
$$;

grant execute on function public.admin_warn_user(uuid, text, text) to authenticated;

-- ============================================================
-- 4) RPC admin : SUSPEND USER (L2+ avec quota duree)
--    L2 max 30 jours, L1 illimite.
-- ============================================================

create or replace function public.admin_suspend_user(
  p_user_id uuid,
  p_until   timestamptz,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level         int;
  v_target_role   public.app_role;
  v_max_duration  interval;
begin
  v_level := public.my_admin_level();
  if v_level is null then
    raise exception 'NOT_ADMIN';
  end if;
  if v_level > 2 then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_MODIFY_SELF';
  end if;
  if p_until <= now() then
    raise exception 'INVALID_DATE';
  end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  -- Empecher un L2 de suspendre un admin
  select role into v_target_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_level = 2 and v_target_role in ('adminlevel1', 'adminlevel2', 'adminlevel3') then
    raise exception 'CANNOT_MODIFY_ADMIN';
  end if;

  -- L2 plafonne a 30 jours
  if v_level = 2 then
    v_max_duration := interval '30 days';
    if (p_until - now()) > v_max_duration then
      raise exception 'L2_MAX_30_DAYS';
    end if;
  end if;

  update public.profiles
    set suspended_until = p_until,
        suspension_reason = p_reason
    where id = p_user_id;

  perform public._admin_log(
    'suspend_user', 'user', p_user_id::text,
    jsonb_build_object(
      'until', p_until,
      'duration_seconds', extract(epoch from (p_until - now()))::int
    ),
    p_reason
  );
end;
$$;

grant execute on function public.admin_suspend_user(uuid, timestamptz, text) to authenticated;

-- ============================================================
-- 5) RPC admin : BAN USER (L1 only, suspended_until = 'infinity')
-- ============================================================

create or replace function public.admin_ban_user(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_MODIFY_SELF';
  end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
    set suspended_until = 'infinity'::timestamptz,
        suspension_reason = p_reason
    where id = p_user_id;

  perform public._admin_log(
    'ban_user', 'user', p_user_id::text, null, p_reason
  );
end;
$$;

grant execute on function public.admin_ban_user(uuid, text) to authenticated;

-- ============================================================
-- 6) RPC admin : UNSUSPEND USER (L2+)
-- ============================================================

create or replace function public.admin_unsuspend_user(
  p_user_id uuid,
  p_reason  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
    set suspended_until = null,
        suspension_reason = null
    where id = p_user_id;

  perform public._admin_log(
    'unsuspend_user', 'user', p_user_id::text, null, p_reason
  );
end;
$$;

grant execute on function public.admin_unsuspend_user(uuid, text) to authenticated;

-- ============================================================
-- 7) Mise a jour : admin_member_summary inclut le statut sanction
-- (on regenere la fonction pour ajouter sanctions)
-- ============================================================

create or replace function public.admin_member_summary(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile          json;
  v_presence         json;
  v_messagerie       json;
  v_portfolios       json;
  v_recent_audit     json;
  v_sanctions        json;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  select to_json(p) into v_profile
  from public.profiles p
  where p.id = p_user_id;

  select to_json(up) into v_presence
  from (
    select
      last_seen_at,
      session_start_at,
      user_agent,
      (last_seen_at > now() - interval '90 seconds') as is_online,
      case
        when last_seen_at > now() - interval '90 seconds'
        then extract(epoch from now() - session_start_at)::int
        else null
      end as online_seconds,
      case
        when last_seen_at <= now() - interval '90 seconds'
        then extract(epoch from now() - last_seen_at)::int
        else null
      end as offline_seconds
    from public.user_presence
    where user_id = p_user_id
  ) up;

  select json_build_object(
    'conversations_count',
      (select count(*) from public.conversation_participants where user_id = p_user_id),
    'messages_sent',
      (select count(*) from public.messages where sender_id = p_user_id),
    'messages_received', (
      select count(*)
      from public.messages m
      join public.conversation_participants cp
        on cp.conversation_id = m.conversation_id
        and cp.user_id = p_user_id
      where m.sender_id <> p_user_id
    ),
    'last_message_at', (
      select max(created_at) from public.messages where sender_id = p_user_id
    )
  ) into v_messagerie;

  select coalesce(json_agg(row_to_json(p) order by p.joined_at desc), '[]'::json) into v_portfolios
  from (
    select
      sp.id            as portfolio_id,
      sp.season_id,
      ss.name          as season_name,
      ss.status        as season_status,
      sp.cash,
      sp.joined_at,
      ss.initial_capital,
      ss.transaction_fee_pct,
      (select count(*) from public.simulator_transactions where portfolio_id = sp.id) as transactions_count,
      (select coalesce(sum(case when type = 'BUY' then 1 else 0 end), 0)
        from public.simulator_transactions where portfolio_id = sp.id) as buy_count,
      (select coalesce(sum(case when type = 'SELL' then 1 else 0 end), 0)
        from public.simulator_transactions where portfolio_id = sp.id) as sell_count
    from public.simulator_portfolios sp
    join public.simulator_seasons ss on ss.id = sp.season_id
    where sp.user_id = p_user_id
  ) p;

  select coalesce(json_agg(row_to_json(a) order by a.created_at desc), '[]'::json) into v_recent_audit
  from (
    select id, action, target_type, target_id, metadata, reason, created_at, actor_role
    from public.admin_audit_log
    where target_id = p_user_id::text
    order by created_at desc
    limit 10
  ) a;

  -- Sanctions : statut courant + historique des warns/suspends/bans
  select json_build_object(
    'is_suspended', coalesce((select suspended_until > now() from public.profiles where id = p_user_id), false),
    'is_banned',    coalesce((select suspended_until = 'infinity' from public.profiles where id = p_user_id), false),
    'suspended_until', (select suspended_until from public.profiles where id = p_user_id),
    'suspension_reason', (select suspension_reason from public.profiles where id = p_user_id),
    'warning_count', (select warning_count from public.profiles where id = p_user_id),
    'history', coalesce((
      select json_agg(row_to_json(h) order by h.created_at desc)
      from (
        select action, reason, metadata, actor_role, created_at
        from public.admin_audit_log
        where target_id = p_user_id::text
          and action in ('warn_user', 'suspend_user', 'unsuspend_user', 'ban_user')
        order by created_at desc
        limit 20
      ) h
    ), '[]'::json)
  ) into v_sanctions;

  return json_build_object(
    'profile',     v_profile,
    'presence',    v_presence,
    'messagerie',  v_messagerie,
    'portfolios',  v_portfolios,
    'audit',       v_recent_audit,
    'sanctions',   v_sanctions
  );
end;
$$;
