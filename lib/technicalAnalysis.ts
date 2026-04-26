// === ANALYSE TECHNIQUE : indicateurs sur cours de clôture ===
// Calculs purs. On ne dispose que du close + volume (pas d'OHLC), donc les
// indicateurs requérant high/low sont approximés ou omis.

export type PriceVolumePoint = {
  date: string;
  value: number;
  volume: number | null;
};

// ==========================================
// MOYENNES MOBILES
// ==========================================

/** Simple moving average. Renvoie un tableau de même longueur, NaN avant la fenêtre. */
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average. α = 2/(N+1). Initialisée par la SMA des N premiers points. */
export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const alpha = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

// ==========================================
// BANDES DE BOLLINGER
// ==========================================

export type BollingerBands = {
  middle: number[];
  upper: number[];
  lower: number[];
  /** %B : (cours - lower) / (upper - lower). Au-dessus de 1 ou sous 0 = excès. */
  percentB: number[];
  /** Bandwidth : (upper - lower) / middle. Mesure la compression / expansion. */
  bandwidth: number[];
};

export function bollinger(
  values: number[],
  period = 20,
  stdMultiplier = 2
): BollingerBands {
  const middle = sma(values, period);
  const upper = new Array(values.length).fill(NaN);
  const lower = new Array(values.length).fill(NaN);
  const percentB = new Array(values.length).fill(NaN);
  const bandwidth = new Array(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i];
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - m;
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = m + stdMultiplier * sd;
    lower[i] = m - stdMultiplier * sd;
    const range = upper[i] - lower[i];
    percentB[i] = range > 0 ? (values[i] - lower[i]) / range : 0.5;
    bandwidth[i] = m > 0 ? range / m : 0;
  }
  return { middle, upper, lower, percentB, bandwidth };
}

// ==========================================
// RSI (Wilder)
// ==========================================

export function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gainSum += ch;
    else lossSum -= ch;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] =
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ==========================================
// MACD
// ==========================================

export type MACDResult = {
  macd: number[]; // EMA(fast) - EMA(slow)
  signal: number[]; // EMA(macd, signalPeriod)
  histogram: number[]; // macd - signal
};

export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const macdLine = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return isFinite(f) && isFinite(s) ? f - s : NaN;
  });
  // Signal = EMA du MACD à partir du premier index où macd est défini
  const firstValid = macdLine.findIndex((v) => isFinite(v));
  const signal = new Array(values.length).fill(NaN);
  if (firstValid >= 0) {
    const validMacd = macdLine.slice(firstValid);
    const sig = ema(validMacd, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstValid + i] = sig[i];
  }
  const histogram = macdLine.map((m, i) =>
    isFinite(m) && isFinite(signal[i]) ? m - signal[i] : NaN
  );
  return { macd: macdLine, signal, histogram };
}

// ==========================================
// OBV (On-Balance Volume)
// ==========================================

export function obv(values: number[], volumes: (number | null)[]): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length === 0) return out;
  let acc = 0;
  out[0] = 0;
  for (let i = 1; i < values.length; i++) {
    const v = volumes[i] ?? 0;
    if (values[i] > values[i - 1]) acc += v;
    else if (values[i] < values[i - 1]) acc -= v;
    out[i] = acc;
  }
  return out;
}

// ==========================================
// ROC (Rate of Change) & Momentum
// ==========================================

/** ROC en pourcentage : (close[i] - close[i-period]) / close[i-period]. */
export function roc(values: number[], period = 10): number[] {
  const out = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    const ref = values[i - period];
    if (ref > 0) out[i] = (values[i] - ref) / ref;
  }
  return out;
}

// ==========================================
// STOCHASTIQUE approximé (basé sur close uniquement)
// ==========================================

/** %K = (C - lowestClose(N)) / (highestClose(N) - lowestClose(N)) × 100. */
export function stochasticFromClose(
  values: number[],
  kPeriod = 14,
  dPeriod = 3
): { k: number[]; d: number[] } {
  const k = new Array(values.length).fill(NaN);
  for (let i = kPeriod - 1; i < values.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (values[j] < lo) lo = values[j];
      if (values[j] > hi) hi = values[j];
    }
    const range = hi - lo;
    k[i] = range > 0 ? ((values[i] - lo) / range) * 100 : 50;
  }
  // D = SMA(K, dPeriod), en sautant les NaN
  const d = new Array(values.length).fill(NaN);
  for (let i = kPeriod - 1 + dPeriod - 1; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (isFinite(k[j])) {
        sum += k[j];
        count++;
      }
    }
    if (count === dPeriod) d[i] = sum / dPeriod;
  }
  return { k, d };
}

// ==========================================
// SUPPORT / RÉSISTANCE par pivots locaux
// ==========================================

