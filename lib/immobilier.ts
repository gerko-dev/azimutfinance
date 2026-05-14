// === IMMOBILIER : loader CSV + moteur d'analyse ===
//
// Sources de données :
//   1) Anciens CSV CI-only (scripts/scrape_immo.py)
//      - jiji-achat.csv          (Jiji.co.ci, biens à vendre)
//      - jiji-location.csv       (Jiji.co.ci, biens à louer)
//
//   2) CSV harmonisé multi-pays UEMOA (16 colonnes incluant `country`)
//      - coinafrique-uemoa.csv   (scrape_coinafrique_uemoa.py — 7 pays)
//      - selogeraumali.csv       (scrape_selogeraumali.py — Mali)
//      - expat-dakar.csv         (scrape_expatdakar.py — Sénégal)
//      - annoncesimmo-ci.csv     (scrape_annoncesimmoci.py — Côte d'Ivoire)
//      - clefsdufaso.csv         (scrape_clefsdufaso.py — Burkina Faso)
//      - beninagence.csv         (scrape_beninagence.py — Bénin)
//
// Format CSV harmonisé (délimiteur ;, UTF-8) :
//   country ; country_label ; source ; transaction ; type_bien ; subcategory ;
//   titre ; prix_fcfa ; surface_m2 ; prix_m2_fcfa ; chambres ; quartier ;
//   sous_quartier ; standing ; url ; scraped_at
//
// Réalité des données :
//   - prix_fcfa quasiment toujours rempli (annonces sans prix → drop au scraping)
//   - surface_m2 et prix_m2_fcfa sparse (sites de cards ne les exposent pas)
//   - chambres souvent rempli, type_bien et quartier presque toujours
//   - dédup par URL au chargement (annonces sponsorisées répétées)
//   - rows bruit possibles : titre = "75 000 CFA" (le scraper a parsé le prix
//     comme titre) → filtrés par isPriceLikeTitle
//
// Comme la surface est sparse, la clé de matching pour les rendements est
// (quartier, type_bien, chambres). Les médianes sont calculées sur ce groupe.

import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

// =============================================================================
// TYPES
// =============================================================================

export type Source =
  | "jiji"
  | "coinafrique"
  | "selogeraumali"
  | "expat-dakar"
  | "annoncesimmo-ci"
  | "clefsdufaso"
  | "beninagence";
export type Transaction = "achat" | "location";

export const ALL_SOURCES: Source[] = [
  "jiji",
  "coinafrique",
  "selogeraumali",
  "expat-dakar",
  "annoncesimmo-ci",
  "clefsdufaso",
  "beninagence",
];

/** Codes pays UEMOA (ISO 2 lettres en majuscules) */
export type CountryCode = "BJ" | "BF" | "CI" | "ML" | "NE" | "SN" | "TG";

export const UEMOA_COUNTRY_LABEL: Record<CountryCode, string> = {
  BJ: "Bénin",
  BF: "Burkina Faso",
  CI: "Côte d'Ivoire",
  ML: "Mali",
  NE: "Niger",
  SN: "Sénégal",
  TG: "Togo",
};

export const UEMOA_COUNTRIES: CountryCode[] = ["BJ", "BF", "CI", "ML", "NE", "SN", "TG"];

