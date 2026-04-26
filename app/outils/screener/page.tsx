import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ScreenerView from "@/components/ScreenerView";
import {
  loadAllActions,
  buildRiskReturnDataset,
  loadMultipleIndicesHistory,
  loadAverageVolumes,
} from "@/lib/dataLoader";
import { computeAllQuadrants, computeReturnsMatrix } from "@/lib/stockStats";
import { loadFundScreenerSnapshotsMulti } from "@/lib/fundamentals";

export const dynamic = "force-static";

export default function Page() {
  const actions = loadAllActions();
  const riskReturn = buildRiskReturnDataset();
  const quadrants = computeAllQuadrants(riskReturn.points);
  const volMap = new Map(riskReturn.points.map((p) => [p.code, p.volatility]));
  const fundMultiMap = loadFundScreenerSnapshotsMulti();
  const avgVolume30 = loadAverageVolumes(30);

  // Variation 1 an pour chaque action (à partir de l'historique de prix).
  // Le cache de loadAllPriceHistory garantit qu'on parse le CSV une seule fois.
  const histories = loadMultipleIndicesHistory(actions.map((a) => a.code));
  const yearChangeMap = new Map<string, number | null>();
  for (const a of actions) {
    const m = computeReturnsMatrix(histories[a.code] ?? []);
    yearChangeMap.set(a.code, m["1A"]);
  }

  const stocks = actions.map((a) => {
    return {
      ...a,
      volatility: volMap.get(a.code) ?? null,
      quadrant: quadrants.get(a.code) ?? null,
      yearChange: yearChangeMap.get(a.code) ?? null,
      avgVolume: avgVolume30.get(a.code) ?? null,
      fundByWindow: fundMultiMap.get(a.code) ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <ScreenerView stocks={stocks} />
    </div>
  );
}
