-- ============================================================
-- AzimutFinance — Ligue Azimut v2 : Course à l'introduction +
-- carnet d'ordres virtuel + détection inactivité.
--
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- PREREQUIS : supabase/simulateur.sql (v1) déjà exécuté.
--
-- Nouveautés :
--   - simulator_seasons étendu avec champs intro phase + snapshot du flottant
--   - simulator_portfolios étend avec last_seen_at (détection inactivité)
--   - simulator_share_pool : pool d'actions disponibles pendant la Course
--   - simulator_positions : positions agrégées par joueur×titre (matérialisé
--     pour vitesse du matching)
--   - simulator_orders : carnet d'ordres virtuel (LIMIT, MARKET, STOP_LOSS,
--     TAKE_PROFIT) avec validité DAY/GTC/GTD
-- ============================================================

-- ============================================================
-- 1) Extension simulator_seasons
-- ============================================================

alter table public.simulator_seasons
  add column if not exists registration_starts_at date,
  add column if not exists registration_ends_at   date,
  add column if not exists intro_phase_start_at   timestamptz,
  add column if not exists intro_phase_end_at     timestamptz,
  add column if not exists float_snapshot_at      date,
  add column if not exists total_pool_units       bigint,
  add column if not exists total_pool_value       bigint,
  add column if not exists participant_count      int;

-- Le statut existant accepte 'upcoming','active','ended' (cf v1).
-- On ajoute 'intro' (Course à l'introduction en cours) et 'frozen' (saison
-- annulée). Comme c'est un check constraint, on doit le drop puis recréer.
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name like 'simulator_seasons_status_check%'
  ) then
    -- Le nom exact varie selon Postgres ; on cible par pattern
    execute (
      select 'alter table public.simulator_seasons drop constraint ' || quote_ident(constraint_name)
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'simulator_seasons'
        and constraint_type = 'CHECK'
        and constraint_name like 'simulator_seasons_status_check%'
      limit 1
    );
  end if;
end$$;

alter table public.simulator_seasons
  add constraint simulator_seasons_status_check
  check (status in ('upcoming','intro','active','ended','frozen'));

-- ============================================================
-- 2) Extension simulator_portfolios : last_seen_at + liquidation flag
-- ============================================================

alter table public.simulator_portfolios
  add column if not exists last_seen_at  timestamptz not null default now(),
  add column if not exists liquidated_at timestamptz;

create index if not exists simulator_portfolios_last_seen_idx
  on public.simulator_portfolios (last_seen_at);

-- ============================================================
-- 3) simulator_share_pool : pool d'actions de la Course à l'introduction
-- ============================================================

create table if not exists public.simulator_share_pool (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references public.simulator_seasons(id) on delete cascade,
  code             text not null,
  total_units      bigint not null check (total_units >= 0),
  remaining_units  bigint not null check (remaining_units >= 0),
  ref_price        bigint not null check (ref_price > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (season_id, code)
);

create index if not exists simulator_share_pool_season_idx
  on public.simulator_share_pool (season_id);

drop trigger if exists simulator_share_pool_set_updated_at on public.simulator_share_pool;
create trigger simulator_share_pool_set_updated_at
  before update on public.simulator_share_pool
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 4) simulator_positions : positions agrégées par joueur×titre
--
-- En v1, simulator_positions était une VUE calculée à la volée à partir de
-- simulator_transactions. En v2 on en fait une TABLE matérialisée pour que
-- le matching engine (S3) puisse vérifier la couverture des SELL sans
-- recalculer l'agrégat à chaque tick. Cette table devient la source de
-- vérité des positions (les transactions restent un journal append-only).
-- ============================================================

-- Drop la vue v1 SI elle existe encore en tant que vue. Si elle existe déjà
-- en tant que table (re-run du script), on la laisse — `create table if not
-- exists` plus bas est idempotent.
do $$
declare
  v_kind char;
begin
  select relkind into v_kind from pg_class
    where relname = 'simulator_positions'
      and relnamespace = 'public'::regnamespace;
  if v_kind = 'v' then
    execute 'drop view public.simulator_positions cascade';
  end if;
end$$;

create table if not exists public.simulator_positions (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references public.simulator_portfolios(id) on delete cascade,
  code          text not null,
  units         bigint not null check (units >= 0),
  avg_cost      bigint not null check (avg_cost >= 0),
  updated_at    timestamptz not null default now(),
  unique (portfolio_id, code)
);

create index if not exists simulator_positions_portfolio_idx
  on public.simulator_positions (portfolio_id);
create index if not exists simulator_positions_code_idx
  on public.simulator_positions (code);

drop trigger if exists simulator_positions_set_updated_at on public.simulator_positions;
create trigger simulator_positions_set_updated_at
  before update on public.simulator_positions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 5) simulator_orders : carnet d'ordres virtuel
