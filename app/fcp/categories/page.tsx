import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import CategoryIndexView from "@/components/CategoryIndexView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  aumAt,
  categoryAt,
  categorySlug,
  FCP_CATEGORIES,
} from "@/lib/fcp";
import { perfWindow, perfYTD } from "@/lib/fcpMath";

export const dynamic = "force-static";

export type CategoryIndexRow = {
  slug: string;
  categorie: string;
  nbFunds: number;
  nbManagers: number;
  aumTotal: number;
  marketShare: number;
  perfMedianYTD: number | null;
  perfMedian1Y: number | null;
  perfMin1Y: number | null;
  perfMax1Y: number | null;
  spread1Y: number | null;
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

export default function CategoriesIndexPage() {
  const funds = loadFunds();
  const refQuarter = getReferenceQuarter(funds);
  const totalMarketAUM = funds.reduce(
    (s, f) => s + (aumAt(f, refQuarter) ?? 0),
    0
  );

  const rows: CategoryIndexRow[] = FCP_CATEGORIES.map((cat) => {
    const inCat = funds.filter((f) => {
      const c = categoryAt(f, refQuarter);
      return c === cat;
    });
    const aumTotal = inCat.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);
    const managers = new Set(inCat.map((f) => f.gestionnaire));
    const ytdPerfs = inCat
      .map((f) => perfYTD(f))
      .filter((p) => p.available)
      .map((p) => p.totalReturn);
    const y1Perfs = inCat
      .map((f) => perfWindow(f, 1, "1Y"))
      .filter((p) => p.available)
      .map((p) => p.totalReturn);
    return {
      slug: categorySlug(cat),
      categorie: cat,
      nbFunds: inCat.length,
      nbManagers: managers.size,
      aumTotal,
      marketShare: totalMarketAUM > 0 ? aumTotal / totalMarketAUM : 0,
      perfMedianYTD: percentile(ytdPerfs, 0.5),
      perfMedian1Y: percentile(y1Perfs, 0.5),
      perfMin1Y: y1Perfs.length > 0 ? Math.min(...y1Perfs) : null,
      perfMax1Y: y1Perfs.length > 0 ? Math.max(...y1Perfs) : null,
      spread1Y:
        y1Perfs.length > 0 ? Math.max(...y1Perfs) - Math.min(...y1Perfs) : null,
    };
  }).filter((r) => r.nbFunds > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <CategoryIndexView
        rows={rows}
        refQuarter={refQuarter}
        marketTotalAUM={totalMarketAUM}
        totalFunds={funds.length}
      />
    </div>
  );
}
