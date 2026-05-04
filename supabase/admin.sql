-- ============================================================
-- AzimutFinance — Admin · ETAPE 2 / 2 : RPCs + audit + RLS
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- ⚠️  PREREQUIS : avoir execute admin-step1-enum.sql en premier
--    (et clique "Run" pour commiter). Sinon, erreur 55P04
--    "unsafe use of new value 'adminlevel1' of enum type app_role".
--
-- Idempotent : peut etre rejoue sans casse.
--
-- Hierarchie :
--   adminlevel1 (level 1) = super-admin, toutes les habilitations
--   adminlevel2 (level 2) = admin operationnel
--   adminlevel3 (level 3) = moderateur (acces lecture + suppression de
--                                       messages signales)
--
-- Convention : "level X >= Y" signifie X plus puissant que Y. Comme nos
-- niveaux sont des entiers (1 plus haut = plus puissant), on compare via
-- "current_level <= required_level". La fonction is_admin_at_least(2)
-- accepte donc level 1 et level 2.
-- ============================================================

-- 1) Helper : niveau admin de l'utilisateur courant (1, 2, 3, ou null)
create or replace function public.my_admin_level()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case role
    when 'adminlevel1' then 1
    when 'adminlevel2' then 2
    when 'adminlevel3' then 3
    else null
  end
  from public.profiles
  where id = auth.uid();
$$;

grant execute on function public.my_admin_level() to authenticated;

-- 2) Helper : verifie que l'utilisateur a AU MOINS le niveau requis
create or replace function public.is_admin_at_least(p_min_level int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_admin_level() <= p_min_level, false);
$$;

grant execute on function public.is_admin_at_least(int) to authenticated;

-- ============================================================
-- 3) Audit log : tracer toutes les actions admin
-- ============================================================

create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references auth.users(id) on delete set null,
  actor_role    public.app_role,
  action        text not null,
  target_type   text,
  target_id     text,
  metadata      jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;

-- Lecture : level 2 et plus haut. Pas d'INSERT/UPDATE/DELETE direct
-- (ecriture via fonction _admin_log security definer uniquement).
drop policy if exists "audit_log_read_admin_l2" on public.admin_audit_log;
create policy "audit_log_read_admin_l2"
  on public.admin_audit_log for select
  to authenticated
  using (public.is_admin_at_least(2));

-- 4) Helper interne : enregistre une action dans le journal d'audit
create or replace function public._admin_log(
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_metadata    jsonb,
  p_reason      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  insert into public.admin_audit_log
    (actor_id, actor_role, action, target_type, target_id, metadata, reason)
  values
    (auth.uid(), v_role, p_action, p_target_type, p_target_id, p_metadata, p_reason);
end;
$$;

-- ============================================================
-- 5) RPC admin : LIST MEMBERS (tous les niveaux)
-- ============================================================

create or replace function public.admin_list_members(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id            uuid,
  email         text,
  username      text,
  full_name     text,
  role          public.app_role,
  country       public.uemoa_country,
  created_at    timestamptz,
  onboarded_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select p.id, p.email, p.username, p.full_name, p.role, p.country,
           p.created_at, p.onboarded_at
    from public.profiles p
    where p_search is null
       or p.email ilike '%' || p_search || '%'
       or coalesce(p.username, '') ilike '%' || p_search || '%'
       or coalesce(p.full_name, '') ilike '%' || p_search || '%'
    order by p.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_members(text, int, int) to authenticated;

-- ============================================================
-- 6) RPC admin : SET ROLE (level 1 uniquement)
-- ============================================================

create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    public.app_role
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
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform public._admin_log(
    'set_role', 'user', p_user_id::text,
    jsonb_build_object('new_role', p_role::text), null
  );
end;
$$;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;

-- ============================================================
-- 7) RPC admin : DELETE USER (level 1 uniquement)
-- ============================================================

create or replace function public.admin_delete_user(
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
    raise exception 'CANNOT_DELETE_SELF';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  -- Audit AVANT le delete (pour avoir une trace meme si le delete cascade)
  perform public._admin_log(
    'delete_user', 'user', p_user_id::text, null, p_reason
  );
  delete from auth.users where id = p_user_id;
end;
$$;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- ============================================================
-- 8) RPC admin : DELETE MESSAGE (level 3+ : tous les admins)
-- ============================================================

create or replace function public.admin_delete_message(
  p_message_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages%rowtype;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;
  perform public._admin_log(
    'delete_message', 'message', p_message_id::text,
    jsonb_build_object(
      'conversation_id', v_msg.conversation_id::text,
      'sender_id', v_msg.sender_id::text,
      'body_preview', left(v_msg.body, 200)
    ),
    p_reason
  );
  delete from public.messages where id = p_message_id;
end;
$$;
grant execute on function public.admin_delete_message(uuid, text) to authenticated;

-- ============================================================
-- 9) RPC admin : DELETE CONVERSATION (level 2+)
-- ============================================================

create or replace function public.admin_delete_conversation(
  p_conversation_id uuid,
  p_reason          text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;
  perform public._admin_log(
    'delete_conversation', 'conversation', p_conversation_id::text, null, p_reason
  );
  delete from public.conversations where id = p_conversation_id;
end;
$$;
grant execute on function public.admin_delete_conversation(uuid, text) to authenticated;

-- ============================================================
-- 10) RPC admin : RECENT MESSAGES (pour la moderation, level 3+)
-- ============================================================

