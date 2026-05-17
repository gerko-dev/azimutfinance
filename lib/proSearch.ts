// === INDEX DE RECHERCHE UNIVERSEL (Pro Terminal) ===
//
// Aggregue les instruments de toutes les classes d'actifs disponibles sur le
// site en un seul index memoize. Sert la barre de recherche du Pro Terminal
// via /api/pros/search.
//
// Source uniques (loaders deja existants) :
//   - loadStocks()           : actions BRVM            -> /titre/<code>
//   - loadListedBonds()      : obligations cotees      -> /obligation/<isin>
//   - loadUmoaEmissions()    : souverains non cotes    -> /marches/souverains-non-cotes?isin=<isin>
//   - loadFunds()            : OPCVM / FCP             -> /fcp/<id>
//   - FX_PAIRS               : paires de change        -> /macro/devises/<slug>
//   - COMMODITIES            : matieres premieres      -> /macro/matieres-premieres/<slug>
//   - liste statique UEMOA   : etats                   -> /macro/pays
//
// SERVER-ONLY (lit le filesystem via les loaders CSV). Ne pas importer depuis
// un fichier "use client".

import "server-only";

import { loadStocks, loadListedBonds, loadUmoaEmissions } from "./dataLoader";
import { loadFunds } from "./fcp";
import { FX_PAIRS } from "./fx";
import { COMMODITIES } from "./commodities";

export type ProSearchKind =
  | "stock"
  | "listed-bond"
  | "sovereign"
  | "fund"
  | "fx"
  | "commodity"
  | "country";

export type ProSearchResult = {
  id: string;
  kind: ProSearchKind;
  label: string;
  /** Sous-libelle court : ISIN, pays, secteur, gestionnaire, etc. */
  sublabel: string;
  href: string;
  /** Champs concatenes lowercase pour le matching (non renvoye au client). */
  haystack: string;
  /** Codes / identifiants prioritaires pour le ranking (lowercase). */
  primary: string[];
};

// Pays UEMOA (les 8 etats emetteurs d'OAT). Pourra etre etendu plus tard si
// /macro/pays accepte d'autres pays.
const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "SN", name: "Sénégal" },
  { code: "BF", name: "Burkina Faso" },
  { code: "ML", name: "Mali" },
  { code: "BJ", name: "Bénin" },
  { code: "TG", name: "Togo" },
  { code: "NE", name: "Niger" },
  { code: "GW", name: "Guinée-Bissau" },
];

// ============================================================================
// NORMALISATION
// ============================================================================

