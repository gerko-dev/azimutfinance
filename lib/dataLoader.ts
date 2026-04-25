// === CHARGEMENT DES DONNEES CSV ===

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import type { Bond, BondCountry, IssuanceResult } from "./bondsUEMOA";

const DATA_DIR = join(process.cwd(), "data");

function parseCSV<T>(filename: string): T[] {
  const filePath = join(DATA_DIR, filename);
  let content = readFileSync(filePath, "utf-8");

  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const result = Papa.parse<T>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  return result.data;
}

export type StockRow = {
  code: string;
  name: string;
  sector: string;
  country: string;
  isin: string;
  price: string;
  change: string;
  changePercent: string;
  volume: string;
  capitalization: string;
  sharesOutstanding: string;
  float: string;
  per: string;
  yield: string;
  high52w: string;
  low52w: string;
  yearChange: string;
  volatility: string;
  description: string;
};

type BondCSVRow = {
  isin: string;
  nameShort: string;
  issuer: string;
  country: BondCountry;
  type: "OAT" | "OTAR" | "BAT" | "Corporate";
  nominalValue: string;
  couponRate: string;
  issueDate: string;
  maturityDate: string;
  frequency: string;
};

type IssuanceCSVRow = {
  date: string;
  country: BondCountry;
  isin: string;
  type: "OAT" | "OTAR" | "BAT";
  maturity: string;
  amount: string;
  weightedAvgYield: string;
};

type PriceHistoryRow = {
  code: string;
  date: string;
  value: string;
};

/**
 * Parse un nombre en acceptant les formats :
 * - 12345.67 (standard)
 * - 12 345,67 (francais avec espace milliers + virgule decimale)
 * - 1,23E+11 (notation scientifique francaise d'Excel)
 * - 1.23E+11 (notation scientifique standard)
 * - NC, "", "-" => defaultValue
 */
function parseNum(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const str = String(value).trim();
  if (str === "" || str === "NC" || str === "-") return defaultValue;

  const scientificFrench = /^-?\d+,\d+[eE][+-]?\d+$/;
  if (scientificFrench.test(str)) {
    const cleaned = str.replace(",", ".");
    const n = Number(cleaned);
    return isNaN(n) ? defaultValue : n;
  }

  const cleaned = str.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return isNaN(n) ? defaultValue : n;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str = String(value).trim();
  return str !== "" && str !== "NC" && str !== "-";
}

export function loadStocks(): StockRow[] {
  return parseCSV<StockRow>("titres.csv");
}

export function loadBonds(): Bond[] {
  const rows = parseCSV<BondCSVRow>("obligations.csv");
  return rows.map((r) => ({
    isin: r.isin?.trim() || "",
    nameShort: r.nameShort?.trim() || "",
    issuer: r.issuer?.trim() || "",
    country: r.country as BondCountry,
    type: r.type,
    nominalValue: parseNum(r.nominalValue, 10000),
    couponRate: parseNum(r.couponRate) / 100,
    issueDate: r.issueDate,
    maturityDate: r.maturityDate,
    frequency: parseNum(r.frequency, 1) as 1 | 2 | 4,
    isin_registered: true,
  }));
}

export function loadIssuances(): IssuanceResult[] {
  const rows = parseCSV<IssuanceCSVRow>("emissions.csv");
  return rows.map((r) => ({
    date: r.date,
    country: r.country as BondCountry,
    isin: r.isin?.trim() || "",
    type: r.type,
    maturity: parseNum(r.maturity),
    amount: parseNum(r.amount),
    weightedAvgYield: parseNum(r.weightedAvgYield) / 100,
  }));
}

export function loadPriceHistory(code: string): { date: string; value: number }[] {
  const allRows = parseCSV<PriceHistoryRow>("historique-prix.csv");
  return allRows
    .filter((r) => r.code?.trim().toUpperCase() === code.toUpperCase())
    .map((r) => ({ date: r.date, value: parseNum(r.value) }));
}

