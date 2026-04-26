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

/**
 * Calcule en une passe le quadrant de chaque action du dataset.
 * Plus efficace que d'appeler computeQuadrant N fois (medianes calculees une seule fois).
 */
export function computeAllQuadrants(
  allPoints: RiskReturnPointLike[]
): Map<string, Quadrant> {
  const out = new Map<string, Quadrant>();
  if (allPoints.length === 0) return out;

  const yields = allPoints.map((p) => p.yieldPct).sort((a, b) => a - b);
  const vols = allPoints.map((p) => p.volatility).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const my = median(yields);
  const mv = median(vols);

  for (const p of allPoints) {
    const highYield = p.yieldPct >= my;
    const highVol = p.volatility >= mv;
    let q: Quadrant;
    if (highYield && !highVol) q = "cashcow";
    else if (highYield && highVol) q = "hiddengem";
    else if (!highYield && !highVol) q = "defensive";
    else q = "speculative";
    out.set(p.code, q);
  }
  return out;
}

// ============================================================
// === STATISTIQUES AVANCÉES ===
// Section dédiée à l'onglet "Statistiques" de la fiche titre :
// descriptives complètes, test de normalité (Jarque-Bera),
// VaR/CVaR, Sortino/Calmar, régression vs BRVMC, autocorrélation,
// rendements mensuels, données pour Q-Q plot et histogramme.
// ============================================================

/** Log-returns d'une série de prix, sans filtrage outliers (export public). */
export function dailyLogReturns(history: PricePoint[]): number[] {
  return logReturns(history.map((p) => p.value).filter((v) => v > 0));
}

// ---------- Helpers numériques ----------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/** Approximation du quantile inverse normal (Acklam 2003). */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Coefficients
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(
      ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
      c[5]
    ) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// ---------- Statistiques descriptives ----------

export type DescriptiveStats = {
  n: number;
  mean: number;
  median: number;
  stdev: number;
  skewness: number;
  kurtosis: number; // kurtosis classique (normale = 3)
  excessKurtosis: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  meanAnnualized: number; // arithmétique annualisée
  stdevAnnualized: number;
};

export function computeDescriptiveStats(returns: number[]): DescriptiveStats | null {
  if (returns.length < 5) return null;
  const n = returns.length;
  const m = mean(returns);
  const sd = stdev(returns);
  const sorted = [...returns].sort((a, b) => a - b);
  // Moments standardisés (avec correction de biais ignorée — n suffisant)
  let m3 = 0;
  let m4 = 0;
  for (const r of returns) {
    const d = (r - m) / (sd || 1);
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const skewness = sd > 0 ? m3 / n : 0;
  const kurtosis = sd > 0 ? m4 / n : 0;

  return {
    n,
    mean: m,
    median: quantile(sorted, 0.5),
    stdev: sd,
    skewness,
    kurtosis,
    excessKurtosis: kurtosis - 3,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    meanAnnualized: m * 252,
    stdevAnnualized: sd * Math.sqrt(252),
  };
}

// ---------- Test de normalité (Jarque-Bera) ----------

export type NormalityTest = {
  jbStatistic: number;
  // p-value approchée via χ² à 2 degrés de liberté
  pValue: number;
  // Verdict aux seuils standards
  isNormal5: boolean; // p > 5% → on n'arrive pas à rejeter la normalité
  isNormal1: boolean;
  skewness: number;
  excessKurtosis: number;
  interpretation: string;
};

/** p-value pour χ²(2) — distribution exponentielle : P(X > x) = exp(-x/2). */
function chi2_2dfPValue(x: number): number {
  if (x < 0) return 1;
  return Math.exp(-x / 2);
}

export function computeNormalityTest(
  returns: number[]
): NormalityTest | null {
  const desc = computeDescriptiveStats(returns);
  if (!desc || desc.n < 30) return null;
  const n = desc.n;
  const S = desc.skewness;
  const K = desc.kurtosis;
  // JB = n/6 × (S² + (K-3)²/4)
  const jb = (n / 6) * (S * S + Math.pow(K - 3, 2) / 4);
  const p = chi2_2dfPValue(jb);
  const isNormal5 = p > 0.05;
  const isNormal1 = p > 0.01;

  let interpretation: string;
  if (isNormal5) {
    interpretation =
      "Les rendements ne contredisent pas l'hypothèse de normalité aux seuils usuels. Les modèles paramétriques (VaR normale, Black-Scholes) restent applicables.";
  } else {
    const heavyTails = desc.excessKurtosis > 1;
    const asymmetric = Math.abs(desc.skewness) > 0.5;
    const parts: string[] = [
      "L'hypothèse de normalité est rejetée.",
    ];
    if (heavyTails) {
      parts.push(
        `Queues épaisses (excess kurtosis ${desc.excessKurtosis.toFixed(2)}) — les chocs extrêmes sont plus fréquents que ne le prédit une loi normale.`
      );
    }
    if (asymmetric) {
      parts.push(
        desc.skewness < 0
          ? `Asymétrie négative (${desc.skewness.toFixed(2)}) — les baisses extrêmes dominent les hausses extrêmes.`
          : `Asymétrie positive (${desc.skewness.toFixed(2)}) — les hausses extrêmes dominent.`
      );
    }
    parts.push(
      "Les VaR paramétriques sous-estiment vraisemblablement le risque réel — préférer la VaR historique."
    );
    interpretation = parts.join(" ");
  }

  return {
    jbStatistic: jb,
    pValue: p,
    isNormal5,
    isNormal1,
    skewness: S,
    excessKurtosis: desc.excessKurtosis,
    interpretation,
  };
}

// ---------- Q-Q plot data ----------

export type QQPoint = { theoretical: number; observed: number };

export function buildQQPlotData(returns: number[]): QQPoint[] {
  if (returns.length < 5) return [];
  const sorted = [...returns].sort((a, b) => a - b);
  const m = mean(sorted);
  const sd = stdev(sorted);
  const n = sorted.length;
  const points: QQPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n; // plotting position
    const z = normInv(p);
    points.push({
      theoretical: m + z * sd,
      observed: sorted[i],
    });
  }
  return points;
}

