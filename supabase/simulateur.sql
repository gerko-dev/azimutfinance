-- ============================================================
-- AzimutFinance — Simulateur de portefeuille (jeu BRVM)
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
-- ============================================================

-- 1) Table seasons : saisons de competition
create table if not exists public.simulator_seasons (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  starts_at             date not null,
  ends_at               date not null,
  initial_capital       bigint not null default 10000000,
  transaction_fee_pct   numeric(5,4) not null default 0.0100,
  status                text not null default 'upcoming'
                        check (status in ('upcoming','active','ended')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint simulator_seasons_dates check (ends_at > starts_at)
);

create index if not exists simulator_seasons_status_idx on public.simulator_seasons (status);
create index if not exists simulator_seasons_dates_idx on public.simulator_seasons (starts_at, ends_at);

drop trigger if exists simulator_seasons_set_updated_at on public.simulator_seasons;
create trigger simulator_seasons_set_updated_at
  before update on public.simulator_seasons
  for each row execute procedure public.set_updated_at();

-- 2) Table portfolios : 1 portefeuille par utilisateur par saison
create table if not exists public.simulator_portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  season_id   uuid not null references public.simulator_seasons(id) on delete cascade,
  cash        bigint not null,
  joined_at   timestamptz not null default now(),
  unique (user_id, season_id),
  constraint simulator_portfolios_cash_nonneg check (cash >= 0)
);

create index if not exists simulator_portfolios_season_idx on public.simulator_portfolios (season_id);
create index if not exists simulator_portfolios_user_idx on public.simulator_portfolios (user_id);

-- 3) Table transactions : journal des ordres executes
create table if not exists public.simulator_transactions (
  id              uuid primary key default gen_random_uuid(),
  portfolio_id    uuid not null references public.simulator_portfolios(id) on delete cascade,
  type            text not null check (type in ('BUY','SELL')),
  code            text not null,
  units           integer not null check (units > 0),
  price           bigint not null check (price > 0),
  gross_total     bigint not null,
  fees            bigint not null default 0 check (fees >= 0),
  net_total       bigint not null,
  price_date      date not null,
  executed_at     timestamptz not null default now()
);