/**
 * Normalise une chaine pour le matching : lowercase, suppression diacritiques,
 * compression des espaces. "Côte d'Ivoire" -> "cote d'ivoire".
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// CONSTRUCTION DE L'INDEX (memoize au niveau module)
// ============================================================================

let _indexCache: ProSearchResult[] | null = null;

function buildIndex(): ProSearchResult[] {
  const out: ProSearchResult[] = [];

  // ─── Actions ────────────────────────────────────────────────────────────
  try {
    for (const s of loadStocks()) {
      const code = s.code?.trim() || "";
      if (!code) continue;
      const name = s.name?.trim() || code;
      const isin = s.isin?.trim() || "";
      const sector = s.sector?.trim() || "";
      const country = s.country?.trim() || "";
      const sublabel = [sector, country].filter(Boolean).join(" · ") || isin;
      out.push({
        id: `stock:${code}`,
        kind: "stock",
        label: `${code} — ${name}`,
        sublabel,
        href: `/titre/${encodeURIComponent(code)}`,
        haystack: normalizeForSearch(
          [code, name, isin, sector, country].join(" "),
        ),
        primary: [code.toLowerCase(), isin.toLowerCase()].filter(Boolean),
      });
    }
  } catch (e) {
    console.warn("[proSearch] loadStocks failed:", (e as Error).message);
  }

  // ─── Obligations cotees ────────────────────────────────────────────────
  try {
    for (const b of loadListedBonds()) {
      const isin = b.isin?.trim() || "";
      if (!isin) continue;
      const name = b.name?.trim() || isin;
      const issuer = b.issuer?.trim() || "";
      const country = b.country?.trim() || "";
      const sublabel = [issuer, country].filter(Boolean).join(" · ") || isin;
      out.push({
        id: `listed-bond:${isin}`,
        kind: "listed-bond",
        label: name,
        sublabel: `${isin}${sublabel ? " · " + sublabel : ""}`,
        href: `/obligation/${encodeURIComponent(isin)}`,
        haystack: normalizeForSearch(
          [isin, name, issuer, country, b.code || "", b.sector || ""].join(" "),
        ),
        primary: [isin.toLowerCase(), (b.code || "").toLowerCase()].filter(
          Boolean,
        ),
      });
    }
  } catch (e) {
    console.warn("[proSearch] loadListedBonds failed:", (e as Error).message);
  }

  // ─── Souverains non cotes (UMOA-Titres) ────────────────────────────────
  // Une entree par ISIN unique : on prend l'emission la plus recente comme
  // representant. Le lien pointe sur l'index avec un parametre ?isin=...
  // (la page peut l'utiliser pour highlight/filtrer, ou simplement l'ignorer).
  try {
    const seen = new Map<string, ReturnType<typeof loadUmoaEmissions>[number]>();
    for (const e of loadUmoaEmissions()) {
      const isin = e.isin?.trim() || "";
      if (!isin) continue;
      const prev = seen.get(isin);
      if (!prev || (e.date && e.date > (prev.date || ""))) seen.set(isin, e);
    }
    for (const e of seen.values()) {
      const isin = e.isin;
      const country = e.countryName?.trim() || e.country || "";
      const labelType = e.type === "BAT" ? "BAT" : "OAT";
      const yieldStr = Number.isFinite(e.weightedAvgYield)
        ? `${(e.weightedAvgYield * 100).toFixed(2).replace(".", ",")}%`
        : "";
      const sublabel = [country, labelType, yieldStr].filter(Boolean).join(" · ");
      out.push({
        id: `sovereign:${isin}`,
        kind: "sovereign",
        label: `${labelType} ${country} ${isin}`,
        sublabel,
        href: `/marches/souverains-non-cotes?isin=${encodeURIComponent(isin)}`,
        haystack: normalizeForSearch(
          [isin, country, labelType, e.precisions || ""].join(" "),
        ),
        primary: [isin.toLowerCase()],
      });
    }
  } catch (e) {
    console.warn("[proSearch] loadUmoaEmissions failed:", (e as Error).message);
  }

  // ─── OPCVM / FCP ───────────────────────────────────────────────────────
  try {
    for (const f of loadFunds()) {
      const id = f.id?.trim();
      if (!id) continue;
      const nom = f.nom?.trim() || id;
      const gest = f.gestionnaire?.trim() || "";
      const cat = f.categorie || "";
      const sublabel = [gest, cat].filter(Boolean).join(" · ");
      out.push({
        id: `fund:${id}`,
        kind: "fund",
        label: nom,
        sublabel,
        href: `/fcp/${encodeURIComponent(id)}`,
        haystack: normalizeForSearch([nom, gest, cat, f.type || ""].join(" ")),
        primary: [id.toLowerCase()],
      });
    }
  } catch (e) {
    console.warn("[proSearch] loadFunds failed:", (e as Error).message);
  }

  // ─── FX (paires de change) ─────────────────────────────────────────────
  for (const fx of FX_PAIRS) {
    const slug = fx.slug;
    out.push({
      id: `fx:${slug}`,
      kind: "fx",
      label: `${fx.pair} — ${fx.name}`,
      sublabel: `${fx.base} / ${fx.quote}`,
      href: `/macro/devises/${encodeURIComponent(slug)}`,
      haystack: normalizeForSearch(
        [slug, fx.pair, fx.name, fx.base, fx.quote, fx.category].join(" "),
      ),
      primary: [
        slug.toLowerCase(),
        fx.pair.toLowerCase(),
        fx.base.toLowerCase(),
        fx.quote.toLowerCase(),
      ],
    });
  }

  // ─── Matieres premieres ────────────────────────────────────────────────
  for (const c of COMMODITIES) {
    out.push({
      id: `commodity:${c.slug}`,
      kind: "commodity",
      label: c.name,
      sublabel: `${c.unit} · ${c.exchange}`,
      href: `/macro/matieres-premieres/${encodeURIComponent(c.slug)}`,
      haystack: normalizeForSearch(
        [c.slug, c.name, c.category, c.exchange, c.unit].join(" "),
      ),
      primary: [c.slug.toLowerCase(), c.name.toLowerCase()],
    });
  }

  // ─── Etats UEMOA ───────────────────────────────────────────────────────
  for (const c of COUNTRIES) {
    out.push({
      id: `country:${c.code}`,
      kind: "country",
      label: c.name,
      sublabel: `Pays UEMOA · ${c.code}`,
      href: `/macro/pays?country=${encodeURIComponent(c.code)}`,
      haystack: normalizeForSearch([c.code, c.name, "uemoa"].join(" ")),
      primary: [c.code.toLowerCase(), c.name.toLowerCase()],
    });
  }

  return out;
}

function getIndex(): ProSearchResult[] {
  if (_indexCache === null) _indexCache = buildIndex();
  return _indexCache;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Calcule un score pour une entree donnee. Plus le score est haut, plus
 * l'entree est pertinente. Retourne 0 si aucun match (sera filtree).
 *
 * Ranking :
 *   100 : primary match exact   (ex: "NSBC", "CI0000010019")
 *    80 : primary match prefix  (ex: "NSB" -> "NSBC")
 *    60 : label commence par la requete (mot-debut)
 *    40 : label contient la requete
 *    20 : haystack contient la requete
 *     0 : pas de match
 *
 * Boost mineur : un primary court (≤ 5 chars) qui matche bat un long, pour
 * privilegier les codes BRVM (4 lettres) aux ISIN (12 chars) dans les
 * resultats ambigus.
 */
