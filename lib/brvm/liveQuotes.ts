// === Scraping cours actions BRVM en direct ===
//
// Source : https://www.brvm.org/fr/cours-actions/0
// Le tableau cible a comme entetes :
//   Symbole | Nom | Volume | Cours veille (FCFA) | Cours Ouverture (FCFA) |
//   Cours Cloture (FCFA) | Variation (%)
//
// Numerique francais : "1 234,56" -> espace milliers, virgule decimale.
// La page BRVM se rafraichit toutes les 15 minutes pendant la cotation.

import "server-only";

import https from "node:https";

const BRVM_URL = "https://www.brvm.org/fr/cours-actions/0";
const TTL_OK_MS = 5 * 60 * 1000; // 5 min en cas de succes
const TTL_FAIL_MS = 30 * 1000; // 30 s en cas d'echec (retry rapide)

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Cache-Control": "no-cache",
} as const;

/** Fallback : Node.js https module (force IPv4, contourne les bugs undici sur Windows). */
// Timeout court (4s) : on prefere echouer vite et reutiliser le cache CSV
// plutot que de bloquer Googlebot 15s par tentative (cf. TTL_FAIL_MS dans
// liveBonds.ts pour la mise en cache des echecs).
export function fetchViaHttps(url: string, timeoutMs = 4_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: BROWSER_HEADERS,
        timeout: timeoutMs,
        // Force IPv4 — evite les pannes Node fetch/Windows en IPv6
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { cause?: unknown; code?: string };
    const parts: string[] = [e.message];
    if (e.code) parts.push(`code=${e.code}`);
    if (e.cause) {
      const c = e.cause as { code?: string; errno?: string; message?: string };
      if (c.code) parts.push(`cause.code=${c.code}`);
      else if (c.message) parts.push(`cause=${c.message}`);
      else parts.push(`cause=${String(e.cause).slice(0, 100)}`);
    }
    return parts.join(" · ");
  }
  return String(err);
}

export type BrvmLiveQuote = {
  code: string;
  name: string;
  volume: number;
  previousClose: number;
  open: number;
  /** Cours actuel (Cours Cloture sur le tableau BRVM) */
  currentPrice: number;
  /** Variation en pourcentage (ex : -0.77) — pris directement sur BRVM */
  variationPct: number;
  /** Variation en FCFA (calculee : currentPrice - previousClose) */
  variationAmount: number;
};

export type BrvmSnapshot = {
  /** ISO timestamp du fetch */
  fetchedAt: string;
  /** Libelle de seance affiche par BRVM (ex : "Lundi, 4 mai, 2026 - 14:22") */
  sessionLabel: string | null;
  /** Indique si la seance est fermee (null si indeterminable) */
  isClosed: boolean | null;
  quotes: BrvmLiveQuote[];
};

// =============================================================================
// PARSERS
// =============================================================================

