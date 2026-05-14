-- ============================================================
-- AzimutFinance — Ligue Azimut : borne ±7,5 % au placement d'ordre
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Règle BRVM : variation maximale autorisée d'un cours par séance =
-- ±7,5 % du cours de la veille. On l'applique aux ordres LIMIT et STOP :
-- placer un ordre dont le prix sort de [ref × 0.925, ref × 1.075] est
-- refusé. Le prix de référence est le dernier cours BRVM connu (CSV),
-- passé en paramètre par la couche TS (qui le lit via getLatestPrice).
--
-- Cette borne ne modifie PAS l'exécution du matching : deux joueurs
-- peuvent toujours se croiser au prix du LIMIT passif (qui, par
-- construction, est dans la bande). Elle empêche juste de placer des
-- ordres aberrants par rapport au cours BRVM scrappé.
-- ============================================================

-- Constante (paramétrable plus tard si besoin)
create or replace function public._simulator_price_band_pct()
returns numeric language sql immutable as $$ select 0.075::numeric $$;

-- Valide qu'un prix est dans la bande [ref × (1 - band), ref × (1 + band)].
-- Raise NOTICE et lève l'exception si hors bande. Retourne le prix arrondi
-- au tick BRVM 5 FCFA si OK (utile si on veut snap-to-band).
create or replace function public._simulator_check_price_band(
  p_price bigint,
  p_ref_price bigint
) returns void
language plpgsql
immutable
as $func$
declare
  v_band numeric := public._simulator_price_band_pct();
  v_min  bigint;
  v_max  bigint;
begin
  if p_ref_price is null or p_ref_price <= 0 then
    -- Pas de cours BRVM connu => on laisse passer (le scrape s'occupera
    -- d'une éventuelle expiration au prochain cycle).
    return;
  end if;
  v_min := floor(p_ref_price::numeric * (1 - v_band))::bigint;
  v_max := ceil (p_ref_price::numeric * (1 + v_band))::bigint;
  if p_price < v_min or p_price > v_max then
    raise exception 'PRICE_OUT_OF_BAND price=% ref=% min=% max=%',
      p_price, p_ref_price, v_min, v_max;
  end if;
end
$func$;

-- Drop l'ancienne signature avant de la remplacer (ajout du paramètre
-- p_ref_price).
drop function if exists public.simulator_place_order_v2(
  uuid, text, text, text, bigint, bigint, bigint, text, timestamptz, bigint
);

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
  p_min_units    bigint default 1,
  p_ref_price    bigint default null  -- cours BRVM CSV de la veille
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

  -- Borne ±7,5 % autour du cours BRVM de la veille
  if p_order_type = 'LIMIT' then
    perform public._simulator_check_price_band(p_limit_price, p_ref_price);
  end if;
  if p_order_type in ('STOP_LOSS','TAKE_PROFIT') then
    perform public._simulator_check_price_band(p_stop_price, p_ref_price);
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
  uuid, text, text, text, bigint, bigint, bigint, text, timestamptz, bigint, bigint
) to authenticated;
