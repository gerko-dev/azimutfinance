// === IMMOBILIER : loader CSV + moteur d'analyse ===
//
// Donnees scrapees par scripts/scrape_immo.py vers data/<source>-<transaction>.csv :
//   - jiji-achat.csv         (Jiji.co.ci, biens a vendre)
//   - jiji-location.csv      (Jiji.co.ci, biens a louer)
//   - coinafrique-achat.csv  (CoinAfrique CI, biens a vendre)
//   - coinafrique-location.csv (CoinAfrique CI, biens a louer)
//
// Format CSV : delimiteur ; encoding utf-8, colonnes :
//   source ; transaction ; type_bien ; titre ; prix_fcfa ; surface_m2 ;
//   prix_m2_fcfa ; chambres ; quartier ; sous_quartier ; standing ; url ;
//   scraped_at
//
// Realite des donnees :
//   - prix_fcfa quasiment toujours rempli
//   - surface_m2 et prix_m2_fcfa souvent vides (Jiji ne les expose pas en card)
//   - chambres souvent rempli, type_bien et quartier presque toujours
//   - duplicats par URL chez CoinAfrique : on dedoublonne au chargement
//   - rows bruit : titre = "75 000 CFA" (le scraper a parse le prix comme titre)
//
// Comme la surface est sparse, la cle de matching pour les rendements est
// (quartier, type_bien, chambres). Les medianes sont calculees sur ce groupe.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

// =============================================================================
// TYPES
// =============================================================================

export type Source = "jiji" | "coinafrique";
export type Transaction = "achat" | "location";

export type Listing = {
  source: Source;
  transaction: Transaction;
  type_bien: string;
  titre: string;
  prix_fcfa: number | null;
  surface_m2: number | null;
  prix_m2_fcfa: number | null;
  chambres: number | null;
  quartier: string;
  sous_quartier: string;
  standing: string;
  url: string;
  scraped_at: string;
};

const FILE_MAP: { source: Source; transaction: Transaction; file: string }[] = [
  { source: "jiji", transaction: "achat", file: "jiji-achat.csv" },
  { source: "jiji", transaction: "location", file: "jiji-location.csv" },
  { source: "coinafrique", transaction: "achat", file: "coinafrique-achat.csv" },
  { source: "coinafrique", transaction: "location", file: "coinafrique-location.csv" },
];

// =============================================================================
// PARSING + SANITY FILTERS
// =============================================================================

type RawRow = Record<string, string>;

