-- ============================================================
-- AzimutFinance — Forum v2 (additions)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/forum.sql
-- Idempotent.
--
-- Ajouts :
--   - forum_list_notifications (liste paginee des notifs)
--   - forum_update_topic / forum_update_reply (edition par auteur, admin override)
--   - admin_list_forum_reports / admin_resolve_forum_report (queue admin)
-- ============================================================

-- ============================================================
-- 0) Policy : lecture des forum_reports pour les admins (necessaire pour
--    les compteurs cote /admin/signalements-forum). Les RPC security definer
--    bypassent la RLS, mais la requete .from('forum_reports').select('status')
--    utilisee pour les chips de comptage est soumise a la RLS.
-- ============================================================

drop policy if exists forum_reports_select_admin on public.forum_reports;
create policy forum_reports_select_admin
  on public.forum_reports for select
  to authenticated
  using (public.is_admin_at_least(3));

-- ============================================================
-- 1) RPC : liste des notifications de l'utilisateur
--    Retourne notifs jointes au topic et au "qui a repondu"
-- ============================================================

create or replace function public.forum_list_notifications(
  p_limit int default 15
)
returns table (
  id            uuid,
  topic_id      uuid,
  reply_id      uuid,
  topic_title   text,
  topic_slug    text,
  replier_id    uuid,
  replier_username text,
  replier_full_name text,
  read_at       timestamptz,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id,
         n.topic_id,
         n.reply_id,
         t.title,
         t.slug,
         r.author_id,
         p.username,
         p.full_name,
         n.read_at,
         n.created_at
  from public.forum_notifications n
  join public.forum_topics t on t.id = n.topic_id
  left join public.forum_replies r on r.id = n.reply_id
  left join public.profiles p on p.id = r.author_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(coalesce(p_limit, 15), 1);
$$;

grant execute on function public.forum_list_notifications(int) to authenticated;

-- Marque toutes les notifs comme lues (utilise quand on ouvre le dropdown)
create or replace function public.forum_mark_all_read()
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.forum_notifications
      set read_at = now()
      where user_id = auth.uid() and read_at is null
      returning 1
  )
  select coalesce(count(*)::int, 0) from upd;
$$;

grant execute on function public.forum_mark_all_read() to authenticated;

-- ============================================================
-- 2) RPC : editer un topic (auteur ou admin L2+)
-- ============================================================

create or replace function public.forum_update_topic(
  p_topic_id uuid,
  p_title    text,
  p_body     text,
  p_tickers  text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_topic  public.forum_topics%rowtype;
  v_is_admin boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_topic from public.forum_topics where id = p_topic_id;
  if not found or v_topic.deleted_at is not null then
    raise exception 'TOPIC_NOT_FOUND';
  end if;

  v_is_admin := public.is_admin_at_least(2);
  if v_topic.author_id <> v_uid and not v_is_admin then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_topic.locked and not v_is_admin then
    raise exception 'TOPIC_LOCKED';
  end if;

  if char_length(coalesce(p_title, '')) not between 5 and 200 then
    raise exception 'INVALID_TITLE';
  end if;
  if char_length(coalesce(p_body, '')) not between 10 and 10000 then
    raise exception 'INVALID_BODY';
  end if;

  update public.forum_topics
    set title = p_title,
        body  = p_body,
        tickers = case when p_tickers is null or array_length(p_tickers, 1) is null then null
                       else (select array_agg(distinct upper(trim(t)))
                             from unnest(p_tickers) t where trim(t) <> '') end
    where id = p_topic_id;

  if v_is_admin and v_topic.author_id <> v_uid then
    perform public._admin_log('forum_topic_edit', 'forum_topic', p_topic_id::text, null, 'edit by admin');
  end if;
end$$;

grant execute on function public.forum_update_topic(uuid, text, text, text[]) to authenticated;

-- ============================================================
-- 3) RPC : editer une reponse (auteur ou admin L2+)
-- ============================================================

create or replace function public.forum_update_reply(
  p_reply_id uuid,
  p_body     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_reply public.forum_replies%rowtype;
  v_is_admin boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_reply from public.forum_replies where id = p_reply_id;
  if not found or v_reply.deleted_at is not null then
    raise exception 'REPLY_NOT_FOUND';
  end if;

  v_is_admin := public.is_admin_at_least(2);
  if v_reply.author_id <> v_uid and not v_is_admin then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if char_length(coalesce(p_body, '')) not between 1 and 10000 then
    raise exception 'INVALID_BODY';
  end if;

  update public.forum_replies
    set body = p_body
    where id = p_reply_id;

  if v_is_admin and v_reply.author_id <> v_uid then
    perform public._admin_log('forum_reply_edit', 'forum_reply', p_reply_id::text, null, 'edit by admin');
  end if;
end$$;

grant execute on function public.forum_update_reply(uuid, text) to authenticated;

-- ============================================================
-- 4) RPC admin : liste des signalements forum
-- ============================================================

