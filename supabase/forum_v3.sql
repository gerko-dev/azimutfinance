-- ============================================================
-- AzimutFinance — Forum v3 (suppression auteur + sanctions guards)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/forum.sql, supabase/forum_v2.sql, supabase/sanctions.sql
-- Idempotent.
-- ============================================================

-- ============================================================
-- 1) Helper : utilisateur suspendu/banni ?
--    Retourne true si profiles.suspended_until > now() pour l'uid donne.
-- ============================================================

create or replace function public.is_user_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select suspended_until > now()
       from public.profiles
       where id = p_user_id),
    false);
$$;

grant execute on function public.is_user_suspended(uuid) to authenticated;

-- ============================================================
-- 2) Reecriture forum_create_topic : bloque les suspendus
-- ============================================================

create or replace function public.forum_create_topic(
  p_category_slug text,
  p_title         text,
  p_body          text,
  p_tickers       text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_cat   public.forum_categories%rowtype;
  v_slug  text;
  v_id    uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Garde-fou suspension/ban
  if public.is_user_suspended(v_uid) then
    raise exception 'USER_SUSPENDED';
  end if;

  select * into v_cat from public.forum_categories where slug = p_category_slug and active;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;

  v_slug := lower(regexp_replace(unaccent(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) > 80 then v_slug := substring(v_slug from 1 for 80); end if;
  if v_slug = '' then v_slug := 'topic'; end if;

  insert into public.forum_topics
    (category_id, author_id, title, slug, body, tickers)
  values
    (v_cat.id, v_uid, p_title, v_slug, p_body,
     case when p_tickers is null or array_length(p_tickers, 1) is null then null
          else (select array_agg(distinct upper(trim(t))) from unnest(p_tickers) t where trim(t) <> '') end)
  returning id into v_id;

  return v_id;
end$$;

-- ============================================================
-- 3) Reecriture forum_create_reply : bloque les suspendus
-- ============================================================

create or replace function public.forum_create_reply(
  p_topic_id uuid,
  p_body     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid;
  v_topic   public.forum_topics%rowtype;
  v_id      uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if public.is_user_suspended(v_uid) then
    raise exception 'USER_SUSPENDED';
  end if;

  select * into v_topic from public.forum_topics where id = p_topic_id;
  if not found or v_topic.deleted_at is not null then raise exception 'TOPIC_NOT_FOUND'; end if;
  if v_topic.locked then raise exception 'TOPIC_LOCKED'; end if;

  insert into public.forum_replies (topic_id, author_id, body)
    values (p_topic_id, v_uid, p_body)
    returning id into v_id;

  return v_id;
end$$;

-- ============================================================
-- 4) Reecriture forum_update_topic : bloque les suspendus (sauf admin)
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
  v_uid      uuid;
  v_topic    public.forum_topics%rowtype;
  v_is_admin boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_is_admin := public.is_admin_at_least(2);
  if not v_is_admin and public.is_user_suspended(v_uid) then
    raise exception 'USER_SUSPENDED';
  end if;

  select * into v_topic from public.forum_topics where id = p_topic_id;
  if not found or v_topic.deleted_at is not null then
    raise exception 'TOPIC_NOT_FOUND';
  end if;

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

-- ============================================================
-- 5) Reecriture forum_update_reply : bloque les suspendus (sauf admin)
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
  v_uid      uuid;
  v_reply    public.forum_replies%rowtype;
  v_is_admin boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_is_admin := public.is_admin_at_least(2);
  if not v_is_admin and public.is_user_suspended(v_uid) then
    raise exception 'USER_SUSPENDED';
  end if;

  select * into v_reply from public.forum_replies where id = p_reply_id;
  if not found or v_reply.deleted_at is not null then
    raise exception 'REPLY_NOT_FOUND';
  end if;

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

-- ============================================================
-- 6) RPC : forum_delete_own_topic
--    L'auteur soft-delete son propre topic. Pas autorise si verrouille.
--    Si admin (L2+), passer plutot par admin_forum_delete_topic.
-- ============================================================

create or replace function public.forum_delete_own_topic(
  p_topic_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_topic public.forum_topics%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_topic from public.forum_topics where id = p_topic_id;
  if not found or v_topic.deleted_at is not null then raise exception 'TOPIC_NOT_FOUND'; end if;

  if v_topic.author_id <> v_uid then raise exception 'NOT_AUTHORIZED'; end if;
  if v_topic.locked then raise exception 'TOPIC_LOCKED'; end if;

  update public.forum_topics set deleted_at = now() where id = p_topic_id;
end$$;

grant execute on function public.forum_delete_own_topic(uuid) to authenticated;

-- ============================================================
-- 7) RPC : forum_delete_own_reply
-- ============================================================

create or replace function public.forum_delete_own_reply(
  p_reply_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid;
  v_reply     public.forum_replies%rowtype;
  v_topic_id  uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_reply from public.forum_replies where id = p_reply_id;
  if not found or v_reply.deleted_at is not null then raise exception 'REPLY_NOT_FOUND'; end if;

  if v_reply.author_id <> v_uid then raise exception 'NOT_AUTHORIZED'; end if;

  update public.forum_replies set deleted_at = now() where id = p_reply_id
    returning topic_id into v_topic_id;

  -- Decrement compteur sur le topic parent
  if v_topic_id is not null then
    update public.forum_topics
      set reply_count = greatest(reply_count - 1, 0)
      where id = v_topic_id;
  end if;
end$$;

grant execute on function public.forum_delete_own_reply(uuid) to authenticated;