function toNumOrNull(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/**
 * Detecte les rows bruit ou le titre est en realite le prix scrape :
 *   "75 000 CFA", "1 200 000 FCFA", "350 000"
 */
function isPriceLikeTitle(titre: string): boolean {
  if (!titre) return true;
  const t = titre.trim();
  if (t.length > 50) return false;
  return /^[\d][\d\s.,]+(?:\s*(?:CFA|FCFA|F\s*CFA))?$/i.test(t);
}

/** Bornes de plausibilite par type de transaction. Hors bornes -> drop. */
function isPriceSane(prix: number, transaction: Transaction): boolean {
  if (transaction === "achat") {
    // Achat : 1 M FCFA (terrain micro) a 5 Md FCFA (residence luxe)
    return prix >= 1_000_000 && prix <= 5_000_000_000;
  }
  // Location : 30k a 20M / mois
  return prix >= 30_000 && prix <= 20_000_000;
}

function parseCSVFile(
  file: string,
  source: Source,
  transaction: Transaction,
): Listing[] {
  let content: string;
  try {
    content = readFileSync(join(DATA_DIR, file), "utf-8");
  } catch {
    return []; // CSV pas encore genere
  }
  if (!content.trim()) return [];
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  const out: Listing[] = [];
  for (const r of result.data) {
    const titre = (r.titre ?? "").trim();
    if (!titre || isPriceLikeTitle(titre)) continue;

    const prix = toNumOrNull(r.prix_fcfa);
    if (prix !== null && !isPriceSane(prix, transaction)) continue;

    // Filtre : les terrains classes en "location" sont quasi-systematiquement
    // des erreurs de classification (les terrains sont vendus, pas loues).
    const typeBien = (r.type_bien ?? "").trim().toLowerCase();
    if (transaction === "location" && typeBien === "terrain") continue;

    const surface = toNumOrNull(r.surface_m2);
    let prixM2 = toNumOrNull(r.prix_m2_fcfa);
    if (prixM2 === null && prix !== null && surface !== null && surface > 0) {
      prixM2 = Math.round(prix / surface);
    }

    out.push({
      source,
      transaction,
      type_bien: (r.type_bien ?? "").trim(),
      titre,
      prix_fcfa: prix,
      surface_m2: surface !== null && surface > 4 && surface < 100000 ? surface : null,
      prix_m2_fcfa: prixM2,
      chambres: toNumOrNull(r.chambres),
      quartier: (r.quartier ?? "").trim(),
      sous_quartier: (r.sous_quartier ?? "").trim(),
      standing: (r.standing ?? "").trim(),
      url: (r.url ?? "").trim(),
      scraped_at: (r.scraped_at ?? "").trim(),
    });
  }
  return out;
}

// =============================================================================
// LOADER MEMOISE + DEDUP
// =============================================================================

let _cache: Listing[] | null = null;

export function loadAllListings(): Listing[] {
  if (_cache) return _cache;
  const all: Listing[] = [];
  for (const { source, transaction, file } of FILE_MAP) {
    all.push(...parseCSVFile(file, source, transaction));
  }
  // Dedup par (url || titre+source+transaction). Une URL peut apparaitre 2x
  // chez Coinafrique car les pages se chevauchent ; on garde la 1ere occurrence.
  const seen = new Set<string>();
  const deduped: Listing[] = [];
  for (const l of all) {
    const key = l.url || `${l.source}|${l.transaction}|${l.titre}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(l);
  }
  _cache = deduped;
  return deduped;
}

// =============================================================================
// STATS HELPERS
// =============================================================================

export function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function quantile(arr: number[], q: number): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (pos - lo) * (s[hi] - s[lo]);
}

// =============================================================================
// AGREGATS
// =============================================================================

export type CatalogStats = {
  totalListings: number;
  byTransaction: Record<Transaction, number>;
  bySource: Record<Source, number>;
  uniqueQuartiers: number;
  uniqueTypes: number;
  scrapedAt: string;
};

export function computeCatalogStats(listings: Listing[]): CatalogStats {
  const byTx: Record<Transaction, number> = { achat: 0, location: 0 };
  const bySrc: Record<Source, number> = { jiji: 0, coinafrique: 0 };
  const quartiers = new Set<string>();
  const types = new Set<string>();
  let latestScrape = "";
  for (const l of listings) {
    byTx[l.transaction]++;
    bySrc[l.source]++;
    if (l.quartier) quartiers.add(l.quartier);
    if (l.type_bien) types.add(l.type_bien);
    if (l.scraped_at && l.scraped_at > latestScrape) latestScrape = l.scraped_at;
  }
  return {
    totalListings: listings.length,
    byTransaction: byTx,
    bySource: bySrc,
    uniqueQuartiers: quartiers.size,
    uniqueTypes: types.size,
    scrapedAt: latestScrape,
  };
}

export type QuartierStats = {
  quartier: string;
  transaction: Transaction;
  count: number;
  prix_median: number | null;
  prix_p25: number | null;
  prix_p75: number | null;
  prix_min: number | null;
  prix_max: number | null;
};

export function statsByQuartierTransaction(
  listings: Listing[],
): Map<string, QuartierStats> {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!l.quartier || l.prix_fcfa === null) continue;
    const key = `${l.quartier}|${l.transaction}`;
    const arr = groups.get(key) ?? [];
    arr.push(l);
    groups.set(key, arr);
  }
  const out = new Map<string, QuartierStats>();
  for (const [key, ls] of groups) {
    const [quartier, transaction] = key.split("|") as [string, Transaction];
    const prix = ls.map((l) => l.prix_fcfa as number);
    out.set(key, {
      quartier,
      transaction,
      count: ls.length,
      prix_median: median(prix),
      prix_p25: quantile(prix, 0.25),
      prix_p75: quantile(prix, 0.75),
      prix_min: prix.length ? Math.min(...prix) : null,
      prix_max: prix.length ? Math.max(...prix) : null,
    });
  }
  return out;
}

// =============================================================================
// RENDEMENTS LOCATIFS BRUT
// =============================================================================

export type YieldRow = {
  quartier: string;
  type_bien: string;
  chambres: number | null;
  countAchat: number;
  countLocation: number;
  prix_achat_median: number;
  loyer_mensuel_mean: number;
  /** Rendement locatif brut annuel = (loyer_moyen * 12 / prix_achat_median) * 100 */
  rendement_brut_pct: number;
};

/**
 * Calcule les rendements locatifs bruts par groupe (quartier, type_bien, chambres).
 * Necessite >= 2 annonces achat ET >= 2 annonces location pour chaque groupe.
 */
export function computeYields(
  listings: Listing[],
  opts: { minSamples?: number; groupBy?: "quartier" | "quartier_type" | "quartier_type_chambres" } = {},
): YieldRow[] {
  const minSamples = opts.minSamples ?? 2;
  const groupBy = opts.groupBy ?? "quartier_type_chambres";

  const keyOf = (l: Listing): string => {
    if (groupBy === "quartier") return l.quartier;
    if (groupBy === "quartier_type") return `${l.quartier}|${l.type_bien || "—"}`;
    return `${l.quartier}|${l.type_bien || "—"}|${l.chambres ?? "—"}`;
  };

  const groups = new Map<string, { achat: number[]; location: number[]; sample: Listing }>();
  for (const l of listings) {
    if (!l.quartier || l.prix_fcfa === null) continue;
    const k = keyOf(l);
    let g = groups.get(k);
    if (!g) {
      g = { achat: [], location: [], sample: l };
      groups.set(k, g);
    }
    if (l.transaction === "achat") g.achat.push(l.prix_fcfa);
    else g.location.push(l.prix_fcfa);
  }

  const out: YieldRow[] = [];
  for (const [, g] of groups) {
    if (g.achat.length < minSamples || g.location.length < minSamples) continue;
    const pa = median(g.achat) as number;
    const pl = mean(g.location) as number;
    if (pa <= 0) continue;
    out.push({
      quartier: g.sample.quartier,
      type_bien: groupBy !== "quartier" ? g.sample.type_bien : "",
      chambres: groupBy === "quartier_type_chambres" ? g.sample.chambres : null,
      countAchat: g.achat.length,
      countLocation: g.location.length,
      prix_achat_median: pa,
      loyer_mensuel_mean: pl,
      rendement_brut_pct: ((pl * 12) / pa) * 100,
    });
  }
  return out.sort((a, b) => b.rendement_brut_pct - a.rendement_brut_pct);
}

// =============================================================================
// HEATMAP : prix median par (quartier, type_bien)
// =============================================================================

export type HeatmapCell = {
  quartier: string;
  type_bien: string;
  count: number;
  prix_median: number | null;
};

export function buildHeatmap(
  listings: Listing[],
  transaction: Transaction,
): {
  quartiers: string[];
  types: string[];
  cells: HeatmapCell[];
} {
  const filtered = listings.filter(
    (l) => l.transaction === transaction && l.quartier && l.type_bien && l.prix_fcfa !== null,
  );

  const quartiersCount = new Map<string, number>();
  const typesCount = new Map<string, number>();
  for (const l of filtered) {
    quartiersCount.set(l.quartier, (quartiersCount.get(l.quartier) ?? 0) + 1);
    typesCount.set(l.type_bien, (typesCount.get(l.type_bien) ?? 0) + 1);
  }
  const quartiers = Array.from(quartiersCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([q]) => q);
  const types = Array.from(typesCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const cells: HeatmapCell[] = [];
  for (const q of quartiers) {
    for (const t of types) {
      const ls = filtered.filter((l) => l.quartier === q && l.type_bien === t);
      cells.push({
        quartier: q,
        type_bien: t,
        count: ls.length,
        prix_median: ls.length ? median(ls.map((l) => l.prix_fcfa as number)) : null,
      });
    }
  }
  return { quartiers, types, cells };
}

// =============================================================================
// TOP DEALS : sous-evalues vs mediane (quartier, type, chambres)
// =============================================================================

export type DealRow = {
  listing: Listing;
  /** Mediane de reference pour le groupe (quartier, type_bien, chambres) */
  reference_median: number;
  /** Ecart relatif par rapport a la mediane (% negatif = sous-evalue) */
  spread_pct: number;
  groupSize: number;
};

export function findTopDeals(
  listings: Listing[],
  transaction: Transaction,
  opts: { minGroupSize?: number; limit?: number } = {},
): DealRow[] {
  const minGroupSize = opts.minGroupSize ?? 5;
  const limit = opts.limit ?? 10;

  const filtered = listings.filter(
    (l) =>
      l.transaction === transaction &&
      l.quartier &&
      l.type_bien &&
      l.chambres !== null &&
      l.prix_fcfa !== null,
  );

  // Group by (quartier, type, chambres) -> compute median
  const groups = new Map<string, number[]>();
  const groupKey = (l: Listing) => `${l.quartier}|${l.type_bien}|${l.chambres}`;
  for (const l of filtered) {
    const k = groupKey(l);
    const arr = groups.get(k) ?? [];
    arr.push(l.prix_fcfa as number);
    groups.set(k, arr);
  }
  const groupMedian = new Map<string, number>();
  const groupSize = new Map<string, number>();
  for (const [k, arr] of groups) {
    if (arr.length < minGroupSize) continue;
    groupMedian.set(k, median(arr) as number);
    groupSize.set(k, arr.length);
  }

  const deals: DealRow[] = [];
  for (const l of filtered) {
    const k = groupKey(l);
    const med = groupMedian.get(k);
    const sz = groupSize.get(k);
    if (med === undefined || sz === undefined) continue;
    const spread = (((l.prix_fcfa as number) - med) / med) * 100;
    deals.push({
      listing: l,
      reference_median: med,
      spread_pct: spread,
      groupSize: sz,
    });
  }
  deals.sort((a, b) => a.spread_pct - b.spread_pct);
  return deals.slice(0, limit);
}

// =============================================================================
// PRIX AU M² PAR LOCALITE
// =============================================================================
//
// Dispo uniquement quand surface_m2 est rempli (cas rare : quelques annonces
// CoinAfrique). On agrege par (quartier, transaction) avec mediane et P25/P75.

export type PriceM2Row = {
  quartier: string;
  transaction: Transaction;
  count: number;
  prix_m2_median: number | null;
  prix_m2_p25: number | null;
  prix_m2_p75: number | null;
  prix_m2_mean: number | null;
};

export function computePriceM2ByQuartier(
  listings: Listing[],
  opts: { minSamples?: number } = {},
): PriceM2Row[] {
  const minSamples = opts.minSamples ?? 3;
  const groups = new Map<string, { quartier: string; transaction: Transaction; values: number[] }>();
  for (const l of listings) {
    if (!l.quartier || l.prix_m2_fcfa === null) continue;
    // On retire les terrains des prix_m2 (le m² d'un terrain n'est pas
    // comparable au m² habitable d'un appartement / villa).
    if (l.type_bien === "terrain") continue;
    const key = `${l.quartier}|${l.transaction}`;
    let g = groups.get(key);
    if (!g) {
      g = { quartier: l.quartier, transaction: l.transaction, values: [] };
      groups.set(key, g);
    }
    g.values.push(l.prix_m2_fcfa);
  }
  const rows: PriceM2Row[] = [];
  for (const [, g] of groups) {
    if (g.values.length < minSamples) continue;
    rows.push({
      quartier: g.quartier,
      transaction: g.transaction,
      count: g.values.length,
      prix_m2_median: median(g.values),
      prix_m2_p25: quantile(g.values, 0.25),
      prix_m2_p75: quantile(g.values, 0.75),
      prix_m2_mean: mean(g.values),
    });
  }
  return rows.sort((a, b) => (b.prix_m2_median ?? 0) - (a.prix_m2_median ?? 0));
}

// =============================================================================
// HISTORIQUE PAR QUARTIER (cards top 8)
// =============================================================================

export type QuartierSummary = {
  quartier: string;
  countAchat: number;
  countLocation: number;
  prix_achat_median: number | null;
  loyer_mean: number | null;
  rendement_brut_pct: number | null;
  /** Type de bien le plus represente */
  type_dominant: string;
};

export function buildQuartierSummaries(listings: Listing[]): QuartierSummary[] {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!l.quartier) continue;
    const list = groups.get(l.quartier) ?? [];
    list.push(l);
    groups.set(l.quartier, list);
  }

  const out: QuartierSummary[] = [];
  for (const [q, ls] of groups) {
    const achats = ls.filter((l) => l.transaction === "achat" && l.prix_fcfa !== null);
    const locs = ls.filter((l) => l.transaction === "location" && l.prix_fcfa !== null);
    const pa = achats.length ? median(achats.map((l) => l.prix_fcfa as number)) : null;
    const pl = locs.length ? mean(locs.map((l) => l.prix_fcfa as number)) : null;
    const yld = pa && pl ? ((pl * 12) / pa) * 100 : null;
    const typeCounts = new Map<string, number>();
    for (const l of ls) {
      if (!l.type_bien) continue;
      typeCounts.set(l.type_bien, (typeCounts.get(l.type_bien) ?? 0) + 1);
    }
    const dominant =
      Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    out.push({
      quartier: q,
      countAchat: achats.length,
      countLocation: locs.length,
      prix_achat_median: pa,
      loyer_mean: pl,
      rendement_brut_pct: yld,
      type_dominant: dominant,
    });
  }

  return out.sort((a, b) => b.countAchat + b.countLocation - (a.countAchat + a.countLocation));
}

// =============================================================================
// FORMATTERS
// =============================================================================

export function formatFCFA(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2).replace(".", ",")} Md`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
}

export function formatPct(v: number | null, dec = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${v >= 0 ? "" : ""}${v.toFixed(dec).replace(".", ",")} %`;
}
