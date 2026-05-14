// === Queries server-side pour le simulateur ===

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrice } from "./pricing";
import type {
  LeaderboardEntry,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderRow,
  Portfolio,
  PortfolioSnapshot,
  Position,
  Season,
  Transaction,
} from "./types";

export type { OrderBookSnapshot, OrderBookLevel, OrderRow };

/** Saison courante "jouable" : intro OU active (en privilégiant la plus récente). */
export async function getCurrentSeason(): Promise<Season | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("simulator_seasons")
    .select("*")
    .in("status", ["intro", "active"])
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as Season;
}

/** Toutes les saisons (pour archives / changement). */
export async function listSeasons(): Promise<Season[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("simulator_seasons")
    .select("*")
    .order("starts_at", { ascending: false });
  if (error || !data) return [];
  return data as Season[];
}

/** Recupere le portefeuille de l'utilisateur courant pour une saison donnee. */
export async function getMyPortfolio(seasonId: string): Promise<Portfolio | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("simulator_portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("season_id", seasonId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Portfolio;
}

/** Liste des transactions d'un portefeuille donne, recents en tete. */
export async function getTransactions(portfolioId: string): Promise<Transaction[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("simulator_transactions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("executed_at", { ascending: false });
  if (error || !data) return [];
  return data as Transaction[];
}

/**
 * Reconstitue les positions courantes a partir des transactions :
 * - units : somme des BUY - SELL (filtre > 0)
 * - PRU (prix moyen pondere) : moyenne des prix d'achat des BUY
 *   apres ajustement des SELLs au PRU courant (FIFO simplifie : on
 *   reduit units sans changer le PRU pour les SELLs).
 */
export function buildPositions(transactions: Transaction[]): Position[] {
  // Tri chronologique pour calculer le PRU correctement
  const txs = [...transactions].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );

  // Map code -> { units, totalCost }
  const acc = new Map<string, { units: number; totalCost: number }>();
  for (const t of txs) {
    const cur = acc.get(t.code) ?? { units: 0, totalCost: 0 };
    if (t.type === "BUY") {
      cur.units += t.units;
      cur.totalCost += t.units * t.price; // base sur prix unitaire (hors fees pour PRU lisible)
    } else {
      // SELL : reduire units en proportion (PRU constant)
      const newUnits = cur.units - t.units;
      if (cur.units > 0) {
        cur.totalCost = cur.totalCost * (Math.max(0, newUnits) / cur.units);
      }
      cur.units = newUnits;
    }
    acc.set(t.code, cur);
  }

  const positions: Position[] = [];
  for (const [code, v] of acc) {
    if (v.units <= 0) continue;
    const avgCost = v.totalCost / v.units;
    const last = getLatestPrice(code);
    const currentPrice = last?.price ?? avgCost; // fallback : on valorise au PRU si pas de prix
    const marketValue = v.units * currentPrice;
    const costBasis = v.totalCost;
    const unrealizedPL = marketValue - costBasis;
    const unrealizedPLPct = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
    positions.push({
      code,
      units: v.units,
      avgCost,
      costBasis,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedPLPct,
    });
  }
  // Tri par valeur de marche desc
  positions.sort((a, b) => b.marketValue - a.marketValue);
  return positions;
}

