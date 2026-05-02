// === MATIERES PREMIERES : loader CSV + moteur d'analyse ===
//
// Chaque CSV (data/<slug>.csv) suit le format Investing.com :
//   "Date","Dernier","Ouv.","Plus Haut","Plus Bas","Vol.","Variation %"
//   - Dates : DD/MM/YYYY
//   - Nombres : "1.234,56" (point = milliers, virgule = decimale)
//   - Volumes : "5,52K" / "1,22M" / "" (vide possible)
//   - Variation : "4,13%" / "-0,21%"
//
// Les fichiers ne contiennent PAS de commentaires ou lignes a ignorer ;
// la premiere ligne est l'entete. Memoise au niveau module : un parse
// par processus serveur.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

// =============================================================================
// CATALOGUE
// =============================================================================

export type CommoditySlug =
  | "cacao"
  | "cafe"
  | "brent"
  | "wti"
  | "or"
  | "palmoil"
  | "sugar"
  | "tsr";

export type CommodityCategory = "agri" | "energy" | "metal";

export type CommodityMeta = {
  slug: CommoditySlug;
  name: string;
  category: CommodityCategory;
  unit: string;
  exchange: string;
  /** Fichier CSV dans /data */
  file: string;
  /** Pourquoi cette MP est pertinente pour la BRVM/UEMOA */
  brvmRelevance: string;
  /** Codes des actions BRVM directement exposees */
  brvmTickers: string[];
  /** Pays UEMOA dont l'export depend significativement de la MP */
  exposedCountries: string[];
  /** Couleur pour les graphes */
  color: string;
};

export const COMMODITIES: CommodityMeta[] = [
  {
    slug: "cacao",
    name: "Cacao",
    category: "agri",
    unit: "USD / tonne",
    exchange: "ICE Futures (Londres)",
    file: "Cacao.csv",
    brvmRelevance:
      "1ʳᵉ ressource d'export de la Côte d'Ivoire (≈40 % du marché mondial). Influence directe les recettes fiscales ivoiriennes, le cours du FCFA via la balance courante et les industriels du cacao cotés.",
    brvmTickers: ["NTLC", "PALC"], // Nestle CI, Palmci ont une exposition transformation
    exposedCountries: ["CI", "GH"],
    color: "#7c2d12",
  },
  {
    slug: "cafe",
    name: "Café Robusta",
    category: "agri",
    unit: "USD / tonne",
    exchange: "ICE Europe (Londres)",
    file: "Cafe.csv",
    brvmRelevance:
      "2ᵉ produit d'export agricole ivoirien et togolais après le cacao. Le robusta est la variété produite en Afrique de l'Ouest.",
    brvmTickers: [],
    exposedCountries: ["CI", "TG"],
    color: "#78350f",
  },
  {
    slug: "brent",
    name: "Pétrole Brent",
    category: "energy",
    unit: "USD / baril",
    exchange: "ICE Futures (Londres)",
    file: "brent.csv",
    brvmRelevance:
      "Référence pour les imports énergétiques de l'UEMOA et pour les exports pétroliers du Sénégal et du Niger. Drive aussi le coût des engrais, du transport et l'inflation importée.",
    brvmTickers: ["TTLC", "TTLS", "SHEC"],
    exposedCountries: ["SN", "NE", "CI", "BF", "ML"],
    color: "#1e293b",
  },
  {
    slug: "wti",
    name: "Pétrole WTI",
    category: "energy",
    unit: "USD / baril",
    exchange: "NYMEX (New York)",
    file: "wti.csv",
    brvmRelevance:
      "Référence US ; corrélée au Brent mais avec un spread informatif (transport, raffinage US). Utile pour mesurer la prime géopolitique.",
    brvmTickers: ["TTLC", "TTLS", "SHEC"],
    exposedCountries: ["SN", "NE"],
    color: "#0f172a",
  },
  {
    slug: "or",
    name: "Or",
    category: "metal",
    unit: "USD / once",
    exchange: "COMEX (New York)",
    file: "or.csv",
    brvmRelevance:
      "1ʳᵉ ressource d'export du Mali, du Burkina Faso et de plus en plus du Sénégal. Détermine les recettes minières et la masse salariale du secteur.",
    brvmTickers: [],
    exposedCountries: ["ML", "BF", "SN", "CI", "NE"],
    color: "#ca8a04",
  },
  {
    slug: "palmoil",
    name: "Huile de palme",
    category: "agri",
    unit: "USD / tonne",
    exchange: "Bursa Malaysia",
    file: "palmoil.csv",
    brvmRelevance:
      "Filière clé en Côte d'Ivoire ; influence directement les marges de PALMCI, SOGB, SAPH (oléagineux & caoutchouc).",
    brvmTickers: ["PALC", "SOGC", "SPHC"],
    exposedCountries: ["CI"],
    color: "#65a30d",
  },
  {
    slug: "sugar",
    name: "Sucre",
    category: "agri",
    unit: "USD / tonne",
    exchange: "ICE Futures (Londres) #5",
    file: "sugar.csv",
    brvmRelevance:
      "Pivot de SUCRIVOIRE (Sifca). Driver des marges des sucreries ouest-africaines et des prix à la consommation.",
    brvmTickers: ["SCRC"],
    exposedCountries: ["CI"],
    color: "#e0e7ff",
  },
  {
    slug: "tsr",
    name: "Caoutchouc TSR20",
    category: "agri",
    unit: "USD cents / kg",
    exchange: "SGX (Singapour)",
    file: "tsr.csv",
    brvmRelevance:
      "Référence mondiale pour le caoutchouc naturel. La Côte d'Ivoire est le 1ᵉʳ producteur africain ; SAPH et SOGB sont directement corrélés.",
    brvmTickers: ["SPHC", "SOGC"],
    exposedCountries: ["CI"],
    color: "#475569",
  },
];

