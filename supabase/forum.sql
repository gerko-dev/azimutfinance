-- ============================================================
-- AzimutFinance — Forum investisseurs
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/admin.sql (is_admin_at_least, _admin_log)
-- Idempotent.
--
-- Structure :
--   public.forum_categories     (taxonomie figee, geree cote admin SQL)
--   public.forum_topics         (un fil de discussion)
--   public.forum_replies        (reponses dans un fil)
--   public.forum_topic_votes    (1 vote par user par topic, value=+1)
--   public.forum_reply_votes    (1 vote par user par reply, value=+1)
--   public.forum_reports        (signalements : topic ou reply)
--   public.forum_notifications  (badge in-app : "nouvelle reponse a ton topic")
--
-- Concept votes : upvote uniquement (value=1). On garde un schema generique
-- (smallint) pour pouvoir ajouter -1 plus tard sans migration lourde.
--
-- Recherche : tsvector unaccent + french, GIN index. Recherche couvre titre,
-- corps des topics et corps des replies (jointure depuis l'app).
-- ============================================================

-- ============================================================
-- 1) Extensions
-- ============================================================

create extension if not exists unaccent;

-- ============================================================
-- 2) Helper : tsvector pour la recherche fr + sans accent
-- ============================================================

create or replace function public.forum_tsv(p_title text, p_body text)
returns tsvector
language sql
immutable
parallel safe
as $$
  select setweight(to_tsvector('french', unaccent(coalesce(p_title, ''))), 'A') ||
         setweight(to_tsvector('french', unaccent(coalesce(p_body,  ''))), 'B')
$$;

-- ============================================================
-- 3) Categories
-- ============================================================

create table if not exists public.forum_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  icon         text,
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Seed des categories de base (idempotent)
insert into public.forum_categories (slug, name, description, icon, sort_order)
values
  ('actions',      'Actions BRVM',         'Discussions sur les titres cotes a la BRVM',                'TrendingUp', 10),
  ('obligations',  'Obligations & taux',   'Souverains UMOA-Titres, obligations cotees, courbe taux',    'LineChart',  20),
  ('fcp',          'FCP & gestion',        'FCP, OPCVM, societes de gestion, allocation',                'Briefcase',  30),
  ('macro',        'Macro UEMOA',          'Politique BCEAO, inflation, change, matieres premieres',     'Globe',      40),
  ('strategies',   'Strategies',           'Vos approches, methodes, retours d''experience',             'Compass',    50),
  ('debutants',    'Debutants',            'Vous demarrez ? Posez vos questions ici sans complexe',      'Sparkles',   60),
  ('actualites',   'Actualites',           'Discussion autour des news economiques et financieres',      'Newspaper',  70),
  ('off-topic',    'Cafe boursier',        'Discussions libres entre investisseurs',                     'Coffee',     90)
on conflict (slug) do nothing;

-- ============================================================
-- 4) Topics
-- ============================================================

create table if not exists public.forum_topics (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid not null references public.forum_categories(id) on delete restrict,
  author_id        uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  slug             text not null,
  body             text not null,
  tickers          text[],
  pinned           boolean not null default false,
  locked           boolean not null default false,
  reply_count      int  not null default 0,
  vote_score       int  not null default 0,
  last_reply_at    timestamptz,
  last_reply_user_id uuid references auth.users(id) on delete set null,
  search_tsv       tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint forum_topics_title_len  check (char_length(title) between 5 and 200),
  constraint forum_topics_body_len   check (char_length(body)  between 10 and 10000)
);

create index if not exists forum_topics_category_idx
  on public.forum_topics (category_id, pinned desc, last_reply_at desc nulls last, created_at desc);
create index if not exists forum_topics_author_idx
  on public.forum_topics (author_id);
create index if not exists forum_topics_search_idx
  on public.forum_topics using gin (search_tsv);
create index if not exists forum_topics_tickers_idx
  on public.forum_topics using gin (tickers);
create index if not exists forum_topics_recent_idx
  on public.forum_topics (last_reply_at desc nulls last, created_at desc)
  where deleted_at is null;

-- Trigger : maintien search_tsv + updated_at
create or replace function public.forum_topics_touch()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv := public.forum_tsv(new.title, new.body);
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_forum_topics_touch on public.forum_topics;
create trigger trg_forum_topics_touch
  before insert or update of title, body on public.forum_topics
  for each row execute function public.forum_topics_touch();

-- ============================================================
-- 5) Replies
-- ============================================================