function score(entry: ProSearchResult, qNorm: string): number {
  let s = 0;
  for (const p of entry.primary) {
    if (!p) continue;
    if (p === qNorm) {
      s = Math.max(s, 100 + (p.length <= 5 ? 1 : 0));
    } else if (p.startsWith(qNorm)) {
      s = Math.max(s, 80 + (p.length <= 5 ? 1 : 0));
    }
  }
  if (s > 0) return s;

  const label = normalizeForSearch(entry.label);
  if (label.startsWith(qNorm)) return 60;
  // Mot-debut : " <query>" apres un separateur courant
  if (new RegExp(`(?:^|[\\s\\-·/])${escapeRegExp(qNorm)}`).test(label))
    return 55;
  if (label.includes(qNorm)) return 40;
  if (entry.haystack.includes(qNorm)) return 20;
  return 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SearchProOptions = {
  /** Nombre max de resultats renvoyes. Defaut 20. */
  limit?: number;
  /** Filtrer sur certaines classes d'actifs (defaut : toutes). */
  kinds?: ProSearchKind[];
};

export function searchProInstruments(
  query: string,
  opts: SearchProOptions = {},
): Array<Omit<ProSearchResult, "haystack" | "primary">> {
  const q = normalizeForSearch(query);
  if (q.length < 1) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));
  const kinds = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;

  const idx = getIndex();
  const scored: Array<{ r: ProSearchResult; s: number }> = [];
  for (const r of idx) {
    if (kinds && !kinds.has(r.kind)) continue;
    const s = score(r, q);
    if (s > 0) scored.push({ r, s });
  }

  // Tri principal par score desc, puis longueur du label asc (pour preferer
  // les libelles courts a competence egale).
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    return a.r.label.length - b.r.label.length;
  });

  return scored.slice(0, limit).map(({ r }) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    sublabel: r.sublabel,
    href: r.href,
  }));
}

/** Force la reconstruction de l'index (utile en dev / tests). */
export function resetProSearchIndex(): void {
  _indexCache = null;
}
