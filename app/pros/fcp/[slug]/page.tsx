import { notFound } from "next/navigation";
import FCPProDetailView, {
  type FCPProDetailData,
} from "@/components/pros/FCPProDetailView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
  managerSlug,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  perfLastPeriod,
  cohortMedianPerf,
  cohortMedianYTD,
  cohortMedianLastPeriod,
  cohortMedianRebasedSeries,
  excessVsCategory,
  publicationCadence,
  rolling1YStats,
  marketShareHistory,
  quartileHistory,
  quartileInCohort,
  aumDecomposition,
} from "@/lib/fcpMath";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fund = loadFunds().find((f) => f.id === slug);
  if (!fund) return { title: "Fonds introuvable — Pro Terminal" };
  return { title: `${fund.nom} (${fund.gestionnaire}) — Pro Terminal` };
}

export default async function FCPProDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const funds = loadFunds();
  const fund = funds.find((f) => f.id === slug);
  if (!fund) notFound();

  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(funds);
  const latestVLGlobal = getLatestVLDate(funds);
  const stalenessCutoff = latestVLGlobal ? subtractCalendarDays(latestVLGlobal, 15) : "";

  const cohort = funds.filter((f) => f.categorie === fund.categorie);
  const managerPeers = funds.filter(
    (f) => f.gestionnaire === fund.gestionnaire && f.id !== fund.id
  );

  const aumRef = aumAt(fund, refQuarter);
  const catAtRef = categoryAt(fund, refQuarter) ?? fund.categorie;
  const ytd = perfYTD(fund);
  const cohortYTDPerfs = cohort
    .map((f) => perfYTD(f))
    .filter((p) => p.available)
    .map((p) => p.totalReturn);
  const ytdQuartile = ytd.available ? quartileInCohort(ytd.totalReturn, cohortYTDPerfs) : null;

  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const aumYearAgo = refYearAgo ? aumAt(fund, refYearAgo) : null;
  const aumDelta1Y =
    aumRef !== null && aumYearAgo !== null && aumYearAgo > 0 ? aumRef / aumYearAgo - 1 : null;

  // === TABLEAU DE PERFORMANCE (fonds vs médiane catégorie) ===
  const perfTable = [
    { label: "Dernière", win: perfLastPeriod(fund), median: cohortMedianLastPeriod(cohort) },
    { label: "YTD", win: ytd, median: cohortMedianYTD(cohort) },
    { label: "3 mois", win: perfWindow(fund, 0.25, "3M"), median: cohortMedianPerf(cohort, 0.25).totalReturn },
    { label: "6 mois", win: perfWindow(fund, 0.5, "6M"), median: cohortMedianPerf(cohort, 0.5).totalReturn },
    { label: "1 an", win: perfWindow(fund, 1, "1Y"), median: cohortMedianPerf(cohort, 1).totalReturn },
    { label: "3 ans (ann.)", win: perfWindow(fund, 3, "3Y"), median: cohortMedianPerf(cohort, 3).annualized, useAnnualized: true },
  ].map((row) => {
    const fundValue = row.win.available
      ? row.useAnnualized
        ? row.win.annualized
        : row.win.totalReturn
      : null;
    return {
      label: row.label,
      fromDate: row.win.fromDate,
      toDate: row.win.toDate,
      fundValue,
      cohortValue: row.median ?? null,
      excess: fundValue != null && row.median != null ? fundValue - row.median : null,
    };
  });

  // === VL REBASEE (fonds vs médiane catégorie) ===
  const vlSeries = fund.observations
    .filter((o) => o.vl !== null)
    .map((o) => ({ date: o.date, vl: o.vl as number }));
  const baseObs = vlSeries[0];
  const cohortRebased = baseObs
    ? cohortMedianRebasedSeries(cohort, baseObs.date, vlSeries.map((p) => p.date))
    : [];
  const vlChart = baseObs
    ? vlSeries.map((p, i) => ({
        date: p.date,
        fund: (p.vl / baseObs.vl) * 100,
        cohort: cohortRebased[i]?.value ?? null,
      }))
    : [];

  // === QUARTILES ===
  const quartileFrame = quartileHistory(fund, cohort, quarterEnds.slice(-16));
  const evaluated = quartileFrame.filter((q) => q.quartile !== null);
  const top2Pct =
    evaluated.length > 0
      ? evaluated.filter((q) => q.quartile === 1 || q.quartile === 2).length / evaluated.length
      : null;

  // === ENCOURS, EXCES, RISQUE ===
  const aumDecomp = aumDecomposition(fund).slice(-13);
  const excess = excessVsCategory(fund, cohort, quarterEnds).slice(-13);
  const rolling = rolling1YStats(fund, quarterEnds, 8);
  const marketShare = marketShareHistory(fund, cohort, quarterEnds).slice(-13);
  const cadence = publicationCadence(fund, latestVLGlobal || refQuarter, quarterEnds);

  // === PAIRS ===
  const peerEntries = cohort
    .filter((f) => f.id !== fund.id)
    .map((f) => {
      const y1F = perfWindow(f, 1, "1Y");
      const ytdF = perfYTD(f);
      return {
        id: f.id,
        nom: f.nom,
        gestionnaire: f.gestionnaire,
        aum: aumAt(f, refQuarter),
        ytd: ytdF.available ? ytdF.totalReturn : null,
        y1: y1F.available ? y1F.totalReturn : null,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1))
    .slice(0, 10);

  const managerEntries = managerPeers
    .map((f) => {
      const y1F = perfWindow(f, 1, "1Y");
      const ytdF = perfYTD(f);
      return {
        id: f.id,
        nom: f.nom,
        categorie: f.categorie,
        aum: aumAt(f, refQuarter),
        ytd: ytdF.available ? ytdF.totalReturn : null,
        y1: y1F.available ? y1F.totalReturn : null,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  const data: FCPProDetailData = {
    fund: {
      id: fund.id,
      nom: fund.nom,
      gestionnaire: fund.gestionnaire,
      gestionnaireSlug: managerSlug(fund.gestionnaire),
      type: fund.type,
      categorie: catAtRef,
      firstObsDate: fund.firstObsDate,
      depositaire: fund.bocSnapshot?.depositaire ?? "",
      frequenceCalcul: fund.bocSnapshot?.frequenceCalcul ?? "",
      bocDate: fund.bocSnapshot?.bocDate ?? "",
      bocVL: fund.bocSnapshot?.vlActuelle ?? null,
      bocDayChange: fund.bocSnapshot?.dayChange ?? null,
    },
    refQuarter,
    latestVL: fund.latestVL,
    stalenessCutoff,
    aumRef,
    aumDelta1Y,
    ytdQuartile,
    cohortSize: cohort.length,
    perfTable,
    vlChart,
    quartileFrame,
    top2Pct,
    aumDecomp,
    excess,
    rolling,
    marketShare,
    cadence: {
      kind: cadence.kind,
      regularity: cadence.regularity,
      daysSinceLast: cadence.daysSinceLast,
      lastPublicationDate: cadence.lastPublicationDate,
      intraTrim365: cadence.intraTrim365,
    },
    peerEntries,
    managerEntries,
  };

  return <FCPProDetailView data={data} />;
}