--
-- order_type :
--   - LIMIT       : ordre à prix limite (BUY ≤ limit_price, SELL ≥ limit_price)
--   - MARKET      : exécution immédiate au meilleur prix disponible
--   - STOP_LOSS   : SELL déclenché quand cours ≤ stop_price
--   - TAKE_PROFIT : SELL déclenché quand cours ≥ stop_price
--
-- validity :
--   - DAY  : annulé à la fin de la séance BRVM (clôture quotidienne)
--   - GTC  : Good Till Cancelled (reste en book jusqu'à exécution/annulation)
--   - GTD  : Good Till Date (expires_at obligatoire)
--
-- status :
--   - open      : actif dans le carnet
--   - partial   : partiellement exécuté
--   - filled    : entièrement exécuté
--   - cancelled : annulé par l'utilisateur ou auto (DAY, GTD expiré)
--   - expired   : expiré par validité
--   - reserved  : suspendu par seuil dynamique/statique BRVM (5 min)
-- ============================================================

create table if not exists public.simulator_orders (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references public.simulator_portfolios(id) on delete cascade,
  season_id     uuid not null references public.simulator_seasons(id) on delete cascade,
  code          text not null,
  side          text not null check (side in ('BUY','SELL')),
  order_type    text not null check (order_type in ('LIMIT','MARKET','STOP_LOSS','TAKE_PROFIT')),
  units         bigint not null check (units > 0),
  units_filled  bigint not null default 0 check (units_filled >= 0),
  limit_price   bigint check (limit_price is null or (limit_price > 0 and limit_price % 5 = 0)),
  stop_price    bigint check (stop_price is null or (stop_price > 0 and stop_price % 5 = 0)),
  min_units     bigint not null default 1 check (min_units >= 1),
  validity      text not null default 'DAY' check (validity in ('DAY','GTC','GTD')),
  expires_at    timestamptz,
  status        text not null default 'open'
                check (status in ('open','partial','filled','cancelled','expired','reserved')),
  reserved_until timestamptz,
  placed_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint simulator_orders_units_fill check (units_filled <= units),
  constraint simulator_orders_limit_needs_price
    check (order_type <> 'LIMIT' or limit_price is not null),
  constraint simulator_orders_stop_needs_price
    check (order_type not in ('STOP_LOSS','TAKE_PROFIT') or stop_price is not null),
  constraint simulator_orders_gtd_needs_expiry
    check (validity <> 'GTD' or expires_at is not null)
);

-- FIFO time priority : tri par placed_at au sein d'un (code, side, prix)
create index if not exists simulator_orders_book_idx
  on public.simulator_orders (season_id, code, side, limit_price, placed_at)
  where status in ('open','partial','reserved');

create index if not exists simulator_orders_portfolio_idx
  on public.simulator_orders (portfolio_id, placed_at desc);

create index if not exists simulator_orders_status_idx
  on public.simulator_orders (status, expires_at);

drop trigger if exists simulator_orders_set_updated_at on public.simulator_orders;
create trigger simulator_orders_set_updated_at
  before update on public.simulator_orders
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 6) Row Level Security
-- ============================================================

alter table public.simulator_share_pool enable row level security;
alter table public.simulator_positions  enable row level security;
alter table public.simulator_orders     enable row level security;

-- share_pool : lecture publique (le pool est visible de tous pendant la Course),
--              écriture service_role uniquement
drop policy if exists "share_pool_select_all" on public.simulator_share_pool;
create policy "share_pool_select_all"
  on public.simulator_share_pool for select
  to anon, authenticated using (true);

-- positions : lecture authentifiée (transparence du classement), écriture
--             via RPC security definer uniquement
drop policy if exists "positions_select_authenticated" on public.simulator_positions;
create policy "positions_select_authenticated"
  on public.simulator_positions for select
  to authenticated using (true);

-- orders : SELECT authentifié sur le book (transparence), INSERT/UPDATE limité
--          à l'owner sur ses propres ordres, DELETE via RPC pour bookkeeping.
drop policy if exists "orders_select_authenticated" on public.simulator_orders;
create policy "orders_select_authenticated"
  on public.simulator_orders for select
  to authenticated using (true);