/** Construit un snapshot complet du portefeuille (positions + valorisation). */
export async function getPortfolioSnapshot(
  seasonId: string,
): Promise<PortfolioSnapshot | null> {
  const portfolio = await getMyPortfolio(seasonId);
  if (!portfolio) return null;

  const supabase = await createSupabaseServerClient();
  const { data: season } = await supabase
    .from("simulator_seasons")
    .select("initial_capital")
    .eq("id", seasonId)
    .maybeSingle();

  const initialCapital = (season as { initial_capital?: number } | null)?.initial_capital ?? 10_000_000;

  const transactions = await getTransactions(portfolio.id);
  const positions = buildPositions(transactions);
  const marketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue = portfolio.cash + marketValue;
  const totalReturn =
    initialCapital > 0 ? ((totalValue - initialCapital) / initialCapital) * 100 : 0;

  // Realized PL : pour chaque SELL, gain = (price - PRU au moment du sell) * units - fees.
  // Approximation : on utilise le PRU courant connu au moment de la transaction.
  let realizedPL = 0;
  const localPru = new Map<string, { units: number; totalCost: number }>();
  const txsAsc = [...transactions].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );
  for (const t of txsAsc) {
    const cur = localPru.get(t.code) ?? { units: 0, totalCost: 0 };
    if (t.type === "BUY") {
      cur.units += t.units;
      cur.totalCost += t.units * t.price;
    } else {
      const pru = cur.units > 0 ? cur.totalCost / cur.units : 0;
      realizedPL += t.units * (t.price - pru) - t.fees;
      const newUnits = cur.units - t.units;
      if (cur.units > 0) {
        cur.totalCost = cur.totalCost * (Math.max(0, newUnits) / cur.units);
      }
      cur.units = newUnits;
    }
    localPru.set(t.code, cur);
  }

  const unrealizedPL = positions.reduce((s, p) => s + p.unrealizedPL, 0);

  return {
    portfolio,
    cash: portfolio.cash,
    positions,
    marketValue,
    totalValue,
    initialCapital,
    totalReturn,
    realizedPL,
    unrealizedPL,
  };
}

/**
 * Classement de la saison : tous les portefeuilles avec valorisation
 * courante = cash + somme(units * dernier prix).
 */
export async function getLeaderboard(seasonId: string): Promise<LeaderboardEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data: season } = await supabase
    .from("simulator_seasons")
    .select("initial_capital")
    .eq("id", seasonId)
    .maybeSingle();
  const initialCapital =
    (season as { initial_capital?: number } | null)?.initial_capital ?? 10_000_000;

  const { data: portfolios } = await supabase
    .from("simulator_portfolios")
    .select("id, user_id, cash, joined_at")
    .eq("season_id", seasonId);
  if (!portfolios || portfolios.length === 0) return [];

  // Charger toutes les transactions de cette saison en 1 coup
  const portfolioIds = portfolios.map((p) => p.id);
  const { data: allTx } = await supabase
    .from("simulator_transactions")
    .select("*")
    .in("portfolio_id", portfolioIds);

  // Charger les profils correspondants
  const userIds = portfolios.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, full_name")
    .in("id", userIds);
  const profileMap = new Map<string, { username: string | null; full_name: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id as string, {
      username: (p as { username: string | null }).username,
      full_name: (p as { full_name: string | null }).full_name,
    });
  }

  // Group transactions by portfolio
  const txByPortfolio = new Map<string, Transaction[]>();
  for (const t of (allTx ?? []) as Transaction[]) {
    const arr = txByPortfolio.get(t.portfolio_id) ?? [];
    arr.push(t);
    txByPortfolio.set(t.portfolio_id, arr);
  }

  const entries: LeaderboardEntry[] = portfolios.map((p) => {
    const txs = txByPortfolio.get(p.id) ?? [];
    const positions = buildPositions(txs);
    const marketValue = positions.reduce((s, x) => s + x.marketValue, 0);
    const totalValue = p.cash + marketValue;
    const totalReturn =
      initialCapital > 0 ? ((totalValue - initialCapital) / initialCapital) * 100 : 0;
    const profile = profileMap.get(p.user_id);
    return {
      rank: 0,
      userId: p.user_id,
      username: profile?.username ?? "—",
      fullName: profile?.full_name ?? null,
      totalValue,
      cash: p.cash,
      marketValue,
      totalReturn,
      txCount: txs.length,
    };
  });

  entries.sort((a, b) => b.totalValue - a.totalValue);
  for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;
  return entries;
}

/**
 * Construit la courbe de valorisation quotidienne du portefeuille
 * en rejouant les transactions et en valorisant aux prix de cloture.
 *
 * Hypothese : on utilise les prix de cloture quotidiens de chaque action
 * (lookup via getLatestPrice n'est pas suffisant ici — on a besoin de
 * l'historique). Pour rester leger, on calcule a maille hebdomadaire
 * (1 point par semaine entre joined_at et aujourd'hui).
 */
