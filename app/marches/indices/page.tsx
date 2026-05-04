import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import IndicesView from "@/components/IndicesView";
import {
  loadMultipleIndicesHistory,
  BRVM_INDEX_CODES,
  computeYtdPct,
} from "@/lib/dataLoader";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [snapshot, history] = await Promise.all([
    getBrvmIndicesSnapshot(),
    Promise.resolve(loadMultipleIndicesHistory(BRVM_INDEX_CODES)),
  ]);

  // Sparkline = 90 derniers points par indice
  const sparklines: Record<string, { date: string; value: number }[]> = {};
  for (const code of BRVM_INDEX_CODES) {
    sparklines[code] = (history[code] ?? []).slice(-90);
  }

  // YTD recalcule depuis le CSV historique : (valeur live - valeur 31/12 N-1) / valeur 31/12 N-1
  // La 5e colonne du tableau BRVM est parfois incoherente avec ce calcul standard.
  const ytdComputed: Record<string, number | null> = {};
  for (const idx of snapshot.indices) {
    ytdComputed[idx.code] = computeYtdPct(idx.code, idx.value);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <IndicesView
        indices={snapshot.indices}
        sparklines={sparklines}
        ytdComputed={ytdComputed}
        session={{
          fetchedAt: snapshot.fetchedAt,
          sessionLabel: snapshot.sessionLabel,
          isClosed: snapshot.isClosed,
        }}
      />
    </div>
  );
}