export type PivotLevel = {
  type: "support" | "resistance";
  price: number;
  date: string;
  /** Force = nombre de fois où le niveau a été testé à ±1% */
  strength: number;
};

/**
 * Détecte les pivots hauts/bas sur une fenêtre symétrique, puis regroupe
 * les niveaux proches (±1%) et conserve les plus testés.
 */
export function detectPivotLevels(
  series: PriceVolumePoint[],
  window = 5,
  maxLevels = 6
): PivotLevel[] {
  if (series.length < 2 * window + 1) return [];

  const pivots: { type: "support" | "resistance"; price: number; date: string }[] = [];
  for (let i = window; i < series.length - window; i++) {
    const v = series[i].value;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (series[j].value >= v) isHigh = false;
      if (series[j].value <= v) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ type: "resistance", price: v, date: series[i].date });
    else if (isLow) pivots.push({ type: "support", price: v, date: series[i].date });
  }

  // Regroupement : on cluster les pivots dont les prix sont à ±1% les uns des autres
  const clusters: { type: "support" | "resistance"; price: number; date: string; strength: number }[] = [];
  for (const p of pivots) {
    const existing = clusters.find(
      (c) => c.type === p.type && Math.abs(c.price - p.price) / c.price < 0.01
    );
    if (existing) {
      existing.strength++;
      // Date la plus récente
      if (p.date > existing.date) existing.date = p.date;
      // Moyenne pondérée du prix
      existing.price =
        (existing.price * (existing.strength - 1) + p.price) / existing.strength;
    } else {
      clusters.push({ ...p, strength: 1 });
    }
  }

  // Conserver les plus testés
  return clusters
    .sort((a, b) => b.strength - a.strength || b.date.localeCompare(a.date))
    .slice(0, maxLevels);
}

// ==========================================
// SIGNAL GLOBAL
// ==========================================

export type SignalLabel =
  | "Achat fort"
  | "Achat"
  | "Neutre"
  | "Vente"
  | "Vente fort";

export type SignalEntry = {
  label: string;
  vote: -1 | 0 | 1;
  detail: string;
};

export type GlobalSignal = {
  label: SignalLabel;
  score: number; // somme des votes
  total: number; // nombre d'indicateurs comptés
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  entries: SignalEntry[];
};

