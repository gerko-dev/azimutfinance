// === STATISTIQUES ACTIONS : performances, risque, classification quadrant ===
// Toutes les fonctions sont pures (pas d'IO). Convention Act/252 pour
// l'annualisation (252 jours de bourse par an).

export type PricePoint = { date: string; value: number };

export type ReturnsMatrix = {
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  YTD: number | null;
  "1A": number | null;
  "3A": number | null;
  "5A": number | null;
  depuis: number | null; // depuis cotation (1er point disponible)
};

export type RiskMetrics = {
  maxDrawdownAll: number | null; // toute l'historique disponible (négatif)
  maxDrawdown1A: number | null; // 12 mois glissants (négatif)
  volatility1A: number | null; // annualisée, log-returns × √252, en décimal
  sharpe1A: number | null; // (rendement annualisé - RfR) / volatilité
  beta: number | null; // pente régression vs BRVMC, sur tout l'historique aligné
};

export type Quadrant = "cashcow" | "hiddengem" | "defensive" | "speculative";

/** Taux sans risque utilisé pour le Sharpe. ~Taux directeur BCEAO. */
export const RISK_FREE_RATE = 0.035;

// ==========================================
// HELPERS DATE / RECHERCHE
// ==========================================

function findPriceAtOrBefore(
  history: PricePoint[],
  targetDate: Date
): PricePoint | null {
  const targetTime = targetDate.getTime();
  for (let i = history.length - 1; i >= 0; i--) {
    if (new Date(history[i].date).getTime() <= targetTime) {
      return history[i];
    }
  }
  return null;
}

function periodReturn(history: PricePoint[], daysBack: number): number | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
  const start = findPriceAtOrBefore(history, cutoff);
  if (!start || start.value <= 0) return null;
  // On exige au moins ~80% de la fenêtre couverte sinon on retourne null
  // (sinon "5 ans" sur une action cotée depuis 2 ans renverrait le rendement
  // depuis cotation, ce qui serait trompeur)
  const startDate = new Date(start.date);
  const actualDays =
    (new Date(latest.date).getTime() - startDate.getTime()) /
    (24 * 60 * 60 * 1000);
  if (actualDays < daysBack * 0.8) return null;
  return latest.value / start.value - 1;
}

function ytdReturn(history: PricePoint[]): number | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const latestDate = new Date(latest.date);
  const startOfYear = new Date(
    Date.UTC(latestDate.getUTCFullYear(), 0, 1)
  );
  const start = findPriceAtOrBefore(history, startOfYear);
  if (!start || start.value <= 0) return null;
  return latest.value / start.value - 1;
}

function sinceListing(history: PricePoint[]): number | null {
  if (history.length < 2) return null;
  const start = history[0].value;
  const end = history[history.length - 1].value;
  if (start <= 0) return null;
  return end / start - 1;
}

// ==========================================
// MATRICE DE PERFORMANCES
// ==========================================

export function computeReturnsMatrix(history: PricePoint[]): ReturnsMatrix {
  return {
    "1M": periodReturn(history, 30),
    "3M": periodReturn(history, 90),
    "6M": periodReturn(history, 180),
    YTD: ytdReturn(history),
    "1A": periodReturn(history, 365),
    "3A": periodReturn(history, 365 * 3),
    "5A": periodReturn(history, 365 * 5),
    depuis: sinceListing(history),
  };
}

// ==========================================
// DRAWDOWN
// ==========================================

function computeDrawdown(values: number[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (v - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

function recentValues(history: PricePoint[], daysBack: number): number[] {
  if (history.length === 0) return [];
  const latest = history[history.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  return history.filter((p) => p.date >= cutoffStr).map((p) => p.value);
}

// ==========================================
// LOG-RETURNS, VOLATILITÉ, BETA
// ==========================================

/** Log-returns avec filtrage des outliers (|r| > 30% en 1 jour) */
function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0 && values[i] > 0) {
      const r = Math.log(values[i] / values[i - 1]);
      if (Math.abs(r) > 0.3) continue;
      out.push(r);
    }
  }
  return out;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
}

function annualizedVolatility(returns: number[]): number {
  return Math.sqrt(variance(returns)) * Math.sqrt(252);
}

function annualizedReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  const meanLog = returns.reduce((a, b) => a + b, 0) / returns.length;
  return Math.exp(meanLog * 252) - 1;
}

