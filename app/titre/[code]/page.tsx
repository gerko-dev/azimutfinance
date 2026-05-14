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
  getStatement,
} from "@/lib/fundamentals";
import { computeRatiosByTicker } from "@/lib/fundamentalsCalc";
import { loadDbNewsByTicker } from "@/lib/newsFromDb";
import { fetchUserRole } from "@/lib/auth/userRole";

// Page rendue dynamiquement a chaque requete pour beneficier du cours live BRVM.
// Le cache module-level dans liveQuotes.ts limite la frequence des fetchs reels.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const stock = getStockDetails(code.toUpperCase());
  if (!stock) return { title: "Titre introuvable — AzimutFinance" };
  const secteur = stock.sector ? ` — ${stock.sector}` : "";
  return {
    title: `${stock.name} (${stock.code}) — Cours, dividende et ratios BRVM`,
    description: `Fiche action ${stock.name} (${stock.code})${secteur} cotée à la BRVM : cours en direct, performances multi-horizons, ratios fondamentaux, profil risque/rendement et actualités.`,
  };
}

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

  // Coherence des sources : recalcule 52s / variation 1 an / volatilite
  // depuis l'historique Sika (loadAllPriceHistory) pour eviter les
  // divergences avec titres.csv, qui est un snapshot pas toujours synchro
  // avec le scrape Sika quotidien.
  if (priceHistory.length > 0) {
    const lastPoint = priceHistory[priceHistory.length - 1];
    const cutoff = new Date(lastPoint.date + "T00:00:00Z");
    cutoff.setUTCDate(cutoff.getUTCDate() - 365);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let high = -Infinity;
    let low = Infinity;
    let oneYearAgo: { date: string; value: number } | null = null;
    for (const p of priceHistory) {
      if (p.date >= cutoffStr) {
        if (p.value > high) high = p.value;
        if (p.value < low) low = p.value;
      }
      if (p.date <= cutoffStr) oneYearAgo = p;
    }
    if (high > 0) stock.high52w = high;
    if (low < Infinity) stock.low52w = low;
    if (oneYearAgo && oneYearAgo.value > 0 && lastPoint.value > 0) {
      stock.yearChange = (lastPoint.value / oneYearAgo.value - 1) * 100;
      stock.hasYearChange = true;
    } else {
      stock.hasYearChange = false;
    }
  }
  // Volatilite alignee sur le bloc Risque (synthese) — meme calcul Sika.
  if (
    riskMetrics.volatility1A !== null &&
    Number.isFinite(riskMetrics.volatility1A)
  ) {
    stock.volatility = riskMetrics.volatility1A * 100;
  }

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

  // Actualités : publiées via /admin/actualites (base de données).
  // Déjà triées par date desc par loadDbNewsByTicker.
  const news = await loadDbNewsByTicker(codeUpper);

  // Fondamentaux
  const fundTitre = getFundTitre(codeUpper);
  const ratios = computeRatiosByTicker(codeUpper);
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