export async function getEquityCurve(
  portfolio: Portfolio,
  initialCapital: number,
  transactions: Transaction[],
): Promise<{ date: string; value: number }[]> {
  // Chargement on-demand de l'historique des codes detenus
  const codes = Array.from(new Set(transactions.map((t) => t.code)));
  if (codes.length === 0) {
    // Pas de tx : valeur constante = cash initial
    return [
      {
        date: portfolio.joined_at.slice(0, 10),
        value: initialCapital,
      },
    ];
  }
  const { loadPriceHistory } = await import("@/lib/dataLoader");
  const histories = new Map<string, { date: string; value: number }[]>();
  for (const code of codes) {
    const h = loadPriceHistory(code).sort((a, b) => a.date.localeCompare(b.date));
    histories.set(code, h);
  }

  // Index temporel : 1 point par semaine entre joined_at et aujourd'hui
  const start = portfolio.joined_at.slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const startMs = new Date(start + "T00:00:00Z").getTime();
  const endMs = new Date(end + "T00:00:00Z").getTime();
  const step = 1000 * 60 * 60 * 24 * 7; // 1 semaine
  for (let t = startMs; t <= endMs; t += step) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  if (dates[dates.length - 1] !== end) dates.push(end);

  // Tri tx ascendant
  const txAsc = [...transactions].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );

  function priceAt(code: string, date: string): number | null {
    const h = histories.get(code);
    if (!h || h.length === 0) return null;
    let last: number | null = null;
    for (const p of h) {
      if (p.date <= date) last = p.value;
      else break;
    }
    return last;
  }

  const points: { date: string; value: number }[] = [];
  for (const d of dates) {
    // Cash + units a la date d
    let cash = initialCapital;
    const units = new Map<string, number>();
    for (const t of txAsc) {
      const txDate = t.executed_at.slice(0, 10);
      if (txDate > d) break;
      if (t.type === "BUY") {
        cash -= t.net_total;
        units.set(t.code, (units.get(t.code) ?? 0) + t.units);
      } else {
        cash += t.net_total;
        units.set(t.code, (units.get(t.code) ?? 0) - t.units);
      }
    }
    let mv = 0;
    for (const [code, u] of units) {
      if (u <= 0) continue;
      const px = priceAt(code, d);
      if (px !== null) mv += u * px;
    }
    points.push({ date: d, value: cash + mv });
  }
  return points;
}

// ===========================================================================
// S2 — Course à l'introduction
// ===========================================================================

export type PoolRow = {
  code: string;
  total_units: number;
  remaining_units: number;
  ref_price: number;
  is_large_cap: boolean;
};

/** Position courante du joueur sur un titre (pour calcul du poids portefeuille). */
export type IntroPosition = {
  code: string;
  units: number;
  avg_cost: number;
};

export type IntroSnapshot = {
  season: Season;
  pool: PoolRow[];
  myPortfolioId: string;
  myCash: number;
  myPositions: IntroPosition[];
  myPoolTransactions: Transaction[];
  myTotalSpent: number;
  myTotalUnits: number;
  totalPoolValue: number;
  totalRemainingValue: number;
};

/**
 * Snapshot complet pour l'écran "Course à l'introduction" :
 * - état du pool (remaining_units par code)
 * - cash du joueur courant
 * - ses achats faits pendant la Course
 */
