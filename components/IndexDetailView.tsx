"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Customized,
} from "recharts";
import ChartDrawingToolbar from "./charting/ChartDrawingToolbar";
import ChartDrawingsLayer from "./charting/ChartDrawingsLayer";
import {
  loadDrawings,
  saveDrawings,
  newDrawingId,
  type Drawing,
  type DrawingTool,
  type DrawingColor,
} from "@/lib/charting/drawings";
import dynamic from "next/dynamic";
import LivePriceBadge from "./LivePriceBadge";
import type { OhlcPoint } from "./charting/KlineChart";

// KLineChart manipule directement le DOM (canvas) → SSR desactive.
const KlineChart = dynamic(() => import("./charting/KlineChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-md">
      Chargement du graphique avance…
    </div>
  ),
});
import type {
  BrvmLiveIndex,
  BrvmIndexCategory,
} from "@/lib/brvm/liveIndices";
import type { SectorComponent } from "@/lib/dataLoader";
import {
  sma,
  ema,
  bollinger,
  rsi,
  macd,
  rsiSignal,
  macdSignal,
  smaTrendSignal,
  type Signal,
} from "@/lib/technical";

const INDEX_DESCRIPTIONS: Record<string, string> = {
  BRVMC:
    "Indice phare de la BRVM, pondéré par la capitalisation flottante de toutes les sociétés cotées sur le marché. Référence pour mesurer la performance globale du marché actions UEMOA.",
  BRVM30:
    "Panier des 30 valeurs les plus actives de la BRVM, sélectionnées sur la liquidité, la capitalisation flottante et la fréquence des transactions. Équivalent du CAC 40 ou du Dow Jones Industrials pour l'UEMOA.",
  BRVMPA:
    "Compartiment principal de la BRVM. Regroupe les sociétés répondant aux critères standards de cotation continue : exigences de capital flottant, ancienneté, transparence financière.",
  BRVMPR:
    "Compartiment Prestige : exigences renforcées de transparence, gouvernance et liquidité. L'équivalent UEMOA du SBF 120 / Premium — réservé aux émetteurs les plus rigoureux.",
  "BRVM-CB":
    "Indice sectoriel : entreprises agroalimentaires et de biens de consommation courante. Inclut SOLIBRA, NESTLE COTE D'IVOIRE, SUCRIVOIRE, etc.",
  "BRVM-CD":
    "Indice sectoriel : distribution, automobile, biens de consommation discrétionnaire. Inclut CFAO MOTORS, BERNABE, TRACTAFRIC MOTORS, etc.",
  "BRVM-EN":
    "Indice sectoriel : exploration, raffinage, distribution d'énergie. Inclut TOTALENERGIES MARKETING (CI/SN), VIVO ENERGY, etc.",
  "BRVM-IN":
    "Indice sectoriel : industries manufacturières, BTP, équipements industriels. Inclut SICABLE, FILTISAC, SETAO, etc.",
  "BRVM-SF":
    "Indice sectoriel : banques, assurances, intermédiation financière. Le secteur le plus capitalisé de la BRVM (>40% de la cote). Inclut SOCIETE GENERALE, ECOBANK, BOA, etc.",
  "BRVM-SP":
    "Indice sectoriel : services publics — eau, électricité, transport public. Inclut CIE, SODE, SETAO, ONATEL, etc.",
  "BRVM-TEL":
    "Indice sectoriel : opérateurs télécoms et services de communication. Inclut SONATEL, ONATEL BURKINA FASO, ORANGE COTE D'IVOIRE.",
  "BRVMC-TR":
    "Variante du BRVM Composite intégrant le réinvestissement des dividendes (Total Return). Mesure la performance économique réelle pour un investisseur long terme.",
};

type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "MAX";

const periodToDays: Record<Period, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1A": 365,
  "3A": 365 * 3,
  "5A": 365 * 5,
  MAX: null,
};

