-- ============================================================
-- AzimutFinance — Presence & online tracking
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
--
-- Architecture :
--   - Table public.user_presence (user_id pk, last_seen_at, session_start_at)
--   - Heartbeat client : RPC presence_ping toutes les 30 s
--   - Une "session" = serie de pings espaces de < 5 min
--   - Online = last_seen_at > now() - 90 s (un peu plus que la cadence ping)
--   - Aucune policy SELECT/INSERT/UPDATE en RLS : tout passe par RPCs
--     security definer qui controlent le role.
-- ============================================================

create table if not exists public.user_presence (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  last_seen_at      timestamptz not null default now(),
  session_start_at  timestamptz not null default now(),
  user_agent        text
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;
-- Aucune policy : acces uniquement via RPCs security definer.

-- ============================================================
-- RPC : presence_ping (heartbeat client toutes les 30 s)
-- ============================================================

create or replace function public.presence_ping(p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_seen timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select last_seen_at into v_last_seen
  from public.user_presence
  where user_id = auth.uid();

  if v_last_seen is null then
    -- Premier ping : nouvelle session
    insert into public.user_presence (user_id, last_seen_at, session_start_at, user_agent)
    values (auth.uid(), now(), now(), p_user_agent);
  elsif (now() - v_last_seen) > interval '5 minutes' then
    -- Gap > 5 min : nouvelle session, on remet session_start_at a maintenant
    update public.user_presence
      set last_seen_at = now(),
          session_start_at = now(),
          user_agent = coalesce(p_user_agent, user_agent)
      where user_id = auth.uid();
  else
    -- Continuation de la session courante
    update public.user_presence
      set last_seen_at = now(),
          user_agent = coalesce(p_user_agent, user_agent)
      where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.presence_ping(text) to authenticated;

-- ============================================================
-- RPC admin : online count (L3+)
-- ============================================================

create or replace function public.admin_online_count(p_threshold_seconds int default 90)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return (
    select count(*)::int
    from public.user_presence
    where last_seen_at > now() - make_interval(secs => p_threshold_seconds)
  );
end;
$$;

grant execute on function public.admin_online_count(int) to authenticated;

-- ============================================================
-- RPC admin : list presence (L3+)
-- Retourne tous les utilisateurs ayant deja pingue, online + offline,
-- avec depuis combien de temps ils sont dans leur etat actuel.
-- ============================================================

create or replace function public.admin_presence_list(
  p_threshold_seconds int default 90
)
returns table (
  user_id           uuid,
  username          text,
  full_name         text,
  email             text,
  role              public.app_role,
  last_seen_at      timestamptz,
  session_start_at  timestamptz,
  user_agent        text,
  is_online         boolean,
  online_seconds    int,
  offline_seconds   int
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
      p.id,
      p.username,
      p.full_name,
      p.email,
      p.role,
      up.last_seen_at,
      up.session_start_at,
      up.user_agent,
      (up.last_seen_at > now() - make_interval(secs => p_threshold_seconds)) as is_online,
      case
        when up.last_seen_at > now() - make_interval(secs => p_threshold_seconds)
        then extract(epoch from now() - up.session_start_at)::int
        else null
      end as online_seconds,
      case
        when up.last_seen_at <= now() - make_interval(secs => p_threshold_seconds)
        then extract(epoch from now() - up.last_seen_at)::int
        else null
      end as offline_seconds
    from public.profiles p
    join public.user_presence up on up.user_id = p.id
    order by up.last_seen_at desc;
end;
$$;

grant execute on function public.admin_presence_list(int) to authenticated;

-- ============================================================
-- RPC admin : SET MEMBER TIER (L2+)
-- Permet de promouvoir/retrograder entre member, premium, pro.
-- Ne touche PAS aux niveaux admin (un L2 ne peut pas casser ou
-- creer un admin — reserve a L1 via admin_set_role).
-- ============================================================

create or replace function public.admin_set_member_tier(
  p_user_id uuid,
  p_tier    text  -- 'member' | 'premium' | 'pro'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.app_role;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_MODIFY_SELF';
  end if;
  if p_tier not in ('member', 'premium', 'pro') then
    raise exception 'INVALID_TIER';
  end if;
  -- Empecher un L2 de toucher a un admin (proteger la chaine)
  select role into v_target_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_target_role in ('adminlevel1', 'adminlevel2', 'adminlevel3') then
    raise exception 'CANNOT_MODIFY_ADMIN';
  end if;
  update public.profiles
    set role = p_tier::public.app_role
    where id = p_user_id;
  perform public._admin_log(
    'set_member_tier', 'user', p_user_id::text,
    jsonb_build_object('new_tier', p_tier, 'previous_role', v_target_role::text),
    null
  );
end;
$$;

grant execute on function public.admin_set_member_tier(uuid, text) to authenticated;

-- ============================================================
-- RPC admin : LOG GENERIC EVENT (L1+)
-- Utilisee par les server actions (ex : upload CSV) qui ne peuvent pas
-- inserer directement dans admin_audit_log a cause de la RLS.
-- ============================================================

create or replace function public.admin_log_event(
  p_action       text,
  p_target_type  text,
  p_target_id    text,
  p_metadata     jsonb,
  p_reason       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(1) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  perform public._admin_log(p_action, p_target_type, p_target_id, p_metadata, p_reason);
end;
$$;

grant execute on function public.admin_log_event(text, text, text, jsonb, text) to authenticated;
