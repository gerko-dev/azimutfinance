import "server-only";

// === DONNÉES DU RAPPORT « RÉCAPITULATIF DE COTATION » ===
// Assemble le même payload que la page /marches/actions (cours live BRVM avec
// repli historique Sika) pour alimenter l'Excel et le PDF du rapport.

import {
  loadAllActionsEnriched,
  getActionsMarketStats,
  getIndexStats,
  computeYtdPct,
  loadIndexHistory,
  type ActionRow,
} from "@/lib/dataLoader";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";

export type ReportAction = ActionRow & { ytdPct: number | null };

export type ReportIndex = {
  code: string;
  name: string;
  category: string;
  value: number;
  previousValue: number;
  variationPct: number;
  variationValue: number;
  ytdPct: number | null;
};

export type CotationReportData = {
  generatedAt: string;
  session: {
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
    liveListedCount: number;
  };
  actions: ReportAction[];
  marketStats: ReturnType<typeof getActionsMarketStats>;
  topGainers: ActionRow[];
  topLosers: ActionRow[];
  compositeStat: {
    code: string;
    name: string;
    latestValue: number;
    latestDate: string;
    variationPct: number;
    variationValue: number;
  };
  indices: ReportIndex[];
  /** Clôtures du BRVM Composite sur ~1 an (pour le graphique du rapport). */
  compositeHistory: { date: string; value: number }[];
};

/** Renvoie la date ISO un an avant `iso` (YYYY-MM-DD). */
function oneYearBeforeISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function getCotationReportData(): Promise<CotationReportData> {
  const [actions, liveSnapshot, indicesSnapshot] = await Promise.all([
    loadAllActionsEnriched(),
    getBrvmSnapshot(),
    getBrvmIndicesSnapshot(),
  ]);

  const liveByCode = new Map(liveSnapshot.quotes.map((q) => [q.code, q]));
  const marketStats = getActionsMarketStats(actions);

  const liveActionsOnly = actions.filter((a) => liveByCode.has(a.code));
  const topGainers = [...liveActionsOnly]
    .filter((a) => a.changePercent > 0 && a.price > 0)
    .sort((a, b) =>
      b.changePercent !== a.changePercent
        ? b.changePercent - a.changePercent
        : b.volume - a.volume,
    )
    .slice(0, 5);
  const topLosers = [...liveActionsOnly]
    .filter((a) => a.changePercent < 0 && a.price > 0)
    .sort((a, b) =>
      a.changePercent !== b.changePercent
        ? a.changePercent - b.changePercent
        : b.volume - a.volume,
    )
    .slice(0, 5);

  const liveComposite = indicesSnapshot.indices.find((i) => i.code === "BRVMC");
  const compositeStat = liveComposite
    ? {
        code: "BRVMC",
        name: "BRVM Composite",
        latestValue: liveComposite.value,
        latestDate: indicesSnapshot.fetchedAt.slice(0, 10),
        variationPct: liveComposite.variationPct,
        variationValue: liveComposite.value - liveComposite.previousValue,
      }
    : (() => {
        const s = getIndexStats("BRVMC");
        return {
          code: "BRVMC",
          name: "BRVM Composite",
          latestValue: s?.latestValue ?? 0,
          latestDate: s?.latestDate ?? indicesSnapshot.fetchedAt.slice(0, 10),
          variationPct: s?.variationPct ?? 0,
          variationValue: s?.variationValue ?? 0,
        };
      })();

  // Historique 1 an du BRVM Composite (clôtures CSV), avec ajout du point live
  // le plus récent si la séance scrapée est postérieure à la dernière clôture.
  const fullCompositeHistory = loadIndexHistory("BRVMC");
  const compositeHistory: { date: string; value: number }[] = (() => {
    if (fullCompositeHistory.length === 0) return [];
    const lastDate = fullCompositeHistory[fullCompositeHistory.length - 1].date;
    const cutoff = oneYearBeforeISO(lastDate);
    const series = fullCompositeHistory
      .filter((p) => p.date >= cutoff)
      .map((p) => ({ date: p.date, value: p.value }));
    const liveDate = indicesSnapshot.fetchedAt.slice(0, 10);
    if (liveComposite && liveComposite.value > 0 && liveDate > lastDate) {
      series.push({ date: liveDate, value: liveComposite.value });
    }
    return series;
  })();

  const indices: ReportIndex[] = indicesSnapshot.indices.map((i) => ({
    code: i.code,
    name: i.name,
    category: i.category,
    value: i.value,
    previousValue: i.previousValue,
    variationPct: i.variationPct,
    variationValue: i.value - i.previousValue,
    ytdPct: computeYtdPct(i.code, i.value),
  }));

  return {
    generatedAt: new Date().toISOString(),
    session: {
      fetchedAt: indicesSnapshot.fetchedAt,
      sessionLabel: indicesSnapshot.sessionLabel,
      isClosed: indicesSnapshot.isClosed,
      liveListedCount: liveSnapshot.quotes.length,
    },
    actions: actions.map((a) => ({ ...a, ytdPct: computeYtdPct(a.code, a.price) })),
    marketStats,
    topGainers,
    topLosers,
    compositeStat,
    indices,
    compositeHistory,
  };
}
