import "server-only";

import type { Transaction } from "./types";

/**
 * Métriques de risque calculées à partir de la courbe d'équity (1 point /
 * semaine, fournie par getEquityCurve) et des transactions.
 *
 * Annualisation : on suppose ~52 points par an (1 par semaine).
 */
export type RiskMetrics = {
  weeklyVolPct: number; // écart-type hebdo des returns, en %
  annualVolPct: number; // weeklyVol × √52, en %
  maxDrawdownPct: number; // pire chute depuis un plus haut, en % (négatif)
  maxDrawdownAbs: number; // pire chute en FCFA (négatif)
  sharpe: number; // (return moyen / vol) × √52, taux sans risque = 0
  bestWeekPct: number;
  worstWeekPct: number;
  // Sur les transactions SELL réalisées
  hitRatePct: number; // % de SELLs gagnants (P&L > 0)
  avgWinAbs: number; // gain moyen par SELL gagnant (FCFA)
  avgLossAbs: number; // perte moyenne par SELL perdant (FCFA, négatif)
  winLossRatio: number; // |avgWin / avgLoss| ; 0 si pas de perte
  sellCount: number;
  weeksTracked: number;
};

export function computeRiskMetrics(
  curve: { date: string; value: number }[],
  transactions: Transaction[],
): RiskMetrics {
  // === Returns hebdomadaires depuis la courbe ===
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].value;
    const next = curve[i].value;
    if (prev > 0) returns.push((next - prev) / prev);
  }

  const meanRet =
    returns.length > 0
      ? returns.reduce((s, r) => s + r, 0) / returns.length
      : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) /
        (returns.length - 1)
      : 0;
  const stdWeekly = Math.sqrt(variance);

  // === Max drawdown ===
  let peak = curve.length > 0 ? curve[0].value : 0;
  let maxDDPct = 0;
  let maxDDAbs = 0;
  for (const pt of curve) {
    if (pt.value > peak) peak = pt.value;
    if (peak > 0) {
      const ddPct = (pt.value - peak) / peak;
      if (ddPct < maxDDPct) maxDDPct = ddPct;
      const ddAbs = pt.value - peak;
      if (ddAbs < maxDDAbs) maxDDAbs = ddAbs;
    }
  }

  // === Best / worst week ===
  const bestWeek = returns.length > 0 ? Math.max(...returns) : 0;
  const worstWeek = returns.length > 0 ? Math.min(...returns) : 0;

  // === Stats sur les SELLs (hit rate, win/loss) ===
  // Pour chaque SELL on a besoin du PRU au moment où elle a eu lieu.
  const txsAsc = [...transactions].sort((a, b) =>
    a.executed_at.localeCompare(b.executed_at),
  );
  const pru = new Map<string, { units: number; totalCost: number }>();
  let wins = 0;
  let losses = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let sellCount = 0;
  for (const t of txsAsc) {
    const cur = pru.get(t.code) ?? { units: 0, totalCost: 0 };
    if (t.type === "BUY") {
      cur.units += t.units;
      cur.totalCost += t.units * t.price;
    } else {
      sellCount += 1;
      const avg = cur.units > 0 ? cur.totalCost / cur.units : 0;
      const pl = t.units * (t.price - avg) - t.fees;
      if (pl > 0) {
        wins += 1;
        sumWin += pl;
      } else if (pl < 0) {
        losses += 1;
        sumLoss += pl;
      }
      const newUnits = cur.units - t.units;
      if (cur.units > 0) {
        cur.totalCost = cur.totalCost * (Math.max(0, newUnits) / cur.units);
      }
      cur.units = newUnits;
    }
    pru.set(t.code, cur);
  }

  const hitRate = sellCount > 0 ? (wins / sellCount) * 100 : 0;
  const avgWin = wins > 0 ? sumWin / wins : 0;
  const avgLoss = losses > 0 ? sumLoss / losses : 0;
  const wlRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  const annualVol = stdWeekly * Math.sqrt(52);
  const sharpe = stdWeekly > 0 ? (meanRet / stdWeekly) * Math.sqrt(52) : 0;

  return {
    weeklyVolPct: stdWeekly * 100,
    annualVolPct: annualVol * 100,
    maxDrawdownPct: maxDDPct * 100,
    maxDrawdownAbs: maxDDAbs,
    sharpe,
    bestWeekPct: bestWeek * 100,
    worstWeekPct: worstWeek * 100,
    hitRatePct: hitRate,
    avgWinAbs: avgWin,
    avgLossAbs: avgLoss,
    winLossRatio: wlRatio,
    sellCount,
    weeksTracked: returns.length,
  };
}
