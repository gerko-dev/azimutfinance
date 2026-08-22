import { notFound } from "next/navigation";
import StockProView from "@/components/pros/StockProView";
import { getBrvmQuote, getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import {
  getStockDetails,
  getLatestSikaQuote,
  loadPriceHistoryWithVolume,
  loadOhlcHistory,
  loadIndexHistory,
  getSectorIndexCode,
  BRVM_INDEX_NAMES,
  loadAllActionsEnriched,
  loadMultipleIndicesHistory,
  loadListedBonds,
  buildRiskReturnDataset,
} from "@/lib/dataLoader";
import {
  computeReturnsMatrix,
  computeRiskMetrics,
  computeAdvancedStats,
  computeQuadrant,
} from "@/lib/stockStats";
import {
  getFundTitre,
  getStatement,
  getPeriodicStatements,
} from "@/lib/fundamentals";
import { computeRatiosByTicker, computeLiveRatios } from "@/lib/fundamentalsCalc";
import { computePriceTarget } from "@/lib/priceTarget";
import { loadDbNewsByTicker } from "@/lib/newsFromDb";

// Pro Terminal : meme pipeline que /titre/[code] mais layout plus dense et
// stats supplementaires. Page dynamique a cause du cours live BRVM (le cache
// memoire dans liveQuotes.ts limite la frequence des fetchs reels).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const stock = getStockDetails(code.toUpperCase());
  if (!stock) return { title: "Titre introuvable — Pro Terminal" };
  return {
    title: `${stock.code} ${stock.name} — Pro Terminal`,
  };
}

