import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import IndexDetailView from "@/components/IndexDetailView";
import {
  loadIndexHistory,
  loadOhlcHistory,
  loadSectorComponents,
  computeYtdPct,
  BRVM_INDEX_NAMES,
  BRVM_SECTORIAL_INDICES,
} from "@/lib/dataLoader";
import {
  getBrvmIndicesSnapshot,
  type BrvmLiveIndex,
} from "@/lib/brvm/liveIndices";
import { fetchUserRole } from "@/lib/auth/userRole";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).toUpperCase();

  const [snapshot, userRole] = await Promise.all([
    getBrvmIndicesSnapshot(),
    fetchUserRole(),
  ]);
  const live: BrvmLiveIndex | null =
    snapshot.indices.find((i) => i.code === code) ?? null;

  // L'indice doit exister soit en live, soit dans nos referentiels
  const referenceName = BRVM_INDEX_NAMES[code];
  if (!live && !referenceName) notFound();

  const history = loadIndexHistory(code);
  // OHLC pour le graphique avance KLineChart (chandeliers, indicateurs pro...)
  const ohlcHistory = loadOhlcHistory(code).map((p) => ({
    timestamp: new Date(p.date + "T00:00:00Z").getTime(),
    open: p.open ?? p.value,
    high: p.high ?? p.value,
    low: p.low ?? p.value,
    close: p.value,
    volume: p.volume ?? 0,
  }));
  // Valeur de reference pour le YTD : prefere la live, fallback derniere CSV
  const referenceValue =
    live?.value ?? (history.length > 0 ? history[history.length - 1].value : 0);
  const ytdComputed = referenceValue > 0
    ? computeYtdPct(code, referenceValue)
    : null;

  // Plus haut / plus bas 52 semaines depuis CSV
  const oneYearAgoIso = (() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const last52w = history.filter((p) => p.date >= oneYearAgoIso);
  const high52w = last52w.length > 0 ? Math.max(...last52w.map((p) => p.value)) : null;
  const low52w = last52w.length > 0 ? Math.min(...last52w.map((p) => p.value)) : null;

  // Composants sectoriels : titres du secteur avec contribution YTD
  // (uniquement pour les indices sectoriels — composition principale non
  // disponible publiquement, on ne veut pas afficher d'approximation faussee)
  const sectorComponents = BRVM_SECTORIAL_INDICES.includes(code)
    ? loadSectorComponents(code)
    : [];

  // Volatilite annualisee 252j sur la fenetre 52 semaines
  const volatility52w = (() => {
    if (last52w.length < 30) return null;
    const returns: number[] = [];
    for (let i = 1; i < last52w.length; i++) {
      const prev = last52w[i - 1].value;
      const cur = last52w[i].value;
      if (prev > 0 && cur > 0) returns.push(Math.log(cur / prev));
    }
    if (returns.length === 0) return null;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <IndexDetailView
        code={code}
        name={live?.name ?? referenceName ?? code}
        category={live?.category ?? null}
        live={live}
        history={history}
        ohlcHistory={ohlcHistory}
        ytdComputed={ytdComputed}
        high52w={high52w}
        low52w={low52w}
        volatility52w={volatility52w}
        sectorComponents={sectorComponents}
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
