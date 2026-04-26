import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import StockDetailView from "@/components/StockDetailView";
import {
  getStockDetails,
  loadPriceHistoryWithVolume,
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
  computeAdvancedStats,
} from "@/lib/stockStats";
import {
  getFundTitre,
  getRatiosByTicker,
  getStatement,
} from "@/lib/fundamentals";
import { loadNewsByTicker } from "@/lib/news";

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

  const priceHistoryFull = loadPriceHistoryWithVolume(codeUpper);
  const priceHistory = priceHistoryFull.map((p) => ({ date: p.date, value: p.value }));
  const brvmcHistory = loadIndexHistory("BRVMC");

  const returnsMatrix = computeReturnsMatrix(priceHistory);
  const riskMetrics = computeRiskMetrics(priceHistory, brvmcHistory);
  const advancedStats = computeAdvancedStats(priceHistory, brvmcHistory);

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

  // Actualités
  const news = loadNewsByTicker(codeUpper);

  // Fondamentaux
  const fundTitre = getFundTitre(codeUpper);
  const ratios = getRatiosByTicker(codeUpper);
  const exercices = ratios.map((r) => r.exercice);
  const statements = {
    exercices,
    bilanActif: fundTitre ? getStatement(codeUpper, "Bilan_Actif", exercices) : [],
    bilanPassif: fundTitre ? getStatement(codeUpper, "Bilan_Passif", exercices) : [],
    compteResultat: fundTitre
      ? getStatement(codeUpper, "Compte_Resultat", exercices)
      : [],
    flux: fundTitre ? getStatement(codeUpper, "Tableau_Flux", exercices) : [],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <StockDetailView
        stock={stock}
        priceHistory={priceHistory}
        priceHistoryWithVolume={priceHistoryFull}
        returnsMatrix={returnsMatrix}
        riskMetrics={riskMetrics}
        quadrant={quadrant}
        brvmcHistory={brvmcHistory}
        sectorIndex={sectorIndex}
        peers={peers}
        peerSparklines={peerSparklines}
        fundTitre={fundTitre}
        ratios={ratios}
        statements={statements}
        news={news}
        advancedStats={advancedStats}
      />
    </div>
  );
}
