-- ============================================================
-- AzimutFinance — Ligue Azimut : évaluation des ordres en attente
-- post-ingestion du cours BRVM.
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Doit être exécuté à chaque ingestion CSV BRVM. Reçoit en entrée la map
-- code → nouveau cours BRVM, et pour chaque saison active :
--   1. Annule les LIMIT/STOP qui sortent de la bande ±7,5 % (refund BUY)
--   2. Déclenche les STOP_LOSS / TAKE_PROFIT dont le seuil est franchi par
--      le nouveau cours → convertit en MARKET et tente le matching
--   3. Retente le matching des LIMIT toujours dans la bande (la liquidité
--      du book a pu évoluer entre-temps)
--
-- Cette RPC ne touche JAMAIS aux cours des titres — elle ne fait que
-- réagir au nouveau cours BRVM scrappé.
-- ============================================================

-- Annule un ordre LIMIT hors bande et rembourse le cash réservé (BUY LIMIT).
create or replace function public._simulator_cancel_out_of_band(
  p_order_id uuid
) returns bigint
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_order  public.simulator_orders%rowtype;
  v_refund bigint := 0;
begin
  select * into v_order from public.simulator_orders where id = p_order_id for update;
  if not found then return 0; end if;
  if v_order.status not in ('open','partial','reserved') then return 0; end if;

  if v_order.side = 'BUY' and v_order.order_type = 'LIMIT' then
    v_refund := (v_order.units - v_order.units_filled) * v_order.limit_price;
    update public.simulator_portfolios
       set cash = cash + v_refund,
           last_seen_at = now()
     where id = v_order.portfolio_id;
  end if;
  update public.simulator_orders set status = 'cancelled' where id = p_order_id;
  return v_refund;
end
$func$;

-- Vérifie si un STOP doit se déclencher en fonction du nouveau cours BRVM.
-- Convention :
--   SELL STOP_LOSS  : se déclenche si cours <= stop_price (protection à la baisse)
--   SELL TAKE_PROFIT: se déclenche si cours >= stop_price (prise de bénéfice)
--   BUY  STOP_LOSS  : se déclenche si cours >= stop_price (entrée breakout)
--   BUY  TAKE_PROFIT: se déclenche si cours <= stop_price (rare, achat sur correction)
create or replace function public._simulator_stop_triggered(
  p_side text,
  p_order_type text,
  p_stop_price bigint,
  p_ref_price bigint
) returns boolean
language sql
immutable
as $func$
  select case
    when p_stop_price is null or p_ref_price is null then false
    when p_side = 'SELL' and p_order_type = 'STOP_LOSS'   then p_ref_price <= p_stop_price
    when p_side = 'SELL' and p_order_type = 'TAKE_PROFIT' then p_ref_price >= p_stop_price
    when p_side = 'BUY'  and p_order_type = 'STOP_LOSS'   then p_ref_price >= p_stop_price
    when p_side = 'BUY'  and p_order_type = 'TAKE_PROFIT' then p_ref_price <= p_stop_price
    else false
  end
$func$;

-- RPC principale : évalue tous les ordres en attente d'une saison avec les
-- nouveaux cours BRVM passés en jsonb `{ "CODE": 1234, ... }`.
create or replace function public.simulator_evaluate_pending_orders(
  p_season_id  uuid,
  p_ref_prices jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_band         numeric := public._simulator_price_band_pct();
  v_ref          bigint;
  v_min          bigint;
  v_max          bigint;
  v_cancelled    int := 0;
  v_triggered    int := 0;
  v_rematched    int := 0;
  v_total_refund bigint := 0;
  v_row          record;
  v_fills        int;
begin
  -- 1) Annuler les LIMIT/STOP hors bande
  for v_row in
    select id, code, side, order_type, limit_price, stop_price, status
      from public.simulator_orders
     where season_id = p_season_id
       and status in ('open','partial','reserved')
       and order_type in ('LIMIT','STOP_LOSS','TAKE_PROFIT')
  loop
    v_ref := nullif(p_ref_prices->>v_row.code, '')::bigint;
    if v_ref is null or v_ref <= 0 then continue; end if;
    v_min := floor(v_ref::numeric * (1 - v_band))::bigint;
    v_max := ceil (v_ref::numeric * (1 + v_band))::bigint;
    if v_row.order_type = 'LIMIT' then
      if v_row.limit_price < v_min or v_row.limit_price > v_max then
        v_total_refund := v_total_refund
                        + public._simulator_cancel_out_of_band(v_row.id);
        v_cancelled := v_cancelled + 1;
      end if;
    else
      if v_row.stop_price < v_min or v_row.stop_price > v_max then
        v_total_refund := v_total_refund
                        + public._simulator_cancel_out_of_band(v_row.id);
        v_cancelled := v_cancelled + 1;
      end if;
    end if;
  end loop;

  -- 2) Déclencher les STOP touchés (convertir en MARKET puis matcher)
  for v_row in
    select id, code, side, order_type, stop_price
      from public.simulator_orders
     where season_id = p_season_id
       and status = 'reserved'
       and order_type in ('STOP_LOSS','TAKE_PROFIT')
  loop
    v_ref := nullif(p_ref_prices->>v_row.code, '')::bigint;
    if v_ref is null then continue; end if;
    if public._simulator_stop_triggered(v_row.side, v_row.order_type, v_row.stop_price, v_ref) then
      update public.simulator_orders
         set order_type = 'MARKET', status = 'open'
       where id = v_row.id;
      v_fills := public._simulator_match_order(v_row.id);
      if v_fills > 0 then v_triggered := v_triggered + 1; end if;
    end if;
  end loop;

  -- 3) Retenter le matching des LIMIT toujours ouverts (le book a pu bouger)
  for v_row in
    select id
      from public.simulator_orders
     where season_id = p_season_id
       and status in ('open','partial')
       and order_type = 'LIMIT'
  loop
    v_fills := public._simulator_match_order(v_row.id);
    if v_fills > 0 then v_rematched := v_rematched + 1; end if;
  end loop;

  return jsonb_build_object(
    'cancelled_out_of_band', v_cancelled,
    'stop_triggered',        v_triggered,
    'limit_rematched',       v_rematched,
    'total_refund',          v_total_refund
  );
end
$func$;

-- Pas de grant à `authenticated` : cette RPC est destinée à un service-role
-- (route handler `/api/simulator/evaluate-orders` ou cron Supabase). Elle
-- doit être appelée avec la clé `SUPABASE_SERVICE_ROLE_KEY`.
revoke all on function public.simulator_evaluate_pending_orders(uuid, jsonb) from public;
revoke all on function public.simulator_evaluate_pending_orders(uuid, jsonb) from authenticated;
