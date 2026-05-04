-- ============================================================
-- AzimutFinance — Signalements de messages (membres → admin)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
--
-- Concept :
--   Un membre signale un message via report_message().
--   Les admins (L3+) traitent la queue dans /admin/signalements.
--   Le report ne fait PAS office de sanction : il enregistre un signal.
--   Les vraies actions (delete_message, warn, suspend, ban) restent les
--   RPC existantes ; admin_resolve_report consigne juste comment le
--   signalement a ete traite.
--
-- Niveaux requis :
--   - report_message      : authentifie + participant de la conversation
--   - admin_list_reports  : L3+ (moderateur)
--   - admin_resolve_report: L3+ (mais L3 ne peut que "dismiss")
-- ============================================================

-- 1) Table des signalements
create table if not exists public.message_reports (
  id                  uuid primary key default gen_random_uuid(),
  message_id          uuid not null references public.messages(id) on delete cascade,
  reporter_id         uuid not null references auth.users(id) on delete cascade,
  category            text not null,
  note                text,
  status              text not null default 'open',
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  resolution_action   text,
  resolution_note     text,
  constraint message_reports_category_check
    check (category in ('spam', 'harcelement', 'insulte', 'arnaque', 'autre')),
  constraint message_reports_status_check
    check (status in ('open', 'actioned', 'dismissed')),
  constraint message_reports_note_length
    check (note is null or char_length(note) <= 500),
  constraint message_reports_unique_per_reporter
    unique (message_id, reporter_id)
);

create index if not exists message_reports_status_idx
  on public.message_reports (status, created_at desc);
create index if not exists message_reports_message_idx
  on public.message_reports (message_id);
create index if not exists message_reports_reporter_idx
  on public.message_reports (reporter_id, created_at desc);

-- 2) RLS : pas d'acces direct via la table. Tout passe par les RPC.
alter table public.message_reports enable row level security;
-- (pas de policy : aucun role authenticated ne peut lire/ecrire en direct)

-- ============================================================
-- 3) RPC membre : REPORT MESSAGE
--    - L'utilisateur doit etre participant de la conversation du message
--    - Ne peut pas signaler ses propres messages
--    - Anti-flood : max 10 signalements ouverts dans les 24h
--    - Anti-doublon : unique(message_id, reporter_id) leve ALREADY_REPORTED
-- ============================================================

