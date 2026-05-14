-- ============================================================
-- AzimutFinance — Ligue Azimut S4 : Watchlist simulateur
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Watchlist user-scope (pas saison-scope) : un joueur peut suivre les mêmes
-- titres d'une saison à l'autre. Le code est libre (validé côté TS par
-- rapport à titres.csv) — pas de FK pour rester découplé du CSV.
-- ============================================================

create table if not exists public.simulator_watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null,
  added_at   timestamptz not null default now(),
  unique (user_id, code)
);

create index if not exists simulator_watchlist_user_idx
  on public.simulator_watchlist (user_id, added_at desc);

alter table public.simulator_watchlist enable row level security;

drop policy if exists "watchlist_read_own" on public.simulator_watchlist;
create policy "watchlist_read_own"
  on public.simulator_watchlist for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "watchlist_insert_own" on public.simulator_watchlist;
create policy "watchlist_insert_own"
  on public.simulator_watchlist for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "watchlist_delete_own" on public.simulator_watchlist;
create policy "watchlist_delete_own"
  on public.simulator_watchlist for delete
  to authenticated
  using (auth.uid() = user_id);

-- RPC : toggle un titre. Retourne true si ajouté, false si supprimé.
create or replace function public.simulator_toggle_watchlist(
  p_code text
) returns boolean
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_user_id uuid;
  v_existing uuid;
  v_code text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_code := upper(trim(p_code));
  if v_code is null or v_code = '' then raise exception 'INVALID_CODE'; end if;

  select id into v_existing
    from public.simulator_watchlist
   where user_id = v_user_id and code = v_code;

  if v_existing is not null then
    delete from public.simulator_watchlist where id = v_existing;
    return false;
  else
    insert into public.simulator_watchlist (user_id, code)
      values (v_user_id, v_code);
    return true;
  end if;
end
$func$;

grant execute on function public.simulator_toggle_watchlist(text) to authenticated;
