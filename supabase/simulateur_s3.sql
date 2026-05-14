-- ============================================================
-- AzimutFinance — Ligue Azimut S3 : Carnet d'ordres virtuel
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- PREREQUIS : supabase/simulateur.sql (v1) + supabase/simulateur_v2.sql (S1+S2)
--             déjà exécutés.
--
-- Modèle de réservation :
--   - BUY LIMIT  : cash débité au placement (units × limit_price).
--                  Remboursé sur annulation/expiration partielle.
--                  Sur fill < limit, la différence est remboursée.
--   - BUY MARKET : pas de réservation upfront ; matching consomme cash jusqu'à
--                  épuisement (units ou cash).
--   - SELL       : pas de mouvement cash. Couverture en live :
--                    available = positions.units
--                              - sum(remaining units des SELLs ouverts du code)
--                  Refuse l'ouverture si SELL > available.
--
-- Matching :
--   - Priorité prix puis temps (FIFO) sur les LIMIT du book.
--   - BUY exécute contre best ask (limit_price min).
--   - SELL exécute contre best bid (limit_price max).
--   - Prix d'exécution = prix du LIMIT passif (price-time priority).
--   - MARKET non rempli → status='cancelled' sur le reliquat.
--
-- Frais : season.transaction_fee_pct prélevés sur chaque côté du fill,
--         sauf si le portfolio est le compte système (user_id NULL).
--
-- STOP_LOSS / TAKE_PROFIT : placement accepté avec status='reserved'.
--   Pas de trigger ici. Activation en S5 via cron.
-- ============================================================

-- Helper : units disponibles pour vendre (positions - réservé par autres SELLs).
create or replace function public._simulator_sell_available_units(
  p_portfolio_id uuid,
  p_code         text
) returns bigint
language sql
set search_path = public
as $func$
  select greatest(
    0,
    coalesce(
      (select units from public.simulator_positions
        where portfolio_id = p_portfolio_id and code = p_code),
      0
    )
    - coalesce(
        (select sum(units - units_filled) from public.simulator_orders
          where portfolio_id = p_portfolio_id
            and code = p_code
            and side = 'SELL'
            and status in ('open','partial','reserved')),
        0
      )
  );
$func$;

-- Helper : exécute un fill entre 2 ordres déjà lockés FOR UPDATE.
create or replace function public._simulator_execute_fill(
  p_buy_order_id    uuid,
  p_sell_order_id   uuid,
  p_units           bigint,
  p_price           bigint,
  p_season_id       uuid,
  p_fee_pct         numeric
) returns void
language plpgsql
set search_path = public
as $func$
declare
  v_buy       public.simulator_orders%rowtype;
  v_sell      public.simulator_orders%rowtype;
  v_gross     bigint;
  v_buy_fees  bigint;
  v_sell_fees bigint;
  v_buy_pf    public.simulator_portfolios%rowtype;
  v_sell_pf   public.simulator_portfolios%rowtype;
  v_code      text;
  v_existing  public.simulator_positions%rowtype;
