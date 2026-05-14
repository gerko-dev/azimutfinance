-- ============================================================
-- AzimutFinance — Notifications unifiées (cloche unique)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS :
--   - supabase/watchlists.sql (alerts, alert_triggers)
--   - supabase/forum.sql      (forum_notifications, forum_topics)
--   - supabase/forum_v2.sql   (forum_list_notifications, forum_mark_all_read)
--
-- Idempotent.
--
-- But : agréger en une seule API "notifications" :
--   - alert_triggers (déclenchements d'alertes)
--   - forum_notifications (réponses aux topics suivis)
--
-- La messagerie reste séparée (icône distincte).
-- ============================================================

-- ============================================================
-- 1) RPC : compteur unifié (alertes non lues + forum non lues)
-- ============================================================

create or replace function public.notifications_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select count(*) from public.alert_triggers
       where user_id = auth.uid() and read_at is null), 0
  )::int
  + coalesce(
    (select count(*) from public.forum_notifications
       where user_id = auth.uid() and read_at is null), 0
  )::int;
$$;

grant execute on function public.notifications_unread_count() to authenticated;

-- ============================================================
-- 2) RPC : liste paginée unifiée
--    Retourne les notifs (alertes + forum) triées par date desc
-- ============================================================

create or replace function public.notifications_list(p_limit int default 20)
returns table (
  kind         text,
  id           uuid,
  created_at   timestamptz,
  read_at      timestamptz,
  title        text,
  subtitle     text,
  href         text
)
language sql
stable
security definer
set search_path = public
as $$
  with merged as (
    -- Branche alertes
    select
      'alert'::text                          as kind,
      t.id                                   as id,
      t.triggered_at                         as created_at,
      t.read_at                              as read_at,
      a.name                                 as title,
      coalesce(t.message,
        a.alert_type || ' · ' || a.target_type || ' ' || a.target_code) as subtitle,
      '/outils/alertes'::text                as href
    from public.alert_triggers t
    join public.alerts a on a.id = t.alert_id
    where t.user_id = auth.uid()

    union all

    -- Branche forum
    select
      'forum_reply'::text                    as kind,
      n.id                                   as id,
      n.created_at                           as created_at,
      n.read_at                              as read_at,
      tp.title                               as title,
      coalesce(p.full_name, p.username, 'Quelqu''un') || ' a répondu' as subtitle,
      ('/communaute/forum/t/' || tp.id::text) as href
    from public.forum_notifications n
    join public.forum_topics tp on tp.id = n.topic_id
    left join public.forum_replies r on r.id = n.reply_id
    left join public.profiles p on p.id = r.author_id
    where n.user_id = auth.uid()
  )
  select * from merged
  order by created_at desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

grant execute on function public.notifications_list(int) to authenticated;

-- ============================================================
-- 3) RPC : marquer toutes les notifs comme lues
--    (utilisé à l'ouverture du dropdown)
-- ============================================================

create or replace function public.notifications_mark_all_read()
returns int
language sql
security definer
set search_path = public
as $$
  with upd_alerts as (
    update public.alert_triggers
       set read_at = now()
     where user_id = auth.uid() and read_at is null
     returning 1
  ),
  upd_forum as (
    update public.forum_notifications
       set read_at = now()
     where user_id = auth.uid() and read_at is null
     returning 1
  )
  select coalesce((select count(*) from upd_alerts), 0)::int
       + coalesce((select count(*) from upd_forum), 0)::int;
$$;

grant execute on function public.notifications_mark_all_read() to authenticated;

-- ============================================================
-- 4) RPC : supprimer une notification (alert_trigger OU forum_notif)
--    Hard delete — l'historique du trigger est perdu mais l'alerte elle-même
--    reste active dans public.alerts.
-- ============================================================

create or replace function public.notifications_delete(p_kind text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_kind = 'alert' then
    delete from public.alert_triggers
      where id = p_id and user_id = auth.uid();
    get diagnostics v_deleted = row_count;
  elsif p_kind = 'forum_reply' then
    delete from public.forum_notifications
      where id = p_id and user_id = auth.uid();
    get diagnostics v_deleted = row_count;
  else
    raise exception 'INVALID_KIND';
  end if;

  return v_deleted > 0;
end$$;

grant execute on function public.notifications_delete(text, uuid) to authenticated;

-- ============================================================
-- 5) RPC : vider toutes les notifs de l'utilisateur
--    Renvoie le nombre total supprimé (alertes + forum)
-- ============================================================

create or replace function public.notifications_clear_all()
returns int
language sql
security definer
set search_path = public
as $$
  with del_alerts as (
    delete from public.alert_triggers
     where user_id = auth.uid()
     returning 1
  ),
  del_forum as (
    delete from public.forum_notifications
     where user_id = auth.uid()
     returning 1
  )
  select coalesce((select count(*) from del_alerts), 0)::int
       + coalesce((select count(*) from del_forum), 0)::int;
$$;

grant execute on function public.notifications_clear_all() to authenticated;

-- ============================================================
-- Note : on ne supprime pas les anciennes RPC (alerts_unread_count,
-- alerts_mark_all_read, forum_unread_count, forum_list_notifications,
-- forum_mark_all_read, forum_mark_topic_read). Elles restent
-- disponibles si un autre appelant les utilise (ex: forum_mark_topic_read
-- est appelé à l'ouverture d'un topic).
-- ============================================================
