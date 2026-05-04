-- ============================================================
-- AzimutFinance — Admin · vue détaillée d'un membre
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- RPC : admin_member_summary(p_user_id)
--   Renvoie un agregat complet : profil + presence + stats messagerie +
--   stats simulateur (par saison) + comptage transactions.
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
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Profil complet
  select to_json(p) into v_profile
  from public.profiles p
  where p.id = p_user_id;

  -- Presence (peut etre null si jamais pingue)
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

  -- Stats messagerie : nb conversations, nb messages envoyes, nb messages reçus
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

  -- Stats simulateur : par saison
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

  -- 10 dernieres entrees d'audit ciblant ce user
  select coalesce(json_agg(row_to_json(a) order by a.created_at desc), '[]'::json) into v_recent_audit
  from (
    select id, action, target_type, target_id, metadata, reason, created_at, actor_role
    from public.admin_audit_log
    where target_id = p_user_id::text
    order by created_at desc
    limit 10
  ) a;

  return json_build_object(
    'profile',     v_profile,
    'presence',    v_presence,
    'messagerie',  v_messagerie,
    'portfolios',  v_portfolios,
    'audit',       v_recent_audit
  );
end;
$$;

grant execute on function public.admin_member_summary(uuid) to authenticated;