begin
  select * into v_buy  from public.simulator_orders where id = p_buy_order_id;
  select * into v_sell from public.simulator_orders where id = p_sell_order_id;
  v_code := v_buy.code;
  v_gross := p_units * p_price;
  select * into v_buy_pf  from public.simulator_portfolios where id = v_buy.portfolio_id;
  select * into v_sell_pf from public.simulator_portfolios where id = v_sell.portfolio_id;

  v_buy_fees  := case when v_buy_pf.user_id  is null then 0 else floor(v_gross * p_fee_pct) end;
  v_sell_fees := case when v_sell_pf.user_id is null then 0 else floor(v_gross * p_fee_pct) end;

  -- Avance les 2 ordres
  update public.simulator_orders
     set units_filled = units_filled + p_units,
         status = case when units_filled + p_units >= units then 'filled' else 'partial' end
   where id = p_buy_order_id;
  update public.simulator_orders
     set units_filled = units_filled + p_units,
         status = case when units_filled + p_units >= units then 'filled' else 'partial' end
   where id = p_sell_order_id;

  -- Cash acheteur : refund du nominal réservé en LIMIT puis débit frais ;
  --                 ou débit gross + frais en MARKET.
  if v_buy.order_type = 'LIMIT' then
    update public.simulator_portfolios
       set cash = cash + (p_units * v_buy.limit_price - v_gross) - v_buy_fees,
           last_seen_at = now()
     where id = v_buy.portfolio_id;
  else
    update public.simulator_portfolios
       set cash = cash - v_gross - v_buy_fees,
           last_seen_at = now()
     where id = v_buy.portfolio_id;
  end if;

  -- Cash vendeur : crédit gross - frais
  update public.simulator_portfolios
     set cash = cash + v_gross - v_sell_fees,
         last_seen_at = case when user_id is null then last_seen_at else now() end
   where id = v_sell.portfolio_id;

  -- Positions : décrémente vendeur
  select * into v_existing
    from public.simulator_positions
   where portfolio_id = v_sell.portfolio_id and code = v_code
   for update;
  if found then
    if v_existing.units - p_units <= 0 then
      delete from public.simulator_positions where id = v_existing.id;
    else
      update public.simulator_positions
         set units = v_existing.units - p_units
       where id = v_existing.id;
    end if;
  end if;

  -- Positions : incrémente acheteur (PRU pondéré)
  select * into v_existing
    from public.simulator_positions
   where portfolio_id = v_buy.portfolio_id and code = v_code
   for update;
  if found then
    update public.simulator_positions
       set units    = v_existing.units + p_units,
           avg_cost = ( (v_existing.units * v_existing.avg_cost)
                        + (p_units * p_price) )
                      / (v_existing.units + p_units)
     where id = v_existing.id;
  else
    insert into public.simulator_positions (portfolio_id, code, units, avg_cost)
    values (v_buy.portfolio_id, v_code, p_units, p_price);
  end if;

  -- Journal de transactions (côté joueurs uniquement)
  if v_buy_pf.user_id is not null then
    insert into public.simulator_transactions
      (portfolio_id, type, code, units, price, gross_total, fees, net_total, price_date)
    values
      (v_buy.portfolio_id, 'BUY', v_code, p_units, p_price,
       v_gross, v_buy_fees, v_gross + v_buy_fees, current_date);
  end if;
  if v_sell_pf.user_id is not null then
    insert into public.simulator_transactions
      (portfolio_id, type, code, units, price, gross_total, fees, net_total, price_date)
    values
      (v_sell.portfolio_id, 'SELL', v_code, p_units, p_price,
       v_gross, v_sell_fees, v_gross - v_sell_fees, current_date);
  end if;
end
$func$;

-- Matching loop pour un ordre fraîchement inséré.
create or replace function public._simulator_match_order(
  p_order_id uuid
) returns int
language plpgsql
set search_path = public
as $func$
declare
  v_order       public.simulator_orders%rowtype;
  v_counter     public.simulator_orders%rowtype;
  v_season      public.simulator_seasons%rowtype;
  v_fills       int := 0;
  v_units_left  bigint;
  v_fill_units  bigint;
  v_exec_price  bigint;
  v_cash_left   bigint;
