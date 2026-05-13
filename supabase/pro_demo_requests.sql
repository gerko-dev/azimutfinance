-- ============================================================
-- AzimutFinance — Demandes de demo Pro
-- A executer dans : Supabase Dashboard > SQL Editor > New query
--
-- PREREQUIS : supabase/admin.sql (is_admin_at_least, _admin_log)
-- Idempotent.
-- ============================================================

-- 1) Enum statut
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pro_demo_status') then
    create type public.pro_demo_status as enum (
      'new', 'contacted', 'converted', 'rejected'
    );
  end if;
end$$;

-- 2) Table pro_demo_requests
create table if not exists public.pro_demo_requests (
  id              uuid primary key default gen_random_uuid(),
  organization    text not null,
  contact_name    text not null,
  contact_role    text,
  email           text not null,
  phone           text,
  country         text,
  team_size       text,
  use_cases       text[],
  message         text,
  status          public.pro_demo_status not null default 'new',
  source          text,         -- ex. 'homepage', 'pros_terminal', 'magazine'
  -- Suivi interne
  assigned_to     uuid references auth.users(id) on delete set null,
  internal_note   text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pro_demo_requests_status_idx
  on public.pro_demo_requests (status, created_at desc);
create index if not exists pro_demo_requests_email_idx
  on public.pro_demo_requests (email);

-- 3) Trigger updated_at
create or replace function public.touch_pro_demo_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_pro_demo_updated_at on public.pro_demo_requests;
create trigger trg_pro_demo_updated_at
  before update on public.pro_demo_requests
  for each row execute function public.touch_pro_demo_updated_at();

-- 4) RLS
alter table public.pro_demo_requests enable row level security;

-- Lecture : admin L2+ uniquement
drop policy if exists pro_demo_select_admin on public.pro_demo_requests;
create policy pro_demo_select_admin
  on public.pro_demo_requests for select
  to authenticated
  using (public.is_admin_at_least(2));

-- Pas de policy INSERT/UPDATE directe : tout passe par les RPC ci-dessous.

-- ============================================================
-- 5) RPC submit_pro_demo_request — formulaire public
--    Accessible anonyme ET authentifie. Cote security definer pour bypass RLS.
-- ============================================================

create or replace function public.submit_pro_demo_request(
  p_organization  text,
  p_contact_name  text,
  p_contact_role  text,
  p_email         text,
  p_phone         text,
  p_country       text,
  p_team_size     text,
  p_use_cases     text[],
  p_message       text,
  p_source        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org text;
  v_name text;
  v_email text;
begin
  v_org := trim(coalesce(p_organization, ''));
  v_name := trim(coalesce(p_contact_name, ''));
  v_email := lower(trim(coalesce(p_email, '')));

  if v_org = '' then
    raise exception 'Nom de l''institution requis';
  end if;
  if v_name = '' then
    raise exception 'Nom du contact requis';
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse email invalide';
  end if;

  insert into public.pro_demo_requests
    (organization, contact_name, contact_role, email, phone, country,
     team_size, use_cases, message, source)
  values
    (v_org, v_name,
     nullif(trim(coalesce(p_contact_role, '')), ''),
     v_email,
     nullif(trim(coalesce(p_phone, '')), ''),
     nullif(trim(coalesce(p_country, '')), ''),
     nullif(trim(coalesce(p_team_size, '')), ''),
     case when p_use_cases is null or array_length(p_use_cases, 1) is null
          then null else p_use_cases end,
     nullif(trim(coalesce(p_message, '')), ''),
     nullif(trim(coalesce(p_source, '')), ''))
  returning id into v_id;

  return v_id;
end$$;

grant execute on function public.submit_pro_demo_request(
  text, text, text, text, text, text, text, text[], text, text
) to anon, authenticated;

-- ============================================================
-- 6) RPC admin_set_pro_demo_status (L2+) — change le statut + note interne
-- ============================================================

create or replace function public.admin_set_pro_demo_status(
  p_id            uuid,
  p_status        public.pro_demo_status,
  p_internal_note text
)
returns public.pro_demo_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pro_demo_requests;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.pro_demo_requests
    set status = p_status,
        internal_note = nullif(trim(coalesce(p_internal_note, '')), ''),
        assigned_to = case
                        when p_status in ('contacted', 'converted', 'rejected')
                          then coalesce(assigned_to, auth.uid())
                        else assigned_to
                      end,
        resolved_at = case
                        when p_status in ('converted', 'rejected')
                          then coalesce(resolved_at, now())
                        else null
                      end
    where id = p_id
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Demande introuvable';
  end if;

  perform public._admin_log(
    'pro_demo_status_change',
    'pro_demo_request',
    p_id::text,
    jsonb_build_object('status', p_status, 'organization', v_row.organization),
    null
  );

  return v_row;
end$$;

grant execute on function public.admin_set_pro_demo_status(
  uuid, public.pro_demo_status, text
) to authenticated;
