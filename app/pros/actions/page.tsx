import ActionsProView from "@/components/pros/ActionsProView";
import {
  loadAllActionsEnriched,
  getActionsMarketStats,
  getIndexStats,
  buildRiskReturnDataset,
  computeYtdPct,
  type ActionRow,
} from "@/lib/dataLoader";
import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";

export const metadata = {
  title: "Actions BRVM — Pro Terminal",
};

// Page dynamique : memes sources live que /marches/actions (cours BRVM differes,
// cache memoire ~5 min cote loaders).
export const dynamic = "force-dynamic";

export default async function ActionsProPage() {
  const [actions, liveSnapshot, indicesSnapshot] = await Promise.all([
    loadAllActionsEnriched(),
    getBrvmSnapshot(),
    getBrvmIndicesSnapshot(),
  ]);

  const liveByCode = new Map(liveSnapshot.quotes.map((q) => [q.code, q]));
  const marketStats = getActionsMarketStats(actions);
  const liveListedCount = liveSnapshot.quotes.length;

  // Top/flop + plus actifs depuis le live (tie-break par volume).
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
  const mostActive: ActionRow[] = [...liveActionsOnly]
    .filter((a) => a.volume > 0 && a.price > 0)
    .sort((a, b) => b.price * b.volume - a.price * a.volume)
    .slice(0, 5);

  // Largeur de marche (outil pro) : hausses / baisses / stables sur le live.
  const breadth = liveActionsOnly.reduce(
    (acc, a) => {
      if (a.price <= 0) return acc;
      if (a.changePercent > 0) acc.up += 1;
      else if (a.changePercent < 0) acc.down += 1;
      else acc.flat += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0 },
  );

  // KPI BRVM Composite : prefere live, fallback CSV.
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

  // YTD recalcule depuis l'historique CSV (cours live vs cours 31/12 N-1).
  const ytdComputed: Record<string, number | null> = {};
  for (const idx of indicesSnapshot.indices) {
    ytdComputed[idx.code] = computeYtdPct(idx.code, idx.value);
  }
  const ytdByAction: Record<string, number | null> = {};
  for (const a of actions) {
    ytdByAction[a.code] = computeYtdPct(a.code, a.price);
  }

  return (
    <ActionsProView
      actions={actions}
      marketStats={marketStats}
      liveListedCount={liveListedCount}
      topGainers={topGainers}
      topLosers={topLosers}
      mostActive={mostActive}
      breadth={breadth}
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
    />
  );
}
