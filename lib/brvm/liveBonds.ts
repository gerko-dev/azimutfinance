// === Scraping cours obligations BRVM en direct ===
//
// Source : https://www.brvm.org/fr/cours-obligations/0
// Le tableau cible a comme entetes :
//   Code obligation | Nom | Date émission | Date maturité |
//   Cours du jour en valeur | Coupon Couru | Dernier paiement (Date/Valeur du coupon)
//
// Le code mnemonique BRVM (ex "EOM.O10", "BIDC.O3") matche directement
// le champ `code` du CSV obligations-cotees.csv.

import "server-only";

import {
  BROWSER_HEADERS,
  describeError,
  fetchViaHttps,
  parseFrenchNumber,
  parseSessionMeta,
  stripTags,
  tryFetchPrimary,
} from "./liveQuotes";

const BRVM_URL = "https://www.brvm.org/fr/cours-obligations/0";
const TTL_OK_MS = 5 * 60 * 1000;
const TTL_FAIL_MS = 30 * 1000;

export type BrvmLiveBondQuote = {
  code: string;
  name: string;
  /** Date d'emission au format "DD/MM/YYYY" tel qu'affiche par BRVM */
  issueDate: string;
  /** Date de maturite au format "DD/MM/YYYY" — souvent vide sur BRVM */
  maturityDate: string;
  /** Cours du jour en valeur (FCFA) — pied de coupon */
  currentPrice: number;
  /** Coupon couru en FCFA */
  couponCouru: number;
  /** Date du dernier paiement de coupon "DD/MM/YYYY" */
  lastPaymentDate: string;
  /** Valeur du dernier coupon paye en FCFA */
  lastPaymentAmount: number;
};

export type BrvmBondsSnapshot = {
  fetchedAt: string;
  sessionLabel: string | null;
  isClosed: boolean | null;
  quotes: BrvmLiveBondQuote[];
};

// =============================================================================
// PARSER
// =============================================================================