create table if not exists public.forum_replies (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.forum_topics(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  body         text not null,
  vote_score   int  not null default 0,
  search_tsv   tsvector,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint forum_replies_body_len check (char_length(body) between 1 and 10000)
);

create index if not exists forum_replies_topic_idx
  on public.forum_replies (topic_id, created_at);
create index if not exists forum_replies_author_idx
  on public.forum_replies (author_id);
create index if not exists forum_replies_search_idx
  on public.forum_replies using gin (search_tsv);

create or replace function public.forum_replies_touch()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv := public.forum_tsv(null, new.body);
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_forum_replies_touch on public.forum_replies;
create trigger trg_forum_replies_touch
  before insert or update of body on public.forum_replies
  for each row execute function public.forum_replies_touch();

-- Trigger : mise a jour des compteurs du topic + notification
create or replace function public.forum_replies_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  -- 1) Maj des compteurs sur le topic parent
  update public.forum_topics
    set reply_count   = reply_count + 1,
        last_reply_at = new.created_at,
        last_reply_user_id = new.author_id,
        updated_at    = now()
    where id = new.topic_id
    returning author_id into v_author_id;

  -- 2) Notification a l'auteur du topic si ce n'est pas lui qui repond
  if v_author_id is not null and v_author_id <> new.author_id then
    insert into public.forum_notifications
      (user_id, topic_id, reply_id, kind)
    values
      (v_author_id, new.topic_id, new.id, 'reply');
  end if;

  return new;
end$$;

drop trigger if exists trg_forum_replies_after_insert on public.forum_replies;
create trigger trg_forum_replies_after_insert
  after insert on public.forum_replies
  for each row execute function public.forum_replies_after_insert();

-- ============================================================
-- 6) Votes (upvotes uniquement pour cette v1, mais schema generique)
-- ============================================================

create table if not exists public.forum_topic_votes (
  topic_id   uuid not null references public.forum_topics(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      smallint not null default 1 check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

create table if not exists public.forum_reply_votes (
  reply_id   uuid not null references public.forum_replies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      smallint not null default 1 check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

-- Triggers : recalcule vote_score sur insert/update/delete
create or replace function public.forum_topic_vote_recount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic_id uuid;
begin
  v_topic_id := coalesce(new.topic_id, old.topic_id);
  update public.forum_topics
    set vote_score = coalesce((
      select sum(value)::int from public.forum_topic_votes where topic_id = v_topic_id
    ), 0)
    where id = v_topic_id;
  return null;
end$$;

drop trigger if exists trg_forum_topic_votes_recount on public.forum_topic_votes;
create trigger trg_forum_topic_votes_recount
  after insert or update or delete on public.forum_topic_votes
  for each row execute function public.forum_topic_vote_recount();

create or replace function public.forum_reply_vote_recount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reply_id uuid;
begin
  v_reply_id := coalesce(new.reply_id, old.reply_id);
  update public.forum_replies
    set vote_score = coalesce((
      select sum(value)::int from public.forum_reply_votes where reply_id = v_reply_id
    ), 0)
    where id = v_reply_id;
  return null;
end$$;

drop trigger if exists trg_forum_reply_votes_recount on public.forum_reply_votes;
create trigger trg_forum_reply_votes_recount
  after insert or update or delete on public.forum_reply_votes
  for each row execute function public.forum_reply_vote_recount();

-- ============================================================
-- 7) Signalements (separe de message_reports car cible differente)
-- ============================================================

create table if not exists public.forum_reports (
  id                  uuid primary key default gen_random_uuid(),
  target_type         text not null check (target_type in ('topic', 'reply')),
  topic_id            uuid references public.forum_topics(id) on delete cascade,
  reply_id            uuid references public.forum_replies(id) on delete cascade,
  reporter_id         uuid not null references auth.users(id) on delete cascade,
  category            text not null check (category in
    ('spam', 'harcelement', 'insulte', 'arnaque', 'autre')),
  note                text check (note is null or char_length(note) <= 500),
  status              text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  resolution_action   text,
  resolution_note     text,
  constraint forum_reports_target_xor
    check ((topic_id is not null) <> (reply_id is not null)),
  constraint forum_reports_unique_topic
    unique (topic_id, reporter_id),
  constraint forum_reports_unique_reply
    unique (reply_id, reporter_id)
);

create index if not exists forum_reports_status_idx
  on public.forum_reports (status, created_at desc);

-- ============================================================
-- 8) Notifications in-app (badge "nouvelle reponse")
-- ============================================================

create table if not exists public.forum_notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  topic_id     uuid not null references public.forum_topics(id) on delete cascade,
  reply_id     uuid references public.forum_replies(id) on delete cascade,
  kind         text not null default 'reply' check (kind in ('reply')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists forum_notifs_user_unread_idx
  on public.forum_notifications (user_id, created_at desc)
  where read_at is null;
create index if not exists forum_notifs_user_topic_idx
  on public.forum_notifications (user_id, topic_id);

-- ============================================================
-- 9) RLS
-- ============================================================

alter table public.forum_categories    enable row level security;
alter table public.forum_topics        enable row level security;
alter table public.forum_replies       enable row level security;
alter table public.forum_topic_votes   enable row level security;
alter table public.forum_reply_votes   enable row level security;
alter table public.forum_reports       enable row level security;
alter table public.forum_notifications enable row level security;

-- Lectures publiques pour categories + topics + replies actifs
drop policy if exists forum_cat_select_all on public.forum_categories;
create policy forum_cat_select_all
  on public.forum_categories for select using (active = true);

drop policy if exists forum_topics_select_all on public.forum_topics;
create policy forum_topics_select_all
  on public.forum_topics for select using (deleted_at is null);

drop policy if exists forum_replies_select_all on public.forum_replies;
create policy forum_replies_select_all
  on public.forum_replies for select using (deleted_at is null);

-- Votes : utilisateur voit ses propres votes (utile pour highlighter le bouton)
drop policy if exists forum_topic_votes_select_own on public.forum_topic_votes;
create policy forum_topic_votes_select_own
  on public.forum_topic_votes for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists forum_reply_votes_select_own on public.forum_reply_votes;
create policy forum_reply_votes_select_own
  on public.forum_reply_votes for select
  to authenticated using (auth.uid() = user_id);

-- Notifications : user voit les siennes uniquement
drop policy if exists forum_notifs_select_own on public.forum_notifications;
create policy forum_notifs_select_own
  on public.forum_notifications for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists forum_notifs_update_own on public.forum_notifications;
create policy forum_notifs_update_own
  on public.forum_notifications for update
  to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE/DELETE sur topics, replies, votes, reports :
-- tout passe par les RPC security definer ci-dessous.

-- ============================================================
-- 10) RPC : creer un topic (auth requis)
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

  select * into v_cat from public.forum_categories where slug = p_category_slug and active;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;

  -- Slug URL-safe a partir du titre
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

