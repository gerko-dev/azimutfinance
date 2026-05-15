-- ============================================================
-- AzimutFinance — Messagerie v4 : « supprimer pour moi »
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse. A passer APRES messagerie_v3.sql.
--
-- Apporte :
--  1. conversation_participants.cleared_at : horodatage de masquage par
--     participant. La conversation disparait de SA liste ; l'autre membre la
--     garde. Elle reapparait cote moi si un message plus recent que cleared_at
--     arrive. Les messages anterieurs a cleared_at ne me sont plus affiches.
--  2. hide_conversation(uuid) : RPC qui pose cleared_at = now() pour le
--     participant courant.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colonne cleared_at
-- ------------------------------------------------------------
alter table public.conversation_participants
  add column if not exists cleared_at timestamptz;

-- ------------------------------------------------------------
-- 2) hide_conversation : « supprimer pour moi »
-- ------------------------------------------------------------
create or replace function public.hide_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  update public.conversation_participants
    set cleared_at = now()
    where conversation_id = p_conversation_id
      and user_id = v_me;
end;
$$;

grant execute on function public.hide_conversation(uuid) to authenticated;