// ---------- Histogramme ----------

export type HistogramBin = {
  binStart: number;
  binEnd: number;
  binMid: number;
  count: number;
  density: number;
  normalDensity: number; // densité normale théorique pour comparaison
};

export function buildHistogram(
  returns: number[],
  binCount = 30
): HistogramBin[] {
  if (returns.length < 5) return [];
  const sorted = [...returns].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const m = mean(returns);
  const sd = stdev(returns);
  if (max === min || sd === 0) return [];
  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const binStart = min + i * binWidth;
    const binEnd = i === binCount - 1 ? max : min + (i + 1) * binWidth;
    const binMid = (binStart + binEnd) / 2;
    let count = 0;
    for (const r of returns) {
      if (r >= binStart && (i === binCount - 1 ? r <= binEnd : r < binEnd)) count++;
    }
    const density = count / (returns.length * binWidth);
    const z = (binMid - m) / sd;
    const normalDensity =
      (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    bins.push({ binStart, binEnd, binMid, count, density, normalDensity });
  }
  return bins;
}

// ---------- Risque avancé : VaR, CVaR, Sortino, Calmar ----------

export type AdvancedRisk = {
  varHistorical95: number; // perte attendue, en valeur positive (1 - quantile 5%)
  varHistorical99: number;
  varParametric95: number;
  varParametric99: number;
  cvar95: number; // expected shortfall historique 95%
  cvar99: number;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  downsideDeviation: number;
  positiveDays: number; // % séances positives
  bestDay: number;
  worstDay: number;
  avgPositive: number;
  avgNegative: number;
};

