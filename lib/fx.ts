// === DEVISES & FX : loader CSV + moteur d'analyse ===
//
// Chaque CSV (data/<PAIR>.csv) suit le format Investing.com :
//   "Date","Dernier","Ouv.","Plus Haut","Plus Bas","Vol.","Variation %"
//   - Dates : DD/MM/YYYY
//   - Nombres : decimale virgule, point optionnel pour les milliers.
//   - Pour les paires FX, valeurs typiques < 1000 (cf. USD/XOF ~560).
//
// Le FCFA est arrime a l'euro a 655,957 XOF pour 1 EUR (peg fixe). La parite
// EUR/XOF n'est donc pas chargee : c'est une constante. Toutes les paires
// XOF chargees sont des cross-rates derives via les marches.
//
// Memoise au niveau module : un parse par processus serveur.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

// Constante du peg : 1 EUR = 655.957 FCFA depuis le 01/01/1999
export const EUR_XOF_PEG = 655.957;

// =============================================================================
// CATALOGUE
// =============================================================================

export type FxSlug =
  | "EUR_USD"
  | "GBP_USD"
  | "USD_CNY"
  | "DXY"
  | "USD_XOF"
  | "GBP_XOF"
  | "JPY_XOF"
  | "CAD_XOF"
  | "AED_XOF"
  | "TRY_XOF"
  | "BRL_XOF"
  | "ZAR_XOF"
  | "NGN_XOF";

export type FxCategory = "global" | "fcfa-major" | "fcfa-emerging" | "africa";

export type FxMeta = {
  slug: FxSlug;
  /** Symbole standard, ex "EUR/USD" */
  pair: string;
  /** Nom long francais */
  name: string;
  /** Devise base (a gauche dans la paire) */
  base: string;
  /** Devise cotee (a droite) */
  quote: string;
  category: FxCategory;
  /** Suffixe pour formatter les valeurs (ex "FCFA", "USD", "" pour DXY) */
  unitSuffix: string;
  /** Nombre de decimales recommande pour l'affichage */
  decimals: number;
  file: string;
  /** Description de l'enjeu pour l'UEMOA / la BRVM */
  uemoaRelevance: string;
  /** Sens d'impact d'une HAUSSE (base s'apprecie vs cotee) sur la BRVM */
  rvmDirection: "positive" | "negative" | "mixte";
  /** Couleur d'affichage */
  color: string;
};

