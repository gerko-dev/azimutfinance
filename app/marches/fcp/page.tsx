import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import FCPMarketView from "@/components/FCPMarketView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
  FCP_CATEGORIES,
} from "@/lib/fcp";
import {
  aumTimelineByCategory,
  perfWindow,
  perfYTD,
  perfLastPeriod,
  quarterlyPerfHeatmap,
} from "@/lib/fcpMath";

// Le nudge JIT lit la session Supabase -> page necessairement dynamique.
// Les CSV sont memoizes au niveau module, donc le cout supplementaire est minime.

export type PeriodKey = "lastPeriod" | "ytd" | "m3" | "m6" | "m9" | "y1";

export type FundCard = {
  id: string;
  nom: string;
  gestionnaire: string;
  categorie: string;          // catégorie courante du fonds (dernière obs)
  categorieAtRef: string;     // catégorie à la date de référence (pour les KPI)
  type: string;
  aumAtRef: number | null;
  latestVLDate: string;
  isStale: boolean;
  perf: Record<PeriodKey, number | null>;
};

export type CategoryStat = {
  categorie: string;
  nbFundsAtRef: number;
  aumAtRef: number;
  perfMedianByPeriod: Record<PeriodKey, number | null>;
};

function median(values: number[]): number | null {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length === 0) return null;
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default async function Page() {
  const funds = loadFunds();
  const quarterEnds = listQuarterEnds();

  // === DATES DE REFERENCE ===
  const refQuarter = getReferenceQuarter(funds);     // ex: "2025-12-31"
  const latestVLGlobal = getLatestVLDate(funds);     // ex: "2026-03-31"
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  // === FUND CARDS (un objet par fonds, tout précompiled) ===
  const cards: FundCard[] = funds.map((f) => {
    const aum = aumAt(f, refQuarter);
    const catAtRef = categoryAt(f, refQuarter) ?? f.categorie;
    const latestVLDate = f.latestVL?.date ?? "";
    const isStale = stalenessCutoff !== "" && latestVLDate < stalenessCutoff;

    const perf: Record<PeriodKey, number | null> = {
      lastPeriod: null,
      ytd: null,
      m3: null,
      m6: null,
      m9: null,
      y1: null,
    };
    const last = perfLastPeriod(f);
    if (last.available) perf.lastPeriod = last.totalReturn;
    const ytd = perfYTD(f);
    if (ytd.available) perf.ytd = ytd.totalReturn;
    const p3 = perfWindow(f, 0.25, "3M");
    if (p3.available) perf.m3 = p3.totalReturn;
    const p6 = perfWindow(f, 0.5, "6M");
    if (p6.available) perf.m6 = p6.totalReturn;
    const p9 = perfWindow(f, 0.75, "9M");
    if (p9.available) perf.m9 = p9.totalReturn;
    const p1 = perfWindow(f, 1, "1Y");
    if (p1.available) perf.y1 = p1.totalReturn;

    return {
      id: f.id,
      nom: f.nom,
      gestionnaire: f.gestionnaire,
      categorie: f.categorie,
      categorieAtRef: catAtRef,
      type: f.type,
      aumAtRef: aum,
      latestVLDate,
      isStale,
      perf,
    };
  });

  // === KPI globaux : AUM ponctuel au refDate ===
  const cardsAtRef = cards.filter((c) => c.aumAtRef !== null && c.aumAtRef > 0);
  const totalAUM = cardsAtRef.reduce((s, c) => s + (c.aumAtRef ?? 0), 0);
  const totalFundsAtRef = cardsAtRef.length;
  const managersAtRef = new Set(cardsAtRef.map((c) => c.gestionnaire)).size;

  // === STATS PAR CATEGORIE ===
  // Important : on agrège par `categorieAtRef` (catégorie déclarée AU 31/12/2025)
  // et non par `categorie` (catégorie courante), car certains fonds changent
  // de classification dans le temps.
  const periodKeys: PeriodKey[] = ["lastPeriod", "ytd", "m3", "m6", "m9", "y1"];
  const categoryStats: CategoryStat[] = FCP_CATEGORIES.map((cat) => {
    const inCat = cardsAtRef.filter((c) => c.categorieAtRef === cat);
    const eligible = inCat.filter((c) => !c.isStale);
    const perfMedian = {} as Record<PeriodKey, number | null>;
    for (const k of periodKeys) {
      perfMedian[k] = median(
        eligible.map((c) => c.perf[k]).filter((v): v is number => v !== null)
      );
    }
    return {
      categorie: cat,
      nbFundsAtRef: inCat.length,
      aumAtRef: inCat.reduce((s, c) => s + (c.aumAtRef ?? 0), 0),
      perfMedianByPeriod: perfMedian,
    };
  }).filter((s) => s.nbFundsAtRef > 0);

  // === TIMELINE & HEATMAP (déjà OK, juste la stacked area + heatmap globales) ===
  const aumTimeline = aumTimelineByCategory(funds, quarterEnds);
  const heatmap = quarterlyPerfHeatmap(funds, quarterEnds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4">
        <ProfileNudge field="investment_horizon" revalidate="/marches/fcp" />
      </div>
      <FCPMarketView
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        stalenessCutoff={stalenessCutoff}
        totalAUM={totalAUM}
        totalFundsAtRef={totalFundsAtRef}
        totalManagers={managersAtRef}
        cards={cards}
        cardsAtRef={cardsAtRef}
        categoryStats={categoryStats}
        aumTimeline={aumTimeline}
        heatmap={heatmap}
      />
    </div>
  );
}
