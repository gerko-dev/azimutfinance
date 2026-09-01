// === Scraping indices BRVM en direct ===
//
// Source : https://www.brvm.org/fr/indices
// La page contient 3 sections :
//   1. Indices principaux : BRVM-30, BRVM - COMPOSITE, BRVM - PRESTIGE, BRVM - PRINCIPAL
//   2. Indices sectoriels : 7 secteurs (CONSO BASE, CONSO DISCR, ENERGIE, INDUSTRIELS,
//      SERV FIN, SERV PUB, TELECOMS)
//   3. Indice Total Return : BRVM – COMPOSITE TOTAL RETURN
//
// Format des tables : 5 colonnes
//   Nom | Veille | Cloture | Variation jour (%) | Variation YTD (%)

import "server-only";

import {
  describeError,
  fetchViaHttps,
  parseFrenchNumber,
  parseSessionMeta,
  stripTags,
  tryFetchPrimary,
} from "./liveQuotes";

const BRVM_URL = "https://www.brvm.org/fr/indices";
const TTL_OK_MS = 5 * 60 * 1000;
const TTL_FAIL_MS = 30 * 1000;

export type BrvmIndexCategory = "principal" | "sectoriel" | "totalreturn";

export type BrvmLiveIndex = {
  /** Nom tel qu'affiche par BRVM, ex "BRVM - COMPOSITE", "BRVM-30" */
  name: string;
  /** Code normalise pour matching avec nos donnees CSV : BRVMC, BRVM30, BRVM-CB, etc. */
  code: string;
  /** Categorie de l'indice */
  category: BrvmIndexCategory;
  /** Valeur de cloture du jour */
  value: number;
  /** Valeur de cloture de la veille */
  previousValue: number;
  /** Variation jour en % (ex 0.14 pour +0.14%) */
  variationPct: number;
  /** Variation cumulee depuis debut d'annee en % */
  ytdPct: number;
};

/**
 * Bloc "Activites du marche" de la page indices. Chiffres officiels BRVM de
 * la seance — a preferer a toute reconstitution maison : la valeur transigee
 * n'est pas derivable de nos donnees (on n'a que des volumes en titres) et la
 * capitalisation officielle tient compte du flottant reel.
 */
export type BrvmMarketActivity = {
  /** Montant total echange sur la seance, en FCFA. */
  valeurTransactions: number | null;
  /** Capitalisation du compartiment actions, en FCFA. */
  capitalisationActions: number | null;
  /** Capitalisation du compartiment obligataire, en FCFA. */
  capitalisationObligations: number | null;
};

export type BrvmIndicesSnapshot = {
  fetchedAt: string;
  sessionLabel: string | null;
  isClosed: boolean | null;
  indices: BrvmLiveIndex[];
  activity: BrvmMarketActivity;
};

// =============================================================================
// MAPPING NOM BRVM → CODE INTERNE
// =============================================================================

/**
 * Normalise un nom d'indice (BRVM - COMPOSITE, BRVM-30...) vers le code utilise
 * dans nos CSV (BRVMC, BRVM30, BRVM-CB...). Tolere variations d'espaces, tirets
 * normaux/longs, casse, accents.
 */
function normalizeIndexCode(rawName: string): string {
  const upper = rawName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-") // tirets longs/cadratin → tiret normal
    .replace(/\s+/g, " ")
    .trim();

  if (upper === "BRVM-30" || upper === "BRVM 30") return "BRVM30";
  if (upper === "BRVM - COMPOSITE" || upper === "BRVM-COMPOSITE" || upper === "BRVM-C")
    return "BRVMC";
  if (upper === "BRVM - PRESTIGE" || upper === "BRVM-PRESTIGE" || upper === "BRVM-PRES")
    return "BRVMPR";
  if (upper === "BRVM - PRINCIPAL" || upper === "BRVM-PRINCIPAL")
    return "BRVMPA";
  if (upper === "BRVM - CONSOMMATION DE BASE") return "BRVM-CB";
  if (upper === "BRVM - CONSOMMATION DISCRETIONNAIRE") return "BRVM-CD";
  if (upper === "BRVM - ENERGIE") return "BRVM-EN";
  if (upper === "BRVM - INDUSTRIELS") return "BRVM-IN";
  if (upper === "BRVM - SERVICES FINANCIERS") return "BRVM-SF";
  if (upper === "BRVM - SERVICES PUBLICS") return "BRVM-SP";
  if (upper === "BRVM - TELECOMMUNICATIONS") return "BRVM-TEL";
  if (upper === "BRVM - COMPOSITE TOTAL RETURN") return "BRVMC-TR";
  return upper.replace(/\s+/g, "");
}

// =============================================================================
// PARSER
// =============================================================================

/**
 * Parcourt le HTML et associe chaque table d'indices a sa categorie.
 * - Premiere table apres <h1 class="page-header">Indices</h1> → "principal"
 *   (BRVM elle-meme ne met pas de h2 sur ce 1er bloc)
 * - Tables sous <h2 class="block-title">Indices sectoriels</h2> → "sectoriel"
 * - Tables sous <h2 class="block-title">Indice Total Return</h2> → "totalreturn"
 *
 * Strategie : on coupe le HTML en segments par les h1.page-header / h2.block-title,
 * puis pour chaque segment on regarde le titre et on parse la 1re table.
 */
