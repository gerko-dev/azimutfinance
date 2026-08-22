import { notFound } from "next/navigation";
import SGOProView, { type SGOProData } from "@/components/pros/SGOProView";
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

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = getManagerBySlug(slug);
  if (!result) return { title: "Société de gestion introuvable — Pro Terminal" };
  return { title: `${result.manager.name} — Pro Terminal` };
}

export default async function SGOProDetailPage({
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
  const stalenessCutoff = latestVLGlobal ? subtractCalendarDays(latestVLGlobal, 15) : "";

  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const ref3YBefore = refIdx >= 12 ? quarterEnds[refIdx - 12] : null;

  const marketTotalAUM = allFunds.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);
  const aumYearAgoTotal = refYearAgo
    ? managerFunds.reduce((s, f) => s + (aumAt(f, refYearAgo) ?? 0), 0)
    : 0;
  const aumDelta1Y = aumYearAgoTotal > 0 ? manager.aumAtRef / aumYearAgoTotal - 1 : null;
  const marketShare = marketTotalAUM > 0 ? manager.aumAtRef / marketTotalAUM : 0;

  // Répartition catégorielle SGO vs marché
  const breakdown = categoryBreakdownForManager(managerFunds, refQuarter);
  const marketBreakdownTotal = new Map<string, number>();
  for (const f of allFunds) {
    const obs = f.observations.find(
      (o) => o.date === refQuarter && o.kind === "quarter" && o.aum !== null
    );
    if (!obs || obs.aum === null) continue;
    marketBreakdownTotal.set(obs.categorie, (marketBreakdownTotal.get(obs.categorie) || 0) + obs.aum);
  }
  const marketShareByCat: Record<string, number> = {};
  for (const [cat, aum] of marketBreakdownTotal)
    marketShareByCat[cat] = marketTotalAUM > 0 ? aum / marketTotalAUM : 0;

  const aumTimeline = aumTimelineByCategory(managerFunds, quarterEnds).slice(-13);
  const quality = managerQualityScore(managerFunds, allFunds);

  // Cohortes 1Y par catégorie (pour quartiles)
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
      const y1 = perfWindow(f, 1, "1Y");
      const ytd = perfYTD(f);
      const y1tr = y1.available ? y1.totalReturn : null;
      const quartile = y1tr != null ? quartileInCohort(y1tr, cohortByCat.get(f.categorie) || []) : null;
      const vlDate = f.latestVL?.date ?? "";
      return {
        id: f.id,
        nom: f.nom,
        categorie: f.categorie,
        aum: aumAt(f, refQuarter),
        ytd: ytd.available ? ytd.totalReturn : null,
        y1: y1tr,
        quartile,
        isStale: stalenessCutoff !== "" && vlDate !== "" && vlDate < stalenessCutoff,
        vlLatest: f.bocSnapshot?.vlActuelle ?? null,
        dayChange: f.bocSnapshot?.dayChange ?? null,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  const growth1Y = refYearAgo ? managerAumGrowthDecomposition(managerFunds, refYearAgo, refQuarter) : null;
  const growth3Y = ref3YBefore ? managerAumGrowthDecomposition(managerFunds, ref3YBefore, refQuarter) : null;

  // League table
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

  // Heatmap perf cat × trim (8 derniers)
  const heatmapRaw = managerPerfHeatmap(managerFunds, quarterEnds);
  const heatQuarters = Array.from(new Set(heatmapRaw.map((h) => h.date))).slice(-8);
  const heatCats = Array.from(new Set(heatmapRaw.map((h) => h.categorie)));
  const heatCells: Record<string, number | null> = {};
  for (const h of heatmapRaw) {
    if (heatQuarters.includes(h.date)) heatCells[`${h.date}|${h.categorie}`] = h.perf;
  }

  const cadenceMix = managerCadenceMix(managerFunds, latestVLGlobal || refQuarter, quarterEnds);

  const data: SGOProData = {
    manager: { slug: manager.slug, name: manager.name, nbFunds: manager.nbFunds, aumAtRef: manager.aumAtRef },
    refQuarter,
    marketTotalAUM,
    marketShare,
    aumDelta1Y,
    myRank,
    nbManagers: allManagers.length,
    breakdown,
    marketShareByCat,
    aumTimeline,
    catKeys: breakdown.map((b) => b.categorie),
    quality,
    fundsList,
    growth1Y,
    growth3Y,
    allManagers,
    heatmap: { quarters: heatQuarters, categories: heatCats, cells: heatCells },
    cadenceMix,
  };

  return <SGOProView data={data} />;
}