export const FX_PAIRS: FxMeta[] = [
  {
    slug: "DXY",
    pair: "DXY",
    name: "US Dollar Index",
    base: "USD",
    quote: "Panier majors",
    category: "global",
    unitSuffix: "",
    decimals: 2,
    file: "US_Dollar_Index.csv",
    uemoaRelevance:
      "Panier USD vs majors (EUR, JPY, GBP, CAD, SEK, CHF). Une hausse = dollar fort partout, ce qui pese sur les commodities libellees en USD (cacao, or) et grossit l'inflation importee de la zone CFA.",
    rvmDirection: "negative",
    color: "#0f172a",
  },
  {
    slug: "EUR_USD",
    pair: "EUR/USD",
    name: "Euro / Dollar",
    base: "EUR",
    quote: "USD",
    category: "global",
    unitSuffix: "USD",
    decimals: 4,
    file: "EUR_USD.csv",
    uemoaRelevance:
      "Paire la plus liquide au monde. Comme le FCFA est arrime a l'euro, EUR/USD pilote mecaniquement le cours USD/XOF (USD_XOF ~ 655,957 / EUR_USD).",
    rvmDirection: "positive",
    color: "#1e3a8a",
  },
  {
    slug: "GBP_USD",
    pair: "GBP/USD",
    name: "Livre sterling / Dollar",
    base: "GBP",
    quote: "USD",
    category: "global",
    unitSuffix: "USD",
    decimals: 4,
    file: "GBP_USD.csv",
    uemoaRelevance:
      "Indicateur du sentiment risk-off / risk-on global. Influence indirecte le cacao (cote a Londres en GBP) et le cafe robusta (londres).",
    rvmDirection: "mixte",
    color: "#7c3aed",
  },
  {
    slug: "USD_CNY",
    pair: "USD/CNY",
    name: "Dollar / Yuan",
    base: "USD",
    quote: "CNY",
    category: "global",
    unitSuffix: "CNY",
    decimals: 4,
    file: "USD_CNY.csv",
    uemoaRelevance:
      "Le yuan piloque la demande chinoise pour les commodities africaines (cacao, cuivre, manganese). Une hausse USD/CNY (yuan faible) = pression baissiere sur la demande chinoise et donc sur les prix.",
    rvmDirection: "negative",
    color: "#dc2626",
  },
  {
    slug: "USD_XOF",
    pair: "USD/XOF",
    name: "Dollar / FCFA",
    base: "USD",
    quote: "XOF",
    category: "fcfa-major",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "USD_XOF.csv",
    uemoaRelevance:
      "Driver direct des recettes en FCFA pour les exportateurs (cacao, or, brent). Une hausse = + recettes en FCFA pour les producteurs MAIS + facture energetique et inflation importee.",
    rvmDirection: "mixte",
    color: "#0d9488",
  },
  {
    slug: "GBP_XOF",
    pair: "GBP/XOF",
    name: "Livre sterling / FCFA",
    base: "GBP",
    quote: "XOF",
    category: "fcfa-major",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "GBP_XOF.csv",
    uemoaRelevance:
      "Cross derivee : valorisation des recettes cacao/cafe lorsque la livre s'apprecie. Pertinent pour la balance commerciale UEMOA-Royaume-Uni.",
    rvmDirection: "positive",
    color: "#6d28d9",
  },
  {
    slug: "JPY_XOF",
    pair: "JPY/XOF",
    name: "Yen japonais / FCFA",
    base: "JPY",
    quote: "XOF",
    category: "fcfa-major",
    unitSuffix: "FCFA",
    decimals: 4,
    file: "JPY_XOF.csv",
    uemoaRelevance:
      "Indicateur du couple risk-off mondial. Le yen est une valeur refuge ; une hausse JPY/XOF accompagne souvent le stress sur les emergents.",
    rvmDirection: "negative",
    color: "#be185d",
  },
  {
    slug: "CAD_XOF",
    pair: "CAD/XOF",
    name: "Dollar canadien / FCFA",
    base: "CAD",
    quote: "XOF",
    category: "fcfa-emerging",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "CAD_XOF.csv",
    uemoaRelevance:
      "Le CAD est tres correle au prix du brent. Suivre CAD/XOF revient a mesurer le pouvoir d'achat petrolier indirectement.",
    rvmDirection: "mixte",
    color: "#b91c1c",
  },
  {
    slug: "AED_XOF",
    pair: "AED/XOF",
    name: "Dirham EAU / FCFA",
    base: "AED",
    quote: "XOF",
    category: "fcfa-emerging",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "AED_XOF.csv",
    uemoaRelevance:
      "Reflete la place de Dubai dans les flux d'or africain et le hub commercial de re-export vers l'UEMOA. Le dirham etant peg au dollar, AED/XOF = USD/XOF * 0,2723.",
    rvmDirection: "mixte",
    color: "#ca8a04",
  },
  {
    slug: "TRY_XOF",
    pair: "TRY/XOF",
    name: "Livre turque / FCFA",
    base: "TRY",
    quote: "XOF",
    category: "fcfa-emerging",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "TRY_XOF.csv",
    uemoaRelevance:
      "La Turquie est devenue un partenaire commercial important de l'UEMOA (textile, BTP, biens d'equipement). La depreciation chronique de la TRY ameliore la competitivite des imports turcs.",
    rvmDirection: "mixte",
    color: "#9a3412",
  },
  {
    slug: "BRL_XOF",
    pair: "BRL/XOF",
    name: "Real bresilien / FCFA",
    base: "BRL",
    quote: "XOF",
    category: "fcfa-emerging",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "BRL_XOF.csv",
    uemoaRelevance:
      "Le Bresil est le principal concurrent de la Cote d'Ivoire sur le cacao et le sucre. Un real fort = pression haussiere sur les commodities tropicales en USD.",
    rvmDirection: "positive",
    color: "#15803d",
  },
  {
    slug: "ZAR_XOF",
    pair: "ZAR/XOF",
    name: "Rand sud-africain / FCFA",
    base: "ZAR",
    quote: "XOF",
    category: "africa",
    unitSuffix: "FCFA",
    decimals: 2,
    file: "ZAR_XOF.csv",
    uemoaRelevance:
      "Reflete le sentiment des investisseurs sur le bloc Afrique : un rand fort signale un appetit pour le risque africain, generalement favorable aux flux vers la BRVM.",
    rvmDirection: "positive",
    color: "#0369a1",
  },
  {
    slug: "NGN_XOF",
    pair: "NGN/XOF",
    name: "Naira nigerian / FCFA",
    base: "NGN",
    quote: "XOF",
    category: "africa",
    unitSuffix: "FCFA",
    decimals: 4,
    file: "NGN_XOF.csv",
    uemoaRelevance:
      "Voisin geant pour le commerce informel (Lagos<->Cotonou<->Abidjan). La depreciation chronique du naira erode la competitivite des exportateurs UEMOA vers le Nigeria.",
    rvmDirection: "positive",
    color: "#16a34a",
  },
];