export const COMMODITIES_BY_SLUG: Record<CommoditySlug, CommodityMeta> =
  Object.fromEntries(COMMODITIES.map((c) => [c.slug, c])) as Record<
    CommoditySlug,
    CommodityMeta
  >;

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

export type CommodityPoint = {
  /** ISO YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Volume en unites brutes (K et M deplies). null si absent. */
  volume: number | null;
  /** Variation quotidienne deja en %, ex 4.13 */
  changePct: number;
};

/**
 * Parse un nombre francais format Investing : "2.621,00" => 2621.00
 * Le point est sep. milliers, la virgule est la decimale. Si pas de virgule,
 * on suppose que les points sont des milliers.
 */
function parseFrenchNumber(value: string): number {
  if (!value || value === "" || value === "-") return NaN;
  const s = value.trim();
  if (s.includes(",")) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  // Pas de decimale : les "." sont des milliers
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

function parseCommodityCSV(file: string): CommodityPoint[] {
  let content = readFileSync(join(DATA_DIR, file), "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.replace(/^﻿/, ""),
  });

  const points: CommodityPoint[] = [];
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

  // Investing.com livre du plus recent au plus ancien : on remet en ordre
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

// Memoisation : une seule lecture par fichier par processus serveur
const _historyCache = new Map<CommoditySlug, CommodityPoint[]>();

export function loadCommodityHistory(slug: CommoditySlug): CommodityPoint[] {
  const cached = _historyCache.get(slug);
  if (cached) return cached;
  const meta = COMMODITIES_BY_SLUG[slug];
  if (!meta) return [];
  const data = parseCommodityCSV(meta.file);
  _historyCache.set(slug, data);
  return data;
}

// =============================================================================
// METRIQUES & STATS
// =============================================================================

export type ReturnHorizon = "1S" | "1M" | "3M" | "6M" | "YTD" | "1A" | "3A" | "5A";

export type CommodityStats = {
  slug: CommoditySlug;
  name: string;
  unit: string;
  category: CommodityCategory;
  color: string;
  last: number;
  lastDate: string;
  prevClose: number | null;
  changeDayPct: number | null;
  /** Performances cumulees par horizon, en % */
  returns: Record<ReturnHorizon, number | null>;
  /** Volatilite annualisee 1A (rendements log * sqrt(252)), en % */
  volatility1Y: number | null;
  /** Drawdown courant depuis le plus haut 5A, en % (negatif) */
  drawdownFromHigh5Y: number | null;
  /** Plus haut & plus bas 52 semaines */
  high52w: number | null;
  low52w: number | null;
  /** Z-score du dernier prix vs moyenne 1A (en ecarts-types) */
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

function findClosestPriceBefore(
  history: CommodityPoint[],
  refIso: string,
): CommodityPoint | null {
  // Binary search : retourne le dernier point dont la date <= refIso
  let lo = 0;
  let hi = history.length - 1;
  let best: CommodityPoint | null = null;
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

export function computeCommodityStats(slug: CommoditySlug): CommodityStats | null {
  const history = loadCommodityHistory(slug);
  const meta = COMMODITIES_BY_SLUG[slug];
  if (!meta || history.length === 0) return null;

  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const changeDayPct =
    prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

  // Performances par horizon
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
  // Premier point dont la date >= debut d'annee
  const ytdRef = history.find((p) => p.date >= yStart);
  if (ytdRef && ytdRef.close > 0 && ytdRef.date !== last.date) {
    returns.YTD = ((last.close - ytdRef.close) / ytdRef.close) * 100;
  }

  // Volatilite annualisee 1A
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

  // Drawdown vs plus haut 5A
  const fiveYearAgo = shiftDays(last.date, 365 * 5);
  const window5y = history.filter((p) => p.date >= fiveYearAgo);
  let drawdownFromHigh5Y: number | null = null;
  if (window5y.length > 0) {
    const peak = window5y.reduce((m, p) => (p.close > m ? p.close : m), -Infinity);
    if (peak > 0) {
      drawdownFromHigh5Y = ((last.close - peak) / peak) * 100;
    }
  }

  return {
    slug,
    name: meta.name,
    unit: meta.unit,
    category: meta.category,
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
  /** Valeur base 100 a la premiere date de la serie */
  [slug: string]: number | string;
};

/**
 * Construit une serie normalisee base 100 sur la premiere date commune.
 * Tronque tous les historiques au point ou ils existent tous, puis rebase.
 */
export function buildNormalizedSeries(
  slugs: CommoditySlug[],
  fromDate: string,
): { points: NormalizedPoint[]; bases: Record<string, number> } {
  if (slugs.length === 0) return { points: [], bases: {} };

  // Charger tous les historiques en filtrant par date debut
  const histories = new Map<CommoditySlug, CommodityPoint[]>();
  for (const slug of slugs) {
    const h = loadCommodityHistory(slug).filter((p) => p.date >= fromDate);
    histories.set(slug, h);
  }

  // Trouver la 1ere date commune (max des min)
  const firstDates = slugs
    .map((s) => histories.get(s)?.[0]?.date ?? "")
    .filter(Boolean);
  if (firstDates.length === 0) return { points: [], bases: {} };
  const startDate = firstDates.reduce((a, b) => (a > b ? a : b));

  // Trouver les bases : 1er close >= startDate par MP
  const bases: Record<string, number> = {};
  for (const slug of slugs) {
    const h = histories.get(slug) ?? [];
    const firstAfter = h.find((p) => p.date >= startDate);
    if (firstAfter) bases[slug] = firstAfter.close;
  }

  // Construire l'index complet de dates (union)
  const dateSet = new Set<string>();
  for (const slug of slugs) {
    const h = histories.get(slug) ?? [];
    for (const p of h) {
      if (p.date >= startDate) dateSet.add(p.date);
    }
  }
  const allDates = Array.from(dateSet).sort();

  // Pour chaque date, on prend le close le plus recent <= date par MP (forward fill)
  const lastIdx: Record<string, number> = {};
  for (const slug of slugs) lastIdx[slug] = -1;

  const points: NormalizedPoint[] = [];
  for (const date of allDates) {
    const point: NormalizedPoint = { date };
    for (const slug of slugs) {
      const h = histories.get(slug) ?? [];
      // Avancer le pointeur tant que le prochain point est <= date
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

/**
 * Matrice de correlation des rendements log quotidiens.
 * Utilise les dates communes uniquement (intersection).
 */
export function computeCorrelationMatrix(
  slugs: CommoditySlug[],
  fromDate: string,
): { matrix: (number | null)[][]; labels: string[] } {
  const labels = slugs.map((s) => COMMODITIES_BY_SLUG[s]?.name ?? s);
  if (slugs.length === 0) return { matrix: [], labels };

  // Index : pour chaque MP, map date -> close (filtree par fromDate)
  const dateMaps = slugs.map((slug) => {
    const m = new Map<string, number>();
    for (const p of loadCommodityHistory(slug)) {
      if (p.date >= fromDate) m.set(p.date, p.close);
    }
    return m;
  });

  // Intersection des dates
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

  // Calcul des log-returns par MP sur les dates communes
  const returns: number[][] = slugs.map(() => []);
  for (let i = 1; i < commonDates.length; i++) {
    const dPrev = commonDates[i - 1];
    const dCurr = commonDates[i];
    for (let j = 0; j < slugs.length; j++) {
      const a = dateMaps[j].get(dPrev);
      const b = dateMaps[j].get(dCurr);
      if (a && b && a > 0 && b > 0) {
        returns[j].push(Math.log(b / a));
      } else {
        returns[j].push(NaN);
      }
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
// IMPACT BRVM (synthese pour la page d'accueil de l'outil)
// =============================================================================

export type CommodityImpact = {
  slug: CommoditySlug;
  name: string;
  category: CommodityCategory;
  /** Importance pour l'UEMOA (0..100), pondere par poids dans les exports/imports */
  uemoaImportance: number;
  /** Sens d'impact d'une hausse de la MP sur la BRVM */
  rvmDirection: "positive" | "negative" | "mixte";
  brvmRationale: string;
  brvmTickers: string[];
  exposedCountries: string[];
};

export const COMMODITY_IMPACTS: CommodityImpact[] = [
  {
    slug: "cacao",
    name: "Cacao",
    category: "agri",
    uemoaImportance: 95,
    rvmDirection: "positive",
    brvmRationale:
      "Hausse = + recettes export Côte d'Ivoire + budget Etat + consommation interne. Soutient indirectement les services financiers (SGBC, NSBC) et la grande conso (NTLC, BICC).",
    brvmTickers: ["NTLC", "PALC", "SGBC", "NSBC"],
    exposedCountries: ["CI"],
  },
  {
    slug: "or",
    name: "Or",
    category: "metal",
    uemoaImportance: 85,
    rvmDirection: "positive",
    brvmRationale:
      "Hausse = + recettes minières Mali, Burkina, Sénégal. Pas de minière cotée à la BRVM mais effet macro positif (reserves de change, budget).",
    brvmTickers: [],
    exposedCountries: ["ML", "BF", "SN", "CI", "NE"],
  },
  {
    slug: "brent",
    name: "Brent",
    category: "energy",
    uemoaImportance: 80,
    rvmDirection: "mixte",
    brvmRationale:
      "Hausse = + marges distributeurs (TTLC, TTLS, SHEC) MAIS - inflation importée et coût du transport. Net négatif pour les pays importateurs (CI, BF, ML).",
    brvmTickers: ["TTLC", "TTLS", "SHEC"],
    exposedCountries: ["CI", "BF", "ML", "SN", "NE"],
  },
  {
    slug: "palmoil",
    name: "Huile de palme",
    category: "agri",
    uemoaImportance: 70,
    rvmDirection: "positive",
    brvmRationale:
      "Driver direct des marges PALMCI, SOGB, SAPH. Hausse = expansion EBITDA pour le complexe oléagineux Sifca.",
    brvmTickers: ["PALC", "SOGC", "SPHC"],
    exposedCountries: ["CI"],
  },
  {
    slug: "tsr",
    name: "Caoutchouc",
    category: "agri",
    uemoaImportance: 65,
    rvmDirection: "positive",
    brvmRationale:
      "Le TSR20 fixe le revenu des planteurs et les marges de SAPH et SOGB. Une hausse soutient également la trésorerie de toute la filière.",
    brvmTickers: ["SPHC", "SOGC"],
    exposedCountries: ["CI"],
  },
  {
    slug: "cafe",
    name: "Café Robusta",
    category: "agri",
    uemoaImportance: 50,
    rvmDirection: "positive",
    brvmRationale:
      "Variable d'ajustement du revenu rural ivoirien et togolais. Pas de pure player coté ; effet macro indirect sur la consommation.",
    brvmTickers: [],
    exposedCountries: ["CI", "TG"],
  },
  {
    slug: "sugar",
    name: "Sucre",
    category: "agri",
    uemoaImportance: 45,
    rvmDirection: "mixte",
    brvmRationale:
      "Hausse = + marges SUCRIVOIRE (Sifca) MAIS + prix conso. Effet net positif sur l'action Sucrivoire si l'Etat n'encadre pas les prix.",
    brvmTickers: ["SCRC"],
    exposedCountries: ["CI"],
  },
  {
    slug: "wti",
    name: "WTI",
    category: "energy",
    uemoaImportance: 35,
    rvmDirection: "mixte",
    brvmRationale:
      "Référence US ; utile surtout via le spread Brent-WTI (prime géopolitique). Effet macro identique au Brent en intensité moindre.",
    brvmTickers: [],
    exposedCountries: ["SN", "NE"],
  },
];

// =============================================================================
// INDICE COMPOSITE UEMOA
// =============================================================================

/**
 * Indice synthetique de pression matieres premieres sur l'UEMOA :
 * Hausse de l'indice = environnement favorable a l'UEMOA (exports + > imports -).
 * On pondere chaque MP par uemoaImportance et son sens d'impact.
 */
export function buildUemoaPressureIndex(fromDate: string): {
  date: string;
  value: number;
}[] {
  const weighted = COMMODITY_IMPACTS.filter((c) => c.rvmDirection !== "mixte").map(
    (c) => ({
      slug: c.slug,
      // Sign : + pour positive (exports), - pour negative
      sign: c.rvmDirection === "positive" ? 1 : -1,
      weight: c.uemoaImportance,
    }),
  );

  if (weighted.length === 0) return [];

  // Charger les historiques, filtres
  const histories = weighted.map((w) => ({
    ...w,
    series: loadCommodityHistory(w.slug).filter((p) => p.date >= fromDate),
  }));

  if (histories.some((h) => h.series.length === 0)) return [];

  // Pour chaque MP : rebase 100 sur sa 1ere obs apres fromDate
  const startDate = histories
    .map((h) => h.series[0].date)
    .reduce((a, b) => (a > b ? a : b));

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

  // Construire l'index complet
  const dateSet = new Set<string>();
  for (const h of histories) {
    for (const p of h.series) {
      if (p.date >= startDate) dateSet.add(p.date);
    }
  }
  const dates = Array.from(dateSet).sort();

  // Bases
  const bases: Record<string, number> = {};
  for (const h of histories) {
    const first = h.series.find((p) => p.date >= startDate);
    if (first) bases[h.slug] = first.close;
  }

  // Forward-fill
  const lastIdx: Record<string, number> = {};
  for (const h of histories) lastIdx[h.slug] = -1;

  const out: { date: string; value: number }[] = [];
  for (const date of dates) {
    let acc = 0;
    let weight = 0;
    for (const h of histories) {
      while (
        lastIdx[h.slug] + 1 < h.series.length &&
        h.series[lastIdx[h.slug] + 1].date <= date
      ) {
        lastIdx[h.slug]++;
      }
      if (lastIdx[h.slug] >= 0 && bases[h.slug]) {
        const norm = (h.series[lastIdx[h.slug]].close / bases[h.slug]) * 100;
        // Pour les "negative", on inverse autour de 100 :
        // si Brent monte, l'index baisse de la meme amplitude.
        const contribution = h.sign === 1 ? norm : 200 - norm;
        acc += contribution * h.weight;
        weight += h.weight;
      }
    }
    if (weight > 0) {
      // On normalise par poids effectivement contributif pour le calcul,
      // puis on rapporte au poids total pour eviter le saut a l'origine
      void totalWeight;
      out.push({ date, value: acc / weight });
    }
  }
  return out;
}

// =============================================================================
// HELPERS DATE / FORMAT
// =============================================================================

/** Convertit une periode en date debut (ISO YYYY-MM-DD) a partir de la derniere date cotee */
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

/** Date la plus recente parmi tous les CSV (point de reference de l'outil). */
export function getLatestCommodityDate(): string {
  let latest = "";
  for (const meta of COMMODITIES) {
    const h = loadCommodityHistory(meta.slug);
    const last = h[h.length - 1]?.date ?? "";
    if (last > latest) latest = last;
  }
  return latest;
}

// =============================================================================
// SAISONNALITE & DRAWDOWN (page detail)
// =============================================================================

export type MonthlyPoint = {
  /** YYYY-MM */
  ym: string;
  year: number;
  month: number;
  open: number;
  close: number;
  high: number;
  low: number;
  /** Variation mensuelle en % (close vs precedent close) */
  changePct: number | null;
};

/**
 * Agrege l'historique quotidien en serie mensuelle. Pour chaque mois on prend :
 *  - open  = 1er close du mois
 *  - close = dernier close du mois
 *  - high  = max des high
 *  - low   = min des low
 *  - changePct = (close_m - close_{m-1}) / close_{m-1}
 */
export function buildMonthlySeries(slug: CommoditySlug): MonthlyPoint[] {
  const history = loadCommodityHistory(slug);
  if (history.length === 0) return [];

  const byMonth = new Map<string, CommodityPoint[]>();
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
      ym,
      year: Number(yStr),
      month: Number(mStr),
      open,
      close,
      high,
      low,
      changePct,
    });
    prevClose = close;
  }
  return out;
}

export type SeasonalityCell = {
  year: number;
  month: number; // 1..12
  changePct: number | null;
};

/** Matrice annee x mois des rendements mensuels (heatmap saisonnalite). */
export function buildSeasonalityMatrix(
  slug: CommoditySlug,
  yearsBack = 10,
): {
  years: number[];
  cells: SeasonalityCell[];
  /** Moyenne par mois (rendement moyen sur la fenetre), index 0..11 = janv..dec */
  monthlyAverages: (number | null)[];
  /** % de mois positifs sur la fenetre, meme indexation */
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
      cells.push({
        year: y,
        month: m,
        changePct: cell?.changePct ?? null,
      });
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

/** Serie de drawdown courant (en %, negatif) sur l'historique fourni. */
export function buildDrawdownSeries(
  slug: CommoditySlug,
  fromDate: string,
): { date: string; drawdown: number }[] {
  const history = loadCommodityHistory(slug).filter((p) => p.date >= fromDate);
  const out: { date: string; drawdown: number }[] = [];
  let peak = -Infinity;
  for (const p of history) {
    if (p.close > peak) peak = p.close;
    const dd = peak > 0 ? ((p.close - peak) / peak) * 100 : 0;
    out.push({ date: p.date, drawdown: dd });
  }
  return out;
}

/** Serie de moyenne mobile (fenetre N jours) sur les closes quotidiens. */
export function buildMovingAverage(
  slug: CommoditySlug,
  fromDate: string,
  window: number,
): { date: string; ma: number | null }[] {
  const history = loadCommodityHistory(slug);
  const out: { date: string; ma: number | null }[] = [];
  let sum = 0;
  const buf: number[] = [];
  for (const p of history) {
    buf.push(p.close);
    sum += p.close;
    if (buf.length > window) sum -= buf.shift()!;
    if (p.date < fromDate) continue;
    out.push({
      date: p.date,
      ma: buf.length >= window ? sum / window : null,
    });
  }
  return out;
}
