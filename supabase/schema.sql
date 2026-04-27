-- ============================================================
-- AzimutFinance — Auth & profils utilisateur (schema initial)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

-- 1) Enum des roles applicatifs
--    'member' : utilisateur authentifie standard
--    'pro'    : acces complet aux outils Pro
--    (visiteur = non authentifie, pas de ligne dans profiles)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('member', 'pro');
  end if;
end$$;

-- 2) Table profile 1:1 avec auth.users
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  username    text unique,
  full_name   text,
  avatar_url  text,
  role        public.app_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);

-- 3) Trigger : updated_at automatique
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- 4) Trigger : creer automatiquement une ligne profiles a chaque nouveau auth.users
--    (couvre signup email/password ET signup via OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5) Row Level Security
alter table public.profiles enable row level security;

-- Lecture : un utilisateur peut lire SON profil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Mise a jour : un utilisateur peut modifier SON profil
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 6) Empecher les utilisateurs de modifier leur propre role.
--    Le role doit etre change uniquement cote serveur via service_role
--    (qui bypasse les GRANTs). On revoque UPDATE global puis on regrante
--    colonne par colonne, en omettant 'role'.
revoke update on public.profiles from authenticated;
grant update (email, username, full_name, avatar_url) on public.profiles to authenticated;

-- 7) Pas de policy INSERT/DELETE :
--    - INSERT gere par le trigger handle_new_user (security definer)
--    - DELETE cascade automatiquement depuis auth.users
