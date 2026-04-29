import ScreenerView from "@/components/ScreenerView";
import ProPageHeader from "@/components/pros/ProPageHeader";
import {
  loadAllActions,
  buildRiskReturnDataset,
  loadMultipleIndicesHistory,
  loadAverageVolumes,
} from "@/lib/dataLoader";
import { computeAllQuadrants, computeReturnsMatrix } from "@/lib/stockStats";
import { loadFundScreenerSnapshotsMulti } from "@/lib/fundamentals";

export const metadata = {
  title: "Screener actions — Pro Terminal",
};

export default function ScreenerPage() {
  const actions = loadAllActions();
  const riskReturn = buildRiskReturnDataset();
  const quadrants = computeAllQuadrants(riskReturn.points);
  const volMap = new Map(riskReturn.points.map((p) => [p.code, p.volatility]));
  const fundMultiMap = loadFundScreenerSnapshotsMulti();
  const avgVolume30 = loadAverageVolumes(30);

  const histories = loadMultipleIndicesHistory(actions.map((a) => a.code));
  const yearChangeMap = new Map<string, number | null>();
  for (const a of actions) {
    const m = computeReturnsMatrix(histories[a.code] ?? []);
    yearChangeMap.set(a.code, m["1A"]);
  }

  const stocks = actions.map((a) => ({
    ...a,
    volatility: volMap.get(a.code) ?? null,
    quadrant: quadrants.get(a.code) ?? null,
    yearChange: yearChangeMap.get(a.code) ?? null,
    avgVolume: avgVolume30.get(a.code) ?? null,
    fundByWindow: fundMultiMap.get(a.code) ?? null,
  }));

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Screener d'actions BRVM"
        subtitle={`Filtres multi-critères sur les ${stocks.length} titres cotés · Quadrants risque/rendement, fondamentaux, momentum`}
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Screener actions" },
        ]}
        badge="Premium"
      />
      <div className="pro-tool">
        <ScreenerView stocks={stocks} />
      </div>
    </div>
  );
}
