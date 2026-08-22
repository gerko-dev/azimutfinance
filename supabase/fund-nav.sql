-- ============================================================
-- AzimutFinance — Historique de valeur liquidative (VL) & actif net
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent. Prerequis : fund-management.sql (table managed_funds).
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Un point d'historique par fonds et par date. L'unicite (fund_id, as_of_date)
-- permet un upsert : import additif, ecrasement des dates deja presentes.
create table if not exists public.fund_nav_history (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  fund_id       uuid not null references public.managed_funds(id) on delete cascade,
  as_of_date    date not null,
  vl            numeric,
  nombre_parts  numeric,
  actif_net     numeric,
  actif_brut    numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (fund_id, as_of_date)
);

create index if not exists fund_nav_history_fund_idx
  on public.fund_nav_history (fund_id, as_of_date);

drop trigger if exists fund_nav_history_set_updated_at on public.fund_nav_history;
create trigger fund_nav_history_set_updated_at
  before update on public.fund_nav_history
  for each row execute procedure public.set_updated_at();

alter table public.fund_nav_history enable row level security;

drop policy if exists "fund_nav_history_all_own" on public.fund_nav_history;
create policy "fund_nav_history_all_own"
  on public.fund_nav_history for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