function fmtPct(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

/** Construit le signal agrégé à partir des dernières valeurs des indicateurs. */
export function aggregateSignal(input: {
  price: number;
  sma20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  macdValue: number;
  macdSignal: number;
  bollPercentB: number;
  obvSlope: number;
  roc10: number;
}): GlobalSignal {
  const entries: SignalEntry[] = [];

  function push(label: string, vote: -1 | 0 | 1, detail: string) {
    entries.push({ label, vote, detail });
  }

  // 1. Prix vs MM courte
  if (isFinite(input.sma20)) {
    const above = input.price > input.sma20;
    push(
      "Prix vs MM20",
      above ? 1 : -1,
      above ? "Cours au-dessus de la MM20" : "Cours sous la MM20"
    );
  }
  // 2. Prix vs MM moyenne
  if (isFinite(input.sma50)) {
    const above = input.price > input.sma50;
    push(
      "Prix vs MM50",
      above ? 1 : -1,
      above ? "Cours au-dessus de la MM50" : "Cours sous la MM50"
    );
  }
  // 3. Prix vs MM longue
  if (isFinite(input.sma200)) {
    const above = input.price > input.sma200;
    push(
      "Prix vs MM200",
      above ? 1 : -1,
      above
        ? "Tendance long terme haussière"
        : "Tendance long terme baissière"
    );
  }
  // 4. Croisement MM50 / MM200
  if (isFinite(input.sma50) && isFinite(input.sma200)) {
    const golden = input.sma50 > input.sma200;
    push(
      "MM50 vs MM200",
      golden ? 1 : -1,
      golden
        ? "Configuration Golden Cross (MM50 > MM200)"
        : "Configuration Death Cross (MM50 < MM200)"
    );
  }
  // 5. RSI
  if (isFinite(input.rsi14)) {
    if (input.rsi14 > 70)
      push(
        "RSI 14",
        -1,
        `RSI ${input.rsi14.toFixed(0)} — zone de surachat`
      );
    else if (input.rsi14 < 30)
      push(
        "RSI 14",
        1,
        `RSI ${input.rsi14.toFixed(0)} — zone de survente`
      );
    else
      push("RSI 14", 0, `RSI ${input.rsi14.toFixed(0)} — zone neutre`);
  }
  // 6. MACD vs signal
  if (isFinite(input.macdValue) && isFinite(input.macdSignal)) {
    const above = input.macdValue > input.macdSignal;
    push(
      "MACD vs signal",
      above ? 1 : -1,
      above
        ? "MACD au-dessus de sa ligne de signal"
        : "MACD sous sa ligne de signal"
    );
  }
  // 7. MACD vs zéro
  if (isFinite(input.macdValue)) {
    const positive = input.macdValue > 0;
    push(
      "MACD vs 0",
      positive ? 1 : -1,
      positive ? "MACD positif" : "MACD négatif"
    );
  }
  // 8. Bollinger %B
  if (isFinite(input.bollPercentB)) {
    if (input.bollPercentB > 1)
      push("Bollinger %B", -1, "Cours au-dessus de la bande supérieure");
    else if (input.bollPercentB < 0)
      push("Bollinger %B", 1, "Cours sous la bande inférieure");
    else if (input.bollPercentB > 0.8)
      push("Bollinger %B", -1, "Cours proche de la bande supérieure");
    else if (input.bollPercentB < 0.2)
      push("Bollinger %B", 1, "Cours proche de la bande inférieure");
    else push("Bollinger %B", 0, "Cours dans la zone centrale");
  }
  // 9. OBV trend
  if (isFinite(input.obvSlope)) {
    const sign = input.obvSlope > 0 ? 1 : input.obvSlope < 0 ? -1 : 0;
    push(
      "Tendance OBV",
      sign as -1 | 0 | 1,
      sign > 0
        ? "Volume cumulé en hausse — accumulation"
        : sign < 0
        ? "Volume cumulé en baisse — distribution"
        : "Volume cumulé stable"
    );
  }
  // 10. ROC 10
  if (isFinite(input.roc10)) {
    const sign = input.roc10 > 0 ? 1 : input.roc10 < 0 ? -1 : 0;
    push(
      "Momentum 10j",
      sign as -1 | 0 | 1,
      `Variation 10 séances : ${fmtPct(input.roc10, 1)}`
    );
  }

  const bullishCount = entries.filter((e) => e.vote === 1).length;
  const bearishCount = entries.filter((e) => e.vote === -1).length;
  const neutralCount = entries.filter((e) => e.vote === 0).length;
  const score = entries.reduce((s, e) => s + e.vote, 0);
  const total = entries.length;

  let label: SignalLabel = "Neutre";
  if (total > 0) {
    const ratio = score / total;
    if (ratio >= 0.6) label = "Achat fort";
    else if (ratio >= 0.2) label = "Achat";
    else if (ratio <= -0.6) label = "Vente fort";
    else if (ratio <= -0.2) label = "Vente";
  }

  return { label, score, total, bullishCount, bearishCount, neutralCount, entries };
}

// ==========================================
// REGRESSION LINEAIRE (pour pente OBV)
// ==========================================

/** Pente d'une régression linéaire OLS sur les N derniers points (indice = x). */
export function trailingSlope(values: number[], period: number): number {
  const n = Math.min(period, values.filter((v) => isFinite(v)).length);
  if (n < 3) return NaN;
  const start = values.length - n;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let count = 0;
  for (let i = start; i < values.length; i++) {
    const v = values[i];
    if (!isFinite(v)) continue;
    const x = i - start;
    sumX += x;
    sumY += v;
    sumXY += x * v;
    sumXX += x * x;
    count++;
  }
  if (count < 3) return NaN;
  const denom = count * sumXX - sumX * sumX;
  if (denom === 0) return NaN;
  return (count * sumXY - sumX * sumY) / denom;
}

// ==========================================
// SNAPSHOT AGRÉGÉ — utilisé par le composant
// ==========================================

export type IndicatorSeries = {
  date: string;
  price: number;
  volume: number | null;
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  ema50: number;
  bollUpper: number;
  bollLower: number;
  bollMiddle: number;
  bollPercentB: number;
  bollBandwidth: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  obv: number;
  roc10: number;
  stochK: number;
  stochD: number;
};

export function buildIndicatorSeries(
  history: PriceVolumePoint[]
): IndicatorSeries[] {
  if (history.length === 0) return [];
  const closes = history.map((p) => p.value);
  const volumes = history.map((p) => p.volume);

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const boll = bollinger(closes, 20, 2);
  const r14 = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const o = obv(closes, volumes);
  const r10 = roc(closes, 10);
  const st = stochasticFromClose(closes, 14, 3);

  return history.map((p, i) => ({
    date: p.date,
    price: p.value,
    volume: p.volume,
    sma20: s20[i],
    sma50: s50[i],
    sma200: s200[i],
    ema20: e20[i],
    ema50: e50[i],
    bollUpper: boll.upper[i],
    bollLower: boll.lower[i],
    bollMiddle: boll.middle[i],
    bollPercentB: boll.percentB[i],
    bollBandwidth: boll.bandwidth[i],
    rsi14: r14[i],
    macd: m.macd[i],
    macdSignal: m.signal[i],
    macdHist: m.histogram[i],
    obv: o[i],
    roc10: r10[i],
    stochK: st.k[i],
    stochD: st.d[i],
  }));
}
