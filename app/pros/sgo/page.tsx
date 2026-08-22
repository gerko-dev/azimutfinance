import ProPageHeader from "@/components/pros/ProPageHeader";
import SGOProIndexView, { type SGOIndexRow } from "@/components/pros/SGOProIndexView";
import {
  loadFunds,
  listManagers,
  getReferenceQuarter,
  aumAt,
} from "@/lib/fcp";
import { managerQualityScore } from "@/lib/fcpMath";

export const metadata = {
  title: "Sociétés de gestion — Pro Terminal",
};

export default function SGOProIndexPage() {
  const allFunds = loadFunds();
  const refQuarter = getReferenceQuarter(allFunds);
  const marketTotalAUM = allFunds.reduce((s, f) => s + (aumAt(f, refQuarter) ?? 0), 0);

  const rows: SGOIndexRow[] = listManagers().map((m) => {
    const mFunds = allFunds.filter((f) => f.gestionnaire === m.name);
    const q = managerQualityScore(mFunds, allFunds);
    const nbCategories = new Set(mFunds.map((f) => f.categorie)).size;
    return {
      slug: m.slug,
      name: m.name,
      nbFunds: m.nbFunds,
      nbCategories,
      aumAtRef: m.aumAtRef,
      marketShare: marketTotalAUM > 0 ? m.aumAtRef / marketTotalAUM : 0,
      perfWeighted1Y: q.perfWeighted1Y,
      perfMedian1Y: q.perfMedian1Y,
      topQuartileShare: q.topQuartileShare,
    };
  });

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Sociétés de gestion"
        subtitle={`Classement des ${rows.length} SGO de la zone UEMOA par encours · encours total ${(marketTotalAUM / 1e12).toFixed(2).replace(".", ",")} T FCFA`}
        breadcrumb={[{ label: "Pro Terminal", href: "/pros" }, { label: "Sociétés de gestion" }]}
        badge="Premium"
      />
      <div className="pro-tool">
        <SGOProIndexView rows={rows} totalAUM={marketTotalAUM} />
      </div>
    </div>
  );
}
