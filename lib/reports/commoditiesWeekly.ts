import "server-only";

// === DONNÉES DU RAPPORT HEBDOMADAIRE MATIÈRES PREMIÈRES ===
// Assemble, pour chaque matière première suivie, les stats hebdomadaires +
// l'historique 1 an (graphique), puis déclenche la génération des commentaires
// IA (Claude + web search). Format pensé pour le PDF A4 portrait.

import {
  COMMODITIES_BY_SLUG,
  loadCommodityHistory,
  computeCommodityStats,
  type CommoditySlug,
  type CommodityCategory,
} from "@/lib/commodities";
import {
  generateCommodityCommentary,
  type CommodityCommentary,
} from "./commoditiesCommentary";

// Ordre de présentation (sans WTI — doublon du Brent, choix utilisateur).
export const WEEKLY_SLUGS: CommoditySlug[] = [
  "cacao",
  "or",
  "brent",
  "cafe",
  "palmoil",
  "tsr",
  "sugar",
];

export type CommodityWeekly = {
  slug: CommoditySlug;
  name: string;
  unit: string;
  exchange: string;
  category: CommodityCategory;
  color: string;
  brvmRelevance: string;
  brvmTickers: string[];
  exposedCountries: string[];
  last: number;
  lastDate: string;
  prevWeekClose: number | null;
  weekChangePct: number | null;
  weekChangeAbs: number | null;
  returns: {
    "1S": number | null;
    "1M": number | null;
    "3M": number | null;
    YTD: number | null;
    "1A": number | null;
  };
  high52w: number | null;
  low52w: number | null;
  volatility1Y: number | null;
  drawdownFromHigh5Y: number | null;
  /** Clôtures sur ~1 an pour le graphique (date ISO, valeur). */
  history1Y: { date: string; value: number }[];
  /** Commentaire IA de la semaine (null si indisponible). */
  commentary: string | null;
};

export type CommoditiesWeeklyData = {
  generatedAt: string;
  asOf: string;
  weekStart: string;
  weekLabel: string;
  commodities: CommodityWeekly[];
  globalCommentary: string | null;
  commentaryModel: string | null;
  commentaryAvailable: boolean;
  sources: string[];
};

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function shiftDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Dernier point dont la date <= refIso (historique trié asc). */
function closeAtOrBefore(
  history: { date: string; close: number }[],
  refIso: string,
): { date: string; close: number } | null {
  let best: { date: string; close: number } | null = null;
  for (const p of history) {
    if (p.date <= refIso) best = p;
    else break;
  }
  return best;
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return `${d} ${MOIS_FR[m - 1]} ${y}`;
}

function frDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MOIS_FR[Number(m) - 1]}`;
}

function buildWeekly(slug: CommoditySlug): CommodityWeekly | null {
  const meta = COMMODITIES_BY_SLUG[slug];
  const stats = computeCommodityStats(slug);
  const history = loadCommodityHistory(slug);
  if (!meta || !stats || history.length === 0) return null;

  const last = history[history.length - 1];
  const weekRefIso = shiftDaysISO(last.date, 7);
  const prevWeek = closeAtOrBefore(history, weekRefIso);
  const prevWeekClose = prevWeek && prevWeek.date !== last.date ? prevWeek.close : null;
  const weekChangeAbs = prevWeekClose != null ? last.close - prevWeekClose : null;
  const weekChangePct =
    prevWeekClose != null && prevWeekClose > 0
      ? (weekChangeAbs! / prevWeekClose) * 100
      : null;

  const oneYearAgo = shiftDaysISO(last.date, 365);
  const history1Y = history
    .filter((p) => p.date >= oneYearAgo)
    .map((p) => ({ date: p.date, value: p.close }));

  return {
    slug,
    name: meta.name,
    unit: meta.unit,
    exchange: meta.exchange,
    category: meta.category,
    color: meta.color,
    brvmRelevance: meta.brvmRelevance,
    brvmTickers: meta.brvmTickers,
    exposedCountries: meta.exposedCountries,
    last: stats.last,
    lastDate: stats.lastDate,
    prevWeekClose,
    weekChangePct: weekChangePct ?? stats.returns["1S"],
    weekChangeAbs,
    returns: {
      "1S": weekChangePct ?? stats.returns["1S"],
      "1M": stats.returns["1M"],
      "3M": stats.returns["3M"],
      YTD: stats.returns.YTD,
      "1A": stats.returns["1A"],
    },
    high52w: stats.high52w,
    low52w: stats.low52w,
    volatility1Y: stats.volatility1Y,
    drawdownFromHigh5Y: stats.drawdownFromHigh5Y,
    history1Y,
    commentary: null,
  };
}

export async function getCommoditiesWeeklyData(): Promise<CommoditiesWeeklyData> {
  const commodities = WEEKLY_SLUGS.map(buildWeekly).filter(
    (c): c is CommodityWeekly => c !== null,
  );

  // Date d'arrêté = la plus récente parmi les MP retenues.
  const asOf = commodities.reduce((m, c) => (c.lastDate > m ? c.lastDate : m), "");
  const weekStart = asOf ? shiftDaysISO(asOf, 6) : "";
  const weekLabel =
    asOf && weekStart ? `du ${frDateShort(weekStart)} au ${frDate(asOf)}` : "";

  // Commentaires IA (un seul appel pour toutes les MP).
  let commentary: CommodityCommentary | null = null;
  try {
    commentary = await generateCommodityCommentary({
      weekLabel,
      asOf,
      commodities: commodities.map((c) => ({
        slug: c.slug,
        name: c.name,
        unit: c.unit,
        last: c.last,
        weekChangePct: c.weekChangePct,
        ytdPct: c.returns.YTD,
        yearPct: c.returns["1A"],
      })),
    });
  } catch (e) {
    console.error("[commoditiesWeekly] génération commentaires échouée", e);
  }

  if (commentary) {
    for (const c of commodities) {
      c.commentary = commentary.perSlug[c.slug]?.trim() || null;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    weekStart,
    weekLabel,
    commodities,
    globalCommentary: commentary?.global || null,
    commentaryModel: commentary?.model ?? null,
    commentaryAvailable: commentary !== null,
    sources: commentary?.sources ?? [],
  };
}
