import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import SGPDetailView from "@/components/SGPDetailView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  getManagerBySlug,
  listManagers,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  categoryBreakdownForManager,
  managerQualityScore,
  managerAumGrowthDecomposition,
  managerCadenceMix,
  managerPerfHeatmap,
  aumTimelineByCategory,
  quartileInCohort,
} from "@/lib/fcpMath";

export const dynamic = "force-static";

export default async function SGPDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = getManagerBySlug(slug);
  if (!result) notFound();
  const { manager, funds: managerFunds } = result;

  const allFunds = loadFunds();
  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(allFunds);
  const latestVLGlobal = getLatestVLDate(allFunds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const ref3YBefore = refIdx >= 12 ? quarterEnds[refIdx - 12] : null;

  // === BLOCK 1 - HEADER ===
  // AUM total marché (pour part de marché)
  const marketTotalAUM = allFunds.reduce(
    (s, f) => s + (aumAt(f, refQuarter) ?? 0),
    0
  );
  const aumYearAgoTotal = refYearAgo
    ? managerFunds.reduce((s, f) => s + (aumAt(f, refYearAgo) ?? 0), 0)
    : 0;
  const aumDelta1Y =
    aumYearAgoTotal > 0 ? manager.aumAtRef / aumYearAgoTotal - 1 : null;
  const marketShare = marketTotalAUM > 0 ? manager.aumAtRef / marketTotalAUM : 0;

  // === BLOCK 2 - REPARTITION CATEGORIE ===
  const breakdown = categoryBreakdownForManager(managerFunds, refQuarter);
  const marketBreakdownTotal = new Map<string, number>();
  for (const f of allFunds) {
    const obs = f.observations.find(
      (o) => o.date === refQuarter && o.kind === "quarter" && o.aum !== null
    );
    if (!obs || obs.aum === null) continue;
    marketBreakdownTotal.set(
      obs.categorie,
      (marketBreakdownTotal.get(obs.categorie) || 0) + obs.aum
    );
  }
  const marketBreakdown = Array.from(marketBreakdownTotal.entries()).map(
    ([categorie, aum]) => ({
      categorie,
      aum,
      share: marketTotalAUM > 0 ? aum / marketTotalAUM : 0,
    })
  );

  // === BLOCK 3 - EVOLUTION AUM SGP ===
  const aumTimeline = aumTimelineByCategory(managerFunds, quarterEnds);

  // === BLOCK 4 - SCORE QUALITE ===
  const quality = managerQualityScore(managerFunds, allFunds);

  // === BLOCK 5 - LISTE DES FONDS ===
  // Cohortes par catégorie pour quartiles
  const cohortByCat = new Map<string, number[]>();
  for (const f of allFunds) {
    const v = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(v) || v === 0) continue;
    const list = cohortByCat.get(f.categorie) || [];
    list.push(v);
    cohortByCat.set(f.categorie, list);
  }
  const fundsList = managerFunds
    .map((f) => {
      const aum = aumAt(f, refQuarter);
      const ytd = perfYTD(f);
      const y1 = perfWindow(f, 1, "1Y");
      const y1tr = y1.available ? y1.totalReturn : null;
      const quartile = y1tr !== null ? quartileInCohort(y1tr, cohortByCat.get(f.categorie) || []) : null;
      const latestVLDate = f.latestVL?.date ?? "";
      const isStale = stalenessCutoff !== "" && latestVLDate < stalenessCutoff;
      return {
        id: f.id,
        nom: f.nom,
        categorie: f.categorie,
        aum,
        ytd: ytd.available ? ytd.totalReturn : null,
        y1: y1tr,
        quartile,
        latestVLDate,
        isStale,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  // === BLOCK 6 - DECOMPOSITION AUM AGREGEE ===
  const growth1Y = refYearAgo
    ? managerAumGrowthDecomposition(managerFunds, refYearAgo, refQuarter)
    : null;
  const growth3Y = ref3YBefore
    ? managerAumGrowthDecomposition(managerFunds, ref3YBefore, refQuarter)
    : null;

  // === BLOCK 7 - POSITION CONCURRENTIELLE ===
  // League table : toutes les SGP triées par AUM
  const allManagers = listManagers().map((m) => {
    const mFunds = allFunds.filter((f) => f.gestionnaire === m.name);
    const q = managerQualityScore(mFunds, allFunds);
    return {
      slug: m.slug,
      name: m.name,
      nbFunds: m.nbFunds,
      aumAtRef: m.aumAtRef,
      marketShare: marketTotalAUM > 0 ? m.aumAtRef / marketTotalAUM : 0,
      perfWeighted1Y: q.perfWeighted1Y,
      topQuartileShare: q.topQuartileShare,
    };
  });
  const myRank = allManagers.findIndex((m) => m.slug === manager.slug) + 1;

  // === BLOCK 8 - HEATMAP PERF SGP CAT × TRIM ===
  const perfHeatmap = managerPerfHeatmap(managerFunds, quarterEnds);

  // === BLOCK 9 - CADENCE AGREGEE ===
  const cadenceMix = managerCadenceMix(managerFunds, latestVLGlobal || refQuarter, quarterEnds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <SGPDetailView
        manager={manager}
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        marketTotalAUM={marketTotalAUM}
        marketShare={marketShare}
        aumDelta1Y={aumDelta1Y}
        breakdown={breakdown}
        marketBreakdown={marketBreakdown}
        aumTimeline={aumTimeline}
        quality={quality}
        fundsList={fundsList}
        growth1Y={growth1Y}
        growth3Y={growth3Y}
        allManagers={allManagers}
        myRank={myRank}
        perfHeatmap={perfHeatmap}
        cadenceMix={cadenceMix}
      />
    </div>
  );
}
