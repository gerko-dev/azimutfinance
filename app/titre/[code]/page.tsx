import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import StockDetailView from "@/components/StockDetailView";
import { getBrvmQuote, getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import {
  getStockDetails,
  loadPriceHistoryWithVolume,
  loadOhlcHistory,
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
import { loadDbNewsByTicker } from "@/lib/newsFromDb";
import { fetchUserRole } from "@/lib/auth/userRole";

// Page rendue dynamiquement a chaque requete pour beneficier du cours live BRVM.
// Le cache module-level dans liveQuotes.ts limite la frequence des fetchs reels.
export const dynamic = "force-dynamic";

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

  // Cours en direct depuis BRVM (cache 5 min, mise a jour BRVM toutes les 15 min).
  // Override price/change/changePercent de la fiche CSV par les valeurs live.
  const [liveQuote, brvmSnapshot, userRole] = await Promise.all([
    getBrvmQuote(codeUpper),
    getBrvmSnapshot(),
    fetchUserRole(),
  ]);
  if (liveQuote && Number.isFinite(liveQuote.currentPrice) && liveQuote.currentPrice > 0) {
    stock.price = liveQuote.currentPrice;
    stock.change = liveQuote.variationAmount;
    stock.changePercent = liveQuote.variationPct;
    if (Number.isFinite(liveQuote.volume) && liveQuote.volume > 0) {
      stock.volume = liveQuote.volume;
      stock.hasVolume = true;
    }
  }

  const priceHistoryFull = loadPriceHistoryWithVolume(codeUpper);
  const priceHistory = priceHistoryFull.map((p) => ({ date: p.date, value: p.value }));
  // OHLC pour le graphique avance KLineChart (chandeliers, indicateurs pro)
  const ohlcHistory = loadOhlcHistory(codeUpper).map((p) => ({
    timestamp: new Date(p.date + "T00:00:00Z").getTime(),
    open: p.open ?? p.value,
    high: p.high ?? p.value,
    low: p.low ?? p.value,
    close: p.value,
    volume: p.volume ?? 0,
  }));
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

  // Actualités : merge CSV (édité a la main) + DB (publiees via /admin/actualites)
  const csvNews = loadNewsByTicker(codeUpper);
  const dbNews = await loadDbNewsByTicker(codeUpper);
  const news = [...dbNews, ...csvNews].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

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
        ohlcHistory={ohlcHistory}
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
        livePrice={{
          fetchedAt: brvmSnapshot.fetchedAt,
          sessionLabel: brvmSnapshot.sessionLabel,
          isClosed: brvmSnapshot.isClosed,
          hasLive: !!liveQuote,
        }}
        userRole={userRole}
      />
    </div>
  );
}
