// === CHARGEMENT DES DONNEES CSV ===

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import type { Bond, BondCountry, IssuanceResult } from "./bondsUEMOA";
import {
  UMOA_COUNTRY_CODE,
  generateAllListedBondEvents,
} from "./listedBondsTypes";
import { getBrvmSnapshot } from "./brvm/liveQuotes";
import { computeLiveRatios } from "./fundamentalsCalc";

const DATA_DIR = join(process.cwd(), "data");
// Historiques scrapes depuis Sikafinance : un CSV par titre/indice avec OHLCV
// Format : date_iso ; date_fr ; open ; high ; low ; close ; volume (separateur ;)
const SIKA_ACTIONS_DIR = join(DATA_DIR, "historique_sika");
const SIKA_INDICES_DIR = join(DATA_DIR, "historique_sika_indices");

function parseCSV<T>(filename: string, delimiter: "," | ";" = ";"): T[] {
  const filePath = join(DATA_DIR, filename);
  let content = readFileSync(filePath, "utf-8");

  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const result = Papa.parse<T>(content, {
    header: true,
    delimiter,
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

/**
 * Le fichier obligations.csv n'existe plus : on derive Bond[] depuis les
 * emissions UMOA-Titres. Une obligation par ISIN unique (OAT seulement —
 * les BAT zero-coupon ne sont pas vraiment des "Bond" pour le simulateur YTM).
 *
 * Pour chaque ISIN, on prend les caracteristiques du PREMIER round (coupon
 * fixe a l'emission, date de valeur initiale, etc.) et on garde la maturite
 * en annees calculee depuis la date d'echeance.
 */
export function loadBonds(): Bond[] {
  const emissions = loadUmoaEmissions();
  const byIsin = new Map<string, ReturnType<typeof loadUmoaEmissions>[number]>();

  for (const e of emissions) {
    if (e.type !== "OAT") continue;
    if (!e.isin || e.isin === "--") continue;
    if (!(e.country in countryNameMap)) continue;
    // Conserve le PREMIER round (date la plus ancienne) — porte le coupon nominal initial
    const existing = byIsin.get(e.isin);
    if (!existing || e.date < existing.date) {
      byIsin.set(e.isin, e);
    }
  }

  const bonds: Bond[] = [];
  for (const e of byIsin.values()) {
    if (e.couponRate == null || e.couponRate <= 0) continue;
    bonds.push({
      isin: e.isin,
      nameShort: `${e.type} ${e.country} ${(e.couponRate * 100).toFixed(2).replace(".", ",")}%`,
      issuer: `Etat ${e.countryName}`,
      country: e.country as BondCountry,
      type: e.type,
      nominalValue: 10000,
      couponRate: e.couponRate,
      issueDate: e.date,
      maturityDate: e.maturityDate,
      frequency: 1,
      isin_registered: true,
    });
  }

  return bonds;
}

// Garde une trace des codes pays valides pour filtrer les emissions exotiques
const countryNameMap: Record<BondCountry, true> = {
  CI: true, SN: true, BF: true, ML: true, BJ: true, TG: true, NE: true, GW: true,
};

/**
 * Resultats d'adjudication pour le simulateur YTM. Reutilise le loader unifie
 * et reshape dans la forme historique IssuanceResult.
 */
export function loadIssuances(): IssuanceResult[] {
  const emissions = loadUmoaEmissions();
  return emissions
    .filter((e) => e.country in countryNameMap)
    .map((e) => ({
      date: e.date,
      country: e.country as BondCountry,
      isin: e.isin,
      type: e.type,
      maturity: e.maturity,
      amount: e.amount,
      weightedAvgYield: e.weightedAvgYield,
    }));
}

export function loadPriceHistory(code: string): { date: string; value: number }[] {
  const codeUpper = code.toUpperCase();
  return loadAllPriceHistory()
    .filter((r) => r.code === codeUpper)
    .map((r) => ({ date: r.date, value: r.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Variante exposant le volume quotidien lorsque disponible. Mémoisé via loadAllPriceHistory. */
export function loadPriceHistoryWithVolume(
  code: string
): { date: string; value: number; volume: number | null }[] {
  const codeUpper = code.toUpperCase();
  return loadAllPriceHistory()
    .filter((r) => r.code.toUpperCase() === codeUpper)
    .map((r) => ({ date: r.date, value: r.value, volume: r.volume }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Volume moyen sur les `days` dernières séances cotées (séances avec volume non-null
 * et > 0). Retourne null si aucune séance avec volume disponible.
 */
export function loadAverageVolumes(days = 30): Map<string, number | null> {
  const all = loadAllPriceHistory();
  const byCode = new Map<string, { date: string; volume: number | null }[]>();
  for (const r of all) {
    const list = byCode.get(r.code) ?? [];
    list.push({ date: r.date, volume: r.volume });
    byCode.set(r.code, list);
  }
  const result = new Map<string, number | null>();
  for (const [code, rows] of byCode) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    // on prend les `days` dernières séances, on ignore celles sans volume
    const recent = rows.slice(-days).filter((r) => r.volume !== null && r.volume > 0);
    if (recent.length === 0) {
      result.set(code, null);
      continue;
    }
    const sum = recent.reduce((s, r) => s + (r.volume ?? 0), 0);
    result.set(code, sum / recent.length);
  }
  return result;
}

export function loadStockByCode(code: string): StockRow | undefined {
  const stocks = loadStocks();
  return stocks.find((s) => s.code?.trim().toUpperCase() === code.toUpperCase());
}

/**
 * ISIN d'une action depuis titres.csv. La colonne porte parfois la sentinelle
 * "0" (cas BICB, dont l'ISIN n'est pas publie par la BRVM) : on la traite comme
 * une absence plutot que de la laisser fuiter jusqu'a l'UI, ou elle s'afficherait
 * comme un identifiant valide. Cf. le contournement historique
 * `s.isin !== "0"` dans app/pros/fund-management/portfolio-match.ts.
 */
function cleanIsin(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === "0" || v === "-" || v === "--" || v.toUpperCase() === "NC") {
    return "";
  }
  return v;
}

/**
 * Champs STATIQUES d'une action depuis titres.csv (identité + structure du
 * capital). Les champs dynamiques — price / change / changePercent / volume /
 * per / yield — sont volontairement renvoyés à 0 / false : ils ne doivent plus
 * venir du CSV. La fiche /titre/[code] les remplit depuis le cours live BRVM
 * (repli historique_sika) et computeLiveRatios. high52w / low52w / yearChange /
 * volatility sont recalculés depuis l'historique Sika par la page.
 */
export function getStockDetails(code: string) {
  const s = loadStockByCode(code);
  if (!s) return null;

  const high52w = parseNum(s.high52w);
  const low52w = parseNum(s.low52w);
  const yearChange = parseNum(s.yearChange) * 100;
  const volatility = parseNum(s.volatility) * 100;
  const capitalization = parseNum(s.capitalization);
  const sharesOutstanding = parseNum(s.sharesOutstanding);
  const floatValue = parseNum(s.float);

  return {
    code: s.code?.trim() || "",
    name: s.name?.trim() || "",
    sector: s.sector?.trim() || "",
    country: s.country?.trim() || "",
    isin: cleanIsin(s.isin),
    description: s.description?.trim() || "",
    // Dynamiques : remplis par la page depuis le live / Sika / ratios.
    price: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    per: 0,
    yield: 0,
    capitalization,
    sharesOutstanding,
    float: floatValue,
    high52w,
    low52w,
    yearChange,
    volatility,
    hasPer: false,
    hasYield: false,
    hasYearChange: isPresent(s.yearChange),
    hasVolume: false,
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
  BocSynthese,
} from "./listedBondsTypes";
import {
  computeCurrentNominalPerTitre,
  isBondMatured,
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
  /** CSV utilise l'entete "firstCouponDate" mais la valeur est en realite
   *  la premiere date d'amortissement (apres differe). */
  firstCouponDate: string;
  rating: string;
  ratingAgency: string;
  callable: string;
  callDate: string;
  greenBond: string;
  description: string;
  amortizationType: string;
  /** "T" = amortissement sur titre, "N" = sur nominal (par defaut). */
  "Titre/Nominal": string;
};

type ListedBondPriceRow = {
  isin: string;
  date: string;
  cleanPrice: string;
  dirtyPrice: string;
  volume: string;
  transactions: string;
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

type BocVnRow = { code: string; valeurNominale: string; bocDate: string };

export type ListedBondsBocCheck = {
  /** Date du BOC de reference (celle portee par le CSV de VN). */
  bocDate: string | null;
  quotedCount: number;
  baseCount: number;
  /**
   * Lignes que la base declare echues alors que le BOC les cote encore.
   * C'est un detecteur d'erreur de saisie sur `maturityDate` : la BRVM ne cote
   * pas une obligation remboursee, donc toute divergence vient de la base.
   * Cas rencontre : TPCI.O29, saisi 19/04/2026 au lieu de 19/10/2026 — six
   * mois d'ecart sur l'emission ET l'echeance.
   */
  maturedButQuoted: { code: string; name: string; maturityDate: string }[];
  /** Cotees au BOC mais absentes du referentiel : nouvelles emissions a saisir. */
  quotedButMissing: string[];
};

/**
 * Rapproche le referentiel obligataire du dernier BOC.
 *
 * S'appuie sur data/obligations-cotees-vn-boc.csv, produit chaque soir par
 * scripts/scrape_brvm_boc.py : y figurer signifie "cotee au BOC de cette date".
 * Aucun telechargement supplementaire n'est donc necessaire.
 */
export function checkListedBondsVsBoc(
  asOf: Date = new Date(),
): ListedBondsBocCheck {
  const bonds = loadListedBonds();
  const quoted = new Set<string>();
  let bocDate: string | null = null;
  try {
    for (const r of parseCSV<BocVnRow>("obligations-cotees-vn-boc.csv")) {
      const code = r.code?.trim();
      if (code) quoted.add(code.toUpperCase());
      const d = r.bocDate?.trim();
      if (d && (!bocDate || d > bocDate)) bocDate = d;
    }
  } catch {
    // fichier absent ou illisible : on renvoie un constat vide plutot qu'une erreur
  }

  const byCode = new Set(bonds.map((b) => b.code.trim().toUpperCase()));

  return {
    bocDate,
    quotedCount: quoted.size,
    baseCount: bonds.length,
    maturedButQuoted: bonds
      .filter(
        (b) =>
          isBondMatured(b, asOf) && quoted.has(b.code.trim().toUpperCase()),
      )
      .map((b) => ({
        code: b.code,
        name: b.name,
        maturityDate: b.maturityDate,
      }))
      .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate)),
    quotedButMissing: [...quoted].filter((c) => !byCode.has(c)).sort(),
  };
}

/** VN scrapees du BOC officiel BRVM (cf. scripts/scrape_brvm_boc.py).
 *  Memoize : le fichier ne change qu'une fois par jour apres scrape. */
let _bocVnCache: Map<string, number> | null = null;
function loadBocNominalValues(): Map<string, number> {
  if (_bocVnCache) return _bocVnCache;
  const m = new Map<string, number>();
  const filePath = join(DATA_DIR, "obligations-cotees-vn-boc.csv");
  if (!existsSync(filePath)) {
    _bocVnCache = m;
    return m;
  }
  try {
    const rows = parseCSV<BocVnRow>("obligations-cotees-vn-boc.csv");
    for (const r of rows) {
      const code = r.code?.trim();
      const vn = parseNum(r.valeurNominale);
      if (code && vn > 0) m.set(code, vn);
    }
  } catch {
    // pas grave : on tombe sur le calcul auto
  }
  _bocVnCache = m;
  return m;
}

export function loadListedBonds(): ListedBond[] {
  const rows = parseCSV<ListedBondCSVRow>("obligations-cotees.csv");
  const bocVn = loadBocNominalValues();
  return rows
    .filter((r) => r.isin?.trim())
    .map((r) => {
    const maturityISO = normalizeDateISO(r.maturityDate);
    const issueDateISO = normalizeDateISO(r.issueDate);
    // CSV header "firstCouponDate" mais la valeur = 1ere date d'amort (apres
    // differe). On garde le nom semantique cote objet.
    const firstAmortDateISO = normalizeDateISO(r.firstCouponDate);
    const amortizationType = normalizeAmortizationType(r.amortizationType);
    const couponFrequency = parseNum(r.couponFrequency, 1) as 1 | 2 | 4;
    const amortizationMode: "T" | "N" =
      r["Titre/Nominal"]?.trim().toUpperCase() === "T" ? "T" : "N";

    // VN courante : preference au BOC officiel BRVM (scrape via
    // scripts/scrape_brvm_boc.py → data/obligations-cotees-vn-boc.csv).
    // Sinon fallback sur le calcul auto depuis les dates + mode + INITIAL=10 000.
    // La colonne `nominalValue` du CSV obligations-cotees.csv est ignoree.
    const code = r.code?.trim() || "";
    const nominalValue =
      bocVn.get(code) ??
      computeCurrentNominalPerTitre({
        amortizationType,
        amortizationMode,
        issueDate: issueDateISO,
        maturityDate: maturityISO,
        firstAmortizationDate: firstAmortDateISO,
        couponFrequency,
      });

    return {
      isin: r.isin?.trim() || "",
      code,
      name: r.name?.trim() || "",
      issuer: r.issuer?.trim() || "",
      issuerType: r.issuerType?.trim() || "Autre",
      country: r.country?.trim() || "",
      sector: r.sector?.trim() || "",
      currency: r.currency?.trim() || "XOF",
      nominalValue,
      totalIssued: parseNum(r.totalIssued),
      outstanding: parseNum(r.outstanding),
      couponRate: parseNum(r.couponRate) / 100,
      couponFrequency,
      issueDate: issueDateISO,
      maturityDate: maturityISO,
      firstAmortizationDate: firstAmortDateISO,
      amortizationType,
      amortizationMode,
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

/**
 * Source UNIQUE des evenements : la fiche de chaque obligation.
 * Les coupons, amortissements intermediaires et remboursement final sont
 * generes par calcul (cf. generateBondLifecycleEvents) — plus aucune lecture
 * du CSV obligations-cotees-evenements.csv, qui n'a plus a etre maintenu.
 */
export function loadListedBondEvents(): ListedBondEvent[] {
  return generateAllListedBondEvents(loadListedBonds());
}

// Synthese marche obligataire scrapee du BOC BRVM (page 1) — JSON memoise.
// Si le fichier est absent / invalide, on retourne null et l'UI retombe sur
// les calculs locaux (totalOutstanding agrege depuis le CSV obligations-cotees).
let _bocSyntheseCache: BocSynthese | null | undefined = undefined;

/** Compte les lignes (hors header, hors lignes vides) du CSV audit
 *  obligations-cotees-vn-boc.csv = nombre d'obligations cotees publiees au BOC.
 *  Lecture independante du JSON synthese : ce compteur reflete les pages
 *  detaillees (5+) du BOC, pas la page 1. */
function readBocBondsCount(): number | null {
  const path = join(DATA_DIR, "obligations-cotees-vn-boc.csv");
  if (!existsSync(path)) return null;
  try {
    let content = readFileSync(path, "utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return Math.max(0, lines.length - 1);
  } catch {
    return null;
  }
}

export function loadBocSynthese(): BocSynthese | null {
  if (_bocSyntheseCache !== undefined) return _bocSyntheseCache;
  const path = join(DATA_DIR, "obligations-cotees-boc-synthese.json");
  if (!existsSync(path)) {
    _bocSyntheseCache = null;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BocSynthese>;
    if (
      typeof parsed.bocDate === "string" &&
      typeof parsed.capitalisationBoursiere === "number" &&
      typeof parsed.volumeEchange === "number" &&
      typeof parsed.valeurTransigee === "number"
    ) {
      _bocSyntheseCache = {
        bocDate: parsed.bocDate,
        capitalisationBoursiere: parsed.capitalisationBoursiere,
        volumeEchange: parsed.volumeEchange,
        valeurTransigee: parsed.valeurTransigee,
        bondsCount: readBocBondsCount(),
      };
      return _bocSyntheseCache;
    }
  } catch {
    // JSON corrompu : on degrade silencieusement, le cron remettra le bon fichier.
  }
  _bocSyntheseCache = null;
  return null;
}

/**
 * KPIs du marche obligataire cote — RESTREINTS aux lignes ACTIVES.
 *
 * Les obligations echues restent au referentiel (historique de prix,
 * evenements, portefeuilles anterieurs y renvoient) mais fausseraient les
 * agregats : au 05/09/2026, 11 lignes remboursees portaient encore
 * 148,6 Mds FCFA d'encours theorique, et leur `yearsToMaturity` NEGATIVE
 * tirait la duree moyenne vers le bas (5,41 ans au lieu de 5,47).
 *
 * Meme parti pris que getSovereignMarketStats pour les souverains non cotes.
 */
export function getMarketStats(bonds: ListedBond[]): MarketStats {
  const actifs = bonds.filter((b) => !isBondMatured(b));
  const totalBonds = actifs.length;
  const maturedBonds = bonds.length - actifs.length;
  const totalOutstanding = actifs.reduce((sum, b) => sum + b.outstanding, 0);
  const weightedYield =
    totalOutstanding > 0
      ? actifs.reduce((sum, b) => sum + b.couponRate * b.outstanding, 0) /
        totalOutstanding
      : 0;
  const averageDuration =
    totalOutstanding > 0
      ? actifs.reduce((sum, b) => sum + b.yearsToMaturity * b.outstanding, 0) /
        totalOutstanding
      : 0;

  const byCountry = actifs.reduce((acc, b) => {
    acc[b.country] = (acc[b.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byType = actifs.reduce((acc, b) => {
    acc[b.issuerType] = (acc[b.issuerType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalBonds,
    maturedBonds,
    totalOutstanding,
    weightedYield,
    averageDuration,
    byCountry,
    byType,
    boc: loadBocSynthese(),
  };
}

// ==========================================
// UMOA-TITRES (emissions souveraines, avec cache)
// ==========================================

let _emissionsCache: import("./listedBondsTypes").EmissionUMOA[] | null = null;

/**
 * Helper : extrait un nombre seulement si la cellule est non vide.
 * Retourne null pour les valeurs absentes ("", "--", "NC"). Différent de parseNum
 * qui retourne 0, ce qui ne distingue pas "0%" d'une cellule vide.
 */
function parseNumOrNull(value: unknown): number | null {
  if (!isPresent(value)) return null;
  const n = parseNum(value, NaN);
  return isNaN(n) ? null : n;
}

/**
 * Charge les emissions UMOA-Titres REALISEES (historique adjudications)
 * depuis data/umoa-emissions-realisees.csv (23 colonnes, separateur ';').
 *
 * Source : scraper scripts/scrape_umoa_emissions.py (cron 19h GMT) qui applique
 * deja TOUT le nettoyage AVANT ecriture du CSV :
 *  - normalisation pays (aliases "Burkina", apostrophe courbe...)
 *  - filtrage lignes incoherentes (dates, montants <= 0, rendement hors borne)
 *  - reclassification BAT > 2 ans en OAT
 *
 * Cote TS, on se contente donc de :
 *  - mapper les colonnes vers le shape EmissionUMOA
 *  - convertir les unites "% scrape" (5.5200) en decimal historique (0.0552)
 *  - laisser un garde-fou minimal pour les cas extremes (defense-in-depth)
 *
 * Les taux sont publies en UNITES POURCENT (5.5200 = 5,52%) dans le CSV, on
 * divise par 100 pour matcher le format decimal historique de EmissionUMOA.
 */
export function loadUmoaEmissions(): import("./listedBondsTypes").EmissionUMOA[] {
  if (_emissionsCache !== null) return _emissionsCache;

  type Row = {
    pays: string;
    titreES: string;
    instrument: string;
    precisions: string;
    dateOperation: string;
    dateValeur: string;
    echeance: string;
    maturiteMois: string;
    differeAnnee: string;
    montantM: string;
    montantSoumisM: string;
    montantRetenuM: string;
    isin: string;
    tauxInteret: string;
    prixMarginal: string;
    tauxMarginalPct: string;
    prixMoyenPondere: string;
    tauxMoyenPonderePct: string;
    rendementMoyenPondere: string;
    typeAmortissement: string;
    ponderationPct: string;
    etat: string;
    url: string;
  };

  // Convertit une valeur "5.5200" (% units, CSV scrape) en 0.0552 (decimal,
  // format EmissionUMOA historique). Retourne null pour "multiple", vide, ou
  // valeur non parseable.
  const pctToDecimal = (s: string): number | null => {
    if (!s) return null;
    const t = s.trim();
    if (!t || t.toLowerCase() === "multiple") return null;
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return null;
    return n / 100;
  };

  const rows = parseCSV<Row>("umoa-emissions-realisees.csv", ";");

  _emissionsCache = rows
    .map((r) => {
      const countryName = r.pays?.trim() || "";
      const country = UMOA_COUNTRY_CODE[countryName] || "";
      const instrumentRaw = (r.instrument?.trim() || "OAT").toUpperCase();

      const issueDateISO = r.dateValeur?.trim() || "";
      const maturityDateISO = r.echeance?.trim() || "";
      let maturity = 0;
      if (issueDateISO && maturityDateISO) {
        const ms =
          new Date(maturityDateISO).getTime() -
          new Date(issueDateISO).getTime();
        if (ms > 0) maturity = ms / (365.25 * 24 * 60 * 60 * 1000);
      }

      // Reclassification : un BAT avec maturite > 2,05 ans est un OAT mal
      // saisi cote UMOA (5 cas observes). On reclasse silencieusement plutot
      // que de jeter la donnee. Inversement, un instrument vide ou "ES" est
      // mappe sur OAT (le defaut historique).
      const type: "OAT" | "BAT" =
        instrumentRaw === "BAT" && maturity <= 2.05 ? "BAT" : "OAT";

      const maturityMonths = parseNum(r.maturiteMois);
      const amortRaw = r.typeAmortissement?.trim();
      const amortizationType: "Linéaire" | "In Fine" | null =
        amortRaw === "Linéaire"
          ? "Linéaire"
          : amortRaw === "In Fine"
            ? "In Fine"
            : null;

      return {
        date: issueDateISO,
        country,
        isin: r.isin?.trim() || "",
        type,
        maturity,
        amount: parseNum(r.montantRetenuM),
        weightedAvgYield: pctToDecimal(r.rendementMoyenPondere) ?? 0,

        tradeDate: r.dateOperation?.trim() || "",
        maturityDate: maturityDateISO,
        maturityMonths,
        graceYears: parseNum(r.differeAnnee),
        couponRate: pctToDecimal(r.tauxInteret),
        amortizationType,
        marginalPrice: parseNumOrNull(r.prixMarginal),
        marginalYield: pctToDecimal(r.tauxMarginalPct),
        weightedAvgPrice: parseNumOrNull(r.prixMoyenPondere),
        weightedAvgRate: pctToDecimal(r.tauxMoyenPonderePct),
        precisions: r.precisions?.trim() || "",
        countryName,
        amountSubmitted: parseNum(r.montantSoumisM),
        amountIssued: parseNum(r.montantM),
        url: r.url?.trim() || "",
      };
    })
    // Garde-fou minimal : si le scraper a laisse passer une ligne aberrante,
    // on protege le calcul actuariel aval. Avec le nettoyage Python en place,
    // ces conditions ne devraient JAMAIS se declencher.
    .filter((e) => {
      if (!e.date || !e.country) return false;
      if (e.maturity <= 0 || e.maturity > 50) return false;
      if (e.amount <= 0) return false;
      if (e.weightedAvgYield <= 0 || e.weightedAvgYield > 0.3) return false;
      return true;
    });

  return _emissionsCache;
}

// === UMOA-Titres : Emissions A VENIR (calendrier 30 jours environ) ===
let _emissionsAVenirCache: import("./listedBondsTypes").EmissionUMOAFuture[] | null = null;

export function loadUmoaEmissionsAVenir(): import("./listedBondsTypes").EmissionUMOAFuture[] {
  if (_emissionsAVenirCache !== null) return _emissionsAVenirCache;

  type Row = {
    pays: string;
    titreES: string;
    instrument: string;
    precisions: string;
    dateOperation: string;
    dateValeur: string;
    echeance: string;
    maturiteMois: string;
    differeAnnee: string;
    montantM: string;
    etat: string;
    url: string;
  };

  const rows = parseCSV<Row>("umoa-emissions-a-venir.csv", ";");

  _emissionsAVenirCache = rows
    .map((r) => {
      const countryName = r.pays?.trim() || "";
      const country = UMOA_COUNTRY_CODE[countryName] || "";
      return {
        country,
        countryName,
        titreES: r.titreES?.trim() || "",
        instrument: r.instrument?.trim() || "",
        precisions: r.precisions?.trim() || "",
        dateOperation: r.dateOperation?.trim() || "",
        dateValeur: r.dateValeur?.trim() || "",
        echeance: r.echeance?.trim() || "",
        maturityMonths: parseNum(r.maturiteMois),
        graceYears: parseNum(r.differeAnnee),
        amount: parseNum(r.montantM),
        url: r.url?.trim() || "",
      };
    })
    .filter((e) => e.country && e.dateOperation);

  return _emissionsAVenirCache;
}

// === UMOA-Titres : Emissions PLANIFIEES (calendrier annuel) ===
let _emissionsPlanifieesCache: import("./listedBondsTypes").EmissionUMOAPlanned[] | null = null;

export function loadUmoaEmissionsPlanifiees(): import("./listedBondsTypes").EmissionUMOAPlanned[] {
  if (_emissionsPlanifieesCache !== null) return _emissionsPlanifieesCache;

  type Row = {
    pays: string;
    titreES: string;
    instrument: string;
    precisions: string;
    dateOperation: string;
    montantM: string;
    etat: string;
    url: string;
  };

  const rows = parseCSV<Row>("umoa-emissions-planifiees.csv", ";");

  _emissionsPlanifieesCache = rows
    .map((r) => {
      const countryName = r.pays?.trim() || "";
      const country = UMOA_COUNTRY_CODE[countryName] || "";
      return {
        country,
        countryName,
        titreES: r.titreES?.trim() || "",
        instrument: r.instrument?.trim() || "",
        precisions: r.precisions?.trim() || "",
        dateOperation: r.dateOperation?.trim() || "",
        amount: parseNum(r.montantM),
        url: r.url?.trim() || "",
      };
    })
    .filter((e) => e.country && e.dateOperation);

  return _emissionsPlanifieesCache;
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

/** Mapping secteur (titres.csv) vers code d'indice sectoriel BRVM */
const SECTOR_TO_INDEX: Record<string, string> = {
  "CONSOMMATION DE BASE": "BRVM-CB",
  "CONSOMMATION DISCRETIONNAIRE": "BRVM-CD",
  ENERGIE: "BRVM-EN",
  INDUSTRIELS: "BRVM-IN",
  "SERVICES FINANCIERS": "BRVM-SF",
  "SERVICES PUBLICS": "BRVM-SP",
  TELECOMMUNICATIONS: "BRVM-TEL",
};

function normalizeSectorKey(sector: string): string {
  return sector
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/�/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Retourne le code d'indice sectoriel BRVM correspondant a un secteur, ou null */
export function getSectorIndexCode(sector: string): string | null {
  if (!sector) return null;
  return SECTOR_TO_INDEX[normalizeSectorKey(sector)] ?? null;
}

type SikaHistoryRow = {
  date_iso: string;
  date_fr: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type PriceHistoryEntry = {
  code: string;
  date: string;
  value: number;
  volume: number | null;
  // Champs OHLC pour les graphiques avances (chandeliers, Heikin Ashi...)
  open: number | null;
  high: number | null;
  low: number | null;
};

/** Cache pour eviter de re-parser les CSVs a chaque appel.
 *  Type interne complet (avec OHLC) ; l'API publique en expose un subset. */
let _allHistoryCache: PriceHistoryEntry[] | null = null;

/** Parse un fichier CSV Sika (chemin absolu) en lignes PriceHistoryEntry. */
function loadSikaFile(filePath: string, code: string): PriceHistoryEntry[] {
  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<SikaHistoryRow>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });

  return result.data
    .map((r) => {
      const close = parseNum(r.close);
      return {
        code,
        date: r.date_iso?.trim() || "",
        value: close,
        volume: isPresent(r.volume) ? parseNum(r.volume) : null,
        open: isPresent(r.open) ? parseNum(r.open) : null,
        high: isPresent(r.high) ? parseNum(r.high) : null,
        low: isPresent(r.low) ? parseNum(r.low) : null,
      };
    })
    .filter((r) => r.code && r.date && r.value > 0);
}

function loadAllPriceHistory(): {
  code: string;
  date: string;
  value: number;
  volume: number | null;
}[] {
  if (_allHistoryCache !== null) return _allHistoryCache;

  const out: PriceHistoryEntry[] = [];

  // 1) Actions : un fichier par titre, nomme TICKER.pays.csv
  // Le code titre = avant le 1er point (ex "BOAC.ci.csv" → "BOAC")
  if (existsSync(SIKA_ACTIONS_DIR)) {
    for (const file of readdirSync(SIKA_ACTIONS_DIR)) {
      if (!file.toLowerCase().endsWith(".csv")) continue;
      const code = file.replace(/\.csv$/i, "").split(".")[0].toUpperCase();
      if (!code) continue;
      out.push(...loadSikaFile(join(SIKA_ACTIONS_DIR, file), code));
    }
  }

  // 2) Indices : un fichier par indice, nomme INDEX.csv (sans suffixe pays)
  // ex "BRVM-SF.csv" → code = "BRVM-SF"
  if (existsSync(SIKA_INDICES_DIR)) {
    for (const file of readdirSync(SIKA_INDICES_DIR)) {
      if (!file.toLowerCase().endsWith(".csv")) continue;
      const code = file.replace(/\.csv$/i, "").toUpperCase();
      if (!code) continue;
      out.push(...loadSikaFile(join(SIKA_INDICES_DIR, file), code));
    }
  }

  // Si les dossiers Sika sont vides (cold start avant le premier scrape,
  // ou env de dev nu), on retourne simplement un historique vide.
  _allHistoryCache = out;
  return out;
}

/**
 * Charge l'historique OHLC complet d'un code (titre ou indice).
 * Inclus open, high, low, close, volume — utilisable pour graphiques
 * en chandeliers, Heikin Ashi, Renko, etc.
 */
export function loadOhlcHistory(code: string): PriceHistoryEntry[] {
  loadAllPriceHistory(); // remplit le cache
  const codeUpper = code.toUpperCase();
  const cache = _allHistoryCache ?? [];
  return cache
    .filter((r) => r.code === codeUpper)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type SikaQuote = {
  /** Dernière clôture disponible dans data/historique_sika/ */
  price: number;
  /** Volume de la dernière séance (0 si absent) */
  volume: number;
  /** Variation en FCFA vs séance précédente */
  change: number;
  /** Variation en % vs séance précédente */
  changePercent: number;
  /** Date ISO de la dernière séance */
  date: string;
};

/**
 * Dernière cotation connue d'une action d'après l'historique Sika
 * (data/historique_sika/). Sert de repli quand le cours live BRVM est
 * indisponible — on ne retombe JAMAIS sur titres.csv pour price/volume/var.
 * Renvoie null si le ticker n'a aucun historique.
 */
export function getLatestSikaQuote(code: string): SikaQuote | null {
  const hist = loadOhlcHistory(code); // trié par date asc
  if (hist.length === 0) return null;
  const last = hist[hist.length - 1];
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  const change = prev ? last.value - prev.value : 0;
  const changePercent =
    prev && prev.value > 0 ? ((last.value - prev.value) / prev.value) * 100 : 0;
  return {
    price: last.value,
    volume: last.volume ?? 0,
    change,
    changePercent,
    date: last.date,
  };
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

/**
 * Au-dela de ce delai sans nouveau point, on considere que l'historique CSV
 * n'est plus alimente et qu'il ne peut plus servir de reference a un cours
 * live. 30 jours couvre largement une interruption de scrape ou une longue
 * suspension de cotation, sans laisser passer une serie abandonnee.
 */
const MAX_HISTORY_STALE_DAYS = 30;

/**
 * Calcule la performance Year-To-Date d'un indice (ou titre) :
 * variation entre `currentValue` et la derniere valeur observee dans
 * l'historique CSV au plus tard le 31/12 de l'annee precedente.
 *
 * Si le 31/12 est non cote (week-end/ferie), on prend le dernier jour
 * de cotation avant cette date. C'est volontaire : pour un titre peu
 * liquide, le dernier cours traite EST la bonne reference (cf. SEMC, sans
 * cotation du 07/11 au 31/12/2025).
 *
 * Renvoie `null` si :
 *   - l'historique ne contient pas de point dans la fenetre
 *     (cas typique d'un nouvel indice)
 *   - l'historique CSV n'a plus ete alimente depuis plus de
 *     MAX_HISTORY_STALE_DAYS : la reference et `currentValue` ne sont plus
 *     comparables (cf. BRVM-SP avant reconstitution depuis le BOC)
 *   - le CSV est sur une echelle differente du `currentValue`
 *     (rebasing d'indice par BRVM detecte par un ecart abrupt entre la
 *     derniere valeur CSV et la valeur live) — dans ce cas l'appelant
 *     doit retomber sur la valeur YTD scrapee BRVM
 */
export function computeYtdPct(
  code: string,
  currentValue: number,
  asOfYear?: number,
): number | null {
  if (!Number.isFinite(currentValue) || currentValue <= 0) return null;
  const year = asOfYear ?? new Date().getUTCFullYear();
  const cutoff = `${year - 1}-12-31`;
  const history = loadIndexHistory(code);
  if (history.length === 0) return null;

  const lastCsvPoint = history[history.length - 1];

  // Garde-fou fraicheur : `currentValue` vient d'une source live, la reference
  // vient du CSV. Si le CSV a cesse d'etre alimente, les deux ne decrivent plus
  // la meme realite et le "YTD" devient une performance sur plusieurs annees.
  // Cas rencontre : BRVM-SP, serie morte au 29/01/2025, affichait +185,89 %
  // la ou la BRVM publiait +168,89 %. On renonce plutot que de publier un
  // chiffre faux — l'appelant affiche alors "n.d.".
  const staleDays =
    (Date.now() - Date.parse(`${lastCsvPoint.date}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(staleDays) || staleDays > MAX_HISTORY_STALE_DAYS) {
    return null;
  }

  // Detection rebasing : si la derniere valeur CSV diffère du live d'un
  // facteur > 3x, le CSV est sur une echelle obsolete (changement de base
  // officiel BRVM). Le YTD calcule serait absurde, on abandonne.
  const lastCsvValue = lastCsvPoint.value;
  if (lastCsvValue > 0) {
    const liveVsCsv = currentValue / lastCsvValue;
    if (liveVsCsv > 3 || liveVsCsv < 1 / 3) return null;
  }

  // history est trie par date asc. Cherche le dernier point <= cutoff.
  let referenceValue: number | null = null;
  for (const p of history) {
    if (p.date <= cutoff) referenceValue = p.value;
    else break;
  }
  if (referenceValue === null || referenceValue <= 0) return null;
  return ((currentValue - referenceValue) / referenceValue) * 100;
}

/**
 * Performance Year-To-Date d'une action : variation entre `currentValue`
 * (typiquement le cours live BRVM) et la derniere valeur observee dans
 * l'historique CSV au plus tard le 31/12 de l'annee precedente.
 * Renvoie une valeur en %, ex 12.5 = +12,5 %. Null si pas d'historique
 * suffisant pour la reference.
 */
export function computeStockYtdPct(
  code: string,
  currentValue: number,
  asOfYear?: number,
): number | null {
  if (!Number.isFinite(currentValue) || currentValue <= 0) return null;
  const year = asOfYear ?? new Date().getUTCFullYear();
  const cutoff = `${year - 1}-12-31`;
  const history = loadPriceHistory(code);
  if (history.length === 0) return null;
  let referenceValue: number | null = null;
  for (const p of history) {
    if (p.date <= cutoff) referenceValue = p.value;
    else break;
  }
  if (referenceValue === null || referenceValue <= 0) return null;
  return ((currentValue - referenceValue) / referenceValue) * 100;
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

/** Inverse de SECTOR_TO_INDEX : code d'indice → libellé secteur normalisé */
const INDEX_TO_SECTOR_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SECTOR_TO_INDEX).map(([sector, code]) => [code, sector]),
);


export type SectorComponent = {
  code: string;
  name: string;
  country: string;
  currentPrice: number;
  startPrice: number | null;
  ytdPct: number | null;
  /** Capitalisation totale au 31/12 N-1 (start_price × sharesOutstanding). Null si indisponible. */
  startCap: number | null;
  /** Poids dans le secteur en % (0–100). 0 si capitalisation indisponible. */
  weightPct: number;
  /** Contribution à la variation YTD du secteur, en points de %. */
  contributionPct: number | null;
};

/**
 * Composants d'un indice sectoriel BRVM : poids en capitalisation totale au
 * 31/12 N-1 (rapporté au total du secteur) et contribution = poids × YTD.
 * Trié par contribution décroissante.
 */
export function loadSectorComponents(indexCode: string): SectorComponent[] {
  const targetSector = INDEX_TO_SECTOR_KEY[indexCode];
  if (!targetSector) return [];

  const stocks = loadStocks().filter(
    (s) => normalizeSectorKey(s.sector) === targetSector,
  );
  if (stocks.length === 0) return [];

  const year = new Date().getUTCFullYear();
  const cutoff = `${year - 1}-12-31`;

  const enriched = stocks
    .map((s): SectorComponent | null => {
      const code = (s.code || "").trim().toUpperCase();
      if (!code) return null;
      const sharesOut = parseNum(s.sharesOutstanding, 0);
      const history = loadPriceHistory(code);
      if (history.length === 0) return null;

      // Prix de référence YTD : dernier point ≤ 31/12 N-1
      let startPrice: number | null = null;
      for (const p of history) {
        if (p.date <= cutoff) startPrice = p.value;
        else break;
      }

      const lastPoint = history[history.length - 1];
      const csvPrice = parseNum(s.price, 0);
      const currentPrice = csvPrice > 0 ? csvPrice : lastPoint.value;

      const ytdPct =
        startPrice !== null && startPrice > 0
          ? ((currentPrice - startPrice) / startPrice) * 100
          : null;

      const startCap =
        startPrice !== null && startPrice > 0 && sharesOut > 0
          ? startPrice * sharesOut
          : null;

      return {
        code,
        name: (s.name || "").trim(),
        country: (s.country || "").trim(),
        currentPrice,
        startPrice,
        ytdPct,
        startCap,
        weightPct: 0,
        contributionPct: null,
      };
    })
    .filter((c): c is SectorComponent => c !== null);

  const totalCap = enriched.reduce(
    (sum, c) => sum + (c.startCap ?? 0),
    0,
  );

  for (const c of enriched) {
    if (totalCap > 0 && c.startCap !== null) {
      c.weightPct = (c.startCap / totalCap) * 100;
      if (c.ytdPct !== null) {
        c.contributionPct = (c.weightPct / 100) * c.ytdPct;
      }
    }
  }

  return enriched.sort((a, b) => {
    const ca = a.contributionPct ?? -Infinity;
    const cb = b.contributionPct ?? -Infinity;
    return cb - ca;
  });
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
  /** Exercice des comptes derriere le PER (null si pas de PER). */
  perYear: number | null;
  /** Exercice du dividende derriere le rendement (null si pas de rendement).
   *  Peut etre anterieur a perYear : cf. fallback DPA dans computeLiveRatios. */
  yieldYear: number | null;
  /** Dividende par action retenu, en FCFA. Sert a qualifier un rendement
   *  ecarte comme non recurrent. */
  dpa: number | null;
};

/**
 * Assemble un ActionRow à partir des champs statiques de titres.csv + un cours
 * courant (live BRVM ou dernière clôture Sika — jamais le prix de titres.csv).
 * PER / rendement sont recalculés sur ce cours via computeLiveRatios, et la
 * capitalisation = nbTitres × cours courant si les fondamentaux sont dispo.
 */
/**
 * Au-dela de ce rendement, on ne considere plus le dividende comme recurrent.
 * Voir le commentaire dans buildActionRow : le seuil ecarte aussi bien les
 * erreurs de saisie que les distributions exceptionnelles legitimes.
 */
const RECURRING_YIELD_MAX_PCT = 50;

function buildActionRow(
  s: StockRow,
  code: string,
  price: number,
  volume: number,
  changePercent: number,
): ActionRow {
  const ratios = price > 0 ? computeLiveRatios(code, price) : null;
  const per = ratios?.per ?? 0;
  const yieldPct =
    ratios?.dividendYield != null ? ratios.dividendYield * 100 : 0;

  let capitalization = parseNum(s.capitalization);
  if (ratios && ratios.nbTitres > 0 && price > 0) {
    capitalization = ratios.nbTitres * price;
  }

  return {
    code,
    name: s.name?.trim() || "",
    sector: s.sector?.trim() || "",
    country: s.country?.trim() || "",
    isin: cleanIsin(s.isin),
    price,
    changePercent,
    volume,
    capitalization,
    per,
    yieldPct,
    // Pas de borne haute sur le PER, volontairement : un PER de 748 (UNILEVER,
    // 640 MFCFA de resultat 2023 pour 52 200 FCFA le titre) est exact et
    // informatif — il dit que la societe ne gagne presque rien au regard de sa
    // valorisation. Le masquer afficherait "donnee indisponible", ce qui est
    // faux.
    hasPer: per > 0,
    // `hasYield` ne dit pas "la donnee est bonne" mais "ce rendement est
    // representatif du courant". Au-dela de 50 % on sort du dividende
    // ordinaire, sans que la cause soit determinable ici : distribution
    // exceptionnelle bien reelle (FILTISAC, 1 726,55 FCFA au titre de 2024
    // pour un cours de ~2 155, soit 80 %, sur cession d'actifs HAO), retour
    // de capital, cours perime ou saisie erronee. Le drapeau sert donc a
    // exclure la valeur des agregats et des tris, PAS a la cacher : l'UI
    // l'affiche signalee, en laissant le lecteur juger.
    hasYield: yieldPct > 0 && yieldPct < RECURRING_YIELD_MAX_PCT,
    perYear: ratios?.perExercice ?? null,
    yieldYear: ratios?.dpaExercice ?? null,
    dpa: ratios?.dpa && ratios.dpa > 0 ? ratios.dpa : null,
  };
}

/**
 * Charge toutes les actions cotées (version SYNCHRONE) :
 *  - identité / secteur / pays / ISIN : titres.csv
 *  - price / changePercent / volume : dernière clôture de l'historique Sika
 *    (data/historique_sika/) — JAMAIS les colonnes de titres.csv
 *  - per / yield : recalculés sur ce cours (computeLiveRatios)
 *
 * Pour le cours intraday live BRVM, utiliser `loadAllActionsEnriched()`.
 */
export function loadAllActions(): ActionRow[] {
  return loadStocks().map((s) => {
    const code = s.code?.trim().toUpperCase() || "";
    const sika = getLatestSikaQuote(code);
    return buildActionRow(
      s,
      code,
      sika?.price ?? 0,
      sika?.volume ?? 0,
      sika?.changePercent ?? 0,
    );
  });
}

/**
 * Variante ASYNCHRONE : superpose le cours intraday live BRVM (mémoïsé ~5 min)
 * sur l'historique Sika. Pour un ticker sans cotation live du jour, on retombe
 * sur la dernière clôture Sika. À utiliser dans les pages déjà async.
 */
export async function loadAllActionsEnriched(): Promise<ActionRow[]> {
  const stocks = loadStocks();
  const snapshot = await getBrvmSnapshot();
  const liveByCode = new Map(snapshot.quotes.map((q) => [q.code, q]));

  return stocks.map((s) => {
    const code = s.code?.trim().toUpperCase() || "";
    const live = liveByCode.get(code);
    if (live && Number.isFinite(live.currentPrice) && live.currentPrice > 0) {
      return buildActionRow(
        s,
        code,
        live.currentPrice,
        Number.isFinite(live.volume) && live.volume > 0 ? live.volume : 0,
        Number.isFinite(live.variationPct) ? live.variationPct : 0,
      );
    }
    const sika = getLatestSikaQuote(code);
    return buildActionRow(
      s,
      code,
      sika?.price ?? 0,
      sika?.volume ?? 0,
      sika?.changePercent ?? 0,
    );
  });
}
/** KPIs globaux du marche actions */
export function getActionsMarketStats(actions: ActionRow[]): {
  totalActions: number;
  totalCapitalization: number;
  totalVolume: number;
  /** MEDIANE, pas moyenne. Une distribution de multiples est fortement
   *  asymetrique : la moyenne des PER du marche ressort a 88,5 contre une
   *  mediane de 20,0, tiree par deux societes en creux de cycle (UNILEVER,
   *  SICOR). La mediane decrit le marche, la moyenne decrit les valeurs
   *  extremes. */
  medianPer: number;
  averageYield: number;
  bySector: Record<string, number>;
  byCountry: Record<string, number>;
} {
  const totalCapitalization = actions.reduce((s, a) => s + a.capitalization, 0);
  const totalVolume = actions.reduce((s, a) => s + a.volume, 0);

  const sortedPer = actions
    .filter((a) => a.hasPer && a.per > 0)
    .map((a) => a.per)
    .sort((x, y) => x - y);
  const medianPer =
    sortedPer.length === 0
      ? 0
      : sortedPer.length % 2 === 1
        ? sortedPer[(sortedPer.length - 1) / 2]
        : (sortedPer[sortedPer.length / 2 - 1] + sortedPer[sortedPer.length / 2]) / 2;

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
    medianPer,
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