export async function getIntroSnapshot(seasonId: string): Promise<IntroSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [seasonRes, poolRes, portfolioRes] = await Promise.all([
    supabase.from("simulator_seasons").select("*").eq("id", seasonId).maybeSingle(),
    supabase
      .from("simulator_share_pool")
      .select("code, total_units, remaining_units, ref_price, is_large_cap")
      .eq("season_id", seasonId)
      .order("ref_price", { ascending: false }),
    supabase
      .from("simulator_portfolios")
      .select("id, cash")
      .eq("season_id", seasonId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (seasonRes.error || !seasonRes.data) return null;
  if (!portfolioRes.data) return null;
  const portfolio = portfolioRes.data as { id: string; cash: number };

  const pool = (poolRes.data ?? []) as PoolRow[];

  const [txsRes, positionsRes] = await Promise.all([
    supabase
      .from("simulator_transactions")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .eq("type", "BUY")
      .order("executed_at", { ascending: false }),
    supabase
      .from("simulator_positions")
      .select("code, units, avg_cost")
      .eq("portfolio_id", portfolio.id),
  ]);
  const myPoolTransactions = (txsRes.data ?? []) as Transaction[];
  const myPositions = (positionsRes.data ?? []) as IntroPosition[];

  let myTotalSpent = 0;
  let myTotalUnits = 0;
  for (const t of myPoolTransactions) {
    myTotalSpent += t.net_total;
    myTotalUnits += t.units;
  }

  let totalPoolValue = 0;
  let totalRemainingValue = 0;
  for (const p of pool) {
    totalPoolValue += p.total_units * p.ref_price;
    totalRemainingValue += p.remaining_units * p.ref_price;
  }

  return {
    season: seasonRes.data as Season,
    pool,
    myPortfolioId: portfolio.id,
    myCash: portfolio.cash,
    myPositions,
    myPoolTransactions,
    myTotalSpent,
    myTotalUnits,
    totalPoolValue,
    totalRemainingValue,
  };
}

// ===========================================================================
// S3 — Carnet d'ordres
// ===========================================================================

/**
 * Carnet d'ordres agrégé pour un (season, code) : best 10 bids et asks.
 * Agrège les ordres LIMIT ouverts/partiels par niveau de prix.
 */
export async function getOrderBook(
  seasonId: string,
  code: string,
  depth = 10,
): Promise<OrderBookSnapshot> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("simulator_orders")
    .select("side, limit_price, units, units_filled, status, order_type")
    .eq("season_id", seasonId)
    .eq("code", code)
    .eq("order_type", "LIMIT")
    .in("status", ["open", "partial"]);

  const bidMap = new Map<number, { units: number; orders: number }>();
  const askMap = new Map<number, { units: number; orders: number }>();
  for (const o of data ?? []) {
    if (!o.limit_price || !o.units) continue;
    const remaining = (o.units as number) - (o.units_filled as number);
    if (remaining <= 0) continue;
    const target = o.side === "BUY" ? bidMap : askMap;
    const cur = target.get(o.limit_price as number) ?? { units: 0, orders: 0 };
    cur.units += remaining;
    cur.orders += 1;
    target.set(o.limit_price as number, cur);
  }

  const bids: OrderBookLevel[] = [...bidMap.entries()]
    .map(([price, v]) => ({ price, units: v.units, orders: v.orders }))
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);
  const asks: OrderBookLevel[] = [...askMap.entries()]
    .map(([price, v]) => ({ price, units: v.units, orders: v.orders }))
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  return { code, bids, asks, bestBid, bestAsk, spread };
}

/**
 * Ordres du joueur courant pour une saison : ouverts en premier, puis
 * historique récent (filled/cancelled/expired).
 */
export async function getMyOrders(seasonId: string): Promise<{
  open: OrderRow[];
  history: OrderRow[];
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { open: [], history: [] };

  const { data: pf } = await supabase
    .from("simulator_portfolios")
    .select("id")
    .eq("season_id", seasonId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!pf) return { open: [], history: [] };

  const { data: orders } = await supabase
    .from("simulator_orders")
    .select("*")
    .eq("portfolio_id", (pf as { id: string }).id)
    .order("placed_at", { ascending: false })
    .limit(100);
  const all = (orders ?? []) as OrderRow[];

  const open = all.filter((o) =>
    ["open", "partial", "reserved"].includes(o.status),
  );
  const history = all.filter((o) =>
    ["filled", "cancelled", "expired"].includes(o.status),
  );
  return { open, history };
}

/**
 * Stream des derniers trades sur un titre, pour la "tape" du carnet.
 * On filtre par side='BUY' pour dédupliquer les fills (chaque fill génère
 * 1 ou 2 transactions selon le portfolio système).
 */
export type TradeTick = {
  id: string;
  code: string;
  units: number;
  price: number;
  executed_at: string;
};

export async function getRecentTrades(
  seasonId: string,
  code: string,
  limit = 50,
): Promise<TradeTick[]> {
  const supabase = await createSupabaseServerClient();
  // On JOIN simulator_portfolios pour filtrer par season_id (transactions
  // n'a pas de season_id direct).
  const { data: portfolios } = await supabase
    .from("simulator_portfolios")
    .select("id")
    .eq("season_id", seasonId);
  const pfIds = (portfolios ?? []).map((p) => (p as { id: string }).id);
  if (pfIds.length === 0) return [];

  const { data } = await supabase
    .from("simulator_transactions")
    .select("id, code, units, price, executed_at, type")
    .eq("code", code)
    .eq("type", "BUY")
    .in("portfolio_id", pfIds)
    .order("executed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((t) => ({
    id: t.id as string,
    code: t.code as string,
    units: t.units as number,
    price: t.price as number,
    executed_at: t.executed_at as string,
  }));
}

