import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import CategoryDetailView from "@/components/CategoryDetailView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
  categoryFromSlug,
  categorySlug,
  managerSlug,
  FCP_CATEGORIES,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  perfLastPeriod,
  aumTimelineByCategory,
  quartileInCohort,
} from "@/lib/fcpMath";

export const dynamic = "force-static";

export type CategoryFundRow = {
  id: string;
  nom: string;
  gestionnaire: string;
  managerSlug: string;
  type: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
  y3: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
  latestVLDate: string;
  isStale: boolean;
};

export type CategoryManagerRow = {
  slug: string;
  name: string;
  nbFunds: number;
  aum: number;
  share: number;
  perfWeighted1Y: number | null;
  perfMedian1Y: number | null;
  topQuartileShare: number | null;
};

export type DispersionRow = {
  label: string;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  iqr: number | null;
  n: number;
};

function percentile(values: number[], p: number): number | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function dispersion(label: string, perfs: number[]): DispersionRow {
  if (perfs.length === 0) {
    return { label, min: null, q1: null, median: null, q3: null, max: null, iqr: null, n: 0 };
  }
  const min = Math.min(...perfs);
  const max = Math.max(...perfs);
  const q1 = percentile(perfs, 0.25);
  const median = percentile(perfs, 0.5);
  const q3 = percentile(perfs, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
  return { label, min, q1, median, q3, max, iqr, n: perfs.length };
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = categoryFromSlug(slug);
  if (!cat) notFound();

  const funds = loadFunds();
  const refQuarter = getReferenceQuarter(funds);
  const latestVLGlobal = getLatestVLDate(funds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";
  const quarterEnds = listQuarterEnds();

  // Fonds de cette catégorie au refDate
  const inCat = funds.filter((f) => categoryAt(f, refQuarter) === cat);

  // Cohorte 1Y pour les quartiles
  const cohort1Y = inCat
    .map((f) => perfWindow(f, 1, "1Y").totalReturn)
    .filter((v) => Number.isFinite(v) && v !== 0);

  // === HEADER stats ===
  const aumTotal = inCat.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);
  const totalMarketAUM = funds.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);
  const marketShare = totalMarketAUM > 0 ? aumTotal / totalMarketAUM : 0;
  const managerNames = new Set(inCat.map((f) => f.gestionnaire));

  // === DISPERSION sur 6 fenêtres ===
  const collect = (winYears: number) =>
    inCat
      .map((f) => perfWindow(f, winYears, ""))
      .filter((p) => p.available)
      .map((p) => p.totalReturn);
  const collectAnnualized = (winYears: number) =>
    inCat
      .map((f) => perfWindow(f, winYears, ""))
      .filter((p) => p.available)
      .map((p) => p.annualized);
  const collectYTD = () =>
    inCat.map((f) => perfYTD(f)).filter((p) => p.available).map((p) => p.totalReturn);
  const collectLast = () =>
    inCat.map((f) => perfLastPeriod(f)).filter((p) => p.available).map((p) => p.totalReturn);

  const dispersionRows: DispersionRow[] = [
    dispersion("Dernière", collectLast()),
    dispersion("YTD", collectYTD()),
    dispersion("3 mois", collect(0.25)),
    dispersion("6 mois", collect(0.5)),
    dispersion("1 an", collect(1)),
    dispersion("3 ans (annualisé)", collectAnnualized(3)),
  ];

  // === FONDS ===
  const fundsRows: CategoryFundRow[] = inCat
    .map((f) => {
      const aum = aumAt(f, refQuarter);
      const ytd = perfYTD(f);
      const y1 = perfWindow(f, 1, "1Y");
      const y3 = perfWindow(f, 3, "3Y");
      const y1tr = y1.available ? y1.totalReturn : null;
      const quartile = y1tr !== null ? quartileInCohort(y1tr, cohort1Y) : null;
      const latestVLDate = f.latestVL?.date ?? "";
      const isStale = stalenessCutoff !== "" && latestVLDate < stalenessCutoff;
      return {
        id: f.id,
        nom: f.nom,
        gestionnaire: f.gestionnaire,
        managerSlug: managerSlug(f.gestionnaire),
        type: f.type,
        aum,
        ytd: ytd.available ? ytd.totalReturn : null,
        y1: y1tr,
        y3: y3.available ? y3.annualized : null,
        quartile,
        latestVLDate,
        isStale,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  // === GESTIONNAIRES ACTIFS DANS LA CAT ===
  const byMgr = new Map<string, typeof inCat>();
  for (const f of inCat) {
    const list = byMgr.get(f.gestionnaire) || [];
    list.push(f);
    byMgr.set(f.gestionnaire, list);
  }
  const managerRows: CategoryManagerRow[] = [];
  for (const [name, mFunds] of byMgr) {
    let weightedNum = 0;
    let weightedDen = 0;
    const perfs: number[] = [];
    let q1Count = 0;
    let evaluated = 0;
    for (const f of mFunds) {
      const tr = perfWindow(f, 1, "1Y").totalReturn;
      if (!Number.isFinite(tr) || tr === 0) continue;
      const aum = aumAt(f, refQuarter) ?? 0;
      perfs.push(tr);
      weightedNum += tr * aum;
      weightedDen += aum;
      const q = quartileInCohort(tr, cohort1Y);
      if (q !== null) {
        evaluated++;
        if (q === 1) q1Count++;
      }
    }
    const aumMgr = mFunds.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);
    managerRows.push({
      slug: managerSlug(name),
      name,
      nbFunds: mFunds.length,
      aum: aumMgr,
      share: aumTotal > 0 ? aumMgr / aumTotal : 0,
      perfWeighted1Y: weightedDen > 0 ? weightedNum / weightedDen : null,
      perfMedian1Y: percentile(perfs, 0.5),
      topQuartileShare: evaluated > 0 ? q1Count / evaluated : null,
    });
  }
  managerRows.sort((a, b) => b.aum - a.aum);

  // === EVOLUTION AUM (de la catégorie sur le marché) ===
  const aumTimeline = aumTimelineByCategory(inCat, quarterEnds);

  // === Concentration : top 5 fonds, top 5 SGP ===
  const top5FundsShare =
    aumTotal > 0
      ? fundsRows.slice(0, 5).reduce((s, r) => s + (r.aum ?? 0), 0) / aumTotal
      : 0;
  const top5MgrShare =
    aumTotal > 0
      ? managerRows.slice(0, 5).reduce((s, r) => s + r.aum, 0) / aumTotal
      : 0;

  // Liens vers autres catégories
  const otherCategories = FCP_CATEGORIES.filter((c) => c !== cat).map((c) => ({
    slug: categorySlug(c),
    name: c,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <CategoryDetailView
        category={cat}
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        nbFunds={inCat.length}
        nbManagers={managerNames.size}
        aumTotal={aumTotal}
        marketShare={marketShare}
        dispersionRows={dispersionRows}
        fundsRows={fundsRows}
        managerRows={managerRows}
        aumTimeline={aumTimeline}
        top5FundsShare={top5FundsShare}
        top5MgrShare={top5MgrShare}
        otherCategories={otherCategories}
      />
    </div>
  );
}