function alignByDate(
  stock: PricePoint[],
  index: PricePoint[]
): { stockValues: number[]; indexValues: number[] } {
  const indexMap = new Map(index.map((p) => [p.date, p.value]));
  const stockValues: number[] = [];
  const indexValues: number[] = [];
  for (const p of stock) {
    const iv = indexMap.get(p.date);
    if (iv !== undefined) {
      stockValues.push(p.value);
      indexValues.push(iv);
    }
  }
  return { stockValues, indexValues };
}

function covariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = a.reduce((x, y) => x + y, 0) / a.length;
  const meanB = b.reduce((x, y) => x + y, 0) / b.length;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += (a[i] - meanA) * (b[i] - meanB);
  }
  return s / a.length;
}

/** Beta vs un indice (BRVMC en pratique) sur tout l'historique aligné. */
export function computeBeta(
  stock: PricePoint[],
  index: PricePoint[]
): number | null {
  const { stockValues, indexValues } = alignByDate(stock, index);
  if (stockValues.length < 30) return null;

  const stockReturns: number[] = [];
  const indexReturns: number[] = [];
  for (let i = 1; i < stockValues.length; i++) {
    if (
      stockValues[i - 1] <= 0 ||
      stockValues[i] <= 0 ||
      indexValues[i - 1] <= 0 ||
      indexValues[i] <= 0
    ) {
      continue;
    }
    const sr = Math.log(stockValues[i] / stockValues[i - 1]);
    const ir = Math.log(indexValues[i] / indexValues[i - 1]);
    if (Math.abs(sr) > 0.3 || Math.abs(ir) > 0.3) continue;
    stockReturns.push(sr);
    indexReturns.push(ir);
  }
  if (stockReturns.length < 30) return null;

  const cov = covariance(stockReturns, indexReturns);
  const varIndex = variance(indexReturns);
  if (varIndex === 0) return null;
  return cov / varIndex;
}

// ==========================================
// MÉTRIQUES DE RISQUE GROUPÉES
// ==========================================

export function computeRiskMetrics(
  stock: PricePoint[],
  brvmc: PricePoint[]
): RiskMetrics {
  const allValues = stock.map((p) => p.value).filter((v) => v > 0);
  const maxDrawdownAll = allValues.length >= 2 ? computeDrawdown(allValues) : null;

  const recent1A = recentValues(stock, 365);
  const maxDrawdown1A = recent1A.length >= 2 ? computeDrawdown(recent1A) : null;

  const returns1A = logReturns(recent1A);
  const volatility1A = returns1A.length >= 30 ? annualizedVolatility(returns1A) : null;

  let sharpe1A: number | null = null;
  if (volatility1A !== null && volatility1A > 0 && returns1A.length >= 30) {
    const annRet = annualizedReturn(returns1A);
    sharpe1A = (annRet - RISK_FREE_RATE) / volatility1A;
  }

  const beta = computeBeta(stock, brvmc);

  return { maxDrawdownAll, maxDrawdown1A, volatility1A, sharpe1A, beta };
}

// ==========================================
// CLASSIFICATION QUADRANT
// (mêmes médianes que le scatter Risk/Return — cohérence visuelle)
// ==========================================

export type RiskReturnPointLike = {
  code: string;
  yieldPct: number;
  volatility: number;
};

export function computeQuadrant(
  code: string,
  allPoints: RiskReturnPointLike[]
): Quadrant | null {
  if (allPoints.length === 0) return null;
  const target = allPoints.find((p) => p.code === code);
  if (!target) return null;

  const yields = allPoints.map((p) => p.yieldPct).sort((a, b) => a - b);
  const vols = allPoints.map((p) => p.volatility).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const my = median(yields);
  const mv = median(vols);

  const highYield = target.yieldPct >= my;
  const highVol = target.volatility >= mv;
  if (highYield && !highVol) return "cashcow";
  if (highYield && highVol) return "hiddengem";
  if (!highYield && !highVol) return "defensive";
  return "speculative";
}