drop policy if exists "orders_insert_own" on public.simulator_orders;
create policy "orders_insert_own"
  on public.simulator_orders for insert
  to authenticated
  with check (
    exists (
      select 1 from public.simulator_portfolios p
       where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "orders_update_own_cancel" on public.simulator_orders;
create policy "orders_update_own_cancel"
  on public.simulator_orders for update
  to authenticated
  using (
    exists (
      select 1 from public.simulator_portfolios p
       where p.id = portfolio_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.simulator_portfolios p
       where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7) RPC : ouverture de saison
--    Calcule le capital initial = total_pool_value / participant_count,
--    crédite chaque portefeuille avec ce montant, remplit share_pool.
--
-- Input :
--   p_season_id : id de la saison à ouvrir
--   p_pool      : jsonb [{code, total_units, ref_price}, ...] (calculé côté
--                 serveur Next à partir du CSV titres.csv)
--
-- Effets :
--   - simulator_share_pool : 1 ligne par titre du pool
--   - simulator_seasons    : status='intro', total_pool_value, participant_count
--   - simulator_portfolios : cash mis à jour pour chaque inscrit
--
-- Seul un admin L3+ peut appeler cette RPC.
-- ============================================================

create or replace function public.simulator_open_season(
  p_season_id uuid,
  p_pool jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_pool_value bigint := 0;
  v_total_pool_units bigint := 0;
  v_participants     int    := 0;
  v_initial_capital  bigint := 0;
  v_season           public.simulator_seasons%rowtype;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Verrouille la saison
  select * into v_season from public.simulator_seasons
    where id = p_season_id for update;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  -- Une saison peut être lancée depuis upcoming (préparation privée) ou
  -- active (phase d'inscription ouverte). Le verrou anti-double-lancement
  -- est total_pool_value : dès qu'il est renseigné, la Course a démarré.
  if v_season.status not in ('upcoming','active') then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;
  if v_season.total_pool_value is not null then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;

  -- Calcule la valeur totale du pool depuis le JSON fourni
  select coalesce(sum( (item->>'total_units')::bigint * (item->>'ref_price')::bigint ), 0),
         coalesce(sum( (item->>'total_units')::bigint ), 0)
    into v_total_pool_value, v_total_pool_units
    from jsonb_array_elements(p_pool) as item;

  if v_total_pool_value <= 0 then
    raise exception 'EMPTY_POOL';
  end if;

  -- Compte les inscrits (déjà créés via JoinSeasonButton avant la phase intro)
  select count(*) into v_participants
    from public.simulator_portfolios
    where season_id = p_season_id;

  if v_participants = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;

  v_initial_capital := v_total_pool_value / v_participants;

  -- Vide l'éventuel pool existant pour cette saison (idempotence)
  delete from public.simulator_share_pool where season_id = p_season_id;

  -- Remplit le pool
  insert into public.simulator_share_pool (season_id, code, total_units, remaining_units, ref_price)
    select p_season_id,
           item->>'code',
           (item->>'total_units')::bigint,
           (item->>'total_units')::bigint,
           (item->>'ref_price')::bigint
      from jsonb_array_elements(p_pool) as item;

  -- Crédite tous les portefeuilles avec le capital initial
  update public.simulator_portfolios
     set cash = v_initial_capital
   where season_id = p_season_id;

  -- Met la saison en statut 'intro' (Course à l'introduction)
  update public.simulator_seasons
     set status            = 'intro',
         initial_capital   = v_initial_capital,
         total_pool_value  = v_total_pool_value,
         total_pool_units  = v_total_pool_units,
         participant_count = v_participants
   where id = p_season_id;

  return jsonb_build_object(
    'initial_capital',  v_initial_capital,
    'participants',     v_participants,
    'total_pool_value', v_total_pool_value,
    'total_pool_units', v_total_pool_units
  );
end$$;

grant execute on function public.simulator_open_season(uuid, jsonb) to authenticated;

-- ============================================================
-- 8) RPC : ping last_seen_at (à appeler à chaque visite de la page ligue)
-- ============================================================

create or replace function public.simulator_ping_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.simulator_portfolios
     set last_seen_at = now()
   where user_id = auth.uid();
end$$;

grant execute on function public.simulator_ping_last_seen() to authenticated;

-- ============================================================
-- 9) Extension de admin_set_season_status pour accepter 'intro' et 'frozen'
--    (la fonction d'origine est dans supabase/admin.sql et n'accepte que
--     upcoming/active/ended).
-- ============================================================

create or replace function public.admin_set_season_status(
  p_season_id uuid,
  p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_status not in ('upcoming', 'intro', 'active', 'ended', 'frozen') then
    raise exception 'INVALID_STATUS';
  end if;
  if not exists (select 1 from public.simulator_seasons where id = p_season_id) then
    raise exception 'SEASON_NOT_FOUND';
  end if;
  update public.simulator_seasons
    set status = p_status, updated_at = now()
    where id = p_season_id;
  perform public._admin_log(
    'set_season_status', 'season', p_season_id::text,
    jsonb_build_object('new_status', p_status), null
  );
end;
$$;

-- ============================================================
-- 10) Suppression de saison (L3 uniquement — opération destructive)
--
-- Les FK des tables filles (portfolios, transactions, share_pool, orders,
-- positions) sont déjà en ON DELETE CASCADE, donc supprimer la saison
-- nettoie tout son écosystème.
-- ============================================================

-- ============================================================
-- Création de saison avec période d'inscription distincte (v2).
-- Variante de admin_create_season(text, date, date, bigint, numeric) qui
-- accepte 2 dates supplémentaires : registration_starts_at / _ends_at.
--
-- Contraintes :
--   - registration_starts_at <= registration_ends_at
--   - registration_ends_at <= starts_at   (inscription doit fermer avant la
--     compétition pour permettre le calcul du pool et le lancement de la
--     Course à l'introduction)
--   - starts_at < ends_at
--
-- Le statut est calculé automatiquement à partir des dates :
--   - avant registration_starts_at : 'upcoming'
--   - entre reg_start et reg_end inclusivement : 'active' (inscriptions ouvertes)
--   - entre reg_end et starts_at : 'active' (transition, inscriptions fermées)
--   - sinon comme avant
-- ============================================================

create or replace function public.admin_create_season_v2(
  p_name                    text,
  p_registration_starts_at  date,
  p_registration_ends_at    date,
  p_starts_at               date,
  p_ends_at                 date,
  p_initial_capital         bigint,
  p_fee_pct                 numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_status text;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_registration_starts_at > p_registration_ends_at then
    raise exception 'INVALID_REGISTRATION_DATES';
  end if;
  if p_registration_ends_at > p_starts_at then
    raise exception 'REGISTRATION_AFTER_COMPETITION';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'INVALID_DATES';
  end if;
  v_status := case
    when p_starts_at <= current_date and p_ends_at >= current_date then 'active'
    when p_registration_starts_at <= current_date and p_starts_at > current_date then 'active'
    when p_registration_starts_at > current_date then 'upcoming'
    else 'ended'
  end;
  insert into public.simulator_seasons
    (name, registration_starts_at, registration_ends_at,
     starts_at, ends_at, initial_capital, transaction_fee_pct, status)
  values
    (p_name, p_registration_starts_at, p_registration_ends_at,
     p_starts_at, p_ends_at, p_initial_capital, p_fee_pct, v_status)
  returning id into v_id;
  perform public._admin_log(
    'create_season', 'season', v_id::text,
    jsonb_build_object(
      'name', p_name,
      'registration_starts_at', p_registration_starts_at,
      'registration_ends_at', p_registration_ends_at,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'initial_capital', p_initial_capital
    ),
    null
  );
  return v_id;
end;
$$;

grant execute on function
  public.admin_create_season_v2(text, date, date, date, date, bigint, numeric)
  to authenticated;

create or replace function public.admin_delete_season(
  p_season_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_pf_count int;
  v_tx_count int;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select name into v_name from public.simulator_seasons where id = p_season_id;
  if not found then
    raise exception 'SEASON_NOT_FOUND';
  end if;

  select count(*) into v_pf_count from public.simulator_portfolios where season_id = p_season_id;
  select count(*) into v_tx_count from public.simulator_transactions tx
    join public.simulator_portfolios p on p.id = tx.portfolio_id
    where p.season_id = p_season_id;

  delete from public.simulator_seasons where id = p_season_id;

  perform public._admin_log(
    'delete_season', 'season', p_season_id::text,
    jsonb_build_object(
      'name', v_name,
      'portfolios_deleted', v_pf_count,
      'transactions_deleted', v_tx_count
    ),
    null
  );
end;
$$;

grant execute on function public.admin_delete_season(uuid) to authenticated;

create or replace function public.admin_delete_all_seasons()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_count int;
  v_pf_count int;
  v_tx_count int;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select count(*) into v_season_count from public.simulator_seasons;
  select count(*) into v_pf_count from public.simulator_portfolios;
  select count(*) into v_tx_count from public.simulator_transactions;

  delete from public.simulator_seasons;

  perform public._admin_log(
    'delete_all_seasons', 'season', null,
    jsonb_build_object(
      'seasons_deleted', v_season_count,
      'portfolios_deleted', v_pf_count,
      'transactions_deleted', v_tx_count
    ),
    null
  );
  return v_season_count;
end;
$$;

grant execute on function public.admin_delete_all_seasons() to authenticated;

-- ============================================================
-- 11) S2 — Course à l'introduction : ajustements schéma
--
-- On autorise user_id NULL sur simulator_portfolios pour pouvoir y stocker
-- UN portfolio « système » par saison : c'est ce portfolio qui détient le
-- reste du pool (les actions non achetées par les joueurs pendant la Course)
-- et qui poste les SELL orders dans le carnet à la bascule J+1.
-- ============================================================

alter table public.simulator_portfolios
  alter column user_id drop not null;

-- L'ancien unique (user_id, season_id) traite NULL comme distinct (donc
-- théoriquement OK pour plusieurs system rows), mais on veut un seul system
-- portfolio par saison. On remplace par 2 index partiels.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
    from pg_constraint
   where conrelid = 'public.simulator_portfolios'::regclass
     and contype  = 'u'
     and pg_get_constraintdef(oid) ilike '%(user_id, season_id)%';
  if v_constraint is not null then
    execute 'alter table public.simulator_portfolios drop constraint ' || quote_ident(v_constraint);
  end if;
end$$;

create unique index if not exists simulator_portfolios_user_season_uniq
  on public.simulator_portfolios (user_id, season_id)
  where user_id is not null;

create unique index if not exists simulator_portfolios_system_uniq
  on public.simulator_portfolios (season_id)
  where user_id is null;

-- ============================================================
-- 12) S2 — RPC simulator_open_season v2 : accepte 2 timestamps
--     intro_phase_start_at / intro_phase_end_at (UTC).
--
-- Si NULL, on défaut sur starts_at @ 10h00 UTC → starts_at+1 @ 00h00 UTC.
-- On drop l'ancienne signature (uuid, jsonb) avant de poser la nouvelle
-- (uuid, jsonb, timestamptz, timestamptz), sinon Postgres garde les 2.
-- ============================================================

drop function if exists public.simulator_open_season(uuid, jsonb);

create or replace function public.simulator_open_season(
  p_season_id        uuid,
  p_pool             jsonb,
  p_intro_start_at   timestamptz default null,
  p_intro_end_at     timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_pool_value bigint := 0;
  v_total_pool_units bigint := 0;
  v_participants     int    := 0;
  v_initial_capital  bigint := 0;
  v_season           public.simulator_seasons%rowtype;
  v_intro_start      timestamptz;
  v_intro_end        timestamptz;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Verrouille la saison
  select * into v_season from public.simulator_seasons
    where id = p_season_id for update;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  if v_season.status not in ('upcoming','active') then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;
  if v_season.total_pool_value is not null then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;

  -- Fenêtre intro : defaults = starts_at 10h–24h UTC
  v_intro_start := coalesce(
    p_intro_start_at,
    (v_season.starts_at::timestamp at time zone 'UTC') + interval '10 hours'
  );
  v_intro_end := coalesce(
    p_intro_end_at,
    (v_season.starts_at::timestamp at time zone 'UTC') + interval '24 hours'
  );
  if v_intro_end <= v_intro_start then
    raise exception 'INVALID_INTRO_WINDOW';
  end if;

  -- Calcule la valeur totale du pool depuis le JSON fourni
  select coalesce(sum( (item->>'total_units')::bigint * (item->>'ref_price')::bigint ), 0),
         coalesce(sum( (item->>'total_units')::bigint ), 0)
    into v_total_pool_value, v_total_pool_units
    from jsonb_array_elements(p_pool) as item;

  if v_total_pool_value <= 0 then
    raise exception 'EMPTY_POOL';
  end if;

  -- Compte les inscrits (exclure le portfolio système éventuel = user_id NULL)
  select count(*) into v_participants
    from public.simulator_portfolios
    where season_id = p_season_id
      and user_id is not null;

  if v_participants = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;

  v_initial_capital := v_total_pool_value / v_participants;

  -- Vide l'éventuel pool existant pour cette saison (idempotence)
  delete from public.simulator_share_pool where season_id = p_season_id;

  -- Remplit le pool
  insert into public.simulator_share_pool (season_id, code, total_units, remaining_units, ref_price)
    select p_season_id,
           item->>'code',
           (item->>'total_units')::bigint,
           (item->>'total_units')::bigint,
           (item->>'ref_price')::bigint
      from jsonb_array_elements(p_pool) as item;

  -- Crédite tous les portefeuilles joueurs avec le capital initial
  update public.simulator_portfolios
     set cash = v_initial_capital
   where season_id = p_season_id
     and user_id is not null;

  -- Met la saison en statut 'intro' (Course à l'introduction)
  update public.simulator_seasons
     set status               = 'intro',
         initial_capital      = v_initial_capital,
         total_pool_value     = v_total_pool_value,
         total_pool_units     = v_total_pool_units,
         participant_count    = v_participants,
         intro_phase_start_at = v_intro_start,
         intro_phase_end_at   = v_intro_end,
         float_snapshot_at    = current_date
   where id = p_season_id;

  perform public._admin_log(
    'open_season_v2', 'season', p_season_id::text,
    jsonb_build_object(
      'initial_capital',  v_initial_capital,
      'participants',     v_participants,
      'total_pool_value', v_total_pool_value,
      'total_pool_units', v_total_pool_units,
      'intro_start',      v_intro_start,
      'intro_end',        v_intro_end
    ),
    null
  );

  return jsonb_build_object(
    'initial_capital',  v_initial_capital,
    'participants',     v_participants,
    'total_pool_value', v_total_pool_value,
    'total_pool_units', v_total_pool_units,
    'intro_start',      v_intro_start,
    'intro_end',        v_intro_end
  );
end$$;

grant execute on function
  public.simulator_open_season(uuid, jsonb, timestamptz, timestamptz)
  to authenticated;

-- ============================================================
-- 13) S2 — RPC simulator_buy_from_pool
--
-- Achat atomique contre simulator_share_pool pendant la Course à
-- l'introduction. Premier arrivé premier servi (FIFO via FOR UPDATE
-- sur la ligne du pool).
--
-- Règles :
--   - L'utilisateur doit être authentifié et avoir un portfolio sur la saison.
--   - La saison doit être en statut 'intro' et NOW() ∈ [intro_start, intro_end].
--   - Le pool de ce code doit avoir assez d'unités restantes.
--   - Le cash du portfolio doit couvrir units * ref_price (aucun frais
--     pendant la Course — la totalité du capital initial doit pouvoir être
--     dépensée à l'achat).
--   - L'achat se fait au ref_price gelé à l'ouverture de la saison.
--
-- Effets :
--   - simulator_share_pool : remaining_units -= units
--   - simulator_portfolios : cash -= units * ref_price
--   - simulator_transactions : 1 ligne BUY
--   - simulator_positions : upsert (units cumul, avg_cost recalculé)
-- ============================================================

create or replace function public.simulator_buy_from_pool(
  p_season_id uuid,
  p_code      text,
  p_units     bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_portfolio   public.simulator_portfolios%rowtype;
  v_season      public.simulator_seasons%rowtype;
  v_pool        public.simulator_share_pool%rowtype;
  v_cost        bigint;
  v_tx_id       uuid;
  v_existing    public.simulator_positions%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_units is null or p_units <= 0 then
    raise exception 'INVALID_UNITS';
  end if;

  -- Saison (lecture sans lock — l'unicité de l'atomicité vient du pool row)
  select * into v_season from public.simulator_seasons
    where id = p_season_id;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  if v_season.status <> 'intro' then
    raise exception 'INTRO_NOT_OPEN';
  end if;
  if v_season.intro_phase_start_at is null
     or now() < v_season.intro_phase_start_at then
    raise exception 'INTRO_NOT_STARTED';
  end if;
  if v_season.intro_phase_end_at is null
     or now() > v_season.intro_phase_end_at then
    raise exception 'INTRO_ENDED';
  end if;

  -- Portfolio joueur (lock pour modifier cash)
  select * into v_portfolio
    from public.simulator_portfolios
   where season_id = p_season_id and user_id = v_user_id
   for update;
  if not found then
    raise exception 'NO_PORTFOLIO';
  end if;

  -- Pool row (lock — c'est le verrou critique du FIFO)
  select * into v_pool
    from public.simulator_share_pool
   where season_id = p_season_id and code = p_code
   for update;
  if not found then
    raise exception 'POOL_CODE_NOT_FOUND';
  end if;
  if v_pool.remaining_units < p_units then
    raise exception 'POOL_INSUFFICIENT';
  end if;

  v_cost := p_units * v_pool.ref_price;
  if v_portfolio.cash < v_cost then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  -- Décrémente le pool
  update public.simulator_share_pool
     set remaining_units = remaining_units - p_units
   where id = v_pool.id;

  -- Débite le cash
  update public.simulator_portfolios
     set cash = cash - v_cost,
         last_seen_at = now()
   where id = v_portfolio.id;

  -- Journal de transaction (fees = 0 pendant la Course)
  insert into public.simulator_transactions
    (portfolio_id, type, code, units, price, gross_total, fees, net_total, price_date)
  values
    (v_portfolio.id, 'BUY', p_code, p_units, v_pool.ref_price,
     v_cost, 0, v_cost, current_date)
  returning id into v_tx_id;

  -- Upsert position
  select * into v_existing
    from public.simulator_positions
   where portfolio_id = v_portfolio.id and code = p_code
   for update;
  if found then
    update public.simulator_positions
       set units    = v_existing.units + p_units,
           avg_cost = ( (v_existing.units * v_existing.avg_cost)
                        + (p_units * v_pool.ref_price) )
                      / (v_existing.units + p_units)
     where id = v_existing.id;
  else
    insert into public.simulator_positions (portfolio_id, code, units, avg_cost)
    values (v_portfolio.id, p_code, p_units, v_pool.ref_price);
  end if;

  return jsonb_build_object(
    'transaction_id',  v_tx_id,
    'units',           p_units,
    'price',           v_pool.ref_price,
    'cost',            v_cost,
    'remaining_units', v_pool.remaining_units - p_units,
    'new_cash',        v_portfolio.cash - v_cost
  );
end$$;

grant execute on function public.simulator_buy_from_pool(uuid, text, bigint) to authenticated;

-- ============================================================
-- 14) S2 — RPC simulator_close_intro_phase
--
-- Termine la Course à l'introduction :
--   - Récupère ou crée le portfolio système de la saison (user_id NULL).
--   - Pour chaque ligne du share_pool avec remaining_units > 0, dépose un
--     ordre SELL LIMIT au ref_price, validity GTC, status='open', sous
--     ce portfolio système, et crée la position correspondante (qu'il
--     pourra "vendre" puisque le matching engine S3 vérifiera la couverture).
--   - Bascule la saison en statut 'active' (carnet d'ordres ouvert).
--
-- Idempotent : si déjà close, no-op silencieux.
--
-- Peut être appelé par un admin L2+ OU automatiquement quand NOW() dépasse
-- intro_phase_end_at (variante simulator_close_intro_phase_auto qui ne check
-- pas le rôle mais vérifie la fenêtre).
-- ============================================================

create or replace function public.simulator_close_intro_phase(
  p_season_id uuid,
  p_force     boolean default false  -- si true, ferme même si NOW() < intro_end
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season       public.simulator_seasons%rowtype;
  v_pool         public.simulator_share_pool%rowtype;
  v_system_pf_id uuid;
  v_orders_count int := 0;
  v_units_dumped bigint := 0;
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_season from public.simulator_seasons
    where id = p_season_id for update;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;

  -- Idempotence : déjà fermée
  if v_season.status <> 'intro' then
    return jsonb_build_object(
      'orders_created', 0,
      'units_dumped',   0,
      'status',         v_season.status,
      'already_closed', true
    );
  end if;

  -- Si pas forcé, vérifier que la fenêtre est terminée
  if not p_force
     and v_season.intro_phase_end_at is not null
     and now() < v_season.intro_phase_end_at then
    raise exception 'INTRO_STILL_OPEN';
  end if;

  -- Portfolio système (créé si absent)
  select id into v_system_pf_id
    from public.simulator_portfolios
   where season_id = p_season_id and user_id is null;
  if not found then
    insert into public.simulator_portfolios (user_id, season_id, cash)
      values (null, p_season_id, 0)
      returning id into v_system_pf_id;
  end if;

  -- Pour chaque code avec du reliquat → SELL LIMIT GTC + position système
  for v_pool in
    select * from public.simulator_share_pool
     where season_id = p_season_id and remaining_units > 0
     for update
  loop
    -- Position système (la totalité du reliquat)
    insert into public.simulator_positions (portfolio_id, code, units, avg_cost)
    values (v_system_pf_id, v_pool.code, v_pool.remaining_units, v_pool.ref_price)
    on conflict (portfolio_id, code) do update
      set units    = simulator_positions.units + excluded.units,
          avg_cost = v_pool.ref_price;

    -- Ordre SELL LIMIT GTC au ref_price
    insert into public.simulator_orders
      (portfolio_id, season_id, code, side, order_type, units, limit_price, validity, status)
    values
      (v_system_pf_id, p_season_id, v_pool.code, 'SELL', 'LIMIT',
       v_pool.remaining_units, v_pool.ref_price, 'GTC', 'open');

    v_orders_count := v_orders_count + 1;
    v_units_dumped := v_units_dumped + v_pool.remaining_units;
  end loop;

  -- Transition statut
  update public.simulator_seasons
     set status = 'active'
   where id = p_season_id;

  perform public._admin_log(
    'close_intro_phase', 'season', p_season_id::text,
    jsonb_build_object(
      'orders_created', v_orders_count,
      'units_dumped',   v_units_dumped,
      'forced',         p_force
    ),
    null
  );

  return jsonb_build_object(
    'orders_created', v_orders_count,
    'units_dumped',   v_units_dumped,
    'status',         'active',
    'already_closed', false
  );
end$$;

grant execute on function public.simulator_close_intro_phase(uuid, boolean) to authenticated;

-- ============================================================
-- 15) S2 — Règle de diversification
--
-- Aucun joueur ne peut détenir un titre à plus de 15 % de la valeur de son
-- portefeuille. Le plafond passe à 20 % pour les titres dont la capitalisation
-- (float × ref_price) dépasse 10 % de la capitalisation flottante totale du
-- pool ("large caps" du marché simulé).
--
-- - Drapeau `is_large_cap` figé à l'ouverture de la saison sur share_pool.
-- - Helper SQL réutilisable côté carnet d'ordres (S3) :
--     _simulator_check_diversification(p_portfolio_id, p_code, p_add_units, p_ref_price)
--   qui lève DIVERSIFICATION_LIMIT si la position résultante violerait la
--   règle. Pas de check sur les SELLs (vendre ne casse jamais la règle).
--
-- - Pendant la Course, ref_price = avg_cost pour toutes les positions, donc la
--   valeur du portefeuille (cash + positions au prix d'entrée) est constante
--   et égale au capital initial. On valorise donc les positions à avg_cost,
--   ce qui marche AUSSI pour le post-intro (= valorisation au PRU). En S3 on
--   passera à une valorisation au dernier prix de marché.
-- ============================================================

alter table public.simulator_share_pool
  add column if not exists is_large_cap boolean not null default false;

-- À l'ouverture de la saison, on calcule is_large_cap : un titre dont la
-- capitalisation flottante (total_units × ref_price) dépasse 10 % de la
-- capitalisation flottante totale du pool. On patche la fin de
-- simulator_open_season (déjà créée) par un UPDATE post-insert. Pour rester
-- idempotent, on intègre ce calcul à l'intérieur du corps de la fonction
-- (on la remplace).
--
-- (NB : on doit drop l'ancienne pour pouvoir lui donner un nouveau corps
-- avec exactement la même signature — create or replace suffit.)

create or replace function public.simulator_open_season(
  p_season_id        uuid,
  p_pool             jsonb,
  p_intro_start_at   timestamptz default null,
  p_intro_end_at     timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_pool_value bigint := 0;
  v_total_pool_units bigint := 0;
  v_participants     int    := 0;
  v_initial_capital  bigint := 0;
  v_season           public.simulator_seasons%rowtype;
  v_intro_start      timestamptz;
  v_intro_end        timestamptz;
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_season from public.simulator_seasons
    where id = p_season_id for update;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  if v_season.status not in ('upcoming','active') then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;
  if v_season.total_pool_value is not null then
    raise exception 'SEASON_ALREADY_OPENED';
  end if;

  v_intro_start := coalesce(
    p_intro_start_at,
    (v_season.starts_at::timestamp at time zone 'UTC') + interval '10 hours'
  );
  v_intro_end := coalesce(
    p_intro_end_at,
    (v_season.starts_at::timestamp at time zone 'UTC') + interval '24 hours'
  );
  if v_intro_end <= v_intro_start then
    raise exception 'INVALID_INTRO_WINDOW';
  end if;

  select coalesce(sum( (item->>'total_units')::bigint * (item->>'ref_price')::bigint ), 0),
         coalesce(sum( (item->>'total_units')::bigint ), 0)
    into v_total_pool_value, v_total_pool_units
    from jsonb_array_elements(p_pool) as item;

  if v_total_pool_value <= 0 then
    raise exception 'EMPTY_POOL';
  end if;

  select count(*) into v_participants
    from public.simulator_portfolios
    where season_id = p_season_id
      and user_id is not null;

  if v_participants = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;

  v_initial_capital := v_total_pool_value / v_participants;

  delete from public.simulator_share_pool where season_id = p_season_id;

  insert into public.simulator_share_pool
    (season_id, code, total_units, remaining_units, ref_price, is_large_cap)
    select p_season_id,
           item->>'code',
           (item->>'total_units')::bigint,
           (item->>'total_units')::bigint,
           (item->>'ref_price')::bigint,
           -- large_cap : capi flottante du titre > 10 % de la capi flottante
           -- totale du pool
           ((item->>'total_units')::bigint * (item->>'ref_price')::bigint)::numeric
             > 0.10 * v_total_pool_value::numeric
      from jsonb_array_elements(p_pool) as item;

  update public.simulator_portfolios
     set cash = v_initial_capital
   where season_id = p_season_id
     and user_id is not null;

  update public.simulator_seasons
     set status               = 'intro',
         initial_capital      = v_initial_capital,
         total_pool_value     = v_total_pool_value,
         total_pool_units     = v_total_pool_units,
         participant_count    = v_participants,
         intro_phase_start_at = v_intro_start,
         intro_phase_end_at   = v_intro_end,
         float_snapshot_at    = current_date
   where id = p_season_id;

  perform public._admin_log(
    'open_season_v2', 'season', p_season_id::text,
    jsonb_build_object(
      'initial_capital',  v_initial_capital,
      'participants',     v_participants,
      'total_pool_value', v_total_pool_value,
      'total_pool_units', v_total_pool_units,
      'intro_start',      v_intro_start,
      'intro_end',        v_intro_end
    ),
    null
  );

  return jsonb_build_object(
    'initial_capital',  v_initial_capital,
    'participants',     v_participants,
    'total_pool_value', v_total_pool_value,
    'total_pool_units', v_total_pool_units,
    'intro_start',      v_intro_start,
    'intro_end',        v_intro_end
  );
end$$;

-- Helper réutilisable : lève DIVERSIFICATION_LIMIT si l'achat dépasse le seuil.
-- Valorise toutes les positions au PRU (avg_cost) ; en intro, ref_price = PRU
-- donc cohérent. En S3, on remplacera cette valorisation par le last_market_price.
create or replace function public._simulator_check_diversification(
  p_portfolio_id   uuid,
  p_code           text,
  p_add_units      bigint,
  p_ref_price      bigint,
  p_is_large_cap   boolean
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_cash             bigint;
  v_positions_value  numeric;
  v_current_units    bigint;
  v_portfolio_value  numeric;
  v_new_position_val numeric;
  v_limit_pct        numeric;
  v_weight           numeric;
begin
  select cash into v_cash
    from public.simulator_portfolios
   where id = p_portfolio_id;

  select coalesce(sum(units * avg_cost), 0) into v_positions_value
    from public.simulator_positions
   where portfolio_id = p_portfolio_id;

  select coalesce(units, 0) into v_current_units
    from public.simulator_positions
   where portfolio_id = p_portfolio_id and code = p_code;

  v_portfolio_value  := v_cash + v_positions_value;
  v_new_position_val := (v_current_units + p_add_units)::numeric * p_ref_price::numeric;

  if v_portfolio_value <= 0 then
    -- Edge case : pas de cash ET pas de positions → on ne devrait pas être ici
    raise exception 'INSUFFICIENT_CASH';
  end if;

  v_limit_pct := case when p_is_large_cap then 0.20 else 0.15 end;
  v_weight    := v_new_position_val / v_portfolio_value;

  -- Tolérance d'1 part par million pour les arrondis FCFA
  if v_weight > v_limit_pct + 0.000001 then
    raise exception 'DIVERSIFICATION_LIMIT % %', v_weight, v_limit_pct
      using detail = format(
        'Cette position représenterait %s%% du portefeuille (max autorisé : %s%%).',
        round(v_weight * 100, 2), round(v_limit_pct * 100, 0)
      );
  end if;
end$$;

-- Patch simulator_buy_from_pool pour insérer le check post-lock.
create or replace function public.simulator_buy_from_pool(
  p_season_id uuid,
  p_code      text,
  p_units     bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_portfolio   public.simulator_portfolios%rowtype;
  v_season      public.simulator_seasons%rowtype;
  v_pool        public.simulator_share_pool%rowtype;
  v_cost        bigint;
  v_tx_id       uuid;
  v_existing    public.simulator_positions%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_units is null or p_units <= 0 then
    raise exception 'INVALID_UNITS';
  end if;

  select * into v_season from public.simulator_seasons
    where id = p_season_id;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  if v_season.status <> 'intro' then
    raise exception 'INTRO_NOT_OPEN';
  end if;
  if v_season.intro_phase_start_at is null
     or now() < v_season.intro_phase_start_at then
    raise exception 'INTRO_NOT_STARTED';
  end if;
  if v_season.intro_phase_end_at is null
     or now() > v_season.intro_phase_end_at then
    raise exception 'INTRO_ENDED';
  end if;

  select * into v_portfolio
    from public.simulator_portfolios
   where season_id = p_season_id and user_id = v_user_id
   for update;
  if not found then
    raise exception 'NO_PORTFOLIO';
  end if;

  select * into v_pool
    from public.simulator_share_pool
   where season_id = p_season_id and code = p_code
   for update;
  if not found then
    raise exception 'POOL_CODE_NOT_FOUND';
  end if;
  if v_pool.remaining_units < p_units then
    raise exception 'POOL_INSUFFICIENT';
  end if;

  v_cost := p_units * v_pool.ref_price;
  if v_portfolio.cash < v_cost then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  -- Règle de diversification : 15 % par défaut, 20 % pour les large caps.
  perform public._simulator_check_diversification(
    v_portfolio.id, p_code, p_units, v_pool.ref_price, v_pool.is_large_cap
  );

  update public.simulator_share_pool
     set remaining_units = remaining_units - p_units
   where id = v_pool.id;

  update public.simulator_portfolios
     set cash = cash - v_cost,
         last_seen_at = now()
   where id = v_portfolio.id;

  insert into public.simulator_transactions
    (portfolio_id, type, code, units, price, gross_total, fees, net_total, price_date)
  values
    (v_portfolio.id, 'BUY', p_code, p_units, v_pool.ref_price,
     v_cost, 0, v_cost, current_date)
  returning id into v_tx_id;

  select * into v_existing
    from public.simulator_positions
   where portfolio_id = v_portfolio.id and code = p_code
   for update;
  if found then
    update public.simulator_positions
       set units    = v_existing.units + p_units,
           avg_cost = ( (v_existing.units * v_existing.avg_cost)
                        + (p_units * v_pool.ref_price) )
                      / (v_existing.units + p_units)
     where id = v_existing.id;
  else
    insert into public.simulator_positions (portfolio_id, code, units, avg_cost)
    values (v_portfolio.id, p_code, p_units, v_pool.ref_price);
  end if;

  return jsonb_build_object(
    'transaction_id',  v_tx_id,
    'units',           p_units,
    'price',           v_pool.ref_price,
    'cost',            v_cost,
    'remaining_units', v_pool.remaining_units - p_units,
    'new_cash',        v_portfolio.cash - v_cost
  );
end$$;
