-- ============================================================
-- AzimutFinance — Messagerie v3 : anti-démarchage de masse
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse. A passer APRES messagerie_v2.sql.
--
-- Apporte :
--  1. search_users : recherche par PSEUDO EXACT uniquement. On ne peut plus
--     decouvrir les membres en tapant un fragment de nom — il faut connaitre
--     le pseudo exact de la personne a contacter.
--  2. start_conversation : quota anti-spam — un compte ne peut ouvrir que
--     5 nouvelles conversations directes par tranche de 24 h.
-- ============================================================

-- ------------------------------------------------------------
-- 1) search_users : match EXACT sur le pseudo (insensible a la casse).
--    Plus de recherche floue, plus de recherche par nom complet.
-- ------------------------------------------------------------
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
    and p.username is not null
    and lower(p.username) = lower(btrim(p_query))
  limit p_limit;
$$;

grant execute on function public.search_users(text, int) to authenticated;

-- ------------------------------------------------------------
-- 2) start_conversation : gate Premium/Pro + nouvelle conv 'pending'
--    + quota anti-spam de 5 nouvelles conversations directes / 24 h.
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
  v_recent  int;
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

  -- Quota anti-spam : 5 nouvelles conversations directes max / 24 h.
  -- Les admins ne sont pas plafonnes.
  if v_role in ('premium', 'pro') then
    select count(*)
      into v_recent
    from public.conversations
    where created_by = v_me
      and kind = 'direct'
      and created_at > now() - interval '24 hours';
    if v_recent >= 5 then
      raise exception 'DAILY_LIMIT_REACHED';
    end if;
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
