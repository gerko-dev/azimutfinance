-- ============================================================
-- AzimutFinance — profiles.country : enum UEMOA -> texte
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : un 2e passage est un no-op (la colonne est deja en text).
--
-- Le wizard /bienvenue permet desormais de choisir N'IMPORTE QUEL pays
-- (investisseurs de la diaspora, hors UEMOA). La colonne profiles.country
-- passe donc de l'enum public.uemoa_country (8 valeurs) a `text` : elle
-- stocke un code ISO 3166-1 alpha-2 en minuscules (ex 'ci', 'fr', 'ca').
--
-- L'enum public.uemoa_country N'EST PAS supprime : il reste utilise par
-- brokerage_accounts.sgi_country et brokerage_tps_rates.country.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'country'
      and udt_name = 'uemoa_country'
  ) then
    alter table public.profiles
      alter column country type text using country::text;
  end if;
end$$;

-- La RPC admin_list_members declarait `country public.uemoa_country` dans son
-- RETURNS TABLE : apres le passage de la colonne en text, elle echoue
-- ("structure of query does not match function result type") et /admin/membres
-- affiche une liste vide. On la recree avec `country text`.
--
-- `create or replace` ne peut PAS changer le type de retour d'une fonction
-- existante (erreur 42P13) → on la supprime d'abord. Aucun objet DB ne depend
-- de cette fonction (appelee uniquement par l'app), donc pas de CASCADE.
drop function if exists public.admin_list_members(text, int, int);

create or replace function public.admin_list_members(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id            uuid,
  email         text,
  username      text,
  full_name     text,
  role          public.app_role,
  country       text,
  created_at    timestamptz,
  onboarded_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select p.id, p.email, p.username, p.full_name, p.role, p.country,
           p.created_at, p.onboarded_at
    from public.profiles p
    where p_search is null
       or p.email ilike '%' || p_search || '%'
       or coalesce(p.username, '') ilike '%' || p_search || '%'
       or coalesce(p.full_name, '') ilike '%' || p_search || '%'
    order by p.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

grant execute on function public.admin_list_members(text, int, int) to authenticated;
