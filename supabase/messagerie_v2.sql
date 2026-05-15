-- ============================================================
-- AzimutFinance — Messagerie v2 : demandes de message, gating Premium,
-- canal admin
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse. A passer APRES messagerie.sql.
--
-- Apporte :
--  1. conversations.status ('pending' | 'accepted') : une conversation
--     initiee avec un membre demarre en 'pending' (= demande de message).
--  2. conversations.kind   ('direct' | 'admin')     : 'admin' = canal de
--     contact avec toute l'equipe (le membre + tous les admins).
--  3. start_conversation   : seuls Premium / Pro / admins peuvent INITIER
--     une conversation avec un membre. Les nouvelles convs sont 'pending'.
--  4. accept_conversation / decline_conversation : le destinataire d'une
--     demande l'accepte (status -> 'accepted') ou la refuse (suppression).
--  5. start_admin_conversation : ouvre (ou retrouve) le canal admin du
--     membre courant — accessible a TOUS, y compris les comptes gratuits.
--  6. RLS messages : dans une conversation 'pending', seul l'initiateur
--     peut ecrire ; le destinataire doit accepter d'abord.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colonnes status + kind
-- ------------------------------------------------------------
alter table public.conversations
  add column if not exists status text not null default 'accepted',
  add column if not exists kind   text not null default 'direct';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_status_chk'
  ) then
    alter table public.conversations
      add constraint conversations_status_chk check (status in ('pending', 'accepted'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_kind_chk'
  ) then
    alter table public.conversations
      add constraint conversations_kind_chk check (kind in ('direct', 'admin'));
  end if;
end$$;

create index if not exists conversations_kind_idx on public.conversations (kind);

-- ------------------------------------------------------------
-- 2) start_conversation : gate Premium/Pro + nouvelle conv 'pending'
-- ------------------------------------------------------------
create or replace function public.start_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_role    text;
  v_conv_id uuid;
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
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Conversation 1-a-1 'direct' existante entre les deux ? on la renvoie
  -- (quel que soit son status — l'UI gere l'affichage d'une demande).
  select cp1.conversation_id
    into v_conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
   and cp2.user_id = p_other_user_id
  join public.conversations c
    on c.id = cp1.conversation_id and c.kind = 'direct'
  where cp1.user_id = v_me
    and (
      select count(*) from public.conversation_participants
      where conversation_id = cp1.conversation_id
    ) = 2
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- Initier une NOUVELLE conversation : reserve Premium / Pro / admins.
  select role::text into v_role from public.profiles where id = v_me;
  if v_role is null
     or v_role not in ('premium', 'pro', 'adminlevel1', 'adminlevel2', 'adminlevel3')
  then
    raise exception 'INITIATE_REQUIRES_PREMIUM';
  end if;

  -- Creation : status 'pending' (demande a accepter par le destinataire).
  insert into public.conversations (created_by, status, kind)
  values (v_me, 'pending', 'direct')
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv_id, v_me), (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$$;

grant execute on function public.start_conversation(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3) accept_conversation / decline_conversation
--    Le destinataire d'une demande (= participant, mais PAS le createur)
--    l'accepte (status -> 'accepted') ou la refuse (suppression de la conv).
-- ------------------------------------------------------------
create or replace function public.accept_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_created_by uuid;
  v_status text;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  select created_by, status into v_created_by, v_status
  from public.conversations where id = p_conversation_id;
  if v_created_by = v_me then
    raise exception 'CANNOT_ACCEPT_OWN_REQUEST';
  end if;
  if v_status = 'pending' then
    update public.conversations
      set status = 'accepted'
      where id = p_conversation_id;
  end if;
end;
$$;

grant execute on function public.accept_conversation(uuid) to authenticated;

create or replace function public.decline_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_created_by uuid;
  v_status text;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  select created_by, status into v_created_by, v_status
  from public.conversations where id = p_conversation_id;
  if v_created_by = v_me then
    raise exception 'CANNOT_DECLINE_OWN_REQUEST';
  end if;
  if v_status <> 'pending' then
    raise exception 'NOT_A_PENDING_REQUEST';
  end if;
  -- Suppression : cascade sur participants + messages.
  delete from public.conversations where id = p_conversation_id;
end;
$$;

grant execute on function public.decline_conversation(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4) start_admin_conversation : canal de contact avec l'equipe.
--    Accessible a TOUS (y compris comptes gratuits). Cree (ou retrouve) une
--    conversation kind='admin' rassemblant le membre + tous les admins.
-- ------------------------------------------------------------
create or replace function public.start_admin_conversation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_conv_id uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Canal admin existant pour ce membre ?
  select c.id
    into v_conv_id
  from public.conversations c
  join public.conversation_participants cp
    on cp.conversation_id = c.id and cp.user_id = v_me
  where c.kind = 'admin'
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- Creation : conversation 'admin', toujours 'accepted' (le support reste
  -- joignable sans validation).
  insert into public.conversations (created_by, status, kind)
  values (v_me, 'accepted', 'admin')
  returning id into v_conv_id;

  -- Participants : le membre + tous les admins (hors lui-meme s'il est admin).
  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, p.id
  from public.profiles p
  where p.id = v_me
     or p.role in ('adminlevel1', 'adminlevel2', 'adminlevel3')
  on conflict (conversation_id, user_id) do nothing;

  return v_conv_id;
end;
$$;

grant execute on function public.start_admin_conversation() to authenticated;

-- ------------------------------------------------------------
-- 5) RLS messages : dans une conversation 'pending', seul l'initiateur peut
--    ecrire. Le destinataire doit accepter la demande d'abord.
-- ------------------------------------------------------------
drop policy if exists "messages_insert_own_in_conv" on public.messages;
create policy "messages_insert_own_in_conv"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and not exists (
      -- conversation en attente ET je n'en suis pas l'initiateur -> bloque
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.status = 'pending'
        and c.created_by <> auth.uid()
    )
  );