export function computeAdvancedRisk(
  returns: number[],
  history: PricePoint[]
): AdvancedRisk | null {
  if (returns.length < 30) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const m = mean(returns);
  const sd = stdev(returns);

  const var95 = -quantile(sorted, 0.05);
  const var99 = -quantile(sorted, 0.01);

  // VaR paramétrique (loi normale) : -[μ - z×σ]
  const varParam95 = -(m - 1.645 * sd);
  const varParam99 = -(m - 2.326 * sd);

  // CVaR (Expected Shortfall) historique
  const cutoff95 = quantile(sorted, 0.05);
  const cutoff99 = quantile(sorted, 0.01);
  const tail95 = sorted.filter((r) => r <= cutoff95);
  const tail99 = sorted.filter((r) => r <= cutoff99);
  const cvar95 = tail95.length > 0 ? -mean(tail95) : 0;
  const cvar99 = tail99.length > 0 ? -mean(tail99) : 0;

  // Downside deviation (par rapport à 0 — convention courante)
  const downside = returns.filter((r) => r < 0);
  const downsideDev =
    downside.length > 0
      ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / returns.length) *
        Math.sqrt(252)
      : 0;
  const annRet = annualizedReturn(returns);
  const sortino =
    downsideDev > 0 ? (annRet - RISK_FREE_RATE) / downsideDev : null;

  // Calmar = rendement annualisé / |max drawdown|
  const allValues = history.map((p) => p.value).filter((v) => v > 0);
  const mdd = allValues.length >= 2 ? computeDrawdown(allValues) : 0;
  const calmar = mdd < 0 ? annRet / Math.abs(mdd) : null;

  const positives = returns.filter((r) => r > 0);
  const negatives = returns.filter((r) => r < 0);

  return {
    varHistorical95: var95,
    varHistorical99: var99,
    varParametric95: varParam95,
    varParametric99: varParam99,
    cvar95,
    cvar99,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    downsideDeviation: downsideDev,
    positiveDays: positives.length / returns.length,
    bestDay: sorted[sorted.length - 1],
    worstDay: sorted[0],
    avgPositive: positives.length > 0 ? mean(positives) : 0,
    avgNegative: negatives.length > 0 ? mean(negatives) : 0,
  };
}

// ---------- Régression vs BRVMC ----------

export type RegressionMetrics = {
  alpha: number; // alpha annualisé (Jensen)
  beta: number;
  rSquared: number; // 0..1
  trackingError: number; // annualisé
  upCapture: number; // ratio
  downCapture: number; // ratio
  correlation: number;
  observations: number;
};

function alignedReturns(
  stock: PricePoint[],
  index: PricePoint[]
): { stock: number[]; index: number[] } {
  const indexMap = new Map(index.map((p) => [p.date, p.value]));
  const sV: number[] = [];
  const iV: number[] = [];
  for (const p of stock) {
    const iv = indexMap.get(p.date);
    if (iv !== undefined) {
      sV.push(p.value);
      iV.push(iv);
    }
  }
  const sR: number[] = [];
  const iR: number[] = [];
  for (let i = 1; i < sV.length; i++) {
    if (sV[i - 1] <= 0 || sV[i] <= 0 || iV[i - 1] <= 0 || iV[i] <= 0) continue;
    const sr = Math.log(sV[i] / sV[i - 1]);
    const ir = Math.log(iV[i] / iV[i - 1]);
    if (Math.abs(sr) > 0.3 || Math.abs(ir) > 0.3) continue;
    sR.push(sr);
    iR.push(ir);
  }
  return { stock: sR, index: iR };
}

export function computeRegressionMetrics(
  stock: PricePoint[],
  index: PricePoint[]
): RegressionMetrics | null {
  const { stock: sR, index: iR } = alignedReturns(stock, index);
  if (sR.length < 30) return null;

  const meanS = mean(sR);
  const meanI = mean(iR);
  const cov = covariance(sR, iR);
  const varI = variance(iR);
  const varS = variance(sR);
  if (varI === 0) return null;
  const beta = cov / varI;
  // Alpha quotidien puis annualisé
  const alphaDaily = meanS - beta * meanI;
  const alphaAnn = alphaDaily * 252;

  // R² = ρ²
  const correlation = cov / (Math.sqrt(varS) * Math.sqrt(varI) || 1);
  const rSquared = correlation * correlation;

  // Tracking error : écart-type des rendements actifs (S - I), annualisé
  const active: number[] = [];
  for (let i = 0; i < sR.length; i++) active.push(sR[i] - iR[i]);
  const trackingError = stdev(active) * Math.sqrt(252);

  // Up / down capture
  let upStockSum = 0;
  let upIdxSum = 0;
  let downStockSum = 0;
  let downIdxSum = 0;
  for (let i = 0; i < sR.length; i++) {
    if (iR[i] > 0) {
      upStockSum += sR[i];
      upIdxSum += iR[i];
    } else if (iR[i] < 0) {
      downStockSum += sR[i];
      downIdxSum += iR[i];
    }
  }
  const upCapture = upIdxSum !== 0 ? upStockSum / upIdxSum : 0;
  const downCapture = downIdxSum !== 0 ? downStockSum / downIdxSum : 0;

  return {
    alpha: alphaAnn,
    beta,
    rSquared,
    trackingError,
    upCapture,
    downCapture,
    correlation,
    observations: sR.length,
  };
}