export const FX_BY_SLUG: Record<FxSlug, FxMeta> = Object.fromEntries(
  FX_PAIRS.map((p) => [p.slug, p]),
) as Record<FxSlug, FxMeta>;

// =============================================================================
// PARSING
// =============================================================================

type RawRow = {
  Date: string;
  Dernier: string;
  "Ouv.": string;
  " Plus Haut": string;
  "Plus Bas": string;
  "Vol.": string;
  "Variation %": string;
};

export type FxPoint = {
  /** ISO YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Volume (rare en FX retail, souvent vide). null si absent. */
  volume: number | null;
  /** Variation quotidienne en % */
  changePct: number;
};

function parseFrenchNumber(value: string): number {
  if (!value || value === "" || value === "-") return NaN;
  const s = value.trim();
  if (s.includes(",")) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  return Number(s.replace(/\./g, ""));
}

function parseVolume(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const s = value.trim();
  const last = s.slice(-1);
  let multiplier = 1;
  let core = s;
  if (last === "K" || last === "k") {
    multiplier = 1_000;
    core = s.slice(0, -1);
  } else if (last === "M" || last === "m") {
    multiplier = 1_000_000;
    core = s.slice(0, -1);
  } else if (last === "B" || last === "b") {
    multiplier = 1_000_000_000;
    core = s.slice(0, -1);
  }
  const n = parseFrenchNumber(core);
  return isNaN(n) ? null : n * multiplier;
}

function parsePercent(value: string): number {
  if (!value || value.trim() === "") return NaN;
  return parseFrenchNumber(value.replace("%", "").trim());
}