grant execute on function public.forum_create_topic(text, text, text, text[]) to authenticated;

-- ============================================================
-- 11) RPC : creer une reponse
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

  select * into v_topic from public.forum_topics where id = p_topic_id;
  if not found or v_topic.deleted_at is not null then raise exception 'TOPIC_NOT_FOUND'; end if;
  if v_topic.locked then raise exception 'TOPIC_LOCKED'; end if;

  insert into public.forum_replies (topic_id, author_id, body)
    values (p_topic_id, v_uid, p_body)
    returning id into v_id;

  return v_id;
end$$;

grant execute on function public.forum_create_reply(uuid, text) to authenticated;

-- ============================================================
-- 12) RPC : voter / retirer son vote
--    p_value = 1 ajoute / met a jour, p_value = 0 supprime le vote
-- ============================================================

create or replace function public.forum_vote_topic(
  p_topic_id uuid,
  p_value    int
) returns int  -- nouveau vote_score du topic
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_score int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if p_value not in (-1, 0, 1) then raise exception 'INVALID_VALUE'; end if;

  if p_value = 0 then
    delete from public.forum_topic_votes where topic_id = p_topic_id and user_id = v_uid;
  else
    insert into public.forum_topic_votes (topic_id, user_id, value)
      values (p_topic_id, v_uid, p_value::smallint)
      on conflict (topic_id, user_id) do update set value = excluded.value;
  end if;

  select vote_score into v_score from public.forum_topics where id = p_topic_id;
  return coalesce(v_score, 0);
end$$;

grant execute on function public.forum_vote_topic(uuid, int) to authenticated;

create or replace function public.forum_vote_reply(
  p_reply_id uuid,
  p_value    int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_score int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_value not in (-1, 0, 1) then raise exception 'INVALID_VALUE'; end if;

  if p_value = 0 then
    delete from public.forum_reply_votes where reply_id = p_reply_id and user_id = v_uid;
  else
    insert into public.forum_reply_votes (reply_id, user_id, value)
      values (p_reply_id, v_uid, p_value::smallint)
      on conflict (reply_id, user_id) do update set value = excluded.value;
  end if;

  select vote_score into v_score from public.forum_replies where id = p_reply_id;
  return coalesce(v_score, 0);
end$$;

grant execute on function public.forum_vote_reply(uuid, int) to authenticated;

-- ============================================================
-- 13) RPC : signaler topic ou reply
-- ============================================================

