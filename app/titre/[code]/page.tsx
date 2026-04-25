import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import StockDetailView from "@/components/StockDetailView";
import {
  getStockDetails,
  loadPriceHistory,
  loadIndexHistory,
  buildRiskReturnDataset,
  getSectorIndexCode,
  BRVM_INDEX_NAMES,
  loadAllActions,
  loadMultipleIndicesHistory,
} from "@/lib/dataLoader";
import {
  computeReturnsMatrix,
  computeRiskMetrics,
  computeQuadrant,
} from "@/lib/stockStats";

export default async function TitrePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const codeUpper = code.toUpperCase();

  const stock = getStockDetails(codeUpper);

  if (!stock) {
    notFound();
  }

  const priceHistory = loadPriceHistory(codeUpper);
  const brvmcHistory = loadIndexHistory("BRVMC");

  const returnsMatrix = computeReturnsMatrix(priceHistory);
  const riskMetrics = computeRiskMetrics(priceHistory, brvmcHistory);

  const riskReturn = buildRiskReturnDataset();
  const quadrant = computeQuadrant(codeUpper, riskReturn.points);

  // Indice sectoriel pour overlay benchmark
  const sectorIndexCode = getSectorIndexCode(stock.sector);
  const sectorIndexHistory = sectorIndexCode
    ? loadIndexHistory(sectorIndexCode)
    : [];
  const sectorIndex =
    sectorIndexCode && sectorIndexHistory.length > 0
      ? {
          code: sectorIndexCode,
          name: BRVM_INDEX_NAMES[sectorIndexCode] || sectorIndexCode,
          history: sectorIndexHistory,
        }
      : null;

  // Pairs du même secteur, top 6 par capitalisation (hors le titre courant)
  const peers = loadAllActions()
    .filter(
      (a) =>
        a.sector === stock.sector && a.code !== codeUpper && a.price > 0
    )
    .sort((a, b) => b.capitalization - a.capitalization)
    .slice(0, 6);

  // Sparklines : 30 derniers points de prix par pair
  const peerHistoriesAll = loadMultipleIndicesHistory(peers.map((p) => p.code));
  const peerSparklines: Record<string, { date: string; value: number }[]> = {};
  for (const p of peers) {
    peerSparklines[p.code] = (peerHistoriesAll[p.code] ?? []).slice(-30);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <StockDetailView
        stock={stock}
        priceHistory={priceHistory}
        returnsMatrix={returnsMatrix}
        riskMetrics={riskMetrics}
        quadrant={quadrant}
        brvmcHistory={brvmcHistory}
        sectorIndex={sectorIndex}
        peers={peers}
        peerSparklines={peerSparklines}
      />
    </div>
  );
}