/**
 * Bougies intraday (OHLCV) construites à partir des trades du carnet.
 * Bucket sur `bucketMinutes` (5/15/60). Renvoie les n derniers buckets non vides.
 */
export type Candle = {
  t: string; // ISO du début du bucket
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // volume (units)
};

export async function getIntradayCandles(
  seasonId: string,
  code: string,
  bucketMinutes = 15,
  maxCandles = 60,
): Promise<Candle[]> {
  const trades = await getRecentTrades(seasonId, code, 1000);
  if (trades.length === 0) return [];

  const bucketMs = bucketMinutes * 60_000;
  const buckets = new Map<number, Candle>();
  // Itérer en ordre chronologique pour construire OHLC correctement
  const sorted = [...trades].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );
  for (const t of sorted) {
    const ts = Date.parse(t.executed_at);
    if (Number.isNaN(ts)) continue;
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        t: new Date(bucketStart).toISOString(),
        o: t.price,
        h: t.price,
        l: t.price,
        c: t.price,
        v: t.units,
      });
    } else {
      existing.h = Math.max(existing.h, t.price);
      existing.l = Math.min(existing.l, t.price);
      existing.c = t.price;
      existing.v += t.units;
    }
  }
  const arr = [...buckets.values()].sort((a, b) => a.t.localeCompare(b.t));
  return arr.slice(-maxCandles);
}

/**
 * Watchlist S4 : codes suivis par le joueur courant.
 */
export async function getMyWatchlist(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("simulator_watchlist")
    .select("code")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  return (data ?? []).map((r) => (r as { code: string }).code);
}

/**
 * Top movers du jour : variation entre les 2 dernières dates connues de chaque
 * titre (depuis CSV). Renvoie gainers (asc → desc par variation), losers
 * (desc → asc), et plus gros volumes tradés sur la saison (depuis transactions).
 */
export type MoverRow = {
  code: string;
  name: string;
  price: number;
  prevPrice: number | null;
  changeAbs: number | null;
  changePct: number | null;
  volume: number; // unités tradées sur la saison
};

export async function getMarketMovers(
  seasonId: string,
  limit = 5,
): Promise<{ gainers: MoverRow[]; losers: MoverRow[]; topVolume: MoverRow[] }> {
  const { getLatestPrices } = await import("./pricing");
  const { loadPriceHistory } = await import("@/lib/dataLoader");

  const latest = getLatestPrices();

  // Calcul variation depuis l'avant-dernière date du CSV
  const rows: MoverRow[] = latest.map((s) => {
    const h = loadPriceHistory(s.code).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const lastIdx = h.length - 1;
    const prev = lastIdx > 0 ? h[lastIdx - 1].value : null;
    const changeAbs = prev !== null ? s.price - prev : null;
    const changePct =
      prev !== null && prev > 0 ? ((s.price - prev) / prev) * 100 : null;
    return {
      code: s.code,
      name: s.name,
      price: s.price,
      prevPrice: prev,
      changeAbs,
      changePct,
      volume: 0,
    };
  });

  // Volumes tradés depuis simulator_transactions de la saison
  const supabase = await createSupabaseServerClient();
  const { data: portfolios } = await supabase
    .from("simulator_portfolios")
    .select("id")
    .eq("season_id", seasonId);
  const pfIds = (portfolios ?? []).map((p) => (p as { id: string }).id);
  if (pfIds.length > 0) {
    const { data: txs } = await supabase
      .from("simulator_transactions")
      .select("code, units, type")
      .eq("type", "BUY")
      .in("portfolio_id", pfIds);
    const volByCode = new Map<string, number>();
    for (const t of (txs ?? []) as Array<{ code: string; units: number }>) {
      volByCode.set(t.code, (volByCode.get(t.code) ?? 0) + t.units);
    }
    for (const r of rows) {
      r.volume = volByCode.get(r.code) ?? 0;
    }
  }

  const withChange = rows.filter((r) => r.changePct !== null);
  const gainers = [...withChange]
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, limit);
  const losers = [...withChange]
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, limit);
  const topVolume = [...rows]
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);

  return { gainers, losers, topVolume };
}
