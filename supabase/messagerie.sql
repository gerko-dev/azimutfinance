-- ============================================================
-- AzimutFinance — Messagerie interne (1-a-1)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

-- 1) Conversations
create table if not exists public.conversations (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now()
);
create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

-- 2) Participants : join N-N entre auth.users et conversations
create table if not exists public.conversation_participants (
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  joined_at         timestamptz not null default now(),
  last_read_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conv_participants_user_idx
  on public.conversation_participants (user_id);
create index if not exists conv_participants_conv_idx
  on public.conversation_participants (conversation_id);

-- 3) Messages
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references auth.users(id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now(),
  constraint messages_body_length check (
    char_length(body) > 0 and char_length(body) <= 4000
  )
);
create index if not exists messages_conv_created_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx
  on public.messages (sender_id);

-- ============================================================
-- Trigger : update conversations.last_message_at sur insert message
-- ============================================================

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute procedure public.touch_conversation_on_message();

-- ============================================================
-- Helper : tester si l'utilisateur courant est participant d'une conv.
-- Utilise dans les policies RLS.
-- ============================================================

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- CONVERSATIONS
--   SELECT : si l'utilisateur courant est participant.
--   INSERT : pas de policy directe (passe par RPC start_conversation security definer).
--   UPDATE/DELETE : interdits (last_message_at gere par trigger).
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_participant(id));

-- CONVERSATION_PARTICIPANTS
--   SELECT : un utilisateur peut voir SA propre ligne, ET les lignes des
--            participants des conversations dont il fait partie.
--   INSERT : pas de policy directe (cree via RPC).
--   UPDATE : own row only (pour last_read_at). Restriction colonne via grant.
--   DELETE : interdit.
drop policy if exists "participants_select_self_or_same_conv" on public.conversation_participants;
create policy "participants_select_self_or_same_conv"
  on public.conversation_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
  );

drop policy if exists "participants_update_own" on public.conversation_participants;
create policy "participants_update_own"
  on public.conversation_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

-- MESSAGES
--   SELECT : si participant de la conversation.
--   INSERT : si sender_id = auth.uid() ET participant de la conversation.
--   UPDATE/DELETE : interdits (immutabilite des messages).
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "messages_insert_own_in_conv" on public.messages;
create policy "messages_insert_own_in_conv"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

-- ============================================================
-- RPC : get_or_create_conversation
-- Renvoie l'id de la conversation 1-a-1 entre auth.uid() et p_other_user_id,
-- en la creant si elle n'existe pas. Atomique.
-- ============================================================

create or replace function public.start_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_other_user_id is null then
    raise exception 'INVALID_USER';
  end if;
  if p_other_user_id = v_me then
    raise exception 'CANNOT_MESSAGE_SELF';
  end if;

  -- Verifier que l'autre utilisateur existe dans profiles
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Chercher une conversation existante 1-a-1 entre les deux users.
  -- "1-a-1" = exactement 2 participants, et ils correspondent.
  select cp1.conversation_id
    into v_conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
    and cp2.user_id = p_other_user_id
  where cp1.user_id = v_me
  and (
    select count(*) from public.conversation_participants
    where conversation_id = cp1.conversation_id
  ) = 2
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- Creer la conversation et les 2 participants
  insert into public.conversations (created_by)
  values (v_me)
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (v_conv_id, v_me),
    (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$$;

grant execute on function public.start_conversation(uuid) to authenticated;

-- ============================================================
-- RPC : search_users (recherche de destinataires pour la messagerie)
-- N'expose que les champs publics (id, username, full_name, avatar_url)
-- sans toucher aux colonnes sensibles de profiles (role, pays, etc.).
-- RLS de profiles reste strict (own-row only).
-- ============================================================

create or replace function public.search_users(p_query text, p_limit int default 10)
returns table (
  id          uuid,
  username    text,
  full_name   text,
  avatar_url  text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  where p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      p.username ilike '%' || p_query || '%'
      or coalesce(p.full_name, '') ilike '%' || p_query || '%'
    )
  order by
    -- Prefere les match au debut du username
    case when p.username ilike p_query || '%' then 0 else 1 end,
    p.username
  limit p_limit;
$$;

grant execute on function public.search_users(text, int) to authenticated;

-- ============================================================
-- RPC : get_users_public (recupere les infos publiques de N utilisateurs)
-- Utilise pour afficher le nom de l'autre participant d'une conversation.
-- ============================================================

create or replace function public.get_users_public(p_user_ids uuid[])
returns table (
  id          uuid,
  username    text,
  full_name   text,
  avatar_url  text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  where p.id = any(p_user_ids);
$$;

grant execute on function public.get_users_public(uuid[]) to authenticated;

-- ============================================================
-- Realtime : activer la publication pour les messages
-- ============================================================

-- Ajouter la table messages a la publication realtime de Supabase.
-- (idempotent grace au "if not exists" implicite via "do block")
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end$$;