// ---------- Autocorrélation + Ljung-Box ----------

export type AutocorrelationResult = {
  lags: { lag: number; rho: number }[];
  ljungBoxStatistic: number;
  ljungBoxPValue: number;
  hasSignificantAutocorr5: boolean;
};

function chi2GenericPValue(x: number, k: number): number {
  // Approximation suffisante : on utilise une série pour la fonction Q(x, k/2)
  // Wilson-Hilferty pour k > 0 : transforme χ² en N(0,1) approximativement
  if (x <= 0) return 1;
  const h = 2 / (9 * k);
  const z = (Math.pow(x / k, 1 / 3) - (1 - h)) / Math.sqrt(h);
  // Φ(z) — fonction de répartition normale
  const phi = 0.5 * (1 + erf(z / Math.SQRT2));
  return 1 - phi;
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function computeAutocorrelation(
  returns: number[],
  lags: number[] = [1, 2, 5, 10, 22]
): AutocorrelationResult | null {
  if (returns.length < 30) return null;
  const m = mean(returns);
  const denom = returns.reduce((s, r) => s + (r - m) ** 2, 0);
  if (denom === 0) return null;
  const rhos: { lag: number; rho: number }[] = [];
  let lbStat = 0;
  const n = returns.length;
  for (const k of lags) {
    if (k >= n) continue;
    let num = 0;
    for (let t = k; t < n; t++) {
      num += (returns[t] - m) * (returns[t - k] - m);
    }
    const rho = num / denom;
    rhos.push({ lag: k, rho });
    // Ljung-Box terme : ρ²(k) / (n - k)
    lbStat += (rho * rho) / (n - k);
  }
  lbStat = n * (n + 2) * lbStat;
  const lbP = chi2GenericPValue(lbStat, rhos.length);
  return {
    lags: rhos,
    ljungBoxStatistic: lbStat,
    ljungBoxPValue: lbP,
    hasSignificantAutocorr5: lbP < 0.05,
  };
}

// ---------- Returns mensuels (heatmap) ----------

export type MonthlyReturn = { year: number; month: number; ret: number };

export function buildMonthlyReturns(history: PricePoint[]): MonthlyReturn[] {
  if (history.length === 0) return [];
  const byMonth = new Map<string, { first: number; last: number }>();
  for (const p of history) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
    const key = p.date.substring(0, 7); // YYYY-MM
    const existing = byMonth.get(key);
    if (!existing) byMonth.set(key, { first: p.value, last: p.value });
    else existing.last = p.value;
  }
  const out: MonthlyReturn[] = [];
  for (const [key, { first, last }] of byMonth) {
    if (first <= 0 || last <= 0) continue;
    const [y, m] = key.split("-").map(Number);
    out.push({ year: y, month: m, ret: last / first - 1 });
  }
  out.sort((a, b) => a.year - b.year || a.month - b.month);
  return out;
}

// ---------- Snapshot agrégé ----------

export type AdvancedStatsSnapshot = {
  descriptive: DescriptiveStats | null;
  normality: NormalityTest | null;
  histogram: HistogramBin[];
  qqPlot: QQPoint[];
  risk: AdvancedRisk | null;
  regression: RegressionMetrics | null;
  autocorr: AutocorrelationResult | null;
  monthlyReturns: MonthlyReturn[];
};

export function computeAdvancedStats(
  history: PricePoint[],
  brvmc: PricePoint[]
): AdvancedStatsSnapshot {
  const returns = dailyLogReturns(history);
  return {
    descriptive: computeDescriptiveStats(returns),
    normality: computeNormalityTest(returns),
    histogram: buildHistogram(returns, 30),
    qqPlot: buildQQPlotData(returns),
    risk: computeAdvancedRisk(returns, history),
    regression: computeRegressionMetrics(history, brvmc),
    autocorr: computeAutocorrelation(returns, [1, 2, 5, 10, 22]),
    monthlyReturns: buildMonthlyReturns(history),
  };
}
