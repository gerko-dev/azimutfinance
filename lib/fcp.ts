// === LOADER FCP / OPCVM (data/dataasgop.csv) ===
//
// Source : 1 ligne = 1 observation (fonds × date). Le CSV mélange deux types
// de points :
//   - "quarter"  : fin de trimestre canonique (mar/juin/sept/déc 31). Inclut
//                  la VL ET l'Actif net. Grille de référence pour les agrégats
//                  d'encours.
//   - "latest"   : VL intra-trimestre (cadence propre à chaque société de
//                  gestion : quotidien pour certains, ad hoc pour d'autres).
//                  Sans Actif net. C'est le dernier point connu pour le fonds.
//
// On ne calcule PAS de volatilité, Sharpe, drawdown, capture ratio : la
// fréquence hétérogène et la rareté des points trimestriels rendraient ces
// métriques fallacieuses. On reste sur perf cumulée + AUM + persistance.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");
const CSV_FILE = "dataasgop.csv";

// ==========================================
// TYPES
// ==========================================

export type FundType = "FCP" | "FCPE" | "SICAV" | "FCPR";

export type FundCategory =
  | "Obligataire"
  | "Monétaire"
  | "Diversifié"
  | "Actions"
  | "Actifs non cotés";

export type FundObservation = {
  date: string;                 // ISO YYYY-MM-DD
  vl: number | null;
  aum: number | null;
  kind: "quarter" | "latest";
  categorie: FundCategory;      // catégorie déclarée pour CETTE ligne (peut varier dans le temps)
  categorieRaw: string;
};

export type Fund = {
  id: string;                   // slug stable (gestionnaire-nom)
  gestionnaire: string;
  nom: string;
  type: FundType;
  categorie: FundCategory;
  categorieRaw: string;         // libellé original avec sous-classe : "Obligataire (OLMT)" etc.
  observations: FundObservation[]; // triées par date asc
  // Raccourcis utiles aux composants
  latestVL: { date: string; vl: number; kind: "quarter" | "latest" } | null;
  latestQuarter: { date: string; vl: number; aum: number } | null;
  firstObsDate: string | null;
};

// ==========================================
// PARSING HELPERS (alignés sur dataLoader.ts)
// ==========================================

function parseCSV<T>(filename: string, delimiter: "," | ";" = ";"): T[] {
  const filePath = join(DATA_DIR, filename);
  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const result = Papa.parse<T>(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  return result.data;
}

function parseNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str === "NC" || str === "-") return null;
  const cleaned = str.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeDateISO(s: string): string {
  if (!s) return "";
  const clean = s.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number);
    const yyyy = String(y).padStart(4, "0");
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split(/[/-]/).map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

const QUARTER_END = new Set(["03-31", "06-30", "09-30", "12-31"]);

