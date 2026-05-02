// === Queries server-side pour le simulateur ===

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrice } from "./pricing";
import type {
  LeaderboardEntry,
  Portfolio,
  PortfolioSnapshot,
  Position,
  Season,
  Transaction,
} from "./types";

/** Saison active courante (la 1ere si plusieurs). */
export async function getCurrentSeason(): Promise<Season | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("simulator_seasons")
    .select("*")
    .eq("status", "active")
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