// === INDICATEURS TECHNIQUES ===
type IndicatorKey =
  | "sma20"
  | "sma50"
  | "sma200"
  | "ema20"
  | "ema50"
  | "bollinger"
  | "rsi"
  | "macd";

type IndicatorMeta = {
  key: IndicatorKey;
  label: string;
  shortLabel: string;
  /** Indicateur en overlay sur le graphique principal, ou panneau separe ? */
  panel: "main" | "rsi" | "macd";
  color: string;
  description: string;
};

const INDICATORS: IndicatorMeta[] = [
  {
    key: "sma20",
    label: "Moyenne mobile simple 20j",
    shortLabel: "SMA 20",
    panel: "main",
    color: "#f59e0b",
    description: "Tendance court terme. Croisement du prix = signal de bascule rapide.",
  },
  {
    key: "sma50",
    label: "Moyenne mobile simple 50j",
    shortLabel: "SMA 50",
    panel: "main",
    color: "#3b82f6",
    description: "Tendance moyen terme. Référence pour les positions ~2 mois.",
  },
  {
    key: "sma200",
    label: "Moyenne mobile simple 200j",
    shortLabel: "SMA 200",
    panel: "main",
    color: "#8b5cf6",
    description: "Tendance long terme. Bull market si prix > SMA 200.",
  },
  {
    key: "ema20",
    label: "Moyenne mobile exponentielle 20j",
    shortLabel: "EMA 20",
    panel: "main",
    color: "#ec4899",
    description: "Plus réactive que la SMA, donne plus de poids aux dernières clôtures.",
  },
  {
    key: "ema50",
    label: "Moyenne mobile exponentielle 50j",
    shortLabel: "EMA 50",
    panel: "main",
    color: "#14b8a6",
    description: "Tendance moyen terme réactive. Croisement EMA 20 / EMA 50 = signal classique.",
  },
  {
    key: "bollinger",
    label: "Bandes de Bollinger (20, 2σ)",
    shortLabel: "Bollinger",
    panel: "main",
    color: "#64748b",
    description: "Volatilité : SMA 20 ± 2 écarts-types. Resserrement = compression, élargissement = expansion.",
  },
  {
    key: "rsi",
    label: "RSI (14)",
    shortLabel: "RSI",
    panel: "rsi",
    color: "#dc2626",
    description: "Force relative 0-100. >70 surachat (vente potentielle), <30 survente (achat potentiel).",
  },
  {
    key: "macd",
    label: "MACD (12, 26, 9)",
    shortLabel: "MACD",
    panel: "macd",
    color: "#0ea5e9",
    description: "Convergence/divergence des moyennes. Histogramme positif = momentum haussier, négatif = baissier.",
  },
];

const SIGNAL_META: Record<Signal, { label: string; color: string }> = {
  buy: { label: "Achat", color: "text-green-700 bg-green-50 border-green-200" },
  sell: { label: "Vente", color: "text-red-700 bg-red-50 border-red-200" },
  neutral: { label: "Neutre", color: "text-slate-600 bg-slate-50 border-slate-200" },
};