function isCanonicalQuarter(dateISO: string): boolean {
  if (dateISO.length < 10) return false;
  return QUARTER_END.has(dateISO.slice(5));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Clé canonique pour fusionner les variantes d'un même fonds présentes dans le
 * CSV. Le fichier mélange les nommages (« AURORE OPPORTUNITES » vs
 * « FCP Aurore Opportunités »), ce qui fragmenterait l'historique d'un même
 * produit. On déduit une clé robuste :
 *   - retire le préfixe FCP / FCPE / FCPR / SICAV
 *   - retire les accents
 *   - uppercase
 *   - écrase les espaces multiples et la ponctuation
 *
 * Cas connus volontairement non fusionnés (orthographes vraiment différentes,
 * pas des variantes du même fonds) : MONERATIS ≠ MONETARIS, ASSURANCE ≠
 * ASSURANCES (suffixe pluriel ambigu), TRESORIE ≠ TRESORERIE.
 */
function fundNameKey(raw: string): string {
  return (raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/^\s*(FCP|FCPE|FCPR|SICAV)\s+/i, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFundType(raw: string): FundType {
  const v = (raw || "").trim().toUpperCase();
  if (v === "FCPE") return "FCPE";
  if (v === "SICAV") return "SICAV";
  if (v === "FCPR") return "FCPR";
  return "FCP";
}

// "Obligataire (OLMT)" → "Obligataire" ; "Actions " → "Actions"
function normalizeCategory(raw: string): { canon: FundCategory; rawTrim: string } {
  const trimmed = (raw || "").trim();
  const lower = trimmed.toLowerCase();
  let canon: FundCategory;
  if (lower.startsWith("obligataire")) canon = "Obligataire";
  else if (lower.startsWith("monétaire") || lower.startsWith("monetaire")) canon = "Monétaire";
  else if (lower.startsWith("diversifié") || lower.startsWith("diversifie")) canon = "Diversifié";
  else if (lower.startsWith("actions")) canon = "Actions";
  else if (lower.startsWith("actifs non")) canon = "Actifs non cotés";
  else canon = "Diversifié"; // fallback rare
  return { canon, rawTrim: trimmed };
}

// ==========================================
// LOADER (memoized)
// ==========================================

type CSVRow = {
  "N°": string;
  "Gestionnaire": string;
  "Nom de l'OPC": string;
  "Type d'OPC": string;
  "Catégorie": string;
  "Date": string;
  "Valeur Liquidative": string;
  "Actif net": string;
};

let _fundsCache: Fund[] | null = null;

export function loadFunds(): Fund[] {
  if (_fundsCache !== null) return _fundsCache;

  const rows = parseCSV<CSVRow>(CSV_FILE, ",");

  // Groupage par (gestionnaire, clé canonique du nom). La clé canonique fusionne
  // les variantes du même fonds (ex: « AURORE OPPORTUNITES » et
  // « FCP Aurore Opportunités »).
  type RowMeta = { row: CSVRow; date: string };
  const groups = new Map<string, { metaByDate: RowMeta[]; obs: FundObservation[] }>();

  for (const r of rows) {
    const gestionnaire = (r["Gestionnaire"] || "").trim();
    const nom = (r["Nom de l'OPC"] || "").trim();
    const dateISO = normalizeDateISO(r["Date"] || "");
    if (!gestionnaire || !nom || !dateISO) continue;

    const vl = parseNumOrNull(r["Valeur Liquidative"]);
    const aum = parseNumOrNull(r["Actif net"]);
    // Si VL absente ET AUM absent, la ligne ne porte aucune info → skip
    if (vl === null && aum === null) continue;

    const kind: FundObservation["kind"] = isCanonicalQuarter(dateISO) ? "quarter" : "latest";
    const { canon, rawTrim } = normalizeCategory(r["Catégorie"]);
    const key = `${gestionnaire}__${fundNameKey(nom)}`;
    const entry = groups.get(key) || { metaByDate: [], obs: [] };
    entry.metaByDate.push({ row: r, date: dateISO });
    entry.obs.push({ date: dateISO, vl, aum, kind, categorie: canon, categorieRaw: rawTrim });
    groups.set(key, entry);
  }

  const funds: Fund[] = [];
  for (const [, { metaByDate, obs }] of groups) {
    // Nom affiché : on prend celui de la ligne la plus récente (= forme actuelle
    // utilisée par la SGP). Idem pour le gestionnaire (au cas où la SGP serait
    // renommée).
    metaByDate.sort((a, b) => a.date.localeCompare(b.date));
    const latestMeta = metaByDate[metaByDate.length - 1].row;
    const gestionnaire = latestMeta["Gestionnaire"].trim();
    const nom = latestMeta["Nom de l'OPC"].trim();

    obs.sort((a, b) => a.date.localeCompare(b.date));

    // Catégorie "courante" du fonds = celle de l'observation la plus récente.
    const latestObs = obs[obs.length - 1];
    const canon = latestObs.categorie;
    const rawTrim = latestObs.categorieRaw;

    // Latest VL (n'importe quel kind, pourvu que vl soit non null)
    const obsWithVL = obs.filter((o) => o.vl !== null);
    const latestVLObs = obsWithVL.length > 0 ? obsWithVL[obsWithVL.length - 1] : null;

    // Latest quarter avec AUM (pour la grille AUM)
    const quartersWithAUM = obs.filter(
      (o) => o.kind === "quarter" && o.vl !== null && o.aum !== null
    );
    const latestQ = quartersWithAUM.length > 0
      ? quartersWithAUM[quartersWithAUM.length - 1]
      : null;

    funds.push({
      id: slugify(`${gestionnaire}-${nom}`),
      gestionnaire,
      nom,
      type: normalizeFundType(latestMeta["Type d'OPC"]),
      categorie: canon,
      categorieRaw: rawTrim,
      observations: obs,
      latestVL: latestVLObs
        ? { date: latestVLObs.date, vl: latestVLObs.vl as number, kind: latestVLObs.kind }
        : null,
      latestQuarter: latestQ
        ? { date: latestQ.date, vl: latestQ.vl as number, aum: latestQ.aum as number }
        : null,
      firstObsDate: obs.length > 0 ? obs[0].date : null,
    });
  }

  // Tri des fonds : par AUM décroissant (les sans-AUM en fin)
  funds.sort((a, b) => {
    const aumA = a.latestQuarter?.aum ?? -1;
    const aumB = b.latestQuarter?.aum ?? -1;
    return aumB - aumA;
  });

  _fundsCache = funds;
  return funds;
}

// ==========================================
// ACCESSEURS DERIVES
// ==========================================

export function loadFundById(id: string): Fund | null {
  return loadFunds().find((f) => f.id === id) ?? null;
}

/**
 * Liste triée des fins de trimestre canoniques effectivement présentes dans
 * les données (toutes catégories confondues), du plus ancien au plus récent.
 */
export function listQuarterEnds(): string[] {
  const set = new Set<string>();
  for (const f of loadFunds()) {
    for (const o of f.observations) {
      if (o.kind === "quarter") set.add(o.date);
    }
  }
  return Array.from(set).sort();
}

/**
 * Date de référence pour les agrégats d'encours : le trimestre canonique le
 * plus récent dont la couverture (nb de fonds avec AUM publié) atteint au
 * moins 50% du pic historique. Filtre automatiquement les trimestres
 * "en cours de publication" (ex : 2026-Q1 où seuls quelques fonds ont rendu).
 */
export function getReferenceQuarter(funds?: Fund[]): string {
  const list = funds ?? loadFunds();
  const counts = new Map<string, number>();
  for (const f of list) {
    for (const o of f.observations) {
      if (o.kind === "quarter" && o.aum !== null) {
        counts.set(o.date, (counts.get(o.date) || 0) + 1);
      }
    }
  }
  if (counts.size === 0) return "";
  const sorted = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxCount = Math.max(...sorted.map(([, c]) => c));
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i][1] >= maxCount * 0.5) return sorted[i][0];
  }
  return sorted[sorted.length - 1][0];
}

