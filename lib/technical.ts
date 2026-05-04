// === Indicateurs d'analyse technique ===
//
// Tous les calculs travaillent sur une serie de valeurs (closes) ordonnee
// par date ascendante. Chaque indicateur retourne un tableau de meme longueur
// que l'entree, avec `null` aux indices ou la fenetre est insuffisante.
//
// Conventions de parametrage usuelles :
//   SMA / EMA      : 20, 50, 100, 200
//   Bollinger      : SMA(20) ± 2σ
//   RSI            : Wilder, period 14
//   MACD           : EMA(12) − EMA(26), signal EMA(9)
//   Stochastic     : %K period 14, %D smoothing 3
//   ATR            : Wilder, period 14 (a partir de high/low/close)

export type Series = (number | null)[];

/** Moyenne mobile simple (SMA). */
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Moyenne mobile exponentielle (EMA), seedee par la SMA initiale. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // Seed : SMA des `period` premieres valeurs
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Bandes de Bollinger : SMA ± `stdDev` ecart-types. */
export function bollinger(
  values: number[],
  period: number = 20,
  stdDev: number = 2,
): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    if (m === null) continue;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varSum += (values[j] - m) ** 2;
    }
    const sd = Math.sqrt(varSum / period);
    upper[i] = m + stdDev * sd;
    lower[i] = m - stdDev * sd;
  }
  return { mid, upper, lower };
}

/** Relative Strength Index (Wilder). Renvoie une valeur entre 0 et 100. */
export function rsi(values: number[], period: number = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD : difference EMA rapide − EMA lente, ligne signal EMA de la diff.
 * Histogramme = MACD − signal (impulse haussier > 0).
 */
export function macd(
  values: number[],
  fast: number = 12,
  slow: number = 26,
  signalPeriod: number = 9,
): { macd: Series; signal: Series; histogram: Series } {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: Series = values.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null
      ? (fastEma[i] as number) - (slowEma[i] as number)
      : null,
  );
  // Pour calculer la ligne signal en EMA, on travaille sur la sous-serie
  // filtree (sans null en debut), puis on remappe les indices.
  const firstValid = macdLine.findIndex((v) => v !== null);
  const signal: Series = new Array(values.length).fill(null);
  if (firstValid >= 0) {
    const compact = macdLine.slice(firstValid).map((v) => v as number);
    const sig = ema(compact, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      signal[firstValid + i] = sig[i];
    }
  }
  const histogram: Series = macdLine.map((m, i) =>
    m !== null && signal[i] !== null ? m - (signal[i] as number) : null,
  );
  return { macd: macdLine, signal, histogram };
}

/**
 * Stochastique %K et %D.
 * %K = (close − min(low, period)) / (max(high, period) − min(low, period)) × 100
 * Faute d'un vrai high/low (on travaille sur close pour les indices),
 * on utilise close comme proxy : c'est le "Stochastique sur close".
 */
export function stochastic(
  values: number[],
  period: number = 14,
  smoothingD: number = 3,
): { k: Series; d: Series } {
  const k: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    const range = max - min;
    k[i] = range === 0 ? 50 : ((values[i] - min) / range) * 100;
  }
  // %D = SMA de %K
  const kValid = k.map((v) => (v === null ? 0 : v));
  const dRaw = sma(kValid, smoothingD);
  const d: Series = dRaw.map((v, i) => (k[i] === null ? null : v));
  return { k, d };
}

// =============================================================================
// SIGNAUX D'AGREGATION (utiles pour un panneau "verdict")
// =============================================================================

export type Signal = "buy" | "sell" | "neutral";

/** Verdict simple sur le RSI : <30 buy / >70 sell / sinon neutral. */
export function rsiSignal(value: number | null): Signal {
  if (value === null) return "neutral";
  if (value < 30) return "buy";
  if (value > 70) return "sell";
  return "neutral";
}

/** Verdict MACD : croisement au-dessus/en-dessous du signal. */
export function macdSignal(
  histogramNow: number | null,
  histogramPrev: number | null,
): Signal {
  if (histogramNow === null || histogramPrev === null) return "neutral";
  if (histogramPrev <= 0 && histogramNow > 0) return "buy"; // golden cross
  if (histogramPrev >= 0 && histogramNow < 0) return "sell"; // death cross
  return "neutral";
}

/** Position prix vs SMA — au-dessus = bullish, en-dessous = bearish. */
export function smaTrendSignal(
  price: number,
  smaValue: number | null,
): Signal {
  if (smaValue === null) return "neutral";
  const diffPct = ((price - smaValue) / smaValue) * 100;
  if (diffPct > 1) return "buy";
  if (diffPct < -1) return "sell";
  return "neutral";
}