export type Listing = {
  source: Source;
  transaction: Transaction;
  /** Pays UEMOA (par défaut "CI" pour les anciennes données Jiji/CoinAfrique CI) */
  country: CountryCode;
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

/**
 * CSV harmonisés multi-pays (format 16 colonnes incluant `country`).
 * Tous parsés par `parseHarmonizedCsv` — le label de source est celui stocké
 * en colonne `source` du CSV.
 */
const HARMONIZED_CSVS: { file: string; source: Source }[] = [
  { file: "coinafrique-uemoa.csv", source: "coinafrique" },
  { file: "selogeraumali.csv", source: "selogeraumali" },
  { file: "expat-dakar.csv", source: "expat-dakar" },
  { file: "annoncesimmo-ci.csv", source: "annoncesimmo-ci" },
  { file: "clefsdufaso.csv", source: "clefsdufaso" },
  { file: "beninagence.csv", source: "beninagence" },
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
      country: "CI", // les anciens CSV jiji/coinafrique-achat/location sont CI-only
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
let _cacheKey = "";

/** Construit une clé basée sur les mtimes des CSV. Si un CSV change, le cache est invalidé. */
function buildCacheKey(): string {
  const files = [
    ...FILE_MAP.map((f) => f.file),
    ...HARMONIZED_CSVS.map((h) => h.file),
  ];
  return files
    .map((f) => {
      const p = join(DATA_DIR, f);
      if (!existsSync(p)) return `${f}:0`;
      try {
        return `${f}:${statSync(p).mtimeMs}`;
      } catch {
        return `${f}:0`;
      }
    })
    .join("|");
}

/**
 * Liste de quartiers/villes par pays, utilisée en fallback quand le scraper
 * n'a pas pu extraire le `quartier` depuis le DOM CoinAfrique (DOM différent
 * selon le pays). On cherche le 1er match (insensible à la casse) dans le
 * titre de l'annonce.
 */
const FALLBACK_QUARTIERS: Record<CountryCode, string[]> = {
  CI: [], // géré par le détecteur Abidjan dans le scraper
  SN: [
    // Région Dakar
    "Plateau", "Almadies", "Mermoz", "Ouakam", "Sacré-Cœur", "Sacre Coeur",
    "Yoff", "Ngor", "Liberté", "Liberte", "Point E", "Fann", "Médina", "Medina",
    "VDN", "Hann", "Sicap", "HLM", "Parcelles Assainies", "Pikine", "Guédiawaye",
    "Guediawaye", "Keur Massar", "Rufisque", "Bargny", "Bambilor", "Niague",
    "Niaga", "Diamniadio", "Sangalkam", "Yenne",
    // Régions
    "Saly", "Mbour", "Saint-Louis", "Saint Louis", "Thiès", "Thies", "Touba",
    "Kaolack", "Ziguinchor", "Kahone", "Gandigal", "Virage",
  ],
  BF: [
    "Ouagadougou", "Ouaga 2000", "Ouaga2000", "Ouaga", "Bobo-Dioulasso",
    "Bobo Dioulasso", "Bobo", "Banfora", "Koudougou",
    "Gounghin", "Tampouy", "Patte d'Oie", "Patte d Oie", "Pissy", "Tanghin",
    "Cissin", "Wemtenga", "Karpala", "Koulouba", "Zone du Bois", "Zone 1", "Zogona",
    "Tabtenga", "Saaba", "Kouritenga", "Rayongo", "Wayalghin", "Dassasgho",
    "Kalgondin", "Cité An III", "Cité An II", "Bonheur Ville",
  ],
  ML: [
    "Bamako", "Sikasso", "Ségou", "Segou", "Mopti", "Kayes", "Koulikoro",
    "ACI 2000", "ACI2000", "Hamdallaye", "Faladie", "Faladié", "Niamakoro",
    "Magnambougou", "Yirimadio", "Sotuba", "Lafiabougou", "Badalabougou",
    "Niarela", "Sogoniko", "Kalaban Coro", "Kalabancoro", "Kati", "Banankabougou",
    "Diatoula", "Sabalibougou", "Daoudabougou", "Mountougoula",
  ],
  NE: [
    "Niamey", "Maradi", "Zinder", "Tahoua", "Agadez", "Dosso",
    "Yantala", "Kouara Kano", "Lazaret", "Riad", "Plateau", "Recasement",
    "Talladje", "Bobiel", "Karssamba", "Bangoula", "Fenifoot",
  ],
  TG: [
    "Lomé", "Lome", "Sokodé", "Sokode", "Kara", "Kpalimé", "Kpalime",
    "Atakpamé", "Atakpame", "Tsévié", "Tsevie", "Aného", "Aneho", "Dapaong",
    "Adidogome", "Adidogomé", "Agoe", "Agoè", "Agoé", "Tokoin", "Bè", "Be",
    "Cacaveli", "Hedzranawoe", "Hédzranawoé", "Baguida", "Légbassito",
    "Legbassito", "Avedji", "Amadahomé", "Noépé", "Noepé", "Apessito",
    "Apéssito", "Vakpossito", "Wuiti",
  ],
  BJ: [
    "Cotonou", "Porto-Novo", "Porto Novo", "Parakou", "Abomey", "Bohicon",
    "Calavi", "Abomey-Calavi", "Abomey Calavi", "Akpakpa", "Fidjrossè",
    "Fidjrosse", "Fidjrossé", "Cadjèhoun", "Cadjehoun", "Godomey", "Houénoussou",
    "Ganhi", "Ste Rita", "Sainte Rita", "St Rita", "Sénadé", "Mènontin",
    "Kouhounou", "Hêvié", "Hevie", "Hevié", "Sikecodji", "Houéto", "Houeto",
    "Zopa", "Malanville", "Denou",
  ],
};

/** Cherche une localité connue dans un titre. Renvoie le premier match exact. */
function extractFallbackQuartier(country: CountryCode, titre: string): string {
  const list = FALLBACK_QUARTIERS[country];
  if (!list || list.length === 0) return "";
  const t = titre.toLowerCase();
  for (const q of list) {
    if (t.includes(q.toLowerCase())) return q;
  }
  return "";
}

/**
 * Parser pour les CSV harmonisés multi-pays (16 colonnes, `country` inclus).
 * Utilisé pour coinafrique-uemoa, selogeraumali, expat-dakar, annoncesimmo-ci,
 * clefsdufaso, beninagence.
 *
 * Le paramètre `defaultSource` est utilisé comme fallback quand la colonne
 * `source` du CSV est absente — sinon on respecte la valeur du fichier.
 */
function parseHarmonizedCsv(file: string, defaultSource: Source): Listing[] {
  let content: string;
  try {
    content = readFileSync(join(DATA_DIR, file), "utf-8");
  } catch {
    return [];
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

    const rawCountry = (r.country ?? "").trim().toUpperCase() as CountryCode;
    if (!UEMOA_COUNTRIES.includes(rawCountry)) continue;

    let transaction = (r.transaction ?? "").trim().toLowerCase() as Transaction;
    if (transaction !== "achat" && transaction !== "location") continue;

    const typeBien = (r.type_bien ?? "").trim().toLowerCase();
    // Les terrains sont par convention en vente. Le scraper peut détecter
    // "location" à tort si "/mois" apparaît ailleurs dans le DOM → on force.
    if (typeBien === "terrain" && transaction === "location") {
      transaction = "achat";
    }

    const prix = toNumOrNull(r.prix_fcfa);
    if (prix !== null && !isPriceSane(prix, transaction)) continue;

    const surface = toNumOrNull(r.surface_m2);
    let prixM2 = toNumOrNull(r.prix_m2_fcfa);
    if (prixM2 === null && prix !== null && surface !== null && surface > 0) {
      prixM2 = Math.round(prix / surface);
    }

    let quartier = (r.quartier ?? "").trim();
    if (!quartier) {
      quartier = extractFallbackQuartier(rawCountry, titre);
    }

    // Source : valeur du CSV si présente et reconnue, sinon fallback du chargeur
    const csvSource = (r.source ?? "").trim() as Source;
    const source: Source = ALL_SOURCES.includes(csvSource) ? csvSource : defaultSource;

    out.push({
      source,
      transaction,
      country: rawCountry,
      type_bien: (r.type_bien ?? "").trim(),
      titre,
      prix_fcfa: prix,
      surface_m2: surface !== null && surface > 4 && surface < 100000 ? surface : null,
      prix_m2_fcfa: prixM2,
      chambres: toNumOrNull(r.chambres),
      quartier,
      sous_quartier: (r.sous_quartier ?? "").trim(),
      standing: (r.standing ?? "").trim(),
      url: (r.url ?? "").trim(),
      scraped_at: (r.scraped_at ?? "").trim(),
    });
  }
  return out;
}

export function loadAllListings(): Listing[] {
  const key = buildCacheKey();
  if (_cache && key === _cacheKey) return _cache;
  _cacheKey = key;
  const all: Listing[] = [];
  for (const { source, transaction, file } of FILE_MAP) {
    all.push(...parseCSVFile(file, source, transaction));
  }
  for (const { file, source } of HARMONIZED_CSVS) {
    all.push(...parseHarmonizedCsv(file, source));
  }
  // Dedup par (url || source+transaction+country+titre). Annonces sponsorisées
  // peuvent réapparaître entre pages ; on garde la 1ère occurrence.
  const seen = new Set<string>();
  const deduped: Listing[] = [];
  for (const l of all) {
    const key = l.url || `${l.source}|${l.transaction}|${l.country}|${l.titre}`;
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
  const bySrc: Record<Source, number> = {
    jiji: 0,
    coinafrique: 0,
    selogeraumali: 0,
    "expat-dakar": 0,
    "annoncesimmo-ci": 0,
    clefsdufaso: 0,
    beninagence: 0,
  };
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

/**
 * Rendement locatif brut au m² — l'analytique clé pour l'investisseur.
 * Calculé uniquement sur la catégorie `logements` (seule où achat ET
 * location existent simultanément).
 *
 * Formule : (loyer médian m²/mois × 12) / prix achat médian m² × 100
 */
export type QuartierYieldM2Row = {
  quartier: string;
  prixAchatM2: number;
  loyerM2Monthly: number;
  rendementBrutPct: number;
  countAchat: number;
  countLocation: number;
};

export type CommuneYieldM2Row = {
  commune: string;
  region: string;
  /** Calculé sur l'ensemble des listings logements de la commune (vraie médiane
   *  agrégée, pas moyenne des sous-quartiers). */
  prixAchatM2: number;
  loyerM2Monthly: number;
  rendementBrutPct: number;
  countAchat: number;
  countLocation: number;
  children: QuartierYieldM2Row[];
};

/**
 * Rendements hiérarchiques par commune (via mapping `quartier-mapping.csv`)
 * avec drill-down par quartier. Cohérent avec computePriceM2HierarchicalByCommune.
 */
export function computeYieldsHierarchicalByCommune(
  listings: Listing[],
  opts: { minSamplesCommune?: number; minSamplesQuartier?: number } = {},
): CommuneYieldM2Row[] {
  const minCommune = opts.minSamplesCommune ?? 3;
  const minQuartier = opts.minSamplesQuartier ?? 3;

  type Bucket = { achat: number[]; location: number[] };
  const newBucket = (): Bucket => ({ achat: [], location: [] });

  type CommuneAgg = {
    commune: string;
    region: string;
    agg: Bucket;
    children: Map<string, Bucket>;
  };

  const communes = new Map<string, CommuneAgg>();

  for (const l of listings) {
    if (!l.quartier) continue;
    const { commune, quartierPretty, region } = assignCommune(
      l.country,
      l.quartier,
    );
    if (!commune) continue;
    const cat = classifyBien(l);
    if (cat !== "logements") continue;

    let prixM2: number | null = l.prix_m2_fcfa;
    if (prixM2 === null && l.prix_fcfa && l.surface_m2 && l.surface_m2 > 0) {
      prixM2 = l.prix_fcfa / l.surface_m2;
    }
    if (prixM2 === null || !isFinite(prixM2) || prixM2 <= 0) continue;
    if (l.transaction === "achat") {
      if (prixM2 < 50_000 || prixM2 > 5_000_000) continue;
    } else {
      if (prixM2 < 1_000 || prixM2 > 50_000) continue;
    }

    let cg = communes.get(commune);
    if (!cg) {
      cg = { commune, region, agg: newBucket(), children: new Map() };
      communes.set(commune, cg);
    } else if (!cg.region && region) {
      cg.region = region;
    }
    cg.agg[l.transaction].push(prixM2);

    if (quartierPretty) {
      let qb = cg.children.get(quartierPretty);
      if (!qb) {
        qb = newBucket();
        cg.children.set(quartierPretty, qb);
      }
      qb[l.transaction].push(prixM2);
    }
  }

  function summarize(
    b: Bucket,
    minS: number,
  ): { pa: number; pl: number; r: number; nA: number; nL: number } | null {
    if (b.achat.length < minS || b.location.length < minS) return null;
    const pa = median(b.achat);
    const pl = median(b.location);
    if (pa === null || pl === null || pa <= 0) return null;
    return {
      pa,
      pl,
      r: ((pl * 12) / pa) * 100,
      nA: b.achat.length,
      nL: b.location.length,
    };
  }

  const out: CommuneYieldM2Row[] = [];
  for (const [, cg] of communes) {
    const summ = summarize(cg.agg, minCommune);
    const childrenRows: QuartierYieldM2Row[] = [];
    for (const [q, qb] of cg.children) {
      const s = summarize(qb, minQuartier);
      if (!s) continue;
      childrenRows.push({
        quartier: q,
        prixAchatM2: s.pa,
        loyerM2Monthly: s.pl,
        rendementBrutPct: s.r,
        countAchat: s.nA,
        countLocation: s.nL,
      });
    }
    childrenRows.sort((a, b) => b.rendementBrutPct - a.rendementBrutPct);

    if (!summ && childrenRows.length === 0) continue;
    out.push({
      commune: cg.commune,
      region: cg.region,
      prixAchatM2: summ?.pa ?? 0,
      loyerM2Monthly: summ?.pl ?? 0,
      rendementBrutPct: summ?.r ?? 0,
      countAchat: summ?.nA ?? 0,
      countLocation: summ?.nL ?? 0,
      children: childrenRows,
    });
  }

  // Tri : region (ordre CSV), puis rendement décroissant
  const regionOrder = getRegionOrder();
  const regionRank = new Map<string, number>();
  regionOrder.forEach((r, i) => regionRank.set(r, i));
  return out.sort((a, b) => {
    const ra = a.region ? (regionRank.get(a.region) ?? 1e9) : 1e9 + 1;
    const rb = b.region ? (regionRank.get(b.region) ?? 1e9) : 1e9 + 1;
    if (ra !== rb) return ra - rb;
    return b.rendementBrutPct - a.rendementBrutPct;
  });
}

/**
 * Comparaison cross-pays : médiane du prix au m² par pays × catégorie,
 * pour une transaction donnée. Utilisé pour le bar chart "Quel pays
 * est le moins cher pour acheter un logement ?".
 */
export type CountryPriceM2Row = {
  country: CountryCode;
  prices: Record<BienCategorie, number | null>;
  counts: Record<BienCategorie, number>;
};

export function computePriceM2ByCountry(
  listings: Listing[],
  transaction: Transaction,
  opts: { minSamples?: number } = {},
): CountryPriceM2Row[] {
  const minSamples = opts.minSamples ?? 5;
  const groups = new Map<CountryCode, Record<BienCategorie, number[]>>();

  for (const l of listings) {
    if (l.transaction !== transaction) continue;
    const cat = classifyBien(l);
    if (cat === null) continue;
    if (!BIEN_CATEGORIES_BY_TRANSACTION[transaction].includes(cat)) continue;

    let prixM2: number | null = l.prix_m2_fcfa;
    if (prixM2 === null && l.prix_fcfa && l.surface_m2 && l.surface_m2 > 0) {
      prixM2 = l.prix_fcfa / l.surface_m2;
    }
    if (prixM2 === null || !isFinite(prixM2) || prixM2 <= 0) continue;

    if (cat === "terrains") {
      if (prixM2 < 5_000 || prixM2 > 5_000_000) continue;
    } else if (transaction === "achat") {
      if (prixM2 < 50_000 || prixM2 > 5_000_000) continue;
    } else {
      if (prixM2 < 1_000 || prixM2 > 50_000) continue;
    }

    let g = groups.get(l.country);
    if (!g) {
      g = EMPTY_CAT_RECORD() as unknown as Record<BienCategorie, number[]>;
      for (const c of BIEN_CATEGORIES) (g as Record<BienCategorie, number[]>)[c] = [];
      groups.set(l.country, g as Record<BienCategorie, number[]>);
    }
    (g as Record<BienCategorie, number[]>)[cat].push(prixM2);
  }

  const out: CountryPriceM2Row[] = [];
  for (const [country, byCat] of groups) {
    const prices = EMPTY_CAT_RECORD();
    const counts: Record<BienCategorie, number> = {
      bureaux: 0,
      logements: 0,
      magasins: 0,
      terrains: 0,
    };
    for (const c of BIEN_CATEGORIES) {
      const vals = byCat[c];
      counts[c] = vals.length;
      if (vals.length >= minSamples) prices[c] = median(vals);
    }
    out.push({ country, prices, counts });
  }

  return out.sort((a, b) => a.country.localeCompare(b.country));
}

/**
 * Dispersion (Q1, médiane, Q3, IQR) du prix au m² par quartier normalisé,
 * pour une transaction × catégorie. Permet de visualiser un boxplot-like
 * et de repérer les quartiers où le marché est hétérogène.
 */
export type QuartierDispersionRow = {
  quartier: string;
  count: number;
  q1: number;
  median: number;
  q3: number;
  iqr: number;
};

export function computeDispersionByQuartier(
  listings: Listing[],
  transaction: Transaction,
  categorie: BienCategorie,
  opts: { minSamples?: number; topN?: number } = {},
): QuartierDispersionRow[] {
  const minSamples = opts.minSamples ?? 5;
  const topN = opts.topN ?? 15;
  // Groupes par (commune, quartierPretty) — utilise le mapping pour éviter
  // la fragmentation type "cocody" / "cocody riviera" / "abidjan-cocody-riviera".
  const groups = new Map<string, { label: string; values: number[] }>();

  for (const l of listings) {
    if (l.transaction !== transaction) continue;
    if (!l.quartier) continue;
    const { commune, quartierPretty } = assignCommune(l.country, l.quartier);
    if (!commune) continue;
    const cat = classifyBien(l);
    if (cat !== categorie) continue;

    let prixM2: number | null = l.prix_m2_fcfa;
    if (prixM2 === null && l.prix_fcfa && l.surface_m2 && l.surface_m2 > 0) {
      prixM2 = l.prix_fcfa / l.surface_m2;
    }
    if (prixM2 === null || !isFinite(prixM2) || prixM2 <= 0) continue;

    if (categorie === "terrains") {
      if (prixM2 < 5_000 || prixM2 > 5_000_000) continue;
    } else if (transaction === "achat") {
      if (prixM2 < 50_000 || prixM2 > 5_000_000) continue;
    } else {
      if (prixM2 < 1_000 || prixM2 > 50_000) continue;
    }

    const key = quartierPretty ? `${commune}||${quartierPretty}` : commune;
    const label = quartierPretty ? `${commune} — ${quartierPretty}` : commune;
    let g = groups.get(key);
    if (!g) {
      g = { label, values: [] };
      groups.set(key, g);
    }
    g.values.push(prixM2);
  }

  const out: QuartierDispersionRow[] = [];
  for (const [, g] of groups) {
    if (g.values.length < minSamples) continue;
    const q1 = quantile(g.values, 0.25);
    const med = median(g.values);
    const q3 = quantile(g.values, 0.75);
    if (q1 === null || med === null || q3 === null) continue;
    out.push({
      quartier: g.label,
      count: g.values.length,
      q1,
      median: med,
      q3,
      iqr: q3 - q1,
    });
  }
  return out
    .sort((a, b) => b.median - a.median)
    .slice(0, topN);
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

  // Group by (quartier normalisé, type, chambres) -> compute median
  // La normalisation fusionne les variantes typographiques du même quartier
  // (Cocody, COCODY, cocody) avant de calculer la médiane de référence.
  const groups = new Map<string, number[]>();
  const groupKey = (l: Listing) =>
    `${normalizeQuartier(l.quartier)}|${l.type_bien}|${l.chambres}`;
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

// =============================================================================
// CATEGORIES UTILISATEUR : bureaux / logements / magasins / terrains
// =============================================================================

export type BienCategorie = "bureaux" | "logements" | "magasins" | "terrains";

export const BIEN_CATEGORIES: BienCategorie[] = [
  "bureaux",
  "logements",
  "magasins",
  "terrains",
];

export const BIEN_CATEGORIE_LABEL: Record<BienCategorie, string> = {
  bureaux: "Bureaux",
  logements: "Logements",
  magasins: "Magasins",
  terrains: "Terrains",
};

/**
 * Catégories pertinentes par type de transaction :
 *   - achat    : on n'achète pas typiquement des bureaux ou magasins seuls (les
 *                annonces correspondantes sont des biens commerciaux entiers, hors
 *                cible). Reste : logements et terrains.
 *   - location : pas de location de terrain (les terrains se vendent, pas se louent).
 */
export const BIEN_CATEGORIES_BY_TRANSACTION: Record<Transaction, BienCategorie[]> = {
  achat: ["logements", "terrains"],
  location: ["bureaux", "logements", "magasins"],
};

/**
 * Classifie une annonce dans l'une des 4 catégories métier.
 * Le champ `type_bien` ne distingue pas bureau/magasin (regroupés en "commercial"),
 * d'où l'utilisation du titre pour départager.
 */
export function classifyBien(listing: Listing): BienCategorie | null {
  const t = (listing.type_bien || "").toLowerCase().trim();
  const titre = (listing.titre || "").toLowerCase();

  if (t === "terrain") return "terrains";

  if (
    t === "appartement" ||
    t === "maison" ||
    t === "villa" ||
    t === "studio" ||
    t === "immeuble"
  ) {
    return "logements";
  }

  // type_bien = "commercial" ou type_bien non renseigné → départage par titre
  const isBureau = /\bbureau/.test(titre);
  const isMagasin = /\b(magasin|boutique|local\s+commercial|entrepot|entrepôt)/.test(titre);

  if (t === "commercial") {
    if (isBureau && !isMagasin) return "bureaux";
    if (isMagasin && !isBureau) return "magasins";
    // "bureaux & commerces" / ambigu → on classe en bureaux (usage le plus courant
    // dans les annonces ivoiriennes labellisées commercial)
    return "bureaux";
  }

  // Fallback : type_bien vide/inconnu, on tente via le titre
  if (isBureau) return "bureaux";
  if (isMagasin) return "magasins";
  if (/\b(appartement|villa|maison|studio|duplex|logement)/.test(titre)) {
    return "logements";
  }
  if (/\bterrain/.test(titre)) return "terrains";
  return null;
}

// =============================================================================
// AGREGAT : prix médian/m² par (catégorie, localité, transaction)
// =============================================================================

export type PriceM2CategoryRow = {
  quartier: string;
  /** Médiane prix/m² achat, FCFA — null si pas assez d'échantillons */
  achat: Record<BienCategorie, number | null>;
  /** Médiane prix/m² location (loyer/m² mensuel), FCFA */
  location: Record<BienCategorie, number | null>;
  countAchat: number;
  countLocation: number;
};

/**
 * Ligne hiérarchique pour le tableau immobilier : agrégat commune avec
 * éventuellement des quartiers enfants (drill-down).
 */
export type CommuneM2Row = {
  commune: string;
  /** Région d'agrégat (ex: ABIDJAN). Vide = pas de regroupement. */
  region: string;
  /** Médiane prix/m² achat, calculée sur l'ensemble des listings de la commune */
  achat: Record<BienCategorie, number | null>;
  location: Record<BienCategorie, number | null>;
  countAchat: number;
  countLocation: number;
  /** Quartiers détaillés appartenant à cette commune (vide si pas de mapping) */
  children: PriceM2CategoryRow[];
};

const EMPTY_CAT_RECORD = (): Record<BienCategorie, number | null> => ({
  bureaux: null,
  logements: null,
  magasins: null,
  terrains: null,
});

/**
 * Calcule la médiane du prix/m² par (quartier, catégorie, transaction).
 * - Pour terrains : on utilise prix_fcfa / surface_m2 (le m² de terrain est le seul
 *   indicateur pertinent même si pas "habitable").
 * - Pour les autres : on garde prix_m2_fcfa déjà calculé dans le CSV.
 */
/**
 * Normalise un nom de quartier pour fusionner les variantes :
 *   "Cocody"           → "cocody"
 *   "COCODY"           → "cocody"
 *   "Cocody  Riviera"  → "cocody riviera"
 *   "Côte d'Ivoire"    → "cote d ivoire"
 * Utilisé comme clé d'agrégation. Pour l'affichage, voir prettyQuartierLabel.
 */
export function normalizeQuartier(q: string): string {
  if (!q) return "";
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques combinants
    .replace(/[‘’'`]/g, " ") // apostrophes typographiques + droites
    .replace(/-/g, " ") // tirets → espaces (slugs type "grand-bassam")
    .replace(/[^a-z0-9\s]/g, " ") // ponctuation résiduelle
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapping géographique : alias quartier → { commune, quartier_pretty, region }.
 * Chargé depuis data/quartier-mapping.csv. Mémoïsé.
 *
 * `region` permet de grouper plusieurs communes dans une section géographique
 * (ex: "ABIDJAN" pour Cocody/Marcory/Yopougon ; "LITTORAL EST" pour
 * Bingerville/Grand-Bassam). Vide = pas de regroupement.
 */
type CommuneAssignment = {
  commune: string;
  quartierPretty: string;
  region: string;
};
let _mappingCache: Map<string, CommuneAssignment> | null = null;
/** Ordre d'apparition des régions dans le CSV (pour le tri d'affichage). */
let _regionOrder: string[] = [];

function mappingKey(country: string, normalizedAlias: string): string {
  return `${country.toUpperCase()}|${normalizedAlias}`;
}

function loadQuartierMapping(): Map<string, CommuneAssignment> {
  if (_mappingCache) return _mappingCache;
  const map = new Map<string, CommuneAssignment>();
  const seenRegions = new Set<string>();
  const regionOrder: string[] = [];
  try {
    const content = readFileSync(
      join(DATA_DIR, "quartier-mapping.csv"),
      "utf-8",
    );
    const result = Papa.parse<Record<string, string>>(content, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^﻿/, "").trim(),
      comments: "#",
    });
    for (const r of result.data) {
      const country = (r.country || "").trim().toUpperCase();
      const alias = normalizeQuartier(r.quartier_alias || "");
      const commune = (r.commune || "").trim();
      const pretty = (r.quartier_pretty || "").trim();
      const region = (r.region || "").trim();
      if (!country || !alias || !commune) continue;
      map.set(mappingKey(country, alias), {
        commune,
        quartierPretty: pretty,
        region,
      });
      if (region && !seenRegions.has(region)) {
        seenRegions.add(region);
        regionOrder.push(region);
      }
    }
  } catch {
    // CSV absent : on continue sans mapping
  }
  _mappingCache = map;
  _regionOrder = regionOrder;
  return map;
}

/** Ordre des régions tel que rencontré dans le CSV. */
export function getRegionOrder(): string[] {
  loadQuartierMapping();
  return _regionOrder;
}

/**
 * Pour un listing donné, retourne la commune canonique et le quartier propre.
 * Fallback : si aucun mapping, le quartier devient sa propre commune.
 */
export function assignCommune(
  country: string,
  quartierRaw: string,
): CommuneAssignment {
  const normalized = normalizeQuartier(quartierRaw);
  if (!normalized) return { commune: "", quartierPretty: "", region: "" };
  const map = loadQuartierMapping();

  // 1) Match exact
  const exact = map.get(mappingKey(country, normalized));
  if (exact) return exact;

  // 2) Match flexible par suffixes : "abidjan cocody angre" → "cocody angre"
  //    → "angre". On retire un token de gauche à chaque itération. On garde
  //    le suffixe **le plus long** qui matche (= plus spécifique géographiquement).
  const tokens = normalized.split(" ").filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const candidate = tokens.slice(i).join(" ");
    const hit = map.get(mappingKey(country, candidate));
    if (hit) return hit;
  }

  // 3) Match d'un préfixe : "fidjrosse plage centre" → "fidjrosse plage"
  //    → "fidjrosse". On retire un token de droite cette fois.
  for (let len = tokens.length - 1; len >= 1; len--) {
    const candidate = tokens.slice(0, len).join(" ");
    const hit = map.get(mappingKey(country, candidate));
    if (hit) return hit;
  }

  // 4) Fallback : quartier brut promu en commune (libellé propre, pas de drill)
  return {
    commune: prettyQuartierLabel(normalized),
    quartierPretty: "",
    region: "",
  };
}

/**
 * Joli label depuis un nom normalisé : title case mot par mot.
 *   "cocody riviera" → "Cocody Riviera"
 */
export function prettyQuartierLabel(normalized: string): string {
  if (!normalized) return "";
  return normalized
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/** Filtres applicables avant agrégation (utilisés depuis la page via search params). */
export type ListingFilters = {
  /** Code pays UEMOA. Si défini, filtre les listings de ce pays. */
  country?: CountryCode;
  /** Année (issue de scraped_at). Filtre les listings scrapés cette année. */
  year?: number;
  /** Transaction. Si défini, filtre achat ou location. */
  transaction?: Transaction;
};

export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  return listings.filter((l) => {
    if (filters.country && l.country !== filters.country) return false;
    if (filters.transaction && l.transaction !== filters.transaction) return false;
    if (filters.year !== undefined) {
      const yr = Number(l.scraped_at.slice(0, 4));
      if (yr !== filters.year) return false;
    }
    return true;
  });
}

/** Années distinctes présentes dans les listings (utile pour le sélecteur). */
export function listAvailableYears(listings: Listing[]): number[] {
  const years = new Set<number>();
  for (const l of listings) {
    const yr = Number(l.scraped_at.slice(0, 4));
    if (isFinite(yr) && yr > 2000) years.add(yr);
  }
  return Array.from(years).sort((a, b) => b - a);
}

/** Codes pays distincts présents dans les listings (utile pour le sélecteur). */
export function listAvailableCountries(listings: Listing[]): CountryCode[] {
  const set = new Set<CountryCode>();
  for (const l of listings) set.add(l.country);
  return UEMOA_COUNTRIES.filter((c) => set.has(c));
}

/**
 * Médianes "Hero" calculées directement sur les listings individuels (par
 * catégorie), pas sur les médianes commune. Donne la **vraie** médiane
 * pondérée pour le pays sélectionné.
 */
export function computeHeroMediansFromListings(
  listings: Listing[],
  transaction: Transaction,
): Record<BienCategorie, number | null> {
  const buckets: Record<BienCategorie, number[]> = {
    bureaux: [],
    logements: [],
    magasins: [],
    terrains: [],
  };
  for (const l of listings) {
    if (l.transaction !== transaction) continue;
    const cat = classifyBien(l);
    if (cat === null) continue;
    let prixM2: number | null = l.prix_m2_fcfa;
    if (prixM2 === null && l.prix_fcfa && l.surface_m2 && l.surface_m2 > 0) {
      prixM2 = l.prix_fcfa / l.surface_m2;
    }
    if (prixM2 === null || !isFinite(prixM2) || prixM2 <= 0) continue;
    if (cat === "terrains") {
      if (prixM2 < 5_000 || prixM2 > 5_000_000) continue;
    } else if (transaction === "achat") {
      if (prixM2 < 50_000 || prixM2 > 5_000_000) continue;
    } else {
      if (prixM2 < 1_000 || prixM2 > 50_000) continue;
    }
    buckets[cat].push(prixM2);
  }
  return {
    bureaux: median(buckets.bureaux),
    logements: median(buckets.logements),
    magasins: median(buckets.magasins),
    terrains: median(buckets.terrains),
  };
}

/**
 * Hiérarchique : pour chaque listing, on déduit (commune, quartier) via le
 * mapping `data/quartier-mapping.csv`, puis :
 *   - les médianes commune sont calculées sur **tous** les listings rattachés
 *     à cette commune (vraie médiane pondérée, pas moyenne des médianes)
 *   - les quartiers enfants apparaissent comme drill-down (avec leur propre
 *     médiane) si le mapping leur donne un `quartier_pretty`
 *   - fallback : un quartier sans mapping devient sa propre commune sans enfant
 */
export function computePriceM2HierarchicalByCommune(
  listings: Listing[],
  opts: { minSamplesCommune?: number; minSamplesQuartier?: number } = {},
): CommuneM2Row[] {
  const minCommune = opts.minSamplesCommune ?? 5;
  const minQuartier = opts.minSamplesQuartier ?? 3;

  type Bucket = {
    achat: Record<BienCategorie, number[]>;
    location: Record<BienCategorie, number[]>;
  };
  const newBucket = (): Bucket => ({
    achat: { bureaux: [], logements: [], magasins: [], terrains: [] },
    location: { bureaux: [], logements: [], magasins: [], terrains: [] },
  });

  type CommuneAgg = {
    commune: string;
    region: string;
    agg: Bucket;
    children: Map<string, Bucket>;
  };

  const communes = new Map<string, CommuneAgg>();

  for (const l of listings) {
    if (!l.quartier) continue;
    const { commune, quartierPretty, region } = assignCommune(
      l.country,
      l.quartier,
    );
    if (!commune) continue;
    const cat = classifyBien(l);
    if (cat === null) continue;

    let prixM2: number | null = l.prix_m2_fcfa;
    if (prixM2 === null && l.prix_fcfa && l.surface_m2 && l.surface_m2 > 0) {
      prixM2 = l.prix_fcfa / l.surface_m2;
    }
    if (prixM2 === null || !isFinite(prixM2) || prixM2 <= 0) continue;

    if (cat === "terrains") {
      if (prixM2 < 5_000 || prixM2 > 5_000_000) continue;
    } else if (l.transaction === "achat") {
      if (prixM2 < 50_000 || prixM2 > 5_000_000) continue;
    } else {
      if (prixM2 < 1_000 || prixM2 > 50_000) continue;
    }

    let cg = communes.get(commune);
    if (!cg) {
      cg = { commune, region, agg: newBucket(), children: new Map() };
      communes.set(commune, cg);
    } else if (!cg.region && region) {
      // Si une 1ère ligne n'avait pas de region mais une plus tardive en a une, on l'adopte
      cg.region = region;
    }
    cg.agg[l.transaction][cat].push(prixM2);

    if (quartierPretty) {
      let qb = cg.children.get(quartierPretty);
      if (!qb) {
        qb = newBucket();
        cg.children.set(quartierPretty, qb);
      }
      qb[l.transaction][cat].push(prixM2);
    }
  }

  function summarize(
    bucket: Bucket,
    minSamples: number,
  ): {
    achat: Record<BienCategorie, number | null>;
    location: Record<BienCategorie, number | null>;
    countA: number;
    countL: number;
  } {
    const achat = EMPTY_CAT_RECORD();
    const location = EMPTY_CAT_RECORD();
    let countA = 0;
    let countL = 0;
    for (const c of BIEN_CATEGORIES) {
      const a = bucket.achat[c];
      const lo = bucket.location[c];
      if (a.length >= minSamples) achat[c] = median(a);
      if (lo.length >= minSamples) location[c] = median(lo);
      countA += a.length;
      countL += lo.length;
    }
    return { achat, location, countA, countL };
  }

  const out: CommuneM2Row[] = [];
  for (const [, cg] of communes) {
    const commune = summarize(cg.agg, minCommune);
    const hasCommune = BIEN_CATEGORIES.some(
      (c) => commune.achat[c] !== null || commune.location[c] !== null,
    );
    const childrenRows: PriceM2CategoryRow[] = [];
    for (const [quartier, qb] of cg.children) {
      const s = summarize(qb, minQuartier);
      const hasAny = BIEN_CATEGORIES.some(
        (c) => s.achat[c] !== null || s.location[c] !== null,
      );
      if (!hasAny) continue;
      childrenRows.push({
        quartier,
        achat: s.achat,
        location: s.location,
        countAchat: s.countA,
        countLocation: s.countL,
      });
    }
    // Tri quartiers enfants par médiane achat decroissante
    childrenRows.sort((a, b) => {
      const sa = BIEN_CATEGORIES.reduce((s, c) => s + (a.achat[c] ?? 0), 0);
      const sb = BIEN_CATEGORIES.reduce((s, c) => s + (b.achat[c] ?? 0), 0);
      return sb - sa;
    });

    if (!hasCommune && childrenRows.length === 0) continue;
    out.push({
      commune: cg.commune,
      region: cg.region,
      achat: commune.achat,
      location: commune.location,
      countAchat: commune.countA,
      countLocation: commune.countL,
      children: childrenRows,
    });
  }

  // Tri : d'abord par region (selon ordre du CSV ; les sans-region à la fin),
  // puis par richesse décroissante au sein de chaque region.
  const regionOrder = getRegionOrder();
  const regionRank = new Map<string, number>();
  regionOrder.forEach((r, i) => regionRank.set(r, i));
  return out.sort((a, b) => {
    const ra = a.region ? (regionRank.get(a.region) ?? 1e9) : 1e9 + 1;
    const rb = b.region ? (regionRank.get(b.region) ?? 1e9) : 1e9 + 1;
    if (ra !== rb) return ra - rb;
    const sa = BIEN_CATEGORIES.reduce((s, c) => s + (a.achat[c] ?? 0), 0);
    const sb = BIEN_CATEGORIES.reduce((s, c) => s + (b.achat[c] ?? 0), 0);
    return sb - sa;
  });
}

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
