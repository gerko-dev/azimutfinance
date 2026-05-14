-- ============================================================
-- AzimutFinance — Présence v2 : analytique du site (anon + authentifiés)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
--
-- Complete (ne remplace pas) supabase/presence.sql :
--   - presence.sql / user_presence : reste utilise pour l'onglet "Membres
--     connectes" de /admin/presence (vue orientee compte).
--   - Ce fichier ajoute le suivi GLOBAL du trafic (visiteurs anonymes inclus),
--     le dispatching par page et l'historique par snapshots de 8 h.
--
-- Architecture :
--   - public.presence            : une ligne par session active (cle = u:<uid>
--                                  pour un membre, v:<visitor_id> pour un anon)
--   - public.presence_sessions   : journal des sessions terminees (duree reelle)
--   - public.presence_snapshots  : agregats figes toutes les 8 h, par role
--   - RPC presence_ping_v2        : heartbeat client (anon + authentifies)
--   - RPC presence_take_snapshot  : appele par le cron 8 h (service_role)
--   - RPC admin_presence_live / admin_presence_snapshots : lecture (L3+)
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists public.presence (
  presence_key      text primary key,                       -- 'u:'<uid> | 'v:'<visitor_id>
  user_id           uuid references auth.users(id) on delete cascade,
  visitor_id        text,
  role              text not null default 'anonymous',       -- 'anonymous' | app_role
  last_seen_at      timestamptz not null default now(),
  session_start_at  timestamptz not null default now(),
  current_page      text,
  user_agent        text
);
create index if not exists presence_last_seen_idx on public.presence (last_seen_at desc);

create table if not exists public.presence_sessions (
  id                bigint generated always as identity primary key,
  user_id           uuid references auth.users(id) on delete set null,
  visitor_id        text,
  role              text not null,
  session_start_at  timestamptz not null,
  session_end_at    timestamptz not null,
  duration_seconds  int not null,
  was_authenticated boolean not null,
  created_at        timestamptz not null default now()
);
create index if not exists presence_sessions_end_idx
  on public.presence_sessions (session_end_at desc);

create table if not exists public.presence_snapshots (
  id                   bigint generated always as identity primary key,
  snapshot_at          timestamptz not null default now(),
  role                 text not null,
  online_count         int not null,        -- pings < 90 s au moment du snapshot
  sessions_count       int not null,        -- sessions terminees sur les 8 dernieres heures
  avg_session_seconds  int                  -- duree moyenne de ces sessions
);
create index if not exists presence_snapshots_at_idx
  on public.presence_snapshots (snapshot_at desc);

-- RLS : aucune policy — tout passe par des RPC security definer / le service_role.
alter table public.presence            enable row level security;
alter table public.presence_sessions   enable row level security;
alter table public.presence_snapshots  enable row level security;

-- ------------------------------------------------------------
-- RPC : presence_ping_v2 — heartbeat client (anon + authentifies)
-- Appele toutes les 30 s + a chaque changement de page.
-- ------------------------------------------------------------