export default async function StockProPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const codeUpper = code.toUpperCase();

  const stock = getStockDetails(codeUpper);
  if (!stock) notFound();

  // ─── Cours live BRVM + fallback historique Sika ─────────────────────────
  const [liveQuote, brvmSnapshot] = await Promise.all([
    getBrvmQuote(codeUpper),
    getBrvmSnapshot(),
  ]);

  if (liveQuote && Number.isFinite(liveQuote.currentPrice) && liveQuote.currentPrice > 0) {
    stock.price = liveQuote.currentPrice;
    stock.change = liveQuote.variationAmount;
    stock.changePercent = liveQuote.variationPct;
    if (Number.isFinite(liveQuote.volume) && liveQuote.volume > 0) {
      stock.volume = liveQuote.volume;
      stock.hasVolume = true;
    }
  } else {
    const sika = getLatestSikaQuote(codeUpper);
    if (sika) {
      stock.price = sika.price;
      stock.change = sika.change;
      stock.changePercent = sika.changePercent;
      if (sika.volume > 0) {
        stock.volume = sika.volume;
        stock.hasVolume = true;
      }
    }
  }

  // PER / yield live sur le cours courant.
  const liveRatios =
    stock.price > 0 ? computeLiveRatios(codeUpper, stock.price) : null;
  if (liveRatios) {
    if (liveRatios.per !== null) {
      stock.per = liveRatios.per;
      stock.hasPer = true;
    }
    if (liveRatios.dividendYield !== null) {
      stock.yield = liveRatios.dividendYield * 100;
      stock.hasYield = true;
    }
  }

  // ─── Historiques de prix ───────────────────────────────────────────────
  const priceHistoryFull = loadPriceHistoryWithVolume(codeUpper);
  const priceHistory = priceHistoryFull.map((p) => ({ date: p.date, value: p.value }));
  const ohlcHistory = loadOhlcHistory(codeUpper).map((p) => ({
    timestamp: new Date(p.date + "T00:00:00Z").getTime(),
    open: p.open ?? p.value,
    high: p.high ?? p.value,
    low: p.low ?? p.value,
    close: p.value,
    volume: p.volume ?? 0,
  }));
  const brvmcHistory = loadIndexHistory("BRVMC");

  // ─── Stats ────────────────────────────────────────────────────────────
  const returnsMatrix = computeReturnsMatrix(priceHistory);
  const riskMetrics = computeRiskMetrics(priceHistory, brvmcHistory);
  const advancedStats = computeAdvancedStats(priceHistory, brvmcHistory);

  // Recalcule 52w / 1Y change / vol depuis l'historique pour coherence.
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
    }
  }
  if (riskMetrics.volatility1A !== null && Number.isFinite(riskMetrics.volatility1A)) {
    stock.volatility = riskMetrics.volatility1A * 100;
  }

  // ─── Indice sectoriel ─────────────────────────────────────────────────
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

  // ─── Pairs : top 6 par capi du meme secteur ───────────────────────────
  const allActions = await loadAllActionsEnriched();
  const peers = allActions
    .filter(
      (a) => a.sector === stock.sector && a.code !== codeUpper && a.price > 0,
    )
    .sort((a, b) => b.capitalization - a.capitalization)
    .slice(0, 6);

  // Sparklines pairs (30 derniers points)
  const peerHistoriesAll = loadMultipleIndicesHistory(peers.map((p) => p.code));
  const peerSparklines: Record<string, { date: string; value: number }[]> = {};
  for (const p of peers) {
    peerSparklines[p.code] = (peerHistoriesAll[p.code] ?? []).slice(-30);
  }

  // ─── Obligations de l'emetteur ────────────────────────────────────────
  // Matching defensif : on compare en normalise (lowercase, NFD) pour
  // tolerer les variations de saisie ("SONATEL SA" vs "Sonatel").
  const stockNameKey = normalizeIssuerKey(stock.name);
  const issuerBonds = loadListedBonds().filter((b) => {
    const issuerKey = normalizeIssuerKey(b.issuer);
    return issuerKey && (issuerKey.includes(stockNameKey) || stockNameKey.includes(issuerKey));
  });

  // ─── Fondamentaux ─────────────────────────────────────────────────────
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
    periodic: fundTitre
      ? getPeriodicStatements(codeUpper)
      : { exercices: [], metrics: [] },
  };

  // ─── Classification quadrant + anticipation de cours ──────────────────
  // Sur le Pro Terminal, l'anticipation est toujours calculee (acces complet).
  const riskReturn = buildRiskReturnDataset();
  const quadrant = computeQuadrant(codeUpper, riskReturn.points);
  const priceTarget =
    stock.price > 0
      ? computePriceTarget(codeUpper, stock.price, priceHistory, allActions)
      : null;

  // ─── Actus ────────────────────────────────────────────────────────────
  const news = await loadDbNewsByTicker(codeUpper);

  return (
    <StockProView
      stock={stock}
      priceHistory={priceHistory}
      priceHistoryWithVolume={priceHistoryFull}
      ohlcHistory={ohlcHistory}
      brvmcHistory={brvmcHistory}
      sectorIndex={sectorIndex}
      returnsMatrix={returnsMatrix}
      riskMetrics={riskMetrics}
      advancedStats={advancedStats}
      quadrant={quadrant}
      priceTarget={priceTarget}
      peers={peers}
      peerSparklines={peerSparklines}
      issuerBonds={issuerBonds}
      fundTitre={fundTitre}
      ratios={ratios}
      statements={statements}
      news={news}
      livePrice={{
        fetchedAt: brvmSnapshot.fetchedAt,
        sessionLabel: brvmSnapshot.sessionLabel,
        isClosed: brvmSnapshot.isClosed,
        hasLive: !!liveQuote,
      }}
    />
  );
}

/**
 * Normalise un nom d'emetteur pour le matching : lowercase, suppression des
 * diacritiques, des suffixes societaires courants (SA, S.A., SAS...) et des
 * espaces multiples. Tolere "SONATEL SA" <-> "Sonatel" lors de la jointure
 * action <-> obligations cotees.
 */
function normalizeIssuerKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(sa|sas|s\.a\.|sarl|s\.a\.r\.l\.|gie|holding)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