create or replace function public.report_message(
  p_message_id uuid,
  p_category   text,
  p_note       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid;
  v_msg             public.messages%rowtype;
  v_recent_count    int;
  v_report_id       uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_category is null
     or p_category not in ('spam', 'harcelement', 'insulte', 'arnaque', 'autre') then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_msg.sender_id = v_uid then
    raise exception 'CANNOT_REPORT_OWN_MESSAGE';
  end if;

  if not public.is_conversation_participant(v_msg.conversation_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- Anti-flood : max 10 reports ouverts (status=open) dans les dernieres 24h
  select count(*) into v_recent_count
    from public.message_reports
    where reporter_id = v_uid
      and created_at > now() - interval '24 hours';
  if v_recent_count >= 10 then
    raise exception 'RATE_LIMIT_EXCEEDED';
  end if;

  insert into public.message_reports (message_id, reporter_id, category, note)
  values (p_message_id, v_uid, p_category, nullif(trim(p_note), ''))
  returning id into v_report_id;

  return v_report_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REPORTED';
end;
$$;

grant execute on function public.report_message(uuid, text, text) to authenticated;

-- ============================================================
-- 4) RPC admin : LIST REPORTS (L3+)
--    Retourne reports avec contexte : reporter, auteur du message,
--    preview du body, nb total de reports sur le meme message.
-- ============================================================

create or replace function public.admin_list_reports(
  p_status text default 'open',
  p_limit  int  default 100,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  message_id          uuid,
  conversation_id     uuid,
  category            text,
  note                text,
  status              text,
  created_at          timestamptz,
  resolved_at         timestamptz,
  resolution_action   text,
  resolution_note     text,
  reporter_id         uuid,
  reporter_username   text,
  reporter_email      text,
  sender_id           uuid,
  sender_username     text,
  sender_email        text,
  resolver_id         uuid,
  resolver_username   text,
  body_preview        text,
  message_created_at  timestamptz,
  reports_total       int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;

  if p_status is not null
     and p_status not in ('open', 'actioned', 'dismissed', 'all') then
    raise exception 'INVALID_STATUS';
  end if;

  return query
    select
      r.id,
      r.message_id,
      m.conversation_id,
      r.category,
      r.note,
      r.status,
      r.created_at,
      r.resolved_at,
      r.resolution_action,
      r.resolution_note,
      r.reporter_id,
      pr.username  as reporter_username,
      pr.email     as reporter_email,
      m.sender_id,
      ps.username  as sender_username,
      ps.email     as sender_email,
      r.resolved_by as resolver_id,
      pres.username as resolver_username,
      left(coalesce(m.body, ''), 280) as body_preview,
      m.created_at as message_created_at,
      (select count(*)::int
         from public.message_reports r2
         where r2.message_id = r.message_id) as reports_total
    from public.message_reports r
    left join public.messages m  on m.id = r.message_id
    left join public.profiles pr on pr.id = r.reporter_id
    left join public.profiles ps on ps.id = m.sender_id
    left join public.profiles pres on pres.id = r.resolved_by
    where p_status is null
       or p_status = 'all'
       or r.status = p_status
    order by r.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

grant execute on function public.admin_list_reports(text, int, int) to authenticated;

-- ============================================================
-- 5) RPC admin : COUNT OPEN REPORTS (L3+)
-- ============================================================

create or replace function public.admin_open_reports_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin_at_least(3) then
      (select count(*)::int from public.message_reports where status = 'open')
    else 0
  end;
$$;

grant execute on function public.admin_open_reports_count() to authenticated;

-- ============================================================
-- 6) RPC admin : RESOLVE REPORT (L3+ pour dismiss, L2+ pour actioned)
--    p_action vaut 'dismiss' ou 'action'
--    p_resolution_action est un libelle libre decrivant la sanction
--    appliquee separement (ex : 'message_deleted', 'user_warned',
--    'user_suspended', 'user_banned', 'no_action').
-- ============================================================

create or replace function public.admin_resolve_report(
  p_report_id          uuid,
  p_action             text,
  p_resolution_action  text default null,
  p_resolution_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level    int;
  v_report   public.message_reports%rowtype;
  v_status   text;
begin
  v_level := public.my_admin_level();
  if v_level is null then
    raise exception 'NOT_ADMIN';
  end if;

  if p_action not in ('dismiss', 'action') then
    raise exception 'INVALID_ACTION';
  end if;

  -- L3 ne peut que dismiss ; pour marquer "traité" il faut au minimum L2.
  if p_action = 'action' and v_level > 2 then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_report from public.message_reports where id = p_report_id;
  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;
  if v_report.status <> 'open' then
    raise exception 'ALREADY_RESOLVED';
  end if;

  v_status := case when p_action = 'action' then 'actioned' else 'dismissed' end;

  update public.message_reports
    set status            = v_status,
        resolved_at       = now(),
        resolved_by       = auth.uid(),
        resolution_action = nullif(trim(coalesce(p_resolution_action, '')), ''),
        resolution_note   = nullif(trim(coalesce(p_resolution_note, '')), '')
    where id = p_report_id;

  perform public._admin_log(
    case when p_action = 'action' then 'action_report' else 'dismiss_report' end,
    'report', p_report_id::text,
    jsonb_build_object(
      'message_id', v_report.message_id::text,
      'category', v_report.category,
      'resolution_action', p_resolution_action
    ),
    p_resolution_note
  );
end;
$$;

grant execute on function public.admin_resolve_report(uuid, text, text, text) to authenticated;

-- ============================================================
-- 7) Cleanup : si la table existait deja sans certaines colonnes,
--    on les rajoute pour rester idempotent.
-- ============================================================
alter table public.message_reports
  add column if not exists resolution_action text,
  add column if not exists resolution_note   text;