function findIndicesSections(html: string): Array<{
  category: BrvmIndexCategory;
  innerHtml: string;
}> {
  // Trouve les positions des marqueurs (h1.page-header "Indices" et h2.block-title)
  const markerRe =
    /<h1[^>]*class="page-header"[^>]*>([^<]+)<\/h1>|<h2[^>]*class="block-title"[^>]*>([^<]+)<\/h2>/gi;
  const markers: Array<{ index: number; title: string; isPageHeader: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(html)) !== null) {
    const title = (m[1] || m[2] || "").trim();
    markers.push({
      index: m.index,
      title,
      isPageHeader: !!m[1],
    });
  }
  if (markers.length === 0) return [];

  const out: Array<{ category: BrvmIndexCategory; innerHtml: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const segment = html.slice(cur.index, next ? next.index : html.length);
    let category: BrvmIndexCategory | null = null;
    const lower = cur.title.toLowerCase();
    if (cur.isPageHeader && lower === "indices") category = "principal";
    else if (lower.includes("sectoriel")) category = "sectoriel";
    else if (lower.includes("total return")) category = "totalreturn";
    if (!category) continue;
    out.push({ category, innerHtml: segment });
  }
  return out;
}

/**
 * Extrait le bloc "Activites du marche" : un tableau a deux colonnes
 * (libelle, montant en FCFA). On matche sur le libelle plutot que sur la
 * position, l'ordre des lignes n'etant pas garanti.
 */
function parseMarketActivity(html: string): BrvmMarketActivity {
  const out: BrvmMarketActivity = {
    valeurTransactions: null,
    capitalisationActions: null,
    capitalisationObligations: null,
  };

  const norm = (s: string) =>
    s
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  for (const table of html.match(/<table[^>]*>[^]*?<\/table>/gi) ?? []) {
    if (!/Activit/i.test(table)) continue;
    const rowRegex = /<tr[^>]*>([^]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRegex.exec(table)) !== null) {
      const cells = rm[1].match(/<td[^>]*>[^]*?<\/td>/gi);
      if (!cells || cells.length < 2) continue;
      const label = norm(stripTags(cells[0]));
      const value = parseFrenchNumber(stripTags(cells[1]).replace(/FCFA/i, ""));
      if (!Number.isFinite(value)) continue;
      if (label.includes("VALEUR DES TRANSACTIONS")) {
        out.valeurTransactions = value;
      } else if (label.includes("CAPITALISATION") && label.includes("ACTION")) {
        out.capitalisationActions = value;
      } else if (
        label.includes("CAPITALISATION") &&
        label.includes("OBLIGATION")
      ) {
        out.capitalisationObligations = value;
      }
    }
  }
  return out;
}

