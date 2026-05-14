import "server-only";

import { getLatestPrice } from "./pricing";
import type { Position, Transaction } from "./types";

/**
 * Décomposition du P&L par titre.
 *
 * - realizedPL : pour chaque SELL, (price - PRU avant le SELL) × units − fees.
 *                Calculé en rejouant les transactions en ordre chronologique
 *                avec un PRU local par code.
 * - unrealizedPL : sur la position courante,
 *                  (current_price − avg_cost) × units − coûts d'acquisition.
 *                  On utilise position.unrealizedPL directement.
 * - totalPL = realized + unrealized
 * - contribution = totalPL / portfolioTotalPL si !=0, sinon 0.
 * - weight = market_value / total_portfolio_value (positions ouvertes uniquement)
 * - volume = somme des unités tradées (BUY + SELL)
 * - turnover = somme des gross_total tradés
 */
export type Attribution = {
  code: string;
  units: number; // unités courantes (0 si position fermée)
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  feesPaid: number;
  contributionPct: number; // contribution au P&L total (% du P&L total signé)
  weightPct: number; // poids actuel dans le portefeuille (% de totalValue)
  volume: number; // unités tradées au total
  turnover: number; // FCFA tradés au total
  buys: number; // nombre de BUYs
  sells: number; // nombre de SELLs
};

export type PerformanceReport = {
  totalRealizedPL: number;
  totalUnrealizedPL: number;
  totalPL: number;
  totalFees: number;
  totalTurnover: number;
  attributions: Attribution[];
  winners: Attribution[]; // top 3 par totalPL desc
  losers: Attribution[]; // bottom 3 par totalPL asc
};

export function computePerformanceAttribution(
  transactions: Transaction[],
  positions: Position[],
  totalValue: number,
): PerformanceReport {
  // Index positions par code
  const posByCode = new Map<string, Position>();
  for (const p of positions) posByCode.set(p.code, p);

  // Rejoue les transactions en ordre chronologique pour calculer le realized
  // P&L et le PRU local par code.
  const txsAsc = [...transactions].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );

  type Bucket = {
    code: string;
    units: number;
    totalCost: number; // coût agrégé des positions encore ouvertes
    realizedPL: number;
    feesPaid: number;
    volume: number;
    turnover: number;
    buys: number;
    sells: number;
  };
  const buckets = new Map<string, Bucket>();
  function getBucket(code: string): Bucket {
    let b = buckets.get(code);
    if (!b) {
      b = {
        code,
        units: 0,
        totalCost: 0,
        realizedPL: 0,
        feesPaid: 0,
        volume: 0,
        turnover: 0,
        buys: 0,
        sells: 0,
      };
      buckets.set(code, b);
    }
    return b;
  }

  for (const t of txsAsc) {
    const b = getBucket(t.code);
    b.feesPaid += t.fees;
    b.volume += t.units;
    b.turnover += t.gross_total;
    if (t.type === "BUY") {
      b.buys += 1;
      b.units += t.units;
      b.totalCost += t.units * t.price;
    } else {
      b.sells += 1;
      const pru = b.units > 0 ? b.totalCost / b.units : 0;
      b.realizedPL += t.units * (t.price - pru) - t.fees;
      const newUnits = b.units - t.units;
      if (b.units > 0) {
        b.totalCost = b.totalCost * (Math.max(0, newUnits) / b.units);
      }
      b.units = newUnits;
    }
  }

  // Assemble les attributions
  let totalRealizedPL = 0;
  let totalUnrealizedPL = 0;
  let totalFees = 0;
  let totalTurnover = 0;
  const attributions: Attribution[] = [];

  for (const [code, b] of buckets) {
    const pos = posByCode.get(code);
    const currentPrice =
      pos?.currentPrice ?? getLatestPrice(code)?.price ?? pos?.avgCost ?? 0;
    const unrealizedPL = pos?.unrealizedPL ?? 0;
    const marketValue = pos?.marketValue ?? 0;
    const totalPL = b.realizedPL + unrealizedPL;
    totalRealizedPL += b.realizedPL;
    totalUnrealizedPL += unrealizedPL;
    totalFees += b.feesPaid;
    totalTurnover += b.turnover;
    attributions.push({
      code,
      units: pos?.units ?? 0,
      avgCost: pos?.avgCost ?? 0,
      currentPrice,
      marketValue,
      realizedPL: b.realizedPL,
      unrealizedPL,
      totalPL,
      feesPaid: b.feesPaid,
      contributionPct: 0, // calculé après
      weightPct: totalValue > 0 ? (marketValue / totalValue) * 100 : 0,
      volume: b.volume,
      turnover: b.turnover,
      buys: b.buys,
      sells: b.sells,
    });
  }

  const totalPL = totalRealizedPL + totalUnrealizedPL;
  // Contribution : signed proportion of P&L. Si totalPL ≈ 0, on retombe sur la
  // valeur absolue pondérée pour éviter les divisions explosives.
  const denomAbs =
    Math.abs(totalPL) > 1
      ? totalPL
      : attributions.reduce((s, a) => s + Math.abs(a.totalPL), 0) || 1;
  for (const a of attributions) {
    a.contributionPct = (a.totalPL / denomAbs) * 100;
  }

  // Trier par totalPL desc et calculer winners/losers
  attributions.sort((a, b) => b.totalPL - a.totalPL);
  const winners = attributions.filter((a) => a.totalPL > 0).slice(0, 3);
  const losers = [...attributions]
    .filter((a) => a.totalPL < 0)
    .sort((a, b) => a.totalPL - b.totalPL)
    .slice(0, 3);

  return {
    totalRealizedPL,
    totalUnrealizedPL,
    totalPL,
    totalFees,
    totalTurnover,
    attributions,
    winners,
    losers,
  };
}