create or replace function public.presence_ping_v2(
  p_page       text default null,
  p_visitor_id text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_role text;
  v_last timestamptz;
begin
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
    select role::text into v_role from public.profiles where id = v_uid;
    v_role := coalesce(v_role, 'member');
  elsif p_visitor_id is not null and length(p_visitor_id) between 8 and 64 then
    v_key  := 'v:' || p_visitor_id;
    v_role := 'anonymous';
  else
    return;  -- ni authentifie ni visitor_id exploitable : on ignore
  end if;

  select last_seen_at into v_last from public.presence where presence_key = v_key;

  if v_last is null then
    insert into public.presence
      (presence_key, user_id, visitor_id, role, last_seen_at, session_start_at, current_page, user_agent)
    values
      (v_key, v_uid, p_visitor_id, v_role, now(), now(), p_page, p_user_agent);

  elsif (now() - v_last) > interval '5 minutes' then
    -- Gap > 5 min : la session precedente est terminee → on l'archive,
    -- puis on rouvre une session sur la meme cle.
    insert into public.presence_sessions
      (user_id, visitor_id, role, session_start_at, session_end_at, duration_seconds, was_authenticated)
    select user_id, visitor_id, role, session_start_at, last_seen_at,
           greatest(0, extract(epoch from last_seen_at - session_start_at))::int,
           user_id is not null
    from public.presence where presence_key = v_key;

    update public.presence set
      user_id          = v_uid,
      visitor_id       = p_visitor_id,
      role             = v_role,
      last_seen_at     = now(),
      session_start_at = now(),
      current_page     = p_page,
      user_agent       = coalesce(p_user_agent, user_agent)
    where presence_key = v_key;

  else
    -- Continuation de la session courante.
    update public.presence set
      role         = v_role,
      last_seen_at = now(),
      current_page = coalesce(p_page, current_page),
      user_agent   = coalesce(p_user_agent, user_agent)
    where presence_key = v_key;
  end if;
end;
$$;

grant execute on function public.presence_ping_v2(text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- RPC : presence_take_snapshot — appelee par le cron toutes les 8 h
-- 1. Archive les sessions mortes (aucun ping depuis > 5 min)
-- 2. Insere un snapshot par role (online courant + sessions des 8 dernieres h)
-- Reservee au service_role (cf. app/api/cron/presence-snapshot).
-- ------------------------------------------------------------

create or replace function public.presence_take_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now();
  v_archived int;
  v_rows     int;
begin
  -- 1. Sessions terminees → journal, puis purge de la table presence.
  with dead as (
    delete from public.presence
    where last_seen_at < v_now - interval '5 minutes'
    returning user_id, visitor_id, role, session_start_at, last_seen_at
  )
  insert into public.presence_sessions
    (user_id, visitor_id, role, session_start_at, session_end_at, duration_seconds, was_authenticated)
  select user_id, visitor_id, role, session_start_at, last_seen_at,
         greatest(0, extract(epoch from last_seen_at - session_start_at))::int,
         user_id is not null
  from dead;
  get diagnostics v_archived = row_count;

  -- 2. Snapshot par role.
  with online as (
    select role, count(*)::int as c
    from public.presence
    where last_seen_at > v_now - interval '90 seconds'
    group by role
  ),
  recent as (
    select role, count(*)::int as c, avg(duration_seconds)::int as avg_s
    from public.presence_sessions
    where session_end_at > v_now - interval '8 hours'
    group by role
  ),
  roles as (
    select role from online union select role from recent
  )
  insert into public.presence_snapshots
    (snapshot_at, role, online_count, sessions_count, avg_session_seconds)
  select v_now, r.role, coalesce(o.c, 0), coalesce(rc.c, 0), rc.avg_s
  from roles r
  left join online o  on o.role  = r.role
  left join recent rc on rc.role = r.role;
  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'at', v_now,
    'archived_sessions', v_archived,
    'snapshot_rows', v_rows
  );
end;
$$;

grant execute on function public.presence_take_snapshot() to service_role;

-- ------------------------------------------------------------
-- RPC admin : presence live (L3+)
-- Total en ligne + dispatching par page + par role.
-- ------------------------------------------------------------

create or replace function public.admin_presence_live(p_threshold_seconds int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cut timestamptz := now() - make_interval(secs => p_threshold_seconds);
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return jsonb_build_object(
    'total',
      (select count(*)::int from public.presence where last_seen_at > v_cut),
    'authenticated',
      (select count(*)::int from public.presence
        where last_seen_at > v_cut and user_id is not null),
    'anonymous',
      (select count(*)::int from public.presence
        where last_seen_at > v_cut and user_id is null),
    'by_page', coalesce((
      select jsonb_agg(jsonb_build_object('page', page, 'count', c) order by c desc)
      from (
        select coalesce(nullif(current_page, ''), '(inconnue)') as page, count(*)::int as c
        from public.presence
        where last_seen_at > v_cut
        group by 1
      ) t
    ), '[]'::jsonb),
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object('role', role, 'count', c) order by c desc)
      from (
        select role, count(*)::int as c
        from public.presence
        where last_seen_at > v_cut
        group by role
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_presence_live(int) to authenticated;

-- ------------------------------------------------------------
-- RPC admin : historique des snapshots (L3+)
-- ------------------------------------------------------------

create or replace function public.admin_presence_snapshots(p_limit int default 90)
returns table (
  snapshot_at         timestamptz,
  role                text,
  online_count        int,
  sessions_count      int,
  avg_session_seconds int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select s.snapshot_at, s.role, s.online_count, s.sessions_count, s.avg_session_seconds
    from public.presence_snapshots s
    order by s.snapshot_at desc, s.role
    limit p_limit;
end;
$$;

grant execute on function public.admin_presence_snapshots(int) to authenticated;