function parseBondsTable(html: string): BrvmLiveBondQuote[] {
  // Cible la table principale en filtrant sur "Code obligation" + "Coupon Couru"
  // dans le thead.
  const tables = html.match(/<table[^>]*>[^]*?<\/table>/gi);
  if (!tables) return [];

  let mainTable: string | null = null;
  for (const t of tables) {
    if (/Code obligation/i.test(t) && /Coupon Couru/i.test(t)) {
      mainTable = t;
      break;
    }
  }
  if (!mainTable) return [];

  const tbodyMatch = mainTable.match(/<tbody[^>]*>([^]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbodyHtml = tbodyMatch[1];

  const rowRegex = /<tr[^>]*>([^]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([^]*?)<\/td>/gi;

  const out: BrvmLiveBondQuote[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(tbodyHtml)) !== null) {
    const rowInner = rm[1];
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cm = cellRegex.exec(rowInner)) !== null) {
      cells.push(cm[1]);
    }
    if (cells.length < 7) continue;

    const code = stripTags(cells[0]);
    const name = stripTags(cells[1]);
    const issueDate = stripTags(cells[2]);
    const maturityDate = stripTags(cells[3]);
    const currentPrice = parseFrenchNumber(stripTags(cells[4]));
    const couponCouru = parseFrenchNumber(stripTags(cells[5]));
    const lastPaymentRaw = stripTags(cells[6]);

    // Format "DD/MM/YYYY / valeur" — split sur " / "
    let lastPaymentDate = "";
    let lastPaymentAmount = 0;
    const lpMatch = lastPaymentRaw.match(/^(\S+)\s*\/\s*(.+)$/);
    if (lpMatch) {
      lastPaymentDate = lpMatch[1].trim();
      lastPaymentAmount = parseFrenchNumber(lpMatch[2]);
    }

    if (!code) continue;
    if (!Number.isFinite(currentPrice)) continue;

    out.push({
      code: code.toUpperCase(),
      name,
      issueDate,
      maturityDate,
      currentPrice,
      couponCouru: Number.isFinite(couponCouru) ? couponCouru : 0,
      lastPaymentDate,
      lastPaymentAmount: Number.isFinite(lastPaymentAmount) ? lastPaymentAmount : 0,
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
  hasMainTable: boolean;
  hasTbody: boolean;
  rowCount: number;
  errorMessage: string | null;
  htmlPreview: string;
} = {
  status: null,
  htmlLength: 0,
  hasMainTable: false,
  hasTbody: false,
  rowCount: 0,
  errorMessage: null,
  htmlPreview: "",
};

export function getLastBrvmBondsDiag() {
  return lastDiag;
}

async function fetchBrvmBondsRaw(): Promise<BrvmBondsSnapshot> {
  const empty: BrvmBondsSnapshot = {
    fetchedAt: new Date().toISOString(),
    sessionLabel: null,
    isClosed: null,
    quotes: [],
  };
  lastDiag = {
    status: null,
    htmlLength: 0,
    hasMainTable: false,
    hasTbody: false,
    rowCount: 0,
    errorMessage: null,
    htmlPreview: "",
  };

  let html = "";
  let status: number | null = null;

  // Tentative 1 : fetch (undici)
  try {
    const r = await tryFetchPrimary(BRVM_URL);
    status = r.status;
    html = r.body;
    if (!html && status >= 400) {
      lastDiag.errorMessage = `fetch HTTP ${status}`;
    }
  } catch (err) {
    lastDiag.errorMessage = `fetch: ${describeError(err)}`;
    console.warn(`[brvm-bonds] primary fetch failed — ${lastDiag.errorMessage}`);
  }

  // Tentative 2 : Node https module (IPv4 force)
  if (!html) {
    try {
      const r = await fetchViaHttps(BRVM_URL);
      status = r.status;
      html = r.status === 200 ? r.body : "";
      if (!html) {
        lastDiag.errorMessage =
          (lastDiag.errorMessage ? lastDiag.errorMessage + " | " : "") +
          `https HTTP ${r.status}`;
      } else {
        lastDiag.errorMessage = null;
      }
    } catch (err) {
      const msg = describeError(err);
      lastDiag.errorMessage =
        (lastDiag.errorMessage ? lastDiag.errorMessage + " | " : "") +
        `https: ${msg}`;
      console.error(`[brvm-bonds] https fallback failed — ${msg}`);
    }
  }

  lastDiag.status = status;
  lastDiag.htmlLength = html.length;
  if (!html) return empty;

  lastDiag.hasMainTable = /Code obligation/i.test(html);
  lastDiag.hasTbody =
    lastDiag.hasMainTable && /<tbody[^>]*>([^]*?)<\/tbody>/i.test(html);
  lastDiag.htmlPreview = html.slice(0, 300);

  const session = parseSessionMeta(html);
  const quotes = parseBondsTable(html);
  lastDiag.rowCount = quotes.length;

  if (quotes.length === 0) {
    console.warn(
      `[brvm-bonds] parser returned 0 quotes ` +
        `(HTML ${html.length} chars, mainTable=${lastDiag.hasMainTable}, tbody=${lastDiag.hasTbody}).`,
    );
  }
  return {
    fetchedAt: new Date().toISOString(),
    sessionLabel: session.label,
    isClosed: session.isClosed,
    quotes,
  };
}

// =============================================================================
// CACHE MODULE-LEVEL
// =============================================================================

let cached: { snapshot: BrvmBondsSnapshot; expiresAt: number } | null = null;
let inflight: Promise<BrvmBondsSnapshot> | null = null;

export async function getBrvmBondsSnapshot(): Promise<BrvmBondsSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.snapshot;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snapshot = await fetchBrvmBondsRaw();
      const ttl = snapshot.quotes.length > 0 ? TTL_OK_MS : TTL_FAIL_MS;
      cached = { snapshot, expiresAt: Date.now() + ttl };
      return snapshot;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function refreshBrvmBondsSnapshot(): Promise<BrvmBondsSnapshot> {
  cached = null;
  return getBrvmBondsSnapshot();
}

/** Retourne le quote pour un code mnemonique (ex "EOM.O10"), ou null. */
export async function getBrvmBondQuote(
  code: string,
): Promise<BrvmLiveBondQuote | null> {
  if (!code) return null;
  const snap = await getBrvmBondsSnapshot();
  return snap.quotes.find((q) => q.code === code.toUpperCase()) ?? null;
}