begin
  select * into v_order from public.simulator_orders where id = p_order_id for update;
  if not found then return 0; end if;
  if v_order.status not in ('open','partial') then return 0; end if;

  select * into v_season from public.simulator_seasons where id = v_order.season_id;

  loop
    v_units_left := v_order.units - v_order.units_filled;
    exit when v_units_left <= 0;

    -- Best contre-ordre éligible (uniquement LIMIT — les MARKET ne reposent
    -- jamais dans le book).
    if v_order.side = 'BUY' then
      select * into v_counter
        from public.simulator_orders
       where season_id  = v_order.season_id
         and code       = v_order.code
         and side       = 'SELL'
         and status     in ('open','partial')
         and order_type = 'LIMIT'
         and (v_order.order_type = 'MARKET'
              or limit_price <= v_order.limit_price)
       order by limit_price asc, placed_at asc
       limit 1
       for update;
    else
      select * into v_counter
        from public.simulator_orders
       where season_id  = v_order.season_id
         and code       = v_order.code
         and side       = 'BUY'
         and status     in ('open','partial')
         and order_type = 'LIMIT'
         and (v_order.order_type = 'MARKET'
              or limit_price >= v_order.limit_price)
       order by limit_price desc, placed_at asc
       limit 1
       for update;
    end if;

    exit when v_counter.id is null;

    v_fill_units := least(v_units_left, v_counter.units - v_counter.units_filled);
    if v_fill_units <= 0 then exit; end if;

    -- Prix d'exec = prix du LIMIT passif
    v_exec_price := v_counter.limit_price;

    -- MARKET BUY : limite par le cash disponible
    if v_order.side = 'BUY' and v_order.order_type = 'MARKET' then
      select cash into v_cash_left
        from public.simulator_portfolios where id = v_order.portfolio_id;
      if v_cash_left < v_fill_units * v_exec_price * (1 + coalesce(v_season.transaction_fee_pct, 0)) then
        v_fill_units := greatest(0, floor(
          v_cash_left::numeric
          / (v_exec_price::numeric * (1 + coalesce(v_season.transaction_fee_pct, 0)))
        )::bigint);
      end if;
      if v_fill_units <= 0 then exit; end if;
    end if;

    -- Exécution
    if v_order.side = 'BUY' then
      perform public._simulator_execute_fill(
        v_order.id, v_counter.id, v_fill_units, v_exec_price,
        v_order.season_id, coalesce(v_season.transaction_fee_pct, 0)
      );
    else
      perform public._simulator_execute_fill(
        v_counter.id, v_order.id, v_fill_units, v_exec_price,
        v_order.season_id, coalesce(v_season.transaction_fee_pct, 0)
      );
    end if;

    v_fills := v_fills + 1;

    -- Recharge l'ordre pour la prochaine itération
    select * into v_order from public.simulator_orders where id = p_order_id;
    exit when v_order.status not in ('open','partial');
  end loop;

  -- MARKET non rempli → cancel le reliquat
  if v_order.order_type = 'MARKET'
     and v_order.status not in ('filled','cancelled')
     and v_order.units_filled < v_order.units then
    update public.simulator_orders set status = 'cancelled' where id = p_order_id;
  end if;

  return v_fills;
end
$func$;

