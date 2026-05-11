import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ActionsBRVMView from "@/components/ActionsBRVMView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadAllActions,
  getActionsMarketStats,
  loadMultipleIndicesHistory,
  getIndexStats,
  BRVM_INDEX_CODES,
  BRVM_INDEX_NAMES,
  buildRiskReturnDataset,
  computeYtdPct,
  type ActionRow,
} from "@/lib/dataLoader";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { computeLatestRatios } from "@/lib/fundamentalsCalc";
import { fetchUserRole } from "@/lib/auth/userRole";

export const dynamic = "force-dynamic";

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

  const [liveSnapshot, indicesSnapshot, userRole] = await Promise.all([
    getBrvmSnapshot(),
    getBrvmIndicesSnapshot(),
    fetchUserRole(),
  ]);

  // === FUSION CSV + LIVE + FONDAMENTAUX ===
  // Override price/changePercent/volume par le live BRVM, et recalcule
  // capi/PER/yield depuis le calculateur (BPA, DPA, Nb_Titres calculés à la
  // volée depuis DB_Valeurs + DB_Titres + historique_sika) :
  //   - capi   = nbTitres × prix_live
  //   - PER    = prix_live / BPA(dernier exercice)
  //   - yield  = DPA(dernier exercice) / prix_live
  // Si pas de BPA/DPA disponible (ou BPA<=0 = pertes), PER/yield sont marques
  // absents. Si pas de ratios du tout, on retombe sur titres.csv scale par le
  // ratio de prix.
  const liveByCode = new Map(liveSnapshot.quotes.map((q) => [q.code, q]));
  const mergedActions: ActionRow[] = actions.map((a) => {
    const lv = liveByCode.get(a.code);
    const ratios = computeLatestRatios(a.code);

    const newPrice = lv && lv.currentPrice > 0 ? lv.currentPrice : a.price;
    const newChange =
      lv && Number.isFinite(lv.variationPct) ? lv.variationPct : a.changePercent;
    const newVolume =
      lv && Number.isFinite(lv.volume) && lv.volume > 0 ? lv.volume : a.volume;
    const priceChanged = a.price > 0 && newPrice !== a.price;

    // --- Capitalisation ---
    let capitalization = a.capitalization;
    if (ratios && ratios.nbTitres > 0 && newPrice > 0) {
      capitalization = ratios.nbTitres * newPrice;
    } else if (priceChanged && a.capitalization > 0) {
      capitalization = a.capitalization * (newPrice / a.price);
    }

    // --- PER : prix_live / BPA(dernier exercice) ---
    let per = a.per;
    let hasPer = a.hasPer;
    if (ratios) {
      const bpa = ratios.bpa ?? 0;
      if (bpa > 0 && newPrice > 0) {
        per = newPrice / bpa;
        hasPer = true;
      } else {
        // BPA <= 0 (pertes) ou non renseigne : PER non significatif
        per = 0;
        hasPer = false;
      }
    } else if (priceChanged && a.hasPer && a.per > 0) {
      per = a.per * (newPrice / a.price);
    }

    // --- Rendement du dividende : DPA(dernier exercice) / prix_live ---
    let yieldPct = a.yieldPct;
    let hasYield = a.hasYield;
    if (ratios) {
      if (ratios.dpa > 0 && newPrice > 0) {
        yieldPct = (ratios.dpa / newPrice) * 100;
        hasYield = yieldPct > 0 && yieldPct < 50;
      } else {
        // Pas de dividende sur le dernier exercice connu
        yieldPct = 0;
        hasYield = false;
      }
    } else if (priceChanged && a.hasYield && a.yieldPct > 0) {
      yieldPct = a.yieldPct * (a.price / newPrice);
    }

    return {
      ...a,
      price: newPrice,
      changePercent: newChange,
      volume: newVolume,
      capitalization,
      per,
      yieldPct,
      hasPer,
      hasYield,
    };
  });

  const marketStats = getActionsMarketStats(mergedActions);
  // Live count : nombre d'actions cotees vu sur la page BRVM aujourd'hui
  const liveListedCount = liveSnapshot.quotes.length;

  // === TOP/FLOP DEPUIS LE LIVE ===
  // Tri sur la variation % live, ties broken by volume desc pour eviter les
  // ex-aequo a 0% qui flotteraient en tete arbitrairement.
  const liveActionsOnly = mergedActions.filter((a) =>
    liveByCode.has(a.code),
  );
  const topGainers = [...liveActionsOnly]
    .filter((a) => a.changePercent > 0 && a.price > 0)
    .sort((a, b) =>
      b.changePercent !== a.changePercent
        ? b.changePercent - a.changePercent
        : b.volume - a.volume,
    )
    .slice(0, 5);
  const topLosers = [...liveActionsOnly]
    .filter((a) => a.changePercent < 0 && a.price > 0)
    .sort((a, b) =>
      a.changePercent !== b.changePercent
        ? a.changePercent - b.changePercent
        : b.volume - a.volume,
    )
    .slice(0, 5);

  // === HISTORIQUES INDICES (CSV) ===
  const allIndicesHistory = loadMultipleIndicesHistory(BRVM_INDEX_CODES);
  const indicesSeries = BRVM_INDEX_CODES.filter(
    (code) => allIndicesHistory[code]?.length > 0,
  ).map((code) => ({
    code,
    name: BRVM_INDEX_NAMES[code] || code,
    data: allIndicesHistory[code],
    color: indexColors[code] || "#6b7280",
  }));

  // === KPI BRVM COMPOSITE : prefere live, fallback CSV ===
  const liveComposite = indicesSnapshot.indices.find((i) => i.code === "BRVMC");
  const compositeStat = liveComposite
    ? {
        code: "BRVMC",
        name: "BRVM Composite",
        latestValue: liveComposite.value,
        latestDate: indicesSnapshot.fetchedAt.slice(0, 10),
        variationPct: liveComposite.variationPct,
        variationValue: liveComposite.value - liveComposite.previousValue,
      }
    : getIndexStats("BRVMC");

  const riskReturn = buildRiskReturnDataset();

  // YTD recalcule depuis l'historique CSV (cours live vs cours 31/12 N-1)
  const ytdComputed: Record<string, number | null> = {};
  for (const idx of indicesSnapshot.indices) {
    ytdComputed[idx.code] = computeYtdPct(idx.code, idx.value);
  }

  // YTD par action : meme logique, le helper computeYtdPct est generique
  const ytdByAction: Record<string, number | null> = {};
  for (const a of mergedActions) {
    ytdByAction[a.code] = computeYtdPct(a.code, a.price);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4">
        <ProfileNudge field="interests" revalidate="/marches/actions" />
      </div>
      <ActionsBRVMView
        actions={mergedActions}
        marketStats={marketStats}
        liveListedCount={liveListedCount}
        topGainers={topGainers}
        topLosers={topLosers}
        indicesSeries={indicesSeries}
        compositeStat={compositeStat}
        liveIndices={indicesSnapshot.indices}
        liveIndicesYtd={ytdComputed}
        ytdByAction={ytdByAction}
        liveSession={{
          fetchedAt: indicesSnapshot.fetchedAt,
          sessionLabel: indicesSnapshot.sessionLabel,
          isClosed: indicesSnapshot.isClosed,
        }}
        riskReturn={riskReturn}
        userRole={userRole}
      />
    </div>
  );
}