create or replace function public.forum_report(
  p_target_type text,
  p_target_id   uuid,
  p_category    text,
  p_note        text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_id  uuid;
  v_existing uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_target_type not in ('topic', 'reply') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_category not in ('spam', 'harcelement', 'insulte', 'arnaque', 'autre') then
    raise exception 'INVALID_CATEGORY';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  -- Anti-doublon
  if p_target_type = 'topic' then
    select id into v_existing from public.forum_reports
      where topic_id = p_target_id and reporter_id = v_uid;
    if found then raise exception 'ALREADY_REPORTED'; end if;
    insert into public.forum_reports (target_type, topic_id, reporter_id, category, note)
      values ('topic', p_target_id, v_uid, p_category, p_note)
      returning id into v_id;
  else
    select id into v_existing from public.forum_reports
      where reply_id = p_target_id and reporter_id = v_uid;
    if found then raise exception 'ALREADY_REPORTED'; end if;
    insert into public.forum_reports (target_type, reply_id, reporter_id, category, note)
      values ('reply', p_target_id, v_uid, p_category, p_note)
      returning id into v_id;
  end if;

  return v_id;
end$$;

grant execute on function public.forum_report(text, uuid, text, text) to authenticated;

-- ============================================================
-- 14) RPC : compteur notifications non lues
-- ============================================================

create or replace function public.forum_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
  from public.forum_notifications
  where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.forum_unread_count() to authenticated;

-- Marque toutes les notifs d'un topic comme lues (quand l'utilisateur ouvre le topic)
create or replace function public.forum_mark_topic_read(p_topic_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.forum_notifications
    set read_at = now()
    where user_id = auth.uid()
      and topic_id = p_topic_id
      and read_at is null;
$$;

grant execute on function public.forum_mark_topic_read(uuid) to authenticated;

-- ============================================================
-- 15) RPC : recherche full-text
-- ============================================================

create or replace function public.forum_search(
  p_query text,
  p_limit int default 30
)
returns table (
  topic_id      uuid,
  category_slug text,
  title         text,
  slug          text,
  snippet       text,
  rank          real
)
language sql
stable
parallel safe
set search_path = public
as $$
  with q as (
    select plainto_tsquery('french', unaccent(coalesce(p_query, ''))) as tsq
  )
  select t.id, c.slug, t.title, t.slug,
         ts_headline('french', unaccent(t.body), q.tsq,
           'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=18,MinWords=6') as snippet,
         ts_rank(t.search_tsv, q.tsq) as rank
  from public.forum_topics t
  join public.forum_categories c on c.id = t.category_id
  cross join q
  where t.deleted_at is null
    and (q.tsq @@ t.search_tsv
         or exists (
           select 1 from public.forum_replies r
           where r.topic_id = t.id
             and r.deleted_at is null
             and q.tsq @@ r.search_tsv
         ))
  order by rank desc, t.last_reply_at desc nulls last
  limit greatest(coalesce(p_limit, 30), 1);
$$;

grant execute on function public.forum_search(text, int) to anon, authenticated;

-- ============================================================
-- 16) RPC admin : moderation (delete topic/reply, lock topic, pin topic)
-- ============================================================

create or replace function public.admin_forum_delete_topic(
  p_topic_id uuid,
  p_reason   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.forum_topics set deleted_at = now() where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  perform public._admin_log('forum_topic_delete', 'forum_topic', p_topic_id::text, null, p_reason);
end$$;
grant execute on function public.admin_forum_delete_topic(uuid, text) to authenticated;

create or replace function public.admin_forum_delete_reply(
  p_reply_id uuid,
  p_reason   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic_id uuid;
begin
  if not public.is_admin_at_least(3) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.forum_replies set deleted_at = now() where id = p_reply_id
    returning topic_id into v_topic_id;
  if not found then raise exception 'REPLY_NOT_FOUND'; end if;
  -- Decremente le compteur cote topic
  if v_topic_id is not null then
    update public.forum_topics
      set reply_count = greatest(reply_count - 1, 0)
      where id = v_topic_id;
  end if;
  perform public._admin_log('forum_reply_delete', 'forum_reply', p_reply_id::text, null, p_reason);
end$$;
grant execute on function public.admin_forum_delete_reply(uuid, text) to authenticated;

create or replace function public.admin_forum_set_topic_flag(
  p_topic_id uuid,
  p_pinned   boolean,
  p_locked   boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.forum_topics
    set pinned = coalesce(p_pinned, pinned),
        locked = coalesce(p_locked, locked)
    where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  perform public._admin_log('forum_topic_flag', 'forum_topic', p_topic_id::text,
    jsonb_build_object('pinned', p_pinned, 'locked', p_locked), null);
end$$;
grant execute on function public.admin_forum_set_topic_flag(uuid, boolean, boolean) to authenticated;