-- RPC publique : placer un ordre dans le carnet
create or replace function public.simulator_place_order_v2(
  p_season_id    uuid,
  p_code         text,
  p_side         text,
  p_order_type   text,
  p_units        bigint,
  p_limit_price  bigint default null,
  p_stop_price   bigint default null,
  p_validity     text   default 'DAY',
  p_expires_at   timestamptz default null,
  p_min_units    bigint default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_user_id     uuid;
  v_portfolio   public.simulator_portfolios%rowtype;
  v_season      public.simulator_seasons%rowtype;
  v_order_id    uuid;
  v_available   bigint;
  v_cash_req    bigint;
  v_is_large    boolean := false;
  v_expires     timestamptz;
  v_status      text := 'open';
  v_fills       int;
  v_final       public.simulator_orders%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  p_code       := upper(trim(p_code));
  p_side       := upper(trim(p_side));
  p_order_type := upper(trim(p_order_type));
  p_validity   := upper(trim(p_validity));

  if p_side not in ('BUY','SELL') then raise exception 'INVALID_SIDE'; end if;
  if p_order_type not in ('LIMIT','MARKET','STOP_LOSS','TAKE_PROFIT') then
    raise exception 'INVALID_ORDER_TYPE';
  end if;
  if p_validity not in ('DAY','GTC','GTD') then raise exception 'INVALID_VALIDITY'; end if;
  if p_units is null or p_units <= 0 then raise exception 'INVALID_UNITS'; end if;
  if p_order_type = 'LIMIT' and (p_limit_price is null or p_limit_price <= 0) then
    raise exception 'LIMIT_PRICE_REQUIRED';
  end if;
  if p_order_type in ('STOP_LOSS','TAKE_PROFIT') and (p_stop_price is null or p_stop_price <= 0) then
    raise exception 'STOP_PRICE_REQUIRED';
  end if;
  if p_validity = 'GTD' and p_expires_at is null then
    raise exception 'EXPIRES_AT_REQUIRED';
  end if;
  if p_order_type = 'LIMIT' and (p_limit_price % 5 <> 0) then
    raise exception 'TICK_PRICE_VIOLATION';
  end if;

  select * into v_portfolio
    from public.simulator_portfolios
   where season_id = p_season_id and user_id = v_user_id;
  if not found then raise exception 'NO_PORTFOLIO'; end if;

  select * into v_season from public.simulator_seasons where id = p_season_id;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
  if v_season.status <> 'active' then raise exception 'SEASON_NOT_ACTIVE'; end if;

  if p_validity = 'DAY' then
    v_expires := (date_trunc('day', now() at time zone 'UTC') + interval '1 day')
                 at time zone 'UTC';
  elsif p_validity = 'GTD' then
    v_expires := p_expires_at;
  else
    v_expires := null;
  end if;

  if p_side = 'SELL' then
    v_available := public._simulator_sell_available_units(v_portfolio.id, p_code);
    if v_available < p_units then
      raise exception 'INSUFFICIENT_UNITS available=% requested=%', v_available, p_units;
    end if;
  end if;

  if p_side = 'BUY' and p_order_type = 'LIMIT' then
    select coalesce(is_large_cap, false) into v_is_large
      from public.simulator_share_pool
     where season_id = p_season_id and code = p_code;
    perform public._simulator_check_diversification(
      v_portfolio.id, p_code, p_units, p_limit_price, coalesce(v_is_large, false)
    );

    v_cash_req := p_units * p_limit_price;
    if v_portfolio.cash < v_cash_req then
      raise exception 'INSUFFICIENT_CASH have=% need=%', v_portfolio.cash, v_cash_req;
    end if;
    update public.simulator_portfolios
       set cash = cash - v_cash_req,
           last_seen_at = now()
     where id = v_portfolio.id;
  end if;

  if p_order_type in ('STOP_LOSS','TAKE_PROFIT') then
    v_status := 'reserved';
  end if;

  insert into public.simulator_orders
    (portfolio_id, season_id, code, side, order_type, units, limit_price, stop_price,
     min_units, validity, expires_at, status)
  values
    (v_portfolio.id, p_season_id, p_code, p_side, p_order_type, p_units, p_limit_price,
     p_stop_price, coalesce(p_min_units, 1), p_validity, v_expires, v_status)
  returning id into v_order_id;

  if p_order_type in ('LIMIT','MARKET') then
    v_fills := public._simulator_match_order(v_order_id);
  else
    v_fills := 0;
  end if;

  select * into v_final from public.simulator_orders where id = v_order_id;

  return jsonb_build_object(
    'order_id',     v_order_id,
    'fills',        v_fills,
    'status',       v_final.status,
    'units_filled', v_final.units_filled,
    'units',        v_final.units
  );
end
$func$;

grant execute on function public.simulator_place_order_v2(
  uuid, text, text, text, bigint, bigint, bigint, text, timestamptz, bigint
) to authenticated;

-- Annulation d'ordre par le propriétaire
create or replace function public.simulator_cancel_order(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_user_id   uuid;
  v_order     public.simulator_orders%rowtype;
  v_portfolio public.simulator_portfolios%rowtype;
  v_refund    bigint := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_order from public.simulator_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into v_portfolio
    from public.simulator_portfolios where id = v_order.portfolio_id;
  if v_portfolio.user_id is null or v_portfolio.user_id <> v_user_id then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_order.status not in ('open','partial','reserved') then
    raise exception 'ORDER_NOT_OPEN status=%', v_order.status;
  end if;

  if v_order.side = 'BUY' and v_order.order_type = 'LIMIT' then
    v_refund := (v_order.units - v_order.units_filled) * v_order.limit_price;
    update public.simulator_portfolios
       set cash = cash + v_refund,
           last_seen_at = now()
     where id = v_portfolio.id;
  end if;

  update public.simulator_orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status',   'cancelled',
    'refund',   v_refund
  );
end
$func$;

grant execute on function public.simulator_cancel_order(uuid) to authenticated;

-- Expiration en lot (cron-friendly).
-- À appeler périodiquement (cron Supabase / GitHub Action) — marque les
-- ordres DAY/GTD échus comme 'expired' et rembourse les BUY LIMIT.
create or replace function public.simulator_expire_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_count        int := 0;
  v_total_refund bigint := 0;
  v_row          record;
begin
  for v_row in
    select id, side, order_type, units, units_filled, limit_price, portfolio_id
      from public.simulator_orders
     where status in ('open','partial','reserved')
       and validity in ('DAY','GTD')
       and expires_at is not null
       and now() >= expires_at
     for update
  loop
    if v_row.side = 'BUY' and v_row.order_type = 'LIMIT' then
      update public.simulator_portfolios
         set cash = cash + (v_row.units - v_row.units_filled) * v_row.limit_price
       where id = v_row.portfolio_id;
      v_total_refund := v_total_refund
                       + (v_row.units - v_row.units_filled) * v_row.limit_price;
    end if;
    update public.simulator_orders set status = 'expired' where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_count,
    'total_refund',  v_total_refund
  );
end
$func$;

grant execute on function public.simulator_expire_orders() to authenticated;
