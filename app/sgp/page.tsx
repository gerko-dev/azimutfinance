import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import SGPIndexView from "@/components/SGPIndexView";
import {
  loadFunds,
  listManagers,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  aumAt,
} from "@/lib/fcp";
import {
  managerQualityScore,
  managerCadenceMix,
  categoryBreakdownForManager,
} from "@/lib/fcpMath";

export const dynamic = "force-static";

export type SGPIndexRow = {
  slug: string;
  name: string;
  nbFunds: number;
  aumAtRef: number;
  marketShare: number;
  perfWeighted1Y: number | null;
  perfMedian1Y: number | null;
  topQuartileShare: number | null;
  topHalfShare: number | null;
  dominantCadence: string;
  cadenceDistribution: { quotidienne: number; hebdomadaire: number; trimestrielle: number; irreguliere: number };
  categories: string[];
};

export default function SGPIndexPage() {
  const allFunds = loadFunds();
  const managers = listManagers();
  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(allFunds);
  const latestVLGlobal = getLatestVLDate(allFunds);

  const marketTotalAUM = allFunds.reduce(
    (s, f) => s + (aumAt(f, refQuarter) ?? 0),
    0
  );

  const rows: SGPIndexRow[] = managers.map((m) => {
    const mFunds = allFunds.filter((f) => f.gestionnaire === m.name);
    const quality = managerQualityScore(mFunds, allFunds);
    const cadenceMix = managerCadenceMix(mFunds, latestVLGlobal || refQuarter, quarterEnds);
    const breakdown = categoryBreakdownForManager(mFunds, refQuarter);

    // Cadence dominante = la plus représentée
    const cadenceEntries = [
      { kind: "quotidienne", n: cadenceMix.quotidienne },
      { kind: "hebdomadaire", n: cadenceMix.hebdomadaire },
      { kind: "trimestrielle", n: cadenceMix.trimestrielle },
      { kind: "irrégulière", n: cadenceMix.irreguliere },
    ].sort((a, b) => b.n - a.n);
    const dominantCadence = cadenceEntries[0].kind;

    return {
      slug: m.slug,
      name: m.name,
      nbFunds: m.nbFunds,
      aumAtRef: m.aumAtRef,
      marketShare: marketTotalAUM > 0 ? m.aumAtRef / marketTotalAUM : 0,
      perfWeighted1Y: quality.perfWeighted1Y,
      perfMedian1Y: quality.perfMedian1Y,
      topQuartileShare: quality.topQuartileShare,
      topHalfShare: quality.topHalfShare,
      dominantCadence,
      cadenceDistribution: {
        quotidienne: cadenceMix.quotidienne,
        hebdomadaire: cadenceMix.hebdomadaire,
        trimestrielle: cadenceMix.trimestrielle,
        irreguliere: cadenceMix.irreguliere,
      },
      categories: breakdown.map((b) => b.categorie),
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <SGPIndexView
        rows={rows}
        refQuarter={refQuarter}
        marketTotalAUM={marketTotalAUM}
        totalFunds={allFunds.length}
      />
    </div>
  );
}
