import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ActionsBRVMView from "@/components/ActionsBRVMView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadAllActions,
  getActionsMarketStats,
  getTopGainers,
  getTopLosers,
  loadMultipleIndicesHistory,
  getIndexStats,
  BRVM_INDEX_CODES,
  BRVM_INDEX_NAMES,
  buildRiskReturnDataset,
} from "@/lib/dataLoader";

// Le nudge JIT lit la session Supabase -> page necessairement dynamique.
// Les CSV sont memoizes au niveau module, donc le cout supplementaire est minime.

const indexColors: Record<string, string> = {
  BRVMC: "#185FA5",
  BRVM30: "#0F6E56",
  BRVMPA: "#7F77DD",
  BRVMPR: "#D85A30",
  "BRVM-CB": "#534AB7",
  "BRVM-CD": "#9333ea",
  "BRVM-EN": "#854F0B",
  "BRVM-IN": "#993C1D",
  "BRVM-SF": "#1D9E75",
  "BRVM-SP": "#0891b2",
  "BRVM-TEL": "#db2777",
};

export default async function Page() {
  const actions = loadAllActions();
  const marketStats = getActionsMarketStats(actions);
  const topGainers = getTopGainers(actions, 5);
  const topLosers = getTopLosers(actions, 5);

  const allIndicesHistory = loadMultipleIndicesHistory(BRVM_INDEX_CODES);
  const indicesSeries = BRVM_INDEX_CODES.filter(
    (code) => allIndicesHistory[code]?.length > 0
  ).map((code) => ({
    code,
    name: BRVM_INDEX_NAMES[code] || code,
    data: allIndicesHistory[code],
    color: indexColors[code] || "#6b7280",
  }));

  const compositeStat = getIndexStats("BRVMC");
  // === Phase 2 : Scatter Rendement vs Volatilite ===
  const riskReturn = buildRiskReturnDataset();
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4">
        <ProfileNudge field="interests" revalidate="/marches/actions" />
      </div>
      <ActionsBRVMView
        actions={actions}
        marketStats={marketStats}
        topGainers={topGainers}
        topLosers={topLosers}
        indicesSeries={indicesSeries}
        compositeStat={compositeStat}
        riskReturn={riskReturn}
      />
    </div>
  );
}