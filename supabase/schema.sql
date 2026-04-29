-- ============================================================
-- AzimutFinance — Auth & profils utilisateur (schema initial)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

-- 1) Enum des roles applicatifs
--    'member'  : utilisateur authentifie standard (compte gratuit)
--    'premium' : abonnement payant individuel
--    'pro'     : acces complet aux outils Pro (clientele B2B)
--    (Invite = visiteur non authentifie, pas de ligne dans profiles)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('member', 'premium', 'pro');
  end if;
end$$;

-- Si l'enum existait deja avec seulement member/pro (avant l'ajout de premium),
-- on l'enrichit. Idempotent grace a "if not exists".
-- Note: "alter type ... add value" ne peut pas s'executer dans un bloc DO.
alter type public.app_role add value if not exists 'premium';

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

-- ============================================================
-- Onboarding : enrichissement du profil au-dela du nom/email.
-- Collecte progressive (wizard /bienvenue + nudges JIT in-app).
-- ============================================================

-- 8) Enums onboarding (idempotents)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'uemoa_country') then
    create type public.uemoa_country as enum
      ('ci','sn','bj','tg','bf','ml','ne','gw');
  end if;
  if not exists (select 1 from pg_type where typname = 'experience_level') then
    create type public.experience_level as enum
      ('debutant','initie','expert');
  end if;
  if not exists (select 1 from pg_type where typname = 'investment_horizon') then
    create type public.investment_horizon as enum
      ('court','moyen','long');
  end if;
end$$;

-- 9) Colonnes ajoutees a profiles (idempotent via "if not exists")
alter table public.profiles
  add column if not exists country             public.uemoa_country,
  add column if not exists experience_level    public.experience_level,
  add column if not exists professional_sector text,
  add column if not exists interests           text[] not null default '{}',
  add column if not exists investment_horizon  public.investment_horizon,
  add column if not exists onboarded_at        timestamptz,
  add column if not exists dismissed_nudges    text[] not null default '{}';

-- 10) Re-grant des colonnes update-ables pour 'authenticated'.
--     Le revoke/grant initial (cf. point 6) n'incluait pas les nouvelles
--     colonnes ; on regrante l'ensemble du set autorise.
revoke update on public.profiles from authenticated;
grant update (
  email, username, full_name, avatar_url,
  country, experience_level, professional_sector,
  interests, investment_horizon, onboarded_at, dismissed_nudges
) on public.profiles to authenticated;
