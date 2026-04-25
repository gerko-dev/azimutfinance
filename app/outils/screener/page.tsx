import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ScreenerView from "@/components/ScreenerView";
import { loadAllActions, buildRiskReturnDataset } from "@/lib/dataLoader";
import { computeAllQuadrants } from "@/lib/stockStats";

export const dynamic = "force-static";

export default function Page() {
  const actions = loadAllActions();
  const riskReturn = buildRiskReturnDataset();
  const quadrants = computeAllQuadrants(riskReturn.points);
  const volMap = new Map(riskReturn.points.map((p) => [p.code, p.volatility]));

  const stocks = actions.map((a) => ({
    ...a,
    volatility: volMap.get(a.code) ?? null,
    quadrant: quadrants.get(a.code) ?? null,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <ScreenerView stocks={stocks} />
    </div>
  );
}