create index if not exists simulator_transactions_portfolio_idx on public.simulator_transactions (portfolio_id);
create index if not exists simulator_transactions_executed_at_idx on public.simulator_transactions (executed_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.simulator_seasons enable row level security;
alter table public.simulator_portfolios enable row level security;
alter table public.simulator_transactions enable row level security;

-- SEASONS : lecture publique (visiteurs peuvent voir les saisons),
-- ecriture reservee aux admins via service_role (pas de policy INSERT/UPDATE/DELETE).
drop policy if exists "seasons_read_all" on public.simulator_seasons;
create policy "seasons_read_all"
  on public.simulator_seasons for select
  to anon, authenticated
  using (true);

-- PORTFOLIOS :
--   SELECT  : tout membre authentifie peut lire tous les portefeuilles
--             (pour le classement et la transparence du jeu).
--   INSERT  : un utilisateur peut creer SON portefeuille (avec son user_id).
--   UPDATE  : un utilisateur peut modifier SON portefeuille (cash apres ordre).
--             Restreint a la colonne cash via GRANT colonne (cf. plus bas).
--   DELETE  : pas de policy (cascade depuis auth.users uniquement).
drop policy if exists "portfolios_read_authenticated" on public.simulator_portfolios;
create policy "portfolios_read_authenticated"
  on public.simulator_portfolios for select
  to authenticated
  using (true);

drop policy if exists "portfolios_insert_own" on public.simulator_portfolios;
create policy "portfolios_insert_own"
  on public.simulator_portfolios for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "portfolios_update_own" on public.simulator_portfolios;
create policy "portfolios_update_own"
  on public.simulator_portfolios for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Restreindre les colonnes UPDATE-ables : seul cash peut etre modifie cote client.
revoke update on public.simulator_portfolios from authenticated;
grant update (cash) on public.simulator_portfolios to authenticated;

-- TRANSACTIONS :
--   SELECT  : tout membre authentifie peut lire (transparence du classement).
--   INSERT  : un utilisateur peut inserer une transaction sur SON portefeuille.
--             La validation metier (prix, units > 0, cash suffisant pour BUY,
--             units detenues suffisantes pour SELL) est faite cote serveur
--             via Server Action.
--   UPDATE/DELETE : interdits (immutabilite du journal de transactions).
drop policy if exists "transactions_read_authenticated" on public.simulator_transactions;
create policy "transactions_read_authenticated"
  on public.simulator_transactions for select
  to authenticated
  using (true);

drop policy if exists "transactions_insert_own_portfolio" on public.simulator_transactions;
create policy "transactions_insert_own_portfolio"
  on public.simulator_transactions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.simulator_portfolios p
      where p.id = portfolio_id
        and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- RPC : place_order (atomique : valide + debit/credit cash + insert tx)
-- ============================================================

create or replace function public.simulator_place_order(
  p_season_id   uuid,
  p_type        text,
  p_code        text,
  p_units       integer,
  p_price       bigint,
  p_price_date  date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_portfolio      public.simulator_portfolios%rowtype;
  v_season         public.simulator_seasons%rowtype;
  v_fee_pct        numeric;
  v_gross          bigint;
  v_fees           bigint;
  v_net            bigint;
  v_current_units  integer;
  v_tx_id          uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_type not in ('BUY','SELL') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_units <= 0 or p_price <= 0 then
    raise exception 'INVALID_AMOUNTS';
  end if;

  select * into v_season from public.simulator_seasons where id = p_season_id;
  if not found then
    raise exception 'SEASON_NOT_FOUND';
  end if;
  if v_season.status <> 'active' then
    raise exception 'SEASON_NOT_ACTIVE';
  end if;
  if current_date < v_season.starts_at or current_date > v_season.ends_at then
    raise exception 'SEASON_OUT_OF_PERIOD';
  end if;
  v_fee_pct := v_season.transaction_fee_pct;

  select * into v_portfolio
  from public.simulator_portfolios
  where user_id = v_user_id and season_id = p_season_id
  for update;
  if not found then
    raise exception 'NO_PORTFOLIO';
  end if;

  v_gross := (p_units::bigint) * p_price;
  v_fees  := round(v_gross * v_fee_pct);

  if p_type = 'BUY' then
    v_net := v_gross + v_fees;
    if v_portfolio.cash < v_net then
      raise exception 'INSUFFICIENT_CASH';
    end if;
    update public.simulator_portfolios
      set cash = cash - v_net
      where id = v_portfolio.id;
  else
    select coalesce(sum(case when type = 'BUY' then units else -units end), 0)::integer
      into v_current_units
    from public.simulator_transactions
    where portfolio_id = v_portfolio.id and code = p_code;
    if v_current_units < p_units then
      raise exception 'INSUFFICIENT_UNITS';
    end if;
    v_net := v_gross - v_fees;
    update public.simulator_portfolios
      set cash = cash + v_net
      where id = v_portfolio.id;
  end if;

  insert into public.simulator_transactions
    (portfolio_id, type, code, units, price, gross_total, fees, net_total, price_date)
  values
    (v_portfolio.id, p_type, p_code, p_units, p_price, v_gross, v_fees, v_net, p_price_date)
  returning id into v_tx_id;

  return json_build_object(
    'transaction_id', v_tx_id,
    'gross_total',    v_gross,
    'fees',           v_fees,
    'net_total',      v_net
  );
end;
$$;

grant execute on function public.simulator_place_order(uuid, text, text, integer, bigint, date)
  to authenticated;

-- ============================================================
-- Vues utiles
-- ============================================================

-- Positions courantes par portefeuille : agregat des transactions.
-- Renvoie code + units (BUY positives, SELL negatives, somme).
create or replace view public.simulator_positions as
select
  t.portfolio_id,
  t.code,
  sum(case when t.type = 'BUY' then t.units else -t.units end)::integer as units
from public.simulator_transactions t
group by t.portfolio_id, t.code
having sum(case when t.type = 'BUY' then t.units else -t.units end) > 0;

-- ============================================================
-- Seed : creer une saison de demo si aucune n'existe.
-- ============================================================

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.simulator_seasons;
  if v_count = 0 then
    insert into public.simulator_seasons
      (name, starts_at, ends_at, initial_capital, transaction_fee_pct, status)
    values
      ('Saison 1 — Mai/Juin 2026',
       current_date,
       current_date + interval '60 days',
       10000000,
       0.0100,
       'active');
  end if;
end$$;
