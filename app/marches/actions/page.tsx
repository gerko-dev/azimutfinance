import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ActionsBRVMView from "@/components/ActionsBRVMView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadAllActionsEnriched,
  getActionsMarketStats,
  getIndexStats,
  buildRiskReturnDataset,
  computeYtdPct,
} from "@/lib/dataLoader";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { fetchUserRole } from "@/lib/auth/userRole";

export const dynamic = "force-dynamic";

export default async function Page() {
  // loadAllActionsEnriched : identité titres.csv + cours/volume/var live BRVM
  // (repli historique_sika), capi/PER/yield recalculés sur le cours courant.
  // titres.csv n'est plus utilisé pour price/volume/changePercent/per/yield.
  const [actions, liveSnapshot, indicesSnapshot, userRole] = await Promise.all([
    loadAllActionsEnriched(),
    getBrvmSnapshot(),
    getBrvmIndicesSnapshot(),
    fetchUserRole(),
  ]);

  const liveByCode = new Map(liveSnapshot.quotes.map((q) => [q.code, q]));

  const marketStats = getActionsMarketStats(actions);
  // Live count : nombre d'actions cotees vu sur la page BRVM aujourd'hui
  const liveListedCount = liveSnapshot.quotes.length;

  // === TOP/FLOP DEPUIS LE LIVE ===
  // Tri sur la variation % live, ties broken by volume desc pour eviter les
  // ex-aequo a 0% qui flotteraient en tete arbitrairement.
  const liveActionsOnly = actions.filter((a) => liveByCode.has(a.code));
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
  for (const a of actions) {
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
        actions={actions}
        marketStats={marketStats}
        liveListedCount={liveListedCount}
        topGainers={topGainers}
        topLosers={topLosers}
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