export function formatStockForUI(s: StockRow) {
  const price = parseNum(s.price);
  const change = parseNum(s.change);
  const changePercentValue = parseNum(s.changePercent) * 100;
  const up = change >= 0;

  return {
    code: s.code?.trim() || "",
    sector: s.sector?.trim() || "",
    price: price > 0 ? price.toLocaleString("fr-FR").replace(/,/g, " ") : "NC",
    change: isPresent(s.changePercent)
      ? (changePercentValue >= 0 ? "+" : "") + changePercentValue.toFixed(2) + "%"
      : "NC",
    up,
    volume: isPresent(s.volume)
      ? parseNum(s.volume).toLocaleString("fr-FR").replace(/,/g, " ")
      : "NC",
    capi: isPresent(s.capitalization)
      ? Math.round(parseNum(s.capitalization) / 1000000)
          .toLocaleString("fr-FR")
          .replace(/,/g, " ")
      : "NC",
    per: isPresent(s.per) ? parseNum(s.per).toFixed(1) : "NC",
    yield: isPresent(s.yield) ? (parseNum(s.yield) * 100).toFixed(2) + "%" : "NC",
  };
}

export function loadStockByCode(code: string): StockRow | undefined {
  const stocks = loadStocks();
  return stocks.find((s) => s.code?.trim().toUpperCase() === code.toUpperCase());
}

export function getStockDetails(code: string) {
  const s = loadStockByCode(code);
  if (!s) return null;

  const price = parseNum(s.price);
  const change = parseNum(s.change);
  const changePercent = parseNum(s.changePercent) * 100;
  const high52w = parseNum(s.high52w);
  const low52w = parseNum(s.low52w);
  const yearChange = parseNum(s.yearChange) * 100;
  const volatility = parseNum(s.volatility) * 100;
  const capitalization = parseNum(s.capitalization);
  const sharesOutstanding = parseNum(s.sharesOutstanding);
  const floatValue = parseNum(s.float);
  const per = parseNum(s.per);
  const stockYield = parseNum(s.yield) * 100;
  const volume = parseNum(s.volume);

  return {
    code: s.code?.trim() || "",
    name: s.name?.trim() || "",
    sector: s.sector?.trim() || "",
    country: s.country?.trim() || "",
    isin: s.isin?.trim() || "",
    description: s.description?.trim() || "",
    price,
    change,
    changePercent,
    volume,
    capitalization,
    sharesOutstanding,
    float: floatValue,
    per,
    yield: stockYield,
    high52w,
    low52w,
    yearChange,
    volatility,
    hasPer: isPresent(s.per),
    hasYield: isPresent(s.yield),
    hasYearChange: isPresent(s.yearChange),
    hasVolume: isPresent(s.volume),
  };
}

// ==========================================
// OBLIGATIONS COTEES BRVM
// ==========================================

import type {
  ListedBond,
  ListedBondPrice,
  ListedBondEvent,
  MarketStats,
} from "./listedBondsTypes";

type ListedBondCSVRow = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  currency: string;
  nominalValue: string;
  totalIssued: string;
  outstanding: string;
  couponRate: string;
  couponFrequency: string;
  issueDate: string;
  maturityDate: string;
  firstAmortizationDate: string;
  amortizationType: string;
  rating: string;
  ratingAgency: string;
  callable: string;
  callDate: string;
  greenBond: string;
  description: string;
};

type ListedBondPriceRow = {
  isin: string;
  date: string;
  cleanPrice: string;
  dirtyPrice: string;
  volume: string;
  transactions: string;
};

type ListedBondEventRow = {
  isin: string;
  date: string;
  eventType: string;
  amount: string;
  description: string;
};

function parseDate(s: string): Date {
  if (!s || s.trim() === "") return new Date(NaN);
  const clean = s.trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split(/[/-]/).map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? new Date(NaN) : fallback;
}

