import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import IndicesView from "@/components/IndicesView";
import {
  loadMultipleIndicesHistory,
  BRVM_INDEX_CODES,
  BRVM_INDEX_NAMES,
  computeYtdPct,
} from "@/lib/dataLoader";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Indices BRVM — AzimutFinance",
  path: "/marches/indices",
});

export const dynamic = "force-dynamic";

// Palette des indices (synchro avec /marches/actions pour coherence visuelle).
const INDEX_COLORS: Record<string, string> = {
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
  const [snapshot, history, userRole] = await Promise.all([
    getBrvmIndicesSnapshot(),
    Promise.resolve(loadMultipleIndicesHistory(BRVM_INDEX_CODES)),
    fetchUserRole(),
  ]);

  // Sparkline = 90 derniers points par indice
  const sparklines: Record<string, { date: string; value: number }[]> = {};
  for (const code of BRVM_INDEX_CODES) {
    sparklines[code] = (history[code] ?? []).slice(-90);
  }

  // Series complets pour le chart d'evolution (historique non tronque, le
  // composant filtre selon la periode demandee).
  const indicesSeries = BRVM_INDEX_CODES.filter(
    (code) => (history[code]?.length ?? 0) > 0,
  ).map((code) => ({
    code,
    name: BRVM_INDEX_NAMES[code] || code,
    data: history[code],
    color: INDEX_COLORS[code] || "#6b7280",
  }));

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
        indicesSeries={indicesSeries}
        ytdComputed={ytdComputed}
        userRole={userRole}
        session={{
          fetchedAt: snapshot.fetchedAt,
          sessionLabel: snapshot.sessionLabel,
          isClosed: snapshot.isClosed,
        }}
      />
    </div>
  );
}