function parseIndicesTable(
  sectionHtml: string,
  category: BrvmIndexCategory,
): BrvmLiveIndex[] {
  // Cible la 1re table de la section
  const tableMatch = sectionHtml.match(/<table[^>]*>[^]*?<\/table>/i);
  if (!tableMatch) return [];

  const tbodyMatch = tableMatch[0].match(/<tbody[^>]*>([^]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbodyHtml = tbodyMatch[1];

  const rowRegex = /<tr[^>]*>([^]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([^]*?)<\/td>/gi;

  const out: BrvmLiveIndex[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(tbodyHtml)) !== null) {
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      cells.push(cm[1]);
    }
    if (cells.length < 5) continue;

    const name = stripTags(cells[0]);
    const previousValue = parseFrenchNumber(stripTags(cells[1]));
    const value = parseFrenchNumber(stripTags(cells[2]));
    // Les colonnes 3 et 4 sont des variations en %. La premiere = jour, la
    // seconde = YTD. Le signe est porte par la classe text-good/text-bad
    // sur le span englobant — on lit la valeur numerique brute puis on
    // regarde la classe pour determiner le signe.
    const dayCell = cells[3];
    const ytdCell = cells[4];
    const dayMagnitude = parseFrenchNumber(stripTags(dayCell));
    const ytdMagnitude = parseFrenchNumber(stripTags(ytdCell));
    // BRVM met la valeur sans signe et code la couleur via class. Mais parfois
    // la valeur contient deja un "-". On detecte les deux cas.
    const dayNeg = /text-bad/i.test(dayCell) || /^-/.test(stripTags(dayCell));
    const ytdNeg = /text-bad/i.test(ytdCell) || /^-/.test(stripTags(ytdCell));
    const variationPct = Number.isFinite(dayMagnitude)
      ? dayNeg && dayMagnitude > 0
        ? -dayMagnitude
        : dayMagnitude
      : 0;
    const ytdPct = Number.isFinite(ytdMagnitude)
      ? ytdNeg && ytdMagnitude > 0
        ? -ytdMagnitude
        : ytdMagnitude
      : 0;

    if (!name) continue;
    if (!Number.isFinite(value)) continue;

    out.push({
      name,
      code: normalizeIndexCode(name),
      category,
      value,
      previousValue: Number.isFinite(previousValue) ? previousValue : 0,
      variationPct,
      ytdPct,
    });
  }
  return out;
}

// =============================================================================
// FETCH + DIAG
// =============================================================================

let lastDiag: {
  status: number | null;
  htmlLength: number;
  errorMessage: string | null;
  count: number;
} = { status: null, htmlLength: 0, errorMessage: null, count: 0 };

export function getLastBrvmIndicesDiag() {
  return lastDiag;
}

async function fetchBrvmIndicesRaw(): Promise<BrvmIndicesSnapshot> {
  const emptyActivity: BrvmMarketActivity = {
    valeurTransactions: null,
    capitalisationActions: null,
    capitalisationObligations: null,
  };
  const empty: BrvmIndicesSnapshot = {
    fetchedAt: new Date().toISOString(),
    sessionLabel: null,
    isClosed: null,
    indices: [],
    activity: emptyActivity,
  };
  lastDiag = { status: null, htmlLength: 0, errorMessage: null, count: 0 };

  let html = "";
  let status: number | null = null;

  try {
    const r = await tryFetchPrimary(BRVM_URL);
    status = r.status;
    html = r.body;
    if (!html && status >= 400) lastDiag.errorMessage = `fetch HTTP ${status}`;
  } catch (err) {
    lastDiag.errorMessage = `fetch: ${describeError(err)}`;
    console.warn(`[brvm-indices] primary fetch failed — ${lastDiag.errorMessage}`);
  }

  if (!html) {
    try {
      const r = await fetchViaHttps(BRVM_URL);
      status = r.status;
      html = r.status === 200 ? r.body : "";
      if (html) lastDiag.errorMessage = null;
      else
        lastDiag.errorMessage =
          (lastDiag.errorMessage ? lastDiag.errorMessage + " | " : "") +
          `https HTTP ${r.status}`;
    } catch (err) {
      lastDiag.errorMessage =
        (lastDiag.errorMessage ? lastDiag.errorMessage + " | " : "") +
        `https: ${describeError(err)}`;
      console.error(`[brvm-indices] https fallback failed`);
    }
  }

  lastDiag.status = status;
  lastDiag.htmlLength = html.length;
  if (!html) return empty;

  const session = parseSessionMeta(html);

  const sections = findIndicesSections(html);
  const rawIndices: BrvmLiveIndex[] = sections.flatMap((s) =>
    parseIndicesTable(s.innerHtml, s.category),
  );

  // Tri canonique : on impose un ordre logique pour l'UI plutot que de
  // suivre l'ordre BRVM (qui met BRVM-30 avant le Composite).
  // Principaux : Composite → 30 → Prestige → Principal
  // Sectoriels : alphabetique sur le code
  // Total Return : a la fin
  const PRINCIPAL_ORDER = ["BRVMC", "BRVM30", "BRVMPR", "BRVMPA"];
  const orderRank = (i: BrvmLiveIndex): number => {
    if (i.category === "principal") {
      const idx = PRINCIPAL_ORDER.indexOf(i.code);
      return idx >= 0 ? idx : PRINCIPAL_ORDER.length;
    }
    if (i.category === "sectoriel") return 100;
    return 1000; // totalreturn
  };
  const indices = [...rawIndices].sort((a, b) => {
    const ra = orderRank(a);
    const rb = orderRank(b);
    if (ra !== rb) return ra - rb;
    return a.code.localeCompare(b.code);
  });

  lastDiag.count = indices.length;

  if (indices.length === 0) {
    console.warn(
      `[brvm-indices] parser returned 0 indices (HTML ${html.length} chars).`,
    );
  }
  return {
    fetchedAt: new Date().toISOString(),
    sessionLabel: session.label,
    isClosed: session.isClosed,
    indices,
    activity: parseMarketActivity(html),
  };
}

// =============================================================================
// CACHE MODULE-LEVEL
// =============================================================================

let cached: { snapshot: BrvmIndicesSnapshot; expiresAt: number } | null = null;
let inflight: Promise<BrvmIndicesSnapshot> | null = null;

export async function getBrvmIndicesSnapshot(): Promise<BrvmIndicesSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.snapshot;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snapshot = await fetchBrvmIndicesRaw();
      const ttl = snapshot.indices.length > 0 ? TTL_OK_MS : TTL_FAIL_MS;
      cached = { snapshot, expiresAt: Date.now() + ttl };
      return snapshot;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function refreshBrvmIndicesSnapshot(): Promise<BrvmIndicesSnapshot> {
  cached = null;
  return getBrvmIndicesSnapshot();
}

/** Recupere un indice live par code interne (ex "BRVMC", "BRVM30"). */
export async function getBrvmLiveIndex(
  code: string,
): Promise<BrvmLiveIndex | null> {
  if (!code) return null;
  const snap = await getBrvmIndicesSnapshot();
  return snap.indices.find((i) => i.code === code) ?? null;
}