create or replace function public.admin_recent_messages(p_limit int default 100)
returns table (
  id              uuid,
  conversation_id uuid,
  sender_id       uuid,
  sender_username text,
  sender_email    text,
  body            text,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select m.id, m.conversation_id, m.sender_id,
           p.username, p.email, m.body, m.created_at
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    order by m.created_at desc
    limit p_limit;
end;
$$;
grant execute on function public.admin_recent_messages(int) to authenticated;

-- ============================================================
-- 11) RPC admin : SAISONS (level 2+ pour create/update)
-- ============================================================

create or replace function public.admin_create_season(
  p_name             text,
  p_starts_at        date,
  p_ends_at          date,
  p_initial_capital  bigint,
  p_fee_pct          numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_status text;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'INVALID_DATES';
  end if;
  v_status := case
    when p_starts_at <= current_date and p_ends_at >= current_date then 'active'
    when p_starts_at > current_date then 'upcoming'
    else 'ended'
  end;
  insert into public.simulator_seasons
    (name, starts_at, ends_at, initial_capital, transaction_fee_pct, status)
  values
    (p_name, p_starts_at, p_ends_at, p_initial_capital, p_fee_pct, v_status)
  returning id into v_id;
  perform public._admin_log(
    'create_season', 'season', v_id::text,
    jsonb_build_object(
      'name', p_name,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'initial_capital', p_initial_capital
    ),
    null
  );
  return v_id;
end;
$$;
grant execute on function public.admin_create_season(text, date, date, bigint, numeric) to authenticated;

create or replace function public.admin_set_season_status(
  p_season_id uuid,
  p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_status not in ('upcoming', 'active', 'ended') then
    raise exception 'INVALID_STATUS';
  end if;
  if not exists (select 1 from public.simulator_seasons where id = p_season_id) then
    raise exception 'SEASON_NOT_FOUND';
  end if;
  update public.simulator_seasons
    set status = p_status, updated_at = now()
    where id = p_season_id;
  perform public._admin_log(
    'set_season_status', 'season', p_season_id::text,
    jsonb_build_object('new_status', p_status), null
  );
end;
$$;
grant execute on function public.admin_set_season_status(uuid, text) to authenticated;

-- ============================================================
-- 12) RPC admin : RESET PORTFOLIO (level 2+)
-- Reinitialise un portefeuille au capital initial : supprime les
-- transactions et restore le cash.
-- ============================================================

create or replace function public.admin_reset_portfolio(
  p_portfolio_id uuid,
  p_reason       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initial_capital bigint;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select s.initial_capital into v_initial_capital
  from public.simulator_portfolios p
  join public.simulator_seasons s on s.id = p.season_id
  where p.id = p_portfolio_id;
  if not found then
    raise exception 'PORTFOLIO_NOT_FOUND';
  end if;
  delete from public.simulator_transactions where portfolio_id = p_portfolio_id;
  update public.simulator_portfolios set cash = v_initial_capital where id = p_portfolio_id;
  perform public._admin_log(
    'reset_portfolio', 'portfolio', p_portfolio_id::text, null, p_reason
  );
end;
$$;
grant execute on function public.admin_reset_portfolio(uuid, text) to authenticated;

-- ============================================================
-- 13) RPC admin : STATS DASHBOARD (level 3+)
-- ============================================================

create or replace function public.admin_dashboard_stats()
returns table (
  total_users         bigint,
  total_admins        bigint,
  total_messages      bigint,
  total_conversations bigint,
  total_transactions  bigint,
  active_seasons      bigint,
  audit_last_24h      bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select
      (select count(*) from public.profiles) as total_users,
      (select count(*) from public.profiles where role in ('adminlevel1','adminlevel2','adminlevel3')) as total_admins,
      (select count(*) from public.messages) as total_messages,
      (select count(*) from public.conversations) as total_conversations,
      (select count(*) from public.simulator_transactions) as total_transactions,
      (select count(*) from public.simulator_seasons where status = 'active') as active_seasons,
      (select count(*) from public.admin_audit_log where created_at > now() - interval '24 hours') as audit_last_24h;
end;
$$;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ============================================================
-- 14) RPC admin : LIST AUDIT LOG (level 2+)
-- ============================================================

create or replace function public.admin_list_audit(
  p_limit  int default 100,
  p_offset int default 0
)
returns table (
  id            uuid,
  actor_id      uuid,
  actor_role    public.app_role,
  actor_email   text,
  actor_username text,
  action        text,
  target_type   text,
  target_id     text,
  metadata      jsonb,
  reason        text,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select a.id, a.actor_id, a.actor_role, p.email, p.username,
           a.action, a.target_type, a.target_id, a.metadata, a.reason, a.created_at
    from public.admin_audit_log a
    left join public.profiles p on p.id = a.actor_id
    order by a.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_audit(int, int) to authenticated;

-- ============================================================
-- 15) Promotion initiale (a editer manuellement avec votre email)
-- Decommenter et remplacer 'votre@email.com' par votre vraie adresse.
-- ============================================================

-- update public.profiles
--   set role = 'adminlevel1'
-- where email = 'votre@email.com';