create or replace function public.admin_list_forum_reports(
  p_status text default 'open',
  p_limit  int  default 100,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  target_type         text,
  topic_id            uuid,
  reply_id            uuid,
  category            text,
  note                text,
  status              text,
  created_at          timestamptz,
  resolved_at         timestamptz,
  resolution_action   text,
  reporter_id         uuid,
  reporter_username   text,
  reporter_full_name  text,
  reporter_email      text,
  topic_title         text,
  topic_slug          text,
  topic_category_slug text,
  topic_author_id     uuid,
  reply_author_id     uuid,
  body_preview        text,
  reports_total       bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
    with target_topic as (
      select fr.id as report_id, t.id as t_id, t.title, t.slug, c.slug as cat_slug,
             t.author_id, substring(t.body for 240) as preview
      from public.forum_reports fr
      join public.forum_topics t on t.id = fr.topic_id
      join public.forum_categories c on c.id = t.category_id
    ),
    target_reply as (
      select fr.id as report_id, t.id as t_id, t.title, t.slug, c.slug as cat_slug,
             r.author_id, substring(r.body for 240) as preview
      from public.forum_reports fr
      join public.forum_replies r on r.id = fr.reply_id
      join public.forum_topics t on t.id = r.topic_id
      join public.forum_categories c on c.id = t.category_id
    ),
    counts as (
      select target_type,
             coalesce(topic_id, reply_id) as target_id,
             count(*) as n
      from public.forum_reports
      group by target_type, coalesce(topic_id, reply_id)
    )
    select fr.id,
           fr.target_type,
           fr.topic_id,
           fr.reply_id,
           fr.category,
           fr.note,
           fr.status,
           fr.created_at,
           fr.resolved_at,
           fr.resolution_action,
           fr.reporter_id,
           rp.username,
           rp.full_name,
           rp.email,
           coalesce(tt.title, tr.title),
           coalesce(tt.slug, tr.slug),
           coalesce(tt.cat_slug, tr.cat_slug),
           tt.author_id,
           tr.author_id,
           coalesce(tt.preview, tr.preview),
           coalesce(cn.n, 1)
    from public.forum_reports fr
    left join target_topic tt on tt.report_id = fr.id
    left join target_reply tr on tr.report_id = fr.id
    left join public.profiles rp on rp.id = fr.reporter_id
    left join counts cn on cn.target_type = fr.target_type
                       and cn.target_id   = coalesce(fr.topic_id, fr.reply_id)
    where (p_status = 'all' or fr.status = p_status)
    order by fr.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end$$;

grant execute on function public.admin_list_forum_reports(text, int, int) to authenticated;

-- ============================================================
-- 5) RPC admin : resoudre un signalement
--    actions :
--      - 'dismiss'        : rejeter le signalement, ne pas toucher au contenu
--      - 'delete_content' : supprimer le topic/reply ET marquer le report 'actioned'
--      - 'lock_topic'     : verrouiller le topic ET marquer le report 'actioned' (uniquement si target=topic)
-- ============================================================

create or replace function public.admin_resolve_forum_report(
  p_report_id uuid,
  p_action    text,
  p_note      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_report public.forum_reports%rowtype;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_actor := auth.uid();

  select * into v_report from public.forum_reports where id = p_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if v_report.status <> 'open' then raise exception 'ALREADY_RESOLVED'; end if;

  if p_action = 'dismiss' then
    update public.forum_reports
      set status = 'dismissed',
          resolved_at = now(),
          resolved_by = v_actor,
          resolution_action = 'dismiss',
          resolution_note = nullif(trim(coalesce(p_note, '')), '')
      where id = p_report_id;

  elsif p_action = 'delete_content' then
    if v_report.target_type = 'topic' then
      update public.forum_topics set deleted_at = now() where id = v_report.topic_id;
      -- Marquer tous les autres reports ouverts sur ce topic comme actioned
      update public.forum_reports
        set status = 'actioned',
            resolved_at = now(),
            resolved_by = v_actor,
            resolution_action = 'delete_content',
            resolution_note = nullif(trim(coalesce(p_note, '')), '')
        where topic_id = v_report.topic_id and status = 'open';
      perform public._admin_log('forum_topic_delete', 'forum_topic', v_report.topic_id::text, null,
        coalesce(p_note, 'via report'));
    else
      update public.forum_replies set deleted_at = now() where id = v_report.reply_id;
      update public.forum_reports
        set status = 'actioned',
            resolved_at = now(),
            resolved_by = v_actor,
            resolution_action = 'delete_content',
            resolution_note = nullif(trim(coalesce(p_note, '')), '')
        where reply_id = v_report.reply_id and status = 'open';
      perform public._admin_log('forum_reply_delete', 'forum_reply', v_report.reply_id::text, null,
        coalesce(p_note, 'via report'));
    end if;

  elsif p_action = 'lock_topic' then
    if v_report.target_type <> 'topic' then
      raise exception 'INVALID_ACTION_FOR_TARGET';
    end if;
    update public.forum_topics set locked = true where id = v_report.topic_id;
    update public.forum_reports
      set status = 'actioned',
          resolved_at = now(),
          resolved_by = v_actor,
          resolution_action = 'lock_topic',
          resolution_note = nullif(trim(coalesce(p_note, '')), '')
      where id = p_report_id;
    perform public._admin_log('forum_topic_lock', 'forum_topic', v_report.topic_id::text, null,
      coalesce(p_note, 'via report'));

  else
    raise exception 'INVALID_ACTION';
  end if;
end$$;

grant execute on function public.admin_resolve_forum_report(uuid, text, text) to authenticated;

-- ============================================================
-- 6) RPC admin : compteur des signalements forum ouverts (pour le badge sidebar)
-- ============================================================

create or replace function public.admin_open_forum_reports_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin_at_least(3)
              then coalesce((select count(*)::int from public.forum_reports where status = 'open'), 0)
              else 0 end;
$$;

grant execute on function public.admin_open_forum_reports_count() to authenticated;
