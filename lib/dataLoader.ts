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

  // Detection notation scientifique avec virgule francaise : 2,06E+11
  const scientificFrench = /^-?\d+,\d+[eE][+-]?\d+$/;
  if (scientificFrench.test(str)) {
    const cleaned = str.replace(",", ".");
    const n = Number(cleaned);
    return isNaN(n) ? defaultValue : n;
  }

  // Nombre francais classique : "12 345,67" -> "12345.67"
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

/**
 * Parse une date en acceptant les formats YYYY-MM-DD ou DD/MM/YYYY.
 */
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

/**
 * Normalise une date en ISO YYYY-MM-DD depuis n'importe quel format accepte.
 */
function normalizeDateISO(s: string): string {
  if (!s || s.trim() === "") return "";
  const d = parseDate(s);
  if (isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalise la valeur d'amortizationType pour n'accepter que IF/AC/ACD
 */
function normalizeAmortizationType(value: string): "IF" | "AC" | "ACD" {
  const v = (value || "").trim().toUpperCase();
  if (v === "IF") return "IF";
  if (v === "ACD") return "ACD";
  return "AC";
}

/** Charge toutes les obligations cotees depuis obligations-cotees.csv */
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

/** Charge l'historique des prix des obligations cotees */
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

/** Charge les evenements (coupons, remboursements, etc.) */
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

/** Calcule les statistiques globales du marche obligataire cote */
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