function calculateYearsToMaturity(maturityDate: string): number {
  const maturity = parseDate(maturityDate);
  if (isNaN(maturity.getTime())) return 0;
  const now = new Date();
  const diffMs = maturity.getTime() - now.getTime();
  return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

function normalizeDateISO(s: string): string {
  if (!s || s.trim() === "") return "";
  const d = parseDate(s);
  if (isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeAmortizationType(value: string): "IF" | "AC" | "ACD" {
  const v = (value || "").trim().toUpperCase();
  if (v === "IF") return "IF";
  if (v === "ACD") return "ACD";
  return "AC";
}

export function loadListedBonds(): ListedBond[] {
  const rows = parseCSV<ListedBondCSVRow>("obligations-cotees.csv");
  return rows.map((r) => {
    const maturityISO = normalizeDateISO(r.maturityDate);
    return {
      isin: r.isin?.trim() || "",
      code: r.code?.trim() || "",
      name: r.name?.trim() || "",
      issuer: r.issuer?.trim() || "",
      issuerType: r.issuerType?.trim() || "Autre",
      country: r.country?.trim() || "",
      sector: r.sector?.trim() || "",
      currency: r.currency?.trim() || "XOF",
      nominalValue: parseNum(r.nominalValue, 10000),
      totalIssued: parseNum(r.totalIssued),
      outstanding: parseNum(r.outstanding),
      couponRate: parseNum(r.couponRate) / 100,
      couponFrequency: parseNum(r.couponFrequency, 1) as 1 | 2 | 4,
      issueDate: normalizeDateISO(r.issueDate),
      maturityDate: maturityISO,
      firstAmortizationDate: normalizeDateISO(r.firstAmortizationDate),
      amortizationType: normalizeAmortizationType(r.amortizationType),
      rating: r.rating?.trim() || "",
      ratingAgency: r.ratingAgency?.trim() || "",
      callable: r.callable?.trim().toLowerCase() === "true",
      callDate: normalizeDateISO(r.callDate),
      greenBond: r.greenBond?.trim().toLowerCase() === "true",
      description: r.description?.trim() || "",
      yearsToMaturity: calculateYearsToMaturity(maturityISO),
    };
  });
}

export function loadListedBondPrices(): ListedBondPrice[] {
  const rows = parseCSV<ListedBondPriceRow>("obligations-cotees-prix.csv");
  return rows.map((r) => ({
    isin: r.isin?.trim() || "",
    date: normalizeDateISO(r.date),
    cleanPrice: parseNum(r.cleanPrice),
    dirtyPrice: parseNum(r.dirtyPrice),
    volume: parseNum(r.volume),
    transactions: parseNum(r.transactions),
  }));
}

export function loadListedBondEvents(): ListedBondEvent[] {
  const rows = parseCSV<ListedBondEventRow>("obligations-cotees-evenements.csv");
  return rows.map((r) => ({
    isin: r.isin?.trim() || "",
    date: normalizeDateISO(r.date),
    eventType: (r.eventType?.trim() || "coupon") as ListedBondEvent["eventType"],
    amount: parseNum(r.amount),
    description: r.description?.trim() || "",
  }));
}

export function getMarketStats(bonds: ListedBond[]): MarketStats {
  const totalBonds = bonds.length;
  const totalOutstanding = bonds.reduce((sum, b) => sum + b.outstanding, 0);
  const weightedYield =
    totalOutstanding > 0
      ? bonds.reduce((sum, b) => sum + b.couponRate * b.outstanding, 0) /
        totalOutstanding
      : 0;
  const averageDuration =
    totalOutstanding > 0
      ? bonds.reduce((sum, b) => sum + b.yearsToMaturity * b.outstanding, 0) /
        totalOutstanding
      : 0;

  const byCountry = bonds.reduce((acc, b) => {
    acc[b.country] = (acc[b.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byType = bonds.reduce((acc, b) => {
    acc[b.issuerType] = (acc[b.issuerType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalBonds,
    totalOutstanding,
    weightedYield,
    averageDuration,
    byCountry,
    byType,
  };
}

// ==========================================
// UMOA-TITRES (emissions souveraines, avec cache)
// ==========================================

let _emissionsCache: import("./listedBondsTypes").EmissionUMOA[] | null = null;

/** Charge les emissions UMOA-Titres pour la calibration des prix theoriques */
export function loadUmoaEmissions(): import("./listedBondsTypes").EmissionUMOA[] {
  if (_emissionsCache !== null) return _emissionsCache;

  const rows = parseCSV<{
    date: string;
    country: string;
    isin: string;
    type: string;
    maturity: string;
    amount: string;
    weightedAvgYield: string;
  }>("emissions.csv");

  _emissionsCache = rows
    .map((r) => ({
      date: normalizeDateISO(r.date),
      country: r.country?.trim() || "",
      isin: r.isin?.trim() || "",
      type: (r.type?.trim() || "OAT") as "OAT" | "BAT",
      maturity: parseNum(r.maturity),
      amount: parseNum(r.amount),
      weightedAvgYield: parseNum(r.weightedAvgYield) / 100,
    }))
    .filter((e) => {
      if (!e.date || !e.country) return false;
      if (e.maturity <= 0 || e.maturity > 50) return false;
      if (e.amount <= 0) return false;
      if (e.weightedAvgYield <= 0 || e.weightedAvgYield > 0.3) return false;
      return true;
    });

  return _emissionsCache;
}
// ==========================================
// INDICES BRVM
// ==========================================

/** Mapping code → nom officiel pour les indices BRVM */
export const BRVM_INDEX_NAMES: Record<string, string> = {
  BRVMC: "BRVM Composite",
  BRVM30: "BRVM 30",
  BRVMPA: "BRVM Principal",
  BRVMPR: "BRVM Prestige",
  "BRVM-CB": "BRVM Consommation de Base",
  "BRVM-CD": "BRVM Consommation Discrétionnaire",
  "BRVM-EN": "BRVM Énergie",
  "BRVM-IN": "BRVM Industriels",
  "BRVM-SF": "BRVM Services Financiers",
  "BRVM-SP": "BRVM Services Publics",
  "BRVM-TEL": "BRVM Télécommunications",
};

export const BRVM_INDEX_CODES = Object.keys(BRVM_INDEX_NAMES);

/** Categorisation des indices */
export const BRVM_MAIN_INDICES = ["BRVMC", "BRVM30", "BRVMPA", "BRVMPR"];
export const BRVM_SECTORIAL_INDICES = [
  "BRVM-CB",
  "BRVM-CD",
  "BRVM-EN",
  "BRVM-IN",
  "BRVM-SF",
  "BRVM-SP",
  "BRVM-TEL",
];

/** Cache pour eviter de re-parser le CSV a chaque appel */
let _allHistoryCache: { code: string; date: string; value: number }[] | null = null;

function loadAllPriceHistory(): { code: string; date: string; value: number }[] {
  if (_allHistoryCache !== null) return _allHistoryCache;

  const rows = parseCSV<PriceHistoryRow>("historique-prix.csv");
  _allHistoryCache = rows
    .map((r) => ({
      code: r.code?.trim() || "",
      date: normalizeDateISO(r.date),
      value: parseNum(r.value),
    }))
    .filter((r) => r.code && r.date && r.value > 0);

  return _allHistoryCache;
}

/** Charge l'historique d'un indice BRVM (code = BRVMC, BRVM30, BRVM-SF, etc.) */
export function loadIndexHistory(
  code: string
): { date: string; value: number }[] {
  const all = loadAllPriceHistory();
  return all
    .filter((r) => r.code.toUpperCase() === code.toUpperCase())
    .map((r) => ({ date: r.date, value: r.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Charge l'historique de plusieurs indices a la fois */
export function loadMultipleIndicesHistory(
  codes: string[]
): Record<string, { date: string; value: number }[]> {
  const all = loadAllPriceHistory();
  const result: Record<string, { date: string; value: number }[]> = {};
  const codesUpper = codes.map((c) => c.toUpperCase());

  for (const code of codesUpper) {
    result[code] = [];
  }

  for (const r of all) {
    const codeUpper = r.code.toUpperCase();
    if (codesUpper.includes(codeUpper)) {
      result[codeUpper].push({ date: r.date, value: r.value });
    }
  }

  // Trier chaque serie par date
  for (const code of codesUpper) {
    result[code].sort((a, b) => a.date.localeCompare(b.date));
  }

  return result;
}

/** Statistiques d'un indice : derniere valeur + variation %  */
export function getIndexStats(
  code: string
): {
  code: string;
  name: string;
  latestValue: number;
  latestDate: string;
  variationPct: number;
  variationValue: number;
} | null {
  const history = loadIndexHistory(code);
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : latest;
  const variationValue = latest.value - previous.value;
  const variationPct = previous.value > 0 ? (variationValue / previous.value) * 100 : 0;

  return {
    code,
    name: BRVM_INDEX_NAMES[code] || code,
    latestValue: latest.value,
    latestDate: latest.date,
    variationPct,
    variationValue,
  };
}

// ==========================================
// ACTIONS BRVM : KPIs et top movers
// ==========================================

export type ActionRow = {
  code: string;
  name: string;
  sector: string;
  country: string;
  isin: string;
  price: number;
  changePercent: number;
  volume: number;
  capitalization: number;
  per: number;
  yieldPct: number;
  hasPer: boolean;
  hasYield: boolean;
};

/** Charge toutes les actions enrichies pour la page Actions BRVM */
export function loadAllActions(): ActionRow[] {
  const stocks = loadStocks();
  return stocks.map((s) => {
    const rawYield = parseNum(s.yield);
    // Detection intelligente : si la valeur > 1 c'est deja en %, sinon en decimal
    // (un yield > 100% n'a pas de sens, donc on cap aussi)
    let yieldPct: number;
    if (rawYield > 1) {
      // Deja en pourcentage (ex: 7.5)
      yieldPct = rawYield;
    } else {
      // En decimal (ex: 0.075)
      yieldPct = rawYield * 100;
    }
    if (!isFinite(yieldPct) || yieldPct > 50) yieldPct = 0;

    const rawChange = parseNum(s.changePercent);
    let changePct: number;
    if (Math.abs(rawChange) > 1) {
      changePct = rawChange;
    } else {
      changePct = rawChange * 100;
    }
    if (!isFinite(changePct)) changePct = 0;

    return {
      code: s.code?.trim() || "",
      name: s.name?.trim() || "",
      sector: s.sector?.trim() || "",
      country: s.country?.trim() || "",
      isin: s.isin?.trim() || "",
      price: parseNum(s.price),
      changePercent: changePct,
      volume: parseNum(s.volume),
      capitalization: parseNum(s.capitalization),
      per: parseNum(s.per),
      yieldPct,
      hasPer: isPresent(s.per) && parseNum(s.per) > 0,
      hasYield: isPresent(s.yield) && yieldPct > 0 && yieldPct < 50,
    };
  });
}
/** KPIs globaux du marche actions */
export function getActionsMarketStats(actions: ActionRow[]): {
  totalActions: number;
  totalCapitalization: number;
  totalVolume: number;
  averagePer: number;
  averageYield: number;
  bySector: Record<string, number>;
  byCountry: Record<string, number>;
} {
  const totalCapitalization = actions.reduce((s, a) => s + a.capitalization, 0);
  const totalVolume = actions.reduce((s, a) => s + a.volume, 0);

  const validPer = actions.filter((a) => a.hasPer && a.per > 0);
  const averagePer =
    validPer.length > 0 ? validPer.reduce((s, a) => s + a.per, 0) / validPer.length : 0;

  const validYield = actions.filter((a) => a.hasYield && a.yieldPct > 0);
  const averageYield =
    validYield.length > 0
      ? validYield.reduce((s, a) => s + a.yieldPct, 0) / validYield.length
      : 0;

  const bySector = actions.reduce((acc, a) => {
    if (a.sector) acc[a.sector] = (acc[a.sector] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byCountry = actions.reduce((acc, a) => {
    if (a.country) acc[a.country] = (acc[a.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalActions: actions.length,
    totalCapitalization,
    totalVolume,
    averagePer,
    averageYield,
    bySector,
    byCountry,
  };
}

/** Top 5 hausses du jour (variations positives) */
export function getTopGainers(actions: ActionRow[], limit: number = 5): ActionRow[] {
  return [...actions]
    .filter((a) => a.changePercent > 0 && a.price > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}

/** Top 5 baisses du jour (variations negatives) */
export function getTopLosers(actions: ActionRow[], limit: number = 5): ActionRow[] {
  return [...actions]
    .filter((a) => a.changePercent < 0 && a.price > 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
}
// ==========================================
// CALCUL DE VOLATILITE 12 MOIS (Act/252)
// ==========================================

/**
 * Calcule la volatilite annualisee d'une action sur les 12 derniers mois.
 *
 * Methodologie :
 * 1. Recupere les prix journaliers sur 365 jours glissants
 * 2. Calcule les rendements quotidiens log : r_t = ln(P_t / P_{t-1})
 * 3. Calcule l'ecart-type des rendements
 * 4. Annualise par sqrt(252) (nb de jours de bourse par an)
 *
 * Retourne null si pas assez de points (< 60 = ~3 mois de bourse)
 */
function computeVolatility12M(
  history: { date: string; value: number }[]
): number | null {
  if (history.length < 2) return null;

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const latest = sorted[sorted.length - 1];
  const cutoffDate = new Date(latest.date);
  cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
  const cutoffStr = cutoffDate.toISOString().substring(0, 10);

  const recent = sorted.filter((h) => h.date >= cutoffStr);
  if (recent.length < 60) return null;

  // Calcul des rendements log + filtrage des outliers (jumps > 30% en 1 jour)
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].value;
    const curr = recent[i].value;
    if (prev <= 0 || curr <= 0) continue;

    const r = Math.log(curr / prev);

    // Filtre des aberrations : on ignore les rendements |r| > 30%
    // (probablement des splits, IPO, erreurs de saisie)
    if (Math.abs(r) > 0.3) continue;

    returns.push(r);
  }

  if (returns.length < 30) return null;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  const annualizedVolatility = stdDev * Math.sqrt(252);

  // Cap a 100% pour eviter les valeurs absurdes
  const result = annualizedVolatility * 100;
  if (!isFinite(result) || result > 100) return null;

  return result;
}

/**
 * Type pour un point du scatter Rendement vs Volatilite
 */
export type RiskReturnPoint = {
  code: string;
  name: string;
  sector: string;
  country: string;
  volatility: number; // en %
  yieldPct: number; // en %
  capitalization: number;
  price: number;
  changePercent: number;
};

/**
 * Construit la base de donnees Rendement/Volatilite pour le scatter.
 * Filtre les actions sans donnees suffisantes.
 */
export function buildRiskReturnDataset(): {
  points: RiskReturnPoint[];
  excludedCount: number;
  excludedReasons: { noYield: number; insufficientHistory: number };
} {
  const actions = loadAllActions();
  const allHistory = loadAllPriceHistory();

  // Pre-grouper l'historique par code (plus rapide)
  const historyByCode = new Map<string, { date: string; value: number }[]>();
  for (const row of allHistory) {
    const list = historyByCode.get(row.code) || [];
    list.push({ date: row.date, value: row.value });
    historyByCode.set(row.code, list);
  }

  const points: RiskReturnPoint[] = [];
  let noYield = 0;
  let insufficientHistory = 0;

  for (const a of actions) {
    if (!a.hasYield || a.yieldPct <= 0) {
      noYield++;
      continue;
    }

    const history = historyByCode.get(a.code) || [];
    const volatility = computeVolatility12M(history);

    if (volatility === null) {
      insufficientHistory++;
      continue;
    }

    points.push({
      code: a.code,
      name: a.name,
      sector: a.sector,
      country: a.country,
      volatility,
      yieldPct: a.yieldPct,
      capitalization: a.capitalization,
      price: a.price,
      changePercent: a.changePercent,
    });
  }
  return {
    points,
    excludedCount: noYield + insufficientHistory,
    excludedReasons: { noYield, insufficientHistory },
  };
}