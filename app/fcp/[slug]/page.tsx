import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import FCPDetailView from "@/components/FCPDetailView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
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
  aumGrowthDecomposition,
  publicationCadence,
  rolling1YStats,
  marketShareHistory,
  quartileHistory,
  quartileInCohort,
  quarterlyCalendar,
  aumDecomposition,
} from "@/lib/fcpMath";

export const dynamic = "force-static";

export default async function FCPDetailPage({
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
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  // === COHORTE (catégorie courante) ===
  const cohort = funds.filter((f) => f.categorie === fund.categorie);
  const managerPeers = funds.filter(
    (f) => f.gestionnaire === fund.gestionnaire && f.id !== fund.id
  );

  // === BLOCK 1 - HEADER ===
  const aumRef = aumAt(fund, refQuarter);
  const catAtRef = categoryAt(fund, refQuarter) ?? fund.categorie;
  const ytd = perfYTD(fund);
  const cohortYTDPerfs = cohort
    .map((f) => perfYTD(f))
    .filter((p) => p.available)
    .map((p) => p.totalReturn);
  const ytdQuartile = ytd.available ? quartileInCohort(ytd.totalReturn, cohortYTDPerfs) : null;

  // Δ AUM 1Y : AUM au refQuarter vs AUM au même trim un an avant (4 trim canoniques)
  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const aumYearAgo = refYearAgo ? aumAt(fund, refYearAgo) : null;
  const aumDelta1Y =
    aumRef !== null && aumYearAgo !== null && aumYearAgo > 0
      ? aumRef / aumYearAgo - 1
      : null;

  // === BLOCK 2 - TABLEAU DE PERFORMANCE ===
  const perfTable = [
    { key: "lastPeriod", label: "Dernière", win: perfLastPeriod(fund), median: cohortMedianLastPeriod(cohort) },
    { key: "ytd", label: "YTD", win: ytd, median: cohortMedianYTD(cohort) },
    { key: "m3", label: "3 mois", win: perfWindow(fund, 0.25, "3M"), median: cohortMedianPerf(cohort, 0.25).totalReturn },
    { key: "m6", label: "6 mois", win: perfWindow(fund, 0.5, "6M"), median: cohortMedianPerf(cohort, 0.5).totalReturn },
    { key: "y1", label: "1 an", win: perfWindow(fund, 1, "1Y"), median: cohortMedianPerf(cohort, 1).totalReturn },
    {
      key: "y3",
      label: "3 ans (annualisé)",
      win: perfWindow(fund, 3, "3Y"),
      median: cohortMedianPerf(cohort, 3).annualized,
      useAnnualized: true,
    },
  ].map((row) => ({
    label: row.label,
    fromDate: row.win.fromDate,
    toDate: row.win.toDate,
    fundValue: row.win.available
      ? row.useAnnualized
        ? row.win.annualized
        : row.win.totalReturn
      : null,
    cohortValue: row.median ?? null,
    excess:
      row.win.available && row.median !== null
        ? (row.useAnnualized ? row.win.annualized : row.win.totalReturn) - row.median
        : null,
  }));

  // === BLOCK 3 - GRAPHE VL REBASE ===
  // Toutes les obs avec VL non null, du firstObsDate au latestVL
  const vlSeries = fund.observations
    .filter((o) => o.vl !== null)
    .map((o) => ({ date: o.date, vl: o.vl as number, kind: o.kind }));
  const baseObs = vlSeries[0];
  const rebasedFundSeries = baseObs
    ? vlSeries.map((p) => ({
        date: p.date,
        rebased: (p.vl / baseObs.vl) * 100,
        kind: p.kind,
      }))
    : [];
  // Médiane catégorie rebasée aux mêmes dates
  const cohortRebased = baseObs
    ? cohortMedianRebasedSeries(
        cohort,
        baseObs.date,
        vlSeries.map((p) => p.date)
      )
    : [];

  // === BLOCK 4 - FRISE QUARTILES ===
  const quartileFrame = quartileHistory(fund, cohort, quarterEnds.slice(-16));
  const top2Pct =
    quartileFrame.length > 0
      ? quartileFrame.filter((q) => q.quartile === 1 || q.quartile === 2).length /
        quartileFrame.filter((q) => q.quartile !== null).length
      : null;

  // === BLOCK 5 - DECOMPOSITION AUM (par trimestre) ===
  const aumDecomp = aumDecomposition(fund);

  // === BLOCK 6 - EXCES VS CATEGORIE ===
  const excess = excessVsCategory(fund, cohort, quarterEnds);

  // === BLOCK 7 - PEER GROUP CATEGORIE ===
  const peerEntries = cohort
    .filter((f) => f.id !== fund.id)
    .map((f) => {
      const aumF = aumAt(f, refQuarter);
      const ytdF = perfYTD(f);
      const y1F = perfWindow(f, 1, "1Y");
      return {
        id: f.id,
        nom: f.nom,
        gestionnaire: f.gestionnaire,
        aum: aumF,
        ytd: ytdF.available ? ytdF.totalReturn : null,
        y1: y1F.available ? y1F.totalReturn : null,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1))
    .slice(0, 10);

  // === BLOCK 8 - AUTRES FONDS DU GESTIONNAIRE ===
  const managerEntries = managerPeers.map((f) => {
    const aumF = aumAt(f, refQuarter);
    const y1F = perfWindow(f, 1, "1Y");
    const ytdF = perfYTD(f);
    return {
      id: f.id,
      nom: f.nom,
      categorie: f.categorie,
      aum: aumF,
      ytd: ytdF.available ? ytdF.totalReturn : null,
      y1: y1F.available ? y1F.totalReturn : null,
    };
  }).sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  // === BLOCK 9 - PART DE MARCHE DANS LA CATEGORIE ===
  const marketShare = marketShareHistory(fund, cohort, quarterEnds);

  // === BLOCK 10 - HEATMAP CALENDRIER ===
  const calendar = quarterlyCalendar(fund, quarterEnds);

  // === BLOCK 11 - CROISSANCE 1A & 3A DECOMPOSEE ===
  const refQ3YBefore = refIdx >= 12 ? quarterEnds[refIdx - 12] : null;
  const growth1Y = refYearAgo
    ? aumGrowthDecomposition(fund, refYearAgo, refQuarter)
    : null;
  const growth3Y = refQ3YBefore
    ? aumGrowthDecomposition(fund, refQ3YBefore, refQuarter)
    : null;

  // === BLOCK 12 - QUALITE DE PUBLICATION ===
  const cadence = publicationCadence(fund, latestVLGlobal || refQuarter, quarterEnds);

  // === BLOCK 13 - ROLLING 1Y ===
  const rolling = rolling1YStats(fund, quarterEnds, 8);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <FCPDetailView
        // header
        fund={{
          id: fund.id,
          nom: fund.nom,
          gestionnaire: fund.gestionnaire,
          type: fund.type,
          categorie: fund.categorie,
          categorieAtRef: catAtRef,
          firstObsDate: fund.firstObsDate,
        }}
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        stalenessCutoff={stalenessCutoff}
        aumRef={aumRef}
        aumDelta1Y={aumDelta1Y}
        latestVL={fund.latestVL}
        ytdQuartile={ytdQuartile}
        cohortSize={cohort.length}
        // perf table
        perfTable={perfTable}
        // VL chart
        rebasedFundSeries={rebasedFundSeries}
        cohortRebased={cohortRebased}
        // quartile frieze
        quartileFrame={quartileFrame}
        top2Pct={top2Pct}
        // AUM decomp
        aumDecomp={aumDecomp}
        // excess
        excess={excess}
        // peers
        peerEntries={peerEntries}
        managerEntries={managerEntries}
        // market share
        marketShare={marketShare}
        // calendar
        calendar={calendar}
        // growth
        growth1Y={growth1Y}
        growth3Y={growth3Y}
        // cadence
        cadence={cadence}
        // rolling
        rolling={rolling}
      />
    </div>
  );
}
