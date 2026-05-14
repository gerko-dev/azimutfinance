-- ============================================================
-- AzimutFinance — Newsletter : RPC publique + colonne country libre
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/magazine.sql (table newsletter_subscribers)
-- Idempotent.
--
-- Sections :
--   1) Migration : colonne country uemoa_country → text (accepte tous
--      les codes ISO-3166-1 alpha-2)
--   2) RPC publique de désinscription / réinscription
-- ============================================================

-- ============================================================
-- 1) Migration country : enum uemoa_country → text
--    On garde une contrainte légère sur le format (2 lettres majuscules
--    ou NULL). Le type uemoa_country lui-même n'est pas supprimé car
--    il peut être utilisé ailleurs.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsletter_subscribers'
      and column_name = 'country'
      and udt_name = 'uemoa_country'
  ) then
    alter table public.newsletter_subscribers
      alter column country type text using country::text;
  end if;
end$$;

alter table public.newsletter_subscribers
  drop constraint if exists newsletter_subscribers_country_iso2;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_country_iso2
  check (country is null or country ~ '^[A-Z]{2}$');

-- ============================================================
-- 2) RPC publique de désinscription / réinscription
-- ============================================================

create or replace function public.newsletter_unsubscribe(p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if p_email is null or trim(p_email) = '' then
    raise exception 'INVALID_EMAIL';
  end if;

  update public.newsletter_subscribers
    set status          = 'unsubscribed',
        unsubscribed_at = now()
    where lower(email) = lower(trim(p_email))
      and status = 'active';

  get diagnostics v_count = row_count;
  return v_count;
end$$;

grant execute on function public.newsletter_unsubscribe(text) to anon, authenticated;

-- ============================================================
-- (Optionnel) RPC publique pour réactivation d'un abonné déjà inscrit
-- mais désabonné. Si tu préfères forcer le passage par l'admin pour
-- les réactivations, ne crée pas celle-ci.
-- ============================================================

create or replace function public.newsletter_resubscribe(p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if p_email is null or trim(p_email) = '' then
    raise exception 'INVALID_EMAIL';
  end if;

  update public.newsletter_subscribers
    set status          = 'active',
        unsubscribed_at = null
    where lower(email) = lower(trim(p_email))
      and status = 'unsubscribed';

  get diagnostics v_count = row_count;
  return v_count;
end$$;

grant execute on function public.newsletter_resubscribe(text) to anon, authenticated;