/**
 * Date la plus récente toutes VL confondues (n'importe quel kind).
 * Sert de référence pour la règle d'exclusion des VL stales (8 j ouvrés).
 */
export function getLatestVLDate(funds?: Fund[]): string {
  const list = funds ?? loadFunds();
  let latest = "";
  for (const f of list) {
    if (f.latestVL && f.latestVL.date > latest) latest = f.latestVL.date;
  }
  return latest;
}

/**
 * Soustrait `days` jours calendaires à `refISO`. UTC.
 */
export function subtractCalendarDays(refISO: string, days: number): string {
  const d = new Date(refISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * AUM d'un fonds à une date trimestrielle précise. Null si pas publié ce
 * jour-là (l'AUM est ponctuel, jamais cumulatif).
 */
export function aumAt(fund: Fund, dateISO: string): number | null {
  const obs = fund.observations.find(
    (o) => o.date === dateISO && o.kind === "quarter" && o.aum !== null
  );
  return obs?.aum ?? null;
}

/**
 * Catégorie déclarée par le fonds à une date donnée. Utile car certains fonds
 * changent de classification dans le temps (ex : CORIS ASSURANCES Diversifié
 * → Monétaire). Pour les agrégats KPI au refDate, c'est la catégorie de la
 * ligne CSV à cette date qu'il faut utiliser.
 */
export function categoryAt(fund: Fund, dateISO: string): FundCategory | null {
  const obs = fund.observations.find((o) => o.date === dateISO);
  return obs?.categorie ?? null;
}

export const FCP_CATEGORIES: FundCategory[] = [
  "Obligataire",
  "Monétaire",
  "Diversifié",
  "Actions",
  "Actifs non cotés",
];

// ==========================================
// SOCIETES DE GESTION (SGP)
// ==========================================

export type ManagerSummary = {
  slug: string;
  name: string;
  nbFunds: number;
  aumAtRef: number;
  fundIds: string[];
};

let _managersCache: ManagerSummary[] | null = null;

/**
 * Liste des sociétés de gestion avec leur slug stable et un récap léger.
 * Utilise le refQuarter pour calculer l'AUM ponctuel de la SGP.
 */
export function listManagers(): ManagerSummary[] {
  if (_managersCache !== null) return _managersCache;
  const funds = loadFunds();
  const refQuarter = getReferenceQuarter(funds);
  const byMgr = new Map<string, Fund[]>();
  for (const f of funds) {
    const list = byMgr.get(f.gestionnaire) || [];
    list.push(f);
    byMgr.set(f.gestionnaire, list);
  }
  const out: ManagerSummary[] = [];
  for (const [name, list] of byMgr) {
    const aum = list.reduce((s, f) => {
      const a = aumAt(f, refQuarter);
      return s + (a ?? 0);
    }, 0);
    out.push({
      slug: slugify(name),
      name,
      nbFunds: list.length,
      aumAtRef: aum,
      fundIds: list.map((f) => f.id),
    });
  }
  out.sort((a, b) => b.aumAtRef - a.aumAtRef);
  _managersCache = out;
  return out;
}

/**
 * Retourne (manager, ses fonds) à partir du slug. Null si inconnu.
 */
export function getManagerBySlug(
  slug: string
): { manager: ManagerSummary; funds: Fund[] } | null {
  const summary = listManagers().find((m) => m.slug === slug);
  if (!summary) return null;
  const allFunds = loadFunds();
  const funds = allFunds.filter((f) => f.gestionnaire === summary.name);
  return { manager: summary, funds };
}

/**
 * Slug pour un gestionnaire donné, à utiliser pour construire des Links
 * depuis n'importe quelle page (sans charger toute la liste).
 */
export function managerSlug(name: string): string {
  return slugify(name);
}

// ==========================================
// CATEGORIES (slugs stables pour route /fcp/categorie/[slug])
// ==========================================

const CATEGORY_SLUG_MAP: Record<FundCategory, string> = {
  Obligataire: "obligataire",
  Monétaire: "monetaire",
  Diversifié: "diversifie",
  Actions: "actions",
  "Actifs non cotés": "actifs-non-cotes",
};

const CATEGORY_FROM_SLUG: Record<string, FundCategory> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_MAP).map(([k, v]) => [v, k as FundCategory])
);

export function categorySlug(cat: FundCategory): string {
  return CATEGORY_SLUG_MAP[cat] ?? slugify(cat);
}

export function categoryFromSlug(slug: string): FundCategory | null {
  return CATEGORY_FROM_SLUG[slug] ?? null;
}