function parseDDMMYYYY(s: string): string {
  if (!s) return "";
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseFxCSV(file: string): FxPoint[] {
  let content = readFileSync(join(DATA_DIR, file), "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.replace(/^﻿/, ""),
  });

  const points: FxPoint[] = [];
  for (const r of result.data) {
    const date = parseDDMMYYYY(r.Date);
    const close = parseFrenchNumber(r.Dernier);
    if (!date || !isFinite(close) || close <= 0) continue;
    const open = parseFrenchNumber(r["Ouv."]);
    const high = parseFrenchNumber(r[" Plus Haut"]);
    const low = parseFrenchNumber(r["Plus Bas"]);
    points.push({
      date,
      open: isFinite(open) ? open : close,
      high: isFinite(high) ? high : close,
      low: isFinite(low) ? low : close,
      close,
      volume: parseVolume(r["Vol."]),
      changePct: parsePercent(r["Variation %"]),
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

const _historyCache = new Map<FxSlug, FxPoint[]>();

export function loadFxHistory(slug: FxSlug): FxPoint[] {
  const cached = _historyCache.get(slug);
  if (cached) return cached;
  const meta = FX_BY_SLUG[slug];
  if (!meta) return [];
  const data = parseFxCSV(meta.file);
  _historyCache.set(slug, data);
  return data;
}

// =============================================================================
// METRIQUES & STATS
// =============================================================================

export type ReturnHorizon = "1S" | "1M" | "3M" | "6M" | "YTD" | "1A" | "3A" | "5A";

export type FxStats = {
  slug: FxSlug;
  pair: string;
  name: string;
  category: FxCategory;
  unitSuffix: string;
  decimals: number;
  color: string;
  last: number;
  lastDate: string;
  prevClose: number | null;
  changeDayPct: number | null;
  returns: Record<ReturnHorizon, number | null>;
  volatility1Y: number | null;
  drawdownFromHigh5Y: number | null;
  high52w: number | null;
  low52w: number | null;
  zScore1Y: number | null;
};

const HORIZON_DAYS: Record<Exclude<ReturnHorizon, "YTD">, number> = {
  "1S": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1A": 365,
  "3A": 365 * 3,
  "5A": 365 * 5,
};

function findClosestPriceBefore(history: FxPoint[], refIso: string): FxPoint | null {
  let lo = 0;
  let hi = history.length - 1;
  let best: FxPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].date <= refIso) {
      best = history[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function startOfYearISO(iso: string): string {
  return iso.slice(0, 4) + "-01-01";
}

export function computeFxStats(slug: FxSlug): FxStats | null {
  const history = loadFxHistory(slug);
  const meta = FX_BY_SLUG[slug];
  if (!meta || history.length === 0) return null;

  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const changeDayPct =
    prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

  const returns: Record<ReturnHorizon, number | null> = {
    "1S": null, "1M": null, "3M": null, "6M": null,
    YTD: null, "1A": null, "3A": null, "5A": null,
  };

  for (const [horizon, days] of Object.entries(HORIZON_DAYS) as [
    Exclude<ReturnHorizon, "YTD">,
    number,
  ][]) {
    const refIso = shiftDays(last.date, days);
    const ref = findClosestPriceBefore(history, refIso);
    if (ref && ref.close > 0 && ref.date !== last.date) {
      returns[horizon] = ((last.close - ref.close) / ref.close) * 100;
    }
  }
  const yStart = startOfYearISO(last.date);
  const ytdRef = history.find((p) => p.date >= yStart);
  if (ytdRef && ytdRef.close > 0 && ytdRef.date !== last.date) {
    returns.YTD = ((last.close - ytdRef.close) / ytdRef.close) * 100;
  }

  const oneYearAgo = shiftDays(last.date, 365);
  const recent = history.filter((p) => p.date >= oneYearAgo);
  let volatility1Y: number | null = null;
  let zScore1Y: number | null = null;
  let high52w: number | null = null;
  let low52w: number | null = null;

  if (recent.length >= 30) {
    const closes = recent.map((p) => p.close);
    high52w = Math.max(...closes);
    low52w = Math.min(...closes);

    const mean = closes.reduce((s, v) => s + v, 0) / closes.length;
    const variance =
      closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length;
    const stdLevel = Math.sqrt(variance);
    zScore1Y = stdLevel > 0 ? (last.close - mean) / stdLevel : null;

    const logReturns: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const a = recent[i - 1].close;
      const b = recent[i].close;
      if (a > 0 && b > 0) {
        const r = Math.log(b / a);
        if (Math.abs(r) < 0.4) logReturns.push(r);
      }
    }
    if (logReturns.length >= 20) {
      const m = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
      const v =
        logReturns.reduce((s, x) => s + (x - m) ** 2, 0) / logReturns.length;
      volatility1Y = Math.sqrt(v) * Math.sqrt(252) * 100;
    }
  }

  const fiveYearAgo = shiftDays(last.date, 365 * 5);
  const window5y = history.filter((p) => p.date >= fiveYearAgo);
  let drawdownFromHigh5Y: number | null = null;
  if (window5y.length > 0) {
    const peak = window5y.reduce((m, p) => (p.close > m ? p.close : m), -Infinity);
    if (peak > 0) drawdownFromHigh5Y = ((last.close - peak) / peak) * 100;
  }

  return {
    slug,
    pair: meta.pair,
    name: meta.name,
    category: meta.category,
    unitSuffix: meta.unitSuffix,
    decimals: meta.decimals,
    color: meta.color,
    last: last.close,
    lastDate: last.date,
    prevClose: prev?.close ?? null,
    changeDayPct,
    returns,
    volatility1Y,
    drawdownFromHigh5Y,
    high52w,
    low52w,
    zScore1Y,
  };
}

// =============================================================================
// SERIES NORMALISEES & CORRELATIONS
// =============================================================================

export type NormalizedPoint = {
  date: string;
  [slug: string]: number | string;
};

export function buildNormalizedSeries(
  slugs: FxSlug[],
  fromDate: string,
): { points: NormalizedPoint[]; bases: Record<string, number> } {
  if (slugs.length === 0) return { points: [], bases: {} };

  const histories = new Map<FxSlug, FxPoint[]>();
  for (const slug of slugs) {
    const h = loadFxHistory(slug).filter((p) => p.date >= fromDate);
    histories.set(slug, h);
  }

  const firstDates = slugs
    .map((s) => histories.get(s)?.[0]?.date ?? "")
    .filter(Boolean);
  if (firstDates.length === 0) return { points: [], bases: {} };
  const startDate = firstDates.reduce((a, b) => (a > b ? a : b));

  const bases: Record<string, number> = {};
  for (const slug of slugs) {
    const h = histories.get(slug) ?? [];
    const firstAfter = h.find((p) => p.date >= startDate);
    if (firstAfter) bases[slug] = firstAfter.close;
  }

  const dateSet = new Set<string>();
  for (const slug of slugs) {
    const h = histories.get(slug) ?? [];
    for (const p of h) {
      if (p.date >= startDate) dateSet.add(p.date);
    }
  }
  const allDates = Array.from(dateSet).sort();

  const lastIdx: Record<string, number> = {};
  for (const slug of slugs) lastIdx[slug] = -1;

  const points: NormalizedPoint[] = [];
  for (const date of allDates) {
    const point: NormalizedPoint = { date };
    for (const slug of slugs) {
      const h = histories.get(slug) ?? [];
      while (lastIdx[slug] + 1 < h.length && h[lastIdx[slug] + 1].date <= date) {
        lastIdx[slug]++;
      }
      if (lastIdx[slug] >= 0 && bases[slug]) {
        point[slug] = (h[lastIdx[slug]].close / bases[slug]) * 100;
      }
    }
    points.push(point);
  }
  return { points, bases };
}

export function computeCorrelationMatrix(
  slugs: FxSlug[],
  fromDate: string,
): { matrix: (number | null)[][]; labels: string[] } {
  const labels = slugs.map((s) => FX_BY_SLUG[s]?.pair ?? s);
  if (slugs.length === 0) return { matrix: [], labels };

  const dateMaps = slugs.map((slug) => {
    const m = new Map<string, number>();
    for (const p of loadFxHistory(slug)) {
      if (p.date >= fromDate) m.set(p.date, p.close);
    }
    return m;
  });

  let common: Set<string> | null = null;
  for (const m of dateMaps) {
    if (common === null) {
      common = new Set(m.keys());
    } else {
      const next = new Set<string>();
      for (const d of m.keys()) if (common.has(d)) next.add(d);
      common = next;
    }
  }
  const commonDates = Array.from(common ?? []).sort();

  const returns: number[][] = slugs.map(() => []);
  for (let i = 1; i < commonDates.length; i++) {
    const dPrev = commonDates[i - 1];
    const dCurr = commonDates[i];
    for (let j = 0; j < slugs.length; j++) {
      const a = dateMaps[j].get(dPrev);
      const b = dateMaps[j].get(dCurr);
      if (a && b && a > 0 && b > 0) returns[j].push(Math.log(b / a));
      else returns[j].push(NaN);
    }
  }

  function pearson(a: number[], b: number[]): number | null {
    const pairs: [number, number][] = [];
    for (let i = 0; i < a.length; i++) {
      if (isFinite(a[i]) && isFinite(b[i])) pairs.push([a[i], b[i]]);
    }
    if (pairs.length < 30) return null;
    const n = pairs.length;
    const ma = pairs.reduce((s, [x]) => s + x, 0) / n;
    const mb = pairs.reduce((s, [, y]) => s + y, 0) / n;
    let num = 0, da = 0, db = 0;
    for (const [x, y] of pairs) {
      const dx = x - ma;
      const dy = y - mb;
      num += dx * dy;
      da += dx * dx;
      db += dy * dy;
    }
    const denom = Math.sqrt(da * db);
    return denom > 0 ? num / denom : null;
  }

  const matrix: (number | null)[][] = [];
  for (let i = 0; i < slugs.length; i++) {
    const row: (number | null)[] = [];
    for (let j = 0; j < slugs.length; j++) {
      if (i === j) row.push(1);
      else row.push(pearson(returns[i], returns[j]));
    }
    matrix.push(row);
  }
  return { matrix, labels };
}

// =============================================================================
// FCFA TRADE-WEIGHTED INDEX
// =============================================================================
//
// Indice synthetique de la valeur du FCFA face a un panier de devises ponderees
// par leur importance relative dans le commerce exterieur de l'UEMOA. Une
// HAUSSE de l'indice = appreciation du FCFA en termes effectifs nominaux.
//
// Methode : pour chaque paire X/XOF, on calcule (X_0 / X_t)^w (geometric).
// Le produit donne l'indice. Base 100 a fromDate.
//
// EUR n'est pas inclus : la parite EUR/XOF est constante (655,957) donc
// neutre par construction. L'indice mesure la fluctuation de la composante
// non-EUR du FCFA.

export type FxBasketWeight = {
  slug: FxSlug;
  /** Ponderation relative dans le commerce exterieur UEMOA hors zone euro (0..1) */
  weight: number;
  /** Libelle commercial */
  rationale: string;
};

export const FCFA_BASKET: FxBasketWeight[] = [
  // Approximations basees sur la part dans les imports + exports UEMOA hors UE.
  { slug: "USD_XOF", weight: 0.45, rationale: "Petrole + commodities export" },
  { slug: "USD_CNY", weight: 0.18, rationale: "Cote via USD/CNY * USD/XOF" }, // synthetique
  { slug: "NGN_XOF", weight: 0.12, rationale: "Voisin Nigeria" },
  { slug: "GBP_XOF", weight: 0.05, rationale: "UK & cacao Londres" },
  { slug: "JPY_XOF", weight: 0.04, rationale: "Equipement & autos" },
  { slug: "AED_XOF", weight: 0.05, rationale: "Hub Dubai (or, re-export)" },
  { slug: "ZAR_XOF", weight: 0.03, rationale: "Afrique du Sud" },
  { slug: "CAD_XOF", weight: 0.02, rationale: "Canada (mines, cereales)" },
  { slug: "TRY_XOF", weight: 0.03, rationale: "Imports turcs" },
  { slug: "BRL_XOF", weight: 0.03, rationale: "Bresil (concurrent cacao/sucre)" },
];

/**
 * Construit l'indice TWI du FCFA. L'indice est calcule de maniere a ce qu'une
 * VALEUR > 100 corresponde a une APPRECIATION du FCFA.
 *
 * Pour USD_CNY on utilise le cross synthetique CNY/XOF = USD_XOF / USD_CNY.
 */
export function buildFcfaTradeWeightedIndex(fromDate: string): {
  date: string;
  value: number;
}[] {
  // Charger toutes les series necessaires
  const usdXof = loadFxHistory("USD_XOF").filter((p) => p.date >= fromDate);
  const usdCny = loadFxHistory("USD_CNY").filter((p) => p.date >= fromDate);

  const xofPairs = FCFA_BASKET.filter((b) => b.slug !== "USD_CNY");
  const histories = xofPairs.map((b) => ({
    ...b,
    series: loadFxHistory(b.slug).filter((p) => p.date >= fromDate),
  }));
  if (histories.some((h) => h.series.length === 0)) return [];
  if (usdXof.length === 0 || usdCny.length === 0) return [];

  // CNY/XOF synthetique
  const usdCnyByDate = new Map(usdCny.map((p) => [p.date, p.close]));
  const cnyXof: { date: string; close: number }[] = [];
  for (const p of usdXof) {
    const cny = usdCnyByDate.get(p.date);
    if (cny && cny > 0) cnyXof.push({ date: p.date, close: p.close / cny });
  }
  if (cnyXof.length === 0) return [];

  // Date de depart commune
  const allFirsts = [
    ...histories.map((h) => h.series[0].date),
    cnyXof[0].date,
  ];
  const startDate = allFirsts.reduce((a, b) => (a > b ? a : b));

  // Bases
  const bases: Record<string, number> = {};
  for (const h of histories) {
    const first = h.series.find((p) => p.date >= startDate);
    if (first) bases[h.slug] = first.close;
  }
  const baseCny = cnyXof.find((p) => p.date >= startDate)?.close ?? null;
  if (baseCny === null) return [];

  // Index dates : union
  const dateSet = new Set<string>();
  for (const h of histories) {
    for (const p of h.series) if (p.date >= startDate) dateSet.add(p.date);
  }
  for (const p of cnyXof) if (p.date >= startDate) dateSet.add(p.date);
  const dates = Array.from(dateSet).sort();

  // Forward-fill
  const lastIdx: Record<string, number> = {};
  for (const h of histories) lastIdx[h.slug] = -1;
  let lastIdxCny = -1;

  const totalWeight = FCFA_BASKET.reduce((s, w) => s + w.weight, 0);

  const out: { date: string; value: number }[] = [];
  for (const date of dates) {
    let logSum = 0;
    let weightSum = 0;
    for (const h of histories) {
      while (
        lastIdx[h.slug] + 1 < h.series.length &&
        h.series[lastIdx[h.slug] + 1].date <= date
      ) {
        lastIdx[h.slug]++;
      }
      if (lastIdx[h.slug] >= 0 && bases[h.slug]) {
        const ratio = h.series[lastIdx[h.slug]].close / bases[h.slug];
        // ratio > 1 = devise s'apprecie vs FCFA = FCFA se deprecie => contribution NEGATIVE
        logSum += -Math.log(ratio) * h.weight;
        weightSum += h.weight;
      }
    }
    while (
      lastIdxCny + 1 < cnyXof.length &&
      cnyXof[lastIdxCny + 1].date <= date
    ) {
      lastIdxCny++;
    }
    if (lastIdxCny >= 0) {
      const cnyW = FCFA_BASKET.find((b) => b.slug === "USD_CNY")?.weight ?? 0;
      const ratio = cnyXof[lastIdxCny].close / baseCny;
      logSum += -Math.log(ratio) * cnyW;
      weightSum += cnyW;
    }
    if (weightSum > 0) {
      void totalWeight;
      out.push({ date, value: 100 * Math.exp(logSum / weightSum) });
    }
  }
  return out;
}

// =============================================================================
// CROSS-RATES SYNTHETIQUES
// =============================================================================

/**
 * Construit la serie d'un cross synthetique a partir de deux paires XOF :
 *   X / Y = (X / XOF) / (Y / XOF)
 * Utile pour deriver, par ex, GBP/JPY a partir de GBP_XOF et JPY_XOF.
 */
export function buildCrossRate(
  baseSlug: FxSlug,
  quoteSlug: FxSlug,
  fromDate: string,
): { date: string; close: number }[] {
  const baseSeries = loadFxHistory(baseSlug).filter((p) => p.date >= fromDate);
  const quoteSeries = loadFxHistory(quoteSlug).filter((p) => p.date >= fromDate);
  const quoteMap = new Map(quoteSeries.map((p) => [p.date, p.close]));
  const out: { date: string; close: number }[] = [];
  for (const p of baseSeries) {
    const q = quoteMap.get(p.date);
    if (q && q > 0) out.push({ date: p.date, close: p.close / q });
  }
  return out;
}

// =============================================================================
// HELPERS DATE / FORMAT
// =============================================================================

export function periodToFromDate(
  period: "1M" | "3M" | "6M" | "YTD" | "1A" | "3A" | "5A" | "MAX",
  lastDate: string,
): string {
  if (period === "MAX") return "0000-01-01";
  if (period === "YTD") return startOfYearISO(lastDate);
  const days: Record<string, number> = {
    "1M": 30, "3M": 90, "6M": 180, "1A": 365, "3A": 365 * 3, "5A": 365 * 5,
  };
  return shiftDays(lastDate, days[period] ?? 365);
}

export function getLatestFxDate(): string {
  let latest = "";
  for (const meta of FX_PAIRS) {
    const h = loadFxHistory(meta.slug);
    const last = h[h.length - 1]?.date ?? "";
    if (last > latest) latest = last;
  }
  return latest;
}

// =============================================================================
// SAISONNALITE / DRAWDOWN / MOVING AVERAGE (page detail)
// =============================================================================

export type MonthlyPoint = {
  ym: string;
  year: number;
  month: number;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number | null;
};

export function buildMonthlySeries(slug: FxSlug): MonthlyPoint[] {
  const history = loadFxHistory(slug);
  if (history.length === 0) return [];

  const byMonth = new Map<string, FxPoint[]>();
  for (const p of history) {
    const ym = p.date.slice(0, 7);
    const list = byMonth.get(ym) ?? [];
    list.push(p);
    byMonth.set(ym, list);
  }
  const months = Array.from(byMonth.keys()).sort();
  const out: MonthlyPoint[] = [];
  let prevClose: number | null = null;
  for (const ym of months) {
    const pts = byMonth.get(ym)!;
    const open = pts[0].close;
    const close = pts[pts.length - 1].close;
    const high = Math.max(...pts.map((p) => p.high));
    const low = Math.min(...pts.map((p) => p.low));
    const changePct =
      prevClose && prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : null;
    const [yStr, mStr] = ym.split("-");
    out.push({
      ym, year: Number(yStr), month: Number(mStr),
      open, close, high, low, changePct,
    });
    prevClose = close;
  }
  return out;
}

export type SeasonalityCell = {
  year: number;
  month: number;
  changePct: number | null;
};

export function buildSeasonalityMatrix(
  slug: FxSlug,
  yearsBack = 10,
): {
  years: number[];
  cells: SeasonalityCell[];
  monthlyAverages: (number | null)[];
  hitRate: (number | null)[];
} {
  const monthly = buildMonthlySeries(slug);
  if (monthly.length === 0) {
    return { years: [], cells: [], monthlyAverages: [], hitRate: [] };
  }
  const lastYear = monthly[monthly.length - 1].year;
  const startYear = lastYear - yearsBack + 1;
  const filtered = monthly.filter((m) => m.year >= startYear);
  const years: number[] = [];
  for (let y = startYear; y <= lastYear; y++) years.push(y);

  const map = new Map<string, MonthlyPoint>();
  for (const m of filtered) map.set(`${m.year}-${m.month}`, m);

  const cells: SeasonalityCell[] = [];
  for (const y of years) {
    for (let m = 1; m <= 12; m++) {
      const cell = map.get(`${y}-${m}`);
      cells.push({ year: y, month: m, changePct: cell?.changePct ?? null });
    }
  }

  const monthlyAverages: (number | null)[] = [];
  const hitRate: (number | null)[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = cells
      .filter((c) => c.month === m && c.changePct !== null)
      .map((c) => c.changePct as number);
    if (vals.length === 0) {
      monthlyAverages.push(null);
      hitRate.push(null);
    } else {
      monthlyAverages.push(vals.reduce((s, v) => s + v, 0) / vals.length);
      hitRate.push((vals.filter((v) => v > 0).length / vals.length) * 100);
    }
  }
  return { years, cells, monthlyAverages, hitRate };
}

export function buildDrawdownSeries(
  slug: FxSlug,
  fromDate: string,
): { date: string; drawdown: number }[] {
  const history = loadFxHistory(slug).filter((p) => p.date >= fromDate);
  const out: { date: string; drawdown: number }[] = [];
  let peak = -Infinity;
  for (const p of history) {
    if (p.close > peak) peak = p.close;
    const dd = peak > 0 ? ((p.close - peak) / peak) * 100 : 0;
    out.push({ date: p.date, drawdown: dd });
  }
  return out;
}

export function buildMovingAverage(
  slug: FxSlug,
  fromDate: string,
  window: number,
): { date: string; ma: number | null }[] {
  const history = loadFxHistory(slug);
  const out: { date: string; ma: number | null }[] = [];
  let sum = 0;
  const buf: number[] = [];
  for (const p of history) {
    buf.push(p.close);
    sum += p.close;
    if (buf.length > window) sum -= buf.shift()!;
    if (p.date < fromDate) continue;
    out.push({ date: p.date, ma: buf.length >= window ? sum / window : null });
  }
  return out;
}