export function parseFrenchNumber(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw
    .replace(/ /g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[+%]/g, "")
    .trim();
  const negative = /^-/.test(cleaned);
  const stripped = cleaned.replace(/^-/, "").replace(/\s/g, "").replace(",", ".");
  if (!stripped) return NaN;
  const n = parseFloat(stripped);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuotesTable(html: string): BrvmLiveQuote[] {
  // On cible la table principale en filtrant sur la presence de "Cours veille" dans le thead.
  // Approche tolerante : on isole chaque <table>, on garde celle qui matche.
  const tables = html.match(/<table[^>]*>[^]*?<\/table>/gi);
  if (!tables) return [];

  let mainTable: string | null = null;
  for (const t of tables) {
    if (/Cours veille/i.test(t) && /Variation/i.test(t)) {
      mainTable = t;
      break;
    }
  }
  if (!mainTable) return [];

  // Extraire le tbody
  const tbodyMatch = mainTable.match(/<tbody[^>]*>([^]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbodyHtml = tbodyMatch[1];

  // Iterer sur chaque <tr>
  const rowRegex = /<tr[^>]*>([^]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([^]*?)<\/td>/gi;

  const out: BrvmLiveQuote[] = [];
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
    const volume = parseFrenchNumber(stripTags(cells[2]));
    const rawPreviousClose = parseFrenchNumber(stripTags(cells[3]));
    const open = parseFrenchNumber(stripTags(cells[4]));
    const currentPrice = parseFrenchNumber(stripTags(cells[5]));

    if (!code) continue;
    if (!Number.isFinite(currentPrice)) continue;

    // Lecture de la variation % (col 7) : la magnitude est dans le span,
    // le signe est porte soit par un "-" explicite soit par la classe text-bad.
    const variationCell = cells[6];
    const variationCellText = stripTags(variationCell);
    const variationMagnitude = parseFrenchNumber(variationCellText);
    const cellIsNegative =
      /text-bad/i.test(variationCell) || /^-/.test(variationCellText);
    const variationPct = Number.isFinite(variationMagnitude)
      ? cellIsNegative && variationMagnitude > 0
        ? -variationMagnitude
        : variationMagnitude
      : 0;

    // ATTENTION : les colonnes "Cours veille" et "Cours Ouverture" du tableau
    // BRVM ne sont pas toujours coherentes (parfois figees, decalees ou non
    // mises a jour). En revanche, le couple (cloture, variation %) est fiable.
    // On reconstruit donc nous-meme previousClose et variationAmount a partir
    // de ces deux valeurs :
    //   currentPrice = previousClose * (1 + variationPct/100)
    //   → previousClose = currentPrice / (1 + variationPct/100)
    //   → variationAmount = currentPrice - previousClose
    let previousClose: number;
    let variationAmount: number;
    if (variationPct === 0) {
      previousClose = currentPrice;
      variationAmount = 0;
    } else {
      previousClose = currentPrice / (1 + variationPct / 100);
      variationAmount = currentPrice - previousClose;
    }
    // Garde-fou : si le calcul donne une absurdite (variation extreme cassee),
    // fallback sur la valeur BRVM brute si elle existe.
    if (!Number.isFinite(previousClose) || previousClose <= 0) {
      previousClose = Number.isFinite(rawPreviousClose) ? rawPreviousClose : 0;
      variationAmount = previousClose > 0 ? currentPrice - previousClose : 0;
    }

    out.push({
      code: code.toUpperCase(),
      name,
      volume: Number.isFinite(volume) ? volume : 0,
      previousClose,
      open: Number.isFinite(open) ? open : 0,
      currentPrice,
      variationPct,
      variationAmount,
    });
  }
  return out;
}

export function parseSessionMeta(html: string): {
  label: string | null;
  isClosed: boolean | null;
} {
  const labelMatch = html.match(/<p[^>]*class="header-seance"[^>]*>([^<]+)<\/p>/i);
  const label = labelMatch ? labelMatch[1].trim() : null;

  // BRVM utilise les classes seance-fermee / seance-ouverte
  const closed = /class="[^"]*seance-fermee[^"]*"/i.test(html);
  const open = /class="[^"]*seance-ouverte[^"]*"/i.test(html);
  let isClosed: boolean | null = null;
  if (closed && !open) isClosed = true;
  else if (open && !closed) isClosed = false;
  return { label, isClosed };
}

// =============================================================================
// FETCH + CACHE
// =============================================================================

/** Diagnostics du dernier fetch (visible via /api/brvm-quotes?debug=1) */
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

export function getLastBrvmDiag() {
  return lastDiag;
}

export async function tryFetchPrimary(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    // Timeout court : si BRVM ne repond pas en 4s, on bascule sur le
    // fallback https. Total pire cas SSR = 8s au lieu de 30s (15+15).
    signal: AbortSignal.timeout(4_000),
    cache: "no-store",
    redirect: "follow",
  });
  return { status: res.status, body: res.ok ? await res.text() : "" };
}

async function fetchBrvmRaw(): Promise<BrvmSnapshot> {
  const empty: BrvmSnapshot = {
    fetchedAt: new Date().toISOString(),
    sessionLabel: null,
    isClosed: null,
    quotes: [],
  };
  // Reset diag
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

  // Tentative 1 : fetch (undici/Node)
  try {
    const r = await tryFetchPrimary(BRVM_URL);
    status = r.status;
    html = r.body;
    if (!html && status >= 400) {
      lastDiag.errorMessage = `fetch HTTP ${status}`;
    }
  } catch (err) {
    lastDiag.errorMessage = `fetch: ${describeError(err)}`;
    console.warn(`[brvm] primary fetch failed — ${lastDiag.errorMessage}`);
  }

  // Tentative 2 : Node https module (IPv4 force) si fetch a echoue
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
        lastDiag.errorMessage = null; // succes via fallback
      }
    } catch (err) {
      const msg = describeError(err);
      lastDiag.errorMessage =
        (lastDiag.errorMessage ? lastDiag.errorMessage + " | " : "") +
        `https: ${msg}`;
      console.error(`[brvm] https fallback failed — ${msg}`);
    }
  }

  lastDiag.status = status;
  lastDiag.htmlLength = html.length;
  if (!html) return empty;

  lastDiag.hasMainTable = /Cours veille/i.test(html);
  lastDiag.hasTbody =
    lastDiag.hasMainTable && /<tbody[^>]*>([^]*?)<\/tbody>/i.test(html);
  lastDiag.htmlPreview = html.slice(0, 300);

  const session = parseSessionMeta(html);
  const quotes = parseQuotesTable(html);
  lastDiag.rowCount = quotes.length;

  if (quotes.length === 0) {
    console.warn(
      `[brvm] parser returned 0 quotes ` +
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
// CACHE MODULE-LEVEL (process-wide)
// =============================================================================

let cached: { snapshot: BrvmSnapshot; expiresAt: number } | null = null;
let inflight: Promise<BrvmSnapshot> | null = null;

/**
 * Snapshot BRVM avec cache process-level :
 *   - 5 min si la derniere recuperation a renvoye des cours
 *   - 30 s si elle a echoue (retry rapide)
 *
 * Le cache est partage entre toutes les requetes du meme process Node.
 * En dev : se reinitialise a chaque recompilation a chaud.
 * En prod : persiste sur la duree de vie du process serverless.
 */
export async function getBrvmSnapshot(): Promise<BrvmSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.snapshot;
  }
  // Deduplique les fetches concurrents (eviter qu'on hammer BRVM)
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snapshot = await fetchBrvmRaw();
      const ttl = snapshot.quotes.length > 0 ? TTL_OK_MS : TTL_FAIL_MS;
      cached = { snapshot, expiresAt: Date.now() + ttl };
      return snapshot;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Force un refetch immediat (utile pour le debug). */
export async function refreshBrvmSnapshot(): Promise<BrvmSnapshot> {
  cached = null;
  return getBrvmSnapshot();
}

/** Retourne le quote pour un code donne, ou null si introuvable. */
export async function getBrvmQuote(code: string): Promise<BrvmLiveQuote | null> {
  if (!code) return null;
  const snap = await getBrvmSnapshot();
  return snap.quotes.find((q) => q.code === code.toUpperCase()) ?? null;
}

/** Map<code, BrvmLiveQuote> pour usage en bulk. */
export async function getBrvmQuoteMap(): Promise<Map<string, BrvmLiveQuote>> {
  const snap = await getBrvmSnapshot();
  const m = new Map<string, BrvmLiveQuote>();
  for (const q of snap.quotes) m.set(q.code, q);
  return m;
}