function formatNumber(v: number, digits = 2): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPctSigned(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2).replace(".", ",")}%`;
}

function pctClass(v: number): string {
  if (v > 0) return "text-green-700";
  if (v < 0) return "text-red-700";
  return "text-slate-500";
}

function categoryLabel(c: BrvmIndexCategory | null): string {
  if (c === "principal") return "Indice principal";
  if (c === "sectoriel") return "Indice sectoriel";
  if (c === "totalreturn") return "Total Return";
  return "Indice BRVM";
}

type Props = {
  code: string;
  name: string;
  category: BrvmIndexCategory | null;
  live: BrvmLiveIndex | null;
  history: { date: string; value: number }[];
  /** Historique OHLC complet, deja convertit en timestamps (pour KlineChart) */
  ohlcHistory: OhlcPoint[];
  ytdComputed: number | null;
  high52w: number | null;
  low52w: number | null;
  volatility52w: number | null;
  /** Vide pour les indices non sectoriels */
  sectorComponents: SectorComponent[];
  session: {
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
  };
};

export default function IndexDetailView({
  code,
  name,
  category,
  live,
  history,
  ohlcHistory,
  ytdComputed,
  high52w,
  low52w,
  volatility52w,
  sectorComponents,
  session,
}: Props) {
  const [period, setPeriod] = useState<Period>("1A");

  // === ANALYSE TECHNIQUE : toggles d'indicateurs ===
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    new Set(["sma50"]),
  );
  const toggleIndicator = (k: IndicatorKey) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // === OUTILS DE DESSIN ===
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [activeColor, setActiveColor] = useState<DrawingColor>("#dc2626");
  // Pour les outils 2-clics (trendline/rect/fibonacci) : on memorise le 1er point
  const [pendingPoint, setPendingPoint] = useState<{
    x: string;
    y: number;
  } | null>(null);

  // Charge les dessins persistes au montage
  useEffect(() => {
    setDrawings(loadDrawings(code));
  }, [code]);

  // Sauvegarde a chaque changement
  useEffect(() => {
    saveDrawings(code, drawings);
  }, [code, drawings]);

  // Reset le point en attente quand on change d'outil
  useEffect(() => {
    setPendingPoint(null);
  }, [activeTool]);

  const addDrawing = (d: Drawing) => {
    setDrawings((prev) => [...prev, d]);
  };
  const deleteDrawing = (id: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  };
  const undoLastDrawing = () => {
    setDrawings((prev) => prev.slice(0, -1));
    setPendingPoint(null);
  };
  const clearAllDrawings = () => {
    setDrawings([]);
    setPendingPoint(null);
  };

  // Capture du clic sur le chart : Recharts donne `activeLabel` (date) et
  // `activePayload[0].value` (valeur Y) du point le plus proche.
  type ChartClick = {
    activeLabel?: string;
    activePayload?: Array<{ value?: number }>;
  };
  const handleChartClick = (e: unknown) => {
    if (activeTool === "cursor") return;
    const evt = e as ChartClick | null;
    const x = evt?.activeLabel;
    const y = evt?.activePayload?.[0]?.value;
    if (!x || typeof y !== "number") return;

    if (activeTool === "horizontal") {
      addDrawing({ id: newDrawingId(), type: "horizontal", y, color: activeColor });
      return;
    }
    if (activeTool === "vertical") {
      addDrawing({ id: newDrawingId(), type: "vertical", x, color: activeColor });
      return;
    }
    if (activeTool === "text") {
      const label = window.prompt("Texte de l'annotation :");
      if (!label) return;
      addDrawing({
        id: newDrawingId(),
        type: "text",
        x,
        y,
        label,
        color: activeColor,
      });
      return;
    }
    // Outils 2-clics
    if (
      activeTool === "trendline" ||
      activeTool === "rect" ||
      activeTool === "fibonacci"
    ) {
      if (!pendingPoint) {
        setPendingPoint({ x, y });
        return;
      }
      addDrawing({
        id: newDrawingId(),
        type: activeTool,
        x1: pendingPoint.x,
        y1: pendingPoint.y,
        x2: x,
        y2: y,
        color: activeColor,
      });
      setPendingPoint(null);
    }
  };

  const pendingHint = useMemo(() => {
    if (activeTool === "cursor") return undefined;
    if (
      (activeTool === "trendline" ||
        activeTool === "rect" ||
        activeTool === "fibonacci") &&
      !pendingPoint
    ) {
      return "Cliquez le 1er point";
    }
    if (
      (activeTool === "trendline" ||
        activeTool === "rect" ||
        activeTool === "fibonacci") &&
      pendingPoint
    ) {
      return "Cliquez le 2ème point";
    }
    if (activeTool === "horizontal") return "Cliquez sur le prix cible";
    if (activeTool === "vertical") return "Cliquez sur la date cible";
    if (activeTool === "text") return "Cliquez où placer l'annotation";
    return undefined;
  }, [activeTool, pendingPoint]);

  // Les indices sectoriels affichent un graphique d'évolution simplifié,
  // sans outils d'analyse technique (peu pertinents pour des indices d'attribution).
  const isSectoral = category === "sectoriel";

  const value = live?.value ?? (history[history.length - 1]?.value ?? 0);
  const variationPct = live?.variationPct ?? 0;
  // YTD effectif : calcul CSV si dispo, sinon scraping BRVM, sinon 0
  const ytdEffective =
    ytdComputed !== null
      ? ytdComputed
      : (live?.ytdPct ?? 0);

  const description = INDEX_DESCRIPTIONS[code];

  const chartData = useMemo(() => {
    const days = periodToDays[period];
    if (days === null) return history;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return history.filter((p) => p.date >= cutoffIso);
  }, [history, period]);

  // === DONNEES ENRICHIES ===
  // On calcule les indicateurs sur l'HISTORIQUE COMPLET (pour eviter les
  // effets de bord en debut de fenetre — une SMA200 sur 1M serait vide),
  // puis on slice apres pour matcher chartData.
  const enrichedFull = useMemo(() => {
    const closes = history.map((p) => p.value);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const bb = bollinger(closes, 20, 2);
    const rsi14 = rsi(closes, 14);
    const macdRes = macd(closes, 12, 26, 9);
    return history.map((p, i) => ({
      date: p.date,
      value: p.value,
      sma20: sma20[i],
      sma50: sma50[i],
      sma200: sma200[i],
      ema20: ema20[i],
      ema50: ema50[i],
      bbUpper: bb.upper[i],
      bbLower: bb.lower[i],
      bbMid: bb.mid[i],
      rsi: rsi14[i],
      macd: macdRes.macd[i],
      macdSignal: macdRes.signal[i],
      macdHist: macdRes.histogram[i],
    }));
  }, [history]);

  const enrichedChart = useMemo(() => {
    const days = periodToDays[period];
    if (days === null) return enrichedFull;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return enrichedFull.filter((p) => p.date >= cutoffIso);
  }, [enrichedFull, period]);

  // === SIGNAUX SYNTHESE (panneau verdict) ===
  const signals = useMemo(() => {
    const last = enrichedFull[enrichedFull.length - 1];
    const prev = enrichedFull[enrichedFull.length - 2];
    if (!last) {
      return {
        sma50: "neutral" as Signal,
        sma200: "neutral" as Signal,
        rsi: "neutral" as Signal,
        macd: "neutral" as Signal,
      };
    }
    return {
      sma50: smaTrendSignal(last.value, last.sma50),
      sma200: smaTrendSignal(last.value, last.sma200),
      rsi: rsiSignal(last.rsi),
      macd: macdSignal(last.macdHist, prev?.macdHist ?? null),
    };
  }, [enrichedFull]);

  // Performance sur la periode selectionnee
  const periodPerf = useMemo(() => {
    if (chartData.length < 2) return null;
    const start = chartData[0].value;
    const end = chartData[chartData.length - 1].value;
    if (start <= 0) return null;
    return ((end - start) / start) * 100;
  }, [chartData]);

  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link href="/marches/indices" className="hover:text-white transition">
              Indices
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">{name}</span>
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-semibold text-white">{name}</h1>
                <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-300 font-mono border border-slate-700">
                  {code}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                    category === "principal"
                      ? "bg-blue-900/60 text-blue-200 border border-blue-800"
                      : category === "sectoriel"
                        ? "bg-emerald-900/60 text-emerald-200 border border-emerald-800"
                        : "bg-purple-900/60 text-purple-200 border border-purple-800"
                  }`}
                >
                  {categoryLabel(category)}
                </span>
              </div>
            </div>
            <LivePriceBadge
              sessionLabel={session.sessionLabel}
              isClosed={session.isClosed}
              variant="dark"
            />
          </div>

          {/* Prix + variation */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mt-4 mb-2">
            <div>
              <span className="text-3xl md:text-4xl font-semibold tabular-nums text-white">
                {formatNumber(value)}
              </span>
            </div>
            <div className={`font-medium ${pctClass(variationPct)}`}>
              <span className="text-base md:text-lg">
                {formatPctSigned(variationPct)}
              </span>
              <span className="text-xs text-slate-400 ml-2">var. jour</span>
            </div>
            <div className={`font-medium ${pctClass(ytdEffective)}`}>
              <span className="text-base md:text-lg">
                {formatPctSigned(ytdEffective)}
              </span>
              <span className="text-xs text-slate-400 ml-2">YTD</span>
            </div>
          </div>

          {/* KPIs : 52w high/low + volatilite */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <KpiCard label="Plus haut 52 sem." value={high52w !== null ? formatNumber(high52w) : "—"} />
            <KpiCard label="Plus bas 52 sem." value={low52w !== null ? formatNumber(low52w) : "—"} />
            <KpiCard
              label="Volatilité annualisée"
              value={volatility52w !== null ? `${volatility52w.toFixed(1).replace(".", ",")}%` : "—"}
              hint="Écart-type log returns × √252"
            />
            <KpiCard
              label="Points historiques"
              value={history.length > 0 ? history.length.toLocaleString("fr-FR") : "—"}
              hint={
                history.length > 0
                  ? `du ${history[0].date} au ${history[history.length - 1].date}`
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* GRAPHIQUE HISTORIQUE (Recharts simple, pour signaux techniques calcules) */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
            <div>
              <h2 className="text-lg md:text-xl font-semibold">📈 Évolution</h2>
              {periodPerf !== null && (
                <div className="text-xs text-slate-500 mt-1">
                  Performance sur la période :{" "}
                  <span className={`font-medium ${pctClass(periodPerf)}`}>
                    {formatPctSigned(periodPerf)}
                  </span>
                </div>
              )}
            </div>
            <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
              {(["1M", "3M", "6M", "1A", "3A", "5A", "MAX"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded transition ${
                    period === p
                      ? "bg-white shadow-sm font-medium text-blue-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Outils de dessin + indicateurs techniques (cachés sur les indices sectoriels) */}
          {!isSectoral && (
            <>
              <ChartDrawingToolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                activeColor={activeColor}
                setActiveColor={setActiveColor}
                onUndo={undoLastDrawing}
                onClearAll={clearAllDrawings}
                drawingsCount={drawings.length}
                pendingHint={pendingHint}
              />

              <div className="mb-4 flex flex-wrap gap-1.5">
                {INDICATORS.map((ind) => {
                  const isActive = activeIndicators.has(ind.key);
                  return (
                    <button
                      key={ind.key}
                      type="button"
                      onClick={() => toggleIndicator(ind.key)}
                      title={ind.description}
                      className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
                        isActive
                          ? "border-slate-300 shadow-sm"
                          : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: ind.color + "12",
                              color: ind.color,
                              borderColor: ind.color + "40",
                            }
                          : {}
                      }
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: isActive ? ind.color : "#cbd5e1" }}
                      />
                      {ind.shortLabel}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Graphique principal : prix + overlays SMA/EMA/Bollinger + dessins */}
          <div
            className={`h-72 md:h-96 ${
              activeTool !== "cursor" ? "cursor-crosshair" : ""
            }`}
          >
            {enrichedChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={enrichedChart} onClick={handleChartClick}>
                  <defs>
                    <linearGradient id="colorIdx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#185FA5" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#185FA5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    minTickGap={50}
                    tickFormatter={(d) =>
                      new Date(d as string).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        timeZone: "UTC",
                      })
                    }
                  />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                    labelFormatter={(d) =>
                      new Date(d as string).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                    }
                    formatter={(v, k) => {
                      const num = Number(v);
                      if (!Number.isFinite(num)) return ["—", k as string];
                      const ind = INDICATORS.find((i) => i.key === k);
                      const label = ind ? ind.shortLabel : k === "value" ? name : (k as string);
                      return [formatNumber(num), label];
                    }}
                  />
                  {/* Bollinger : zone d'incertitude grise */}
                  {!isSectoral && activeIndicators.has("bollinger") && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="bbUpper"
                        stroke="#94a3b8"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        fill="none"
                        connectNulls
                        name="bollinger"
                        legendType="none"
                      />
                      <Area
                        type="monotone"
                        dataKey="bbLower"
                        stroke="#94a3b8"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        fill="none"
                        connectNulls
                        legendType="none"
                      />
                    </>
                  )}
                  {/* Prix (toujours affiche) */}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#185FA5"
                    strokeWidth={2}
                    fill="url(#colorIdx)"
                  />
                  {/* Overlays SMA/EMA (cachés sur les indices sectoriels) */}
                  {!isSectoral &&
                    INDICATORS.filter(
                      (ind) => ind.panel === "main" && ind.key !== "bollinger",
                    ).map((ind) =>
                      activeIndicators.has(ind.key) ? (
                        <Line
                          key={ind.key}
                          type="monotone"
                          dataKey={ind.key}
                          stroke={ind.color}
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                          name={ind.key}
                        />
                      ) : null,
                    )}
                  {/* Layer SVG des dessins manuels (toujours rendu en dernier
                      pour etre au-dessus des autres elements) */}
                  {!isSectoral && (
                    <Customized
                      component={
                        <ChartDrawingsLayer
                          drawings={drawings}
                          onDeleteDrawing={deleteDrawing}
                        />
                      }
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Pas d&apos;historique disponible pour cet indice.
              </div>
            )}
          </div>

          {/* Sous-graphe RSI */}
          {!isSectoral && activeIndicators.has("rsi") && enrichedChart.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-2">
                <span>RSI 14</span>
                <span className="text-[10px] text-slate-400">
                  (surachat &gt; 70 · survente &lt; 30)
                </span>
              </div>
              <div className="h-28 md:h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={enrichedChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      fontSize={10}
                      minTickGap={50}
                      tickFormatter={(d) =>
                        new Date(d as string).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          timeZone: "UTC",
                        })
                      }
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      domain={[0, 100]}
                      ticks={[0, 30, 50, 70, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                      formatter={(v) => [
                        Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—",
                        "RSI",
                      ]}
                      labelFormatter={(d) =>
                        new Date(d as string).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      }
                    />
                    <ReferenceLine
                      y={70}
                      stroke="#dc2626"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <ReferenceLine
                      y={30}
                      stroke="#16a34a"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="rsi"
                      stroke="#dc2626"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Sous-graphe MACD */}
          {!isSectoral && activeIndicators.has("macd") && enrichedChart.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-2">
                <span>MACD 12/26/9</span>
                <span className="text-[10px] text-slate-400">
                  (ligne MACD · signal · histogramme)
                </span>
              </div>
              <div className="h-32 md:h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={enrichedChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      fontSize={10}
                      minTickGap={50}
                      tickFormatter={(d) =>
                        new Date(d as string).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          timeZone: "UTC",
                        })
                      }
                    />
                    <YAxis stroke="#94a3b8" fontSize={10} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                      formatter={(v, k) => {
                        const num = Number(v);
                        if (!Number.isFinite(num)) return ["—", k as string];
                        const labels: Record<string, string> = {
                          macd: "MACD",
                          macdSignal: "Signal",
                          macdHist: "Histogramme",
                        };
                        return [num.toFixed(3), labels[k as string] ?? (k as string)];
                      }}
                      labelFormatter={(d) =>
                        new Date(d as string).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      }
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                    <Bar dataKey="macdHist" name="macdHist">
                      {enrichedChart.map((d, i) => (
                        <rect
                          key={i}
                          fill={(d.macdHist ?? 0) >= 0 ? "#16a34a" : "#dc2626"}
                          opacity={0.5}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="macd"
                      stroke="#0ea5e9"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="macdSignal"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>

        {/* PANNEAU SIGNAUX SYNTHESE (caché sur les indices sectoriels) */}
        {!isSectoral && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-4">
              🎯 Signaux techniques
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SignalCard
                label="vs SMA 50"
                signal={signals.sma50}
                hint="Tendance moyen terme"
              />
              <SignalCard
                label="vs SMA 200"
                signal={signals.sma200}
                hint="Tendance long terme"
              />
              <SignalCard
                label="RSI 14"
                signal={signals.rsi}
                hint="Surachat/survente"
              />
              <SignalCard
                label="MACD"
                signal={signals.macd}
                hint="Croisement signal"
              />
            </div>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              <strong>Avertissement :</strong> ces signaux sont des indicateurs
              statistiques calculés sur l&apos;historique des cours, pas des
              recommandations d&apos;investissement. Les performances passées ne
              préjugent pas des performances futures.
            </p>
          </section>
        )}

        {/* COMPOSITION SECTORIELLE — contribution YTD */}
        {sectorComponents.length > 0 && (
          <SectorComponentsSection
            components={sectorComponents}
            indexYtd={ytdEffective}
          />
        )}

        {/* GRAPHIQUE PRO (KLineChart) — chandeliers + indicateurs + outils dessin */}
        {ohlcHistory.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="mb-3">
              <h2 className="text-lg md:text-xl font-semibold">
                📊 Graphique avancé
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Chandeliers · 50+ indicateurs · outils de dessin (Fibonacci,
                Elliott, patterns…) · zoom &amp; plein écran
              </p>
            </div>
            <KlineChart data={ohlcHistory} code={code} name={name} height={560} />
          </section>
        )}

        {/* CONTEXTE LIVE */}
        {live && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3">
              Données de séance
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Veille</div>
                <div className="font-medium tabular-nums">
                  {formatNumber(live.previousValue)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Clôture</div>
                <div className="font-medium tabular-nums">{formatNumber(live.value)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Variation jour</div>
                <div className={`font-medium tabular-nums ${pctClass(live.variationPct)}`}>
                  {formatPctSigned(live.variationPct)}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* DESCRIPTION */}
        {description && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold mb-3">À propos</h2>
            <p className="text-sm text-slate-700 leading-relaxed">{description}</p>
            <p className="text-xs text-slate-500 mt-4">
              Source officielle :{" "}
              <a
                href="https://www.brvm.org/fr/indices"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
              >
                brvm.org/fr/indices
              </a>
            </p>
          </section>
        )}

        <div className="text-center">
          <Link
            href="/marches/indices"
            className="text-sm text-blue-700 hover:text-blue-900"
          >
            ← Retour à tous les indices
          </Link>
        </div>
      </main>
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl md:text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function SectorComponentsSection({
  components,
  indexYtd,
}: {
  components: SectorComponent[];
  indexYtd: number;
}) {
  const sumContrib = components.reduce(
    (s, c) => s + (c.contributionPct ?? 0),
    0,
  );
  // Résiduel : écart entre la somme des contributions reconstituées et le
  // YTD officiel de l'indice. Cause principale : méthodologie BRVM en
  // capitalisation flottante (vs. capitalisation totale ici), et opérations
  // sur capital ajustées dans l'indice. La somme des deux = YTD officiel.
  const residual = indexYtd - sumContrib;
  const ranked = components;

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg md:text-xl font-semibold">
          🧮 Composition du secteur — Contribution YTD
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {ranked.length} titre{ranked.length > 1 ? "s" : ""} · classés par
          contribution décroissante à la performance YTD de l&apos;indice.
        </p>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-2 md:px-3 py-2 font-medium w-10">#</th>
              <th className="px-2 md:px-3 py-2 font-medium">Titre</th>
              <th className="px-2 md:px-3 py-2 font-medium text-right tabular-nums">
                Cours
              </th>
              <th className="px-2 md:px-3 py-2 font-medium text-right tabular-nums">
                YTD
              </th>
              <th className="px-2 md:px-3 py-2 font-medium text-right tabular-nums">
                Poids
              </th>
              <th className="px-2 md:px-3 py-2 font-medium text-right tabular-nums">
                Contribution
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => (
              <tr
                key={c.code}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-2 md:px-3 py-2 text-slate-400 tabular-nums">
                  {i + 1}
                </td>
                <td className="px-2 md:px-3 py-2">
                  <Link
                    href={`/titre/${c.code}`}
                    className="text-blue-700 hover:underline"
                  >
                    <span className="font-mono text-xs text-slate-500 mr-2">
                      {c.code}
                    </span>
                    <span>{c.name}</span>
                  </Link>
                </td>
                <td className="px-2 md:px-3 py-2 text-right tabular-nums">
                  {c.currentPrice > 0 ? formatNumber(c.currentPrice, 0) : "—"}
                </td>
                <td
                  className={`px-2 md:px-3 py-2 text-right tabular-nums font-medium ${
                    c.ytdPct !== null ? pctClass(c.ytdPct) : "text-slate-400"
                  }`}
                >
                  {c.ytdPct !== null ? formatPctSigned(c.ytdPct) : "—"}
                </td>
                <td className="px-2 md:px-3 py-2 text-right tabular-nums text-slate-600">
                  {c.weightPct > 0
                    ? `${c.weightPct.toFixed(1).replace(".", ",")}%`
                    : "—"}
                </td>
                <td
                  className={`px-2 md:px-3 py-2 text-right tabular-nums font-semibold ${
                    c.contributionPct !== null
                      ? pctClass(c.contributionPct)
                      : "text-slate-400"
                  }`}
                >
                  {c.contributionPct !== null
                    ? formatPctSigned(c.contributionPct)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Sous-total titres identifiés */}
            <tr className="text-xs border-t-2 border-slate-300">
              <td
                colSpan={4}
                className="px-2 md:px-3 py-2 text-slate-500 text-right"
              >
                Σ contributions identifiées
              </td>
              <td className="px-2 md:px-3 py-2 text-right tabular-nums text-slate-500">
                100,0%
              </td>
              <td className="px-2 md:px-3 py-2 text-right tabular-nums">
                <span className={`font-medium ${pctClass(sumContrib)}`}>
                  {formatPctSigned(sumContrib)}
                </span>
              </td>
            </tr>
            {/* Résiduel d'attribution */}
            <tr className="text-xs">
              <td
                colSpan={4}
                className="px-2 md:px-3 py-2 text-slate-500 text-right"
              >
                <span title="Écart d'attribution : différence entre notre reconstitution (capitalisation totale) et le YTD officiel BRVM (capitalisation flottante + ajustements opérations sur capital).">
                  Ajustement méthodologique BRVM
                </span>
              </td>
              <td className="px-2 md:px-3 py-2 text-right tabular-nums text-slate-400">
                —
              </td>
              <td className="px-2 md:px-3 py-2 text-right tabular-nums">
                <span className={`font-medium ${pctClass(residual)}`}>
                  {formatPctSigned(residual)}
                </span>
              </td>
            </tr>
            {/* Total = YTD officiel */}
            <tr className="text-sm border-t border-slate-300 bg-slate-50">
              <td
                colSpan={5}
                className="px-2 md:px-3 py-2 text-slate-700 text-right font-medium"
              >
                YTD indice ({formatPctSigned(indexYtd)})
              </td>
              <td className="px-2 md:px-3 py-2 text-right tabular-nums">
                <span className={`font-semibold ${pctClass(indexYtd)}`}>
                  {formatPctSigned(indexYtd)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </section>
  );
}

function SignalCard({
  label,
  signal,
  hint,
}: {
  label: string;
  signal: Signal;
  hint?: string;
}) {
  const meta = SIGNAL_META[signal];
  return (
    <div className={`rounded-lg border p-4 ${meta.color}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-lg md:text-xl font-semibold">{meta.label}</div>
      {hint && <div className="text-[11px] opacity-70 mt-1">{hint}</div>}
    </div>
  );
}
