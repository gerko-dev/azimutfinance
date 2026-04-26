"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  buildIndicatorSeries,
  detectPivotLevels,
  aggregateSignal,
  trailingSlope,
  type PriceVolumePoint,
  type IndicatorSeries,
  type GlobalSignal,
  type SignalLabel,
} from "@/lib/technicalAnalysis";

type Period = "3M" | "6M" | "1A" | "3A" | "5A" | "Max";

type Props = {
  ticker: string;
  history: PriceVolumePoint[];
};

// === Couleurs cohérentes avec le reste du site ===
const COL = {
  price: "#0f172a",
  sma20: "#185FA5",
  sma50: "#854F0B",
  sma200: "#9333ea",
  ema20: "#0d9488",
  ema50: "#db2777",
  bollUp: "#94a3b8",
  bollLo: "#94a3b8",
  bollMid: "#cbd5e1",
  volume: "#94a3b8",
  rsi: "#185FA5",
  macd: "#185FA5",
  macdSignal: "#dc2626",
  macdHistPos: "#16a34a",
  macdHistNeg: "#dc2626",
  support: "#16a34a",
  resistance: "#dc2626",
};

// === Formatters ===

function formatFCFA(v: number): string {
  if (!isFinite(v)) return "—";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatNum(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  return v.toFixed(decimals).replace(".", ",");
}

function formatPct(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatPctSigned(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatVolumeAxis(v: number): string {
  if (v === 0) return "0";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + " k";
  return String(Math.round(v));
}

function dateLabel(d: unknown): string {
  if (typeof d !== "string") return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function filterByPeriod(
  series: IndicatorSeries[],
  period: Period
): IndicatorSeries[] {
  if (period === "Max" || series.length === 0) return series;
  const last = new Date(series[series.length - 1].date);
  const cutoff = new Date(last);
  switch (period) {
    case "3M": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6M": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "1A": cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    case "3A": cutoff.setFullYear(cutoff.getFullYear() - 3); break;
    case "5A": cutoff.setFullYear(cutoff.getFullYear() - 5); break;
  }
  return series.filter((p) => new Date(p.date) >= cutoff);
}

// Verdict visuel selon le score
const SIGNAL_STYLE: Record<
  SignalLabel,
  { cls: string; icon: string }
> = {
  "Achat fort": {
    cls: "bg-green-100 border-green-300 text-green-900",
    icon: "▲▲",
  },
  Achat: {
    cls: "bg-green-50 border-green-200 text-green-800",
    icon: "▲",
  },
  Neutre: {
    cls: "bg-slate-50 border-slate-200 text-slate-700",
    icon: "●",
  },
  Vente: {
    cls: "bg-red-50 border-red-200 text-red-800",
    icon: "▼",
  },
  "Vente fort": {
    cls: "bg-red-100 border-red-300 text-red-900",
    icon: "▼▼",
  },
};

export default function TechnicalAnalysisView({ ticker, history }: Props) {
  const [period, setPeriod] = useState<Period>("1A");
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showSMA200, setShowSMA200] = useState(false);
  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showSR, setShowSR] = useState(true);

  // === Calculs (full history pour avoir les MM200 valides en début de période) ===
  const fullSeries = useMemo(() => buildIndicatorSeries(history), [history]);
  const filtered = useMemo(
    () => filterByPeriod(fullSeries, period),
    [fullSeries, period]
  );
  const pivots = useMemo(
    () => detectPivotLevels(history, 5, 6),
    [history]
  );

  // Dernière valeur disponible (la plus récente)
  const last = fullSeries[fullSeries.length - 1];

  // Pente OBV sur les 30 dernières séances pour le signal
  const obvSlope = useMemo(() => {
    const obvValues = fullSeries.map((s) => s.obv);
    const slope = trailingSlope(obvValues, 30);
    return isFinite(slope) ? slope : 0;
  }, [fullSeries]);

  const signal: GlobalSignal | null = useMemo(() => {
    if (!last) return null;
    return aggregateSignal({
      price: last.price,
      sma20: last.sma20,
      sma50: last.sma50,
      sma200: last.sma200,
      rsi14: last.rsi14,
      macdValue: last.macd,
      macdSignal: last.macdSignal,
      bollPercentB: last.bollPercentB,
      obvSlope,
      roc10: last.roc10,
    });
  }, [last, obvSlope]);

  // Volume MA20
  const volumeMA20 = useMemo(() => {
    if (!last) return null;
    const recent = fullSeries.slice(-20);
    const vols = recent.map((s) => s.volume).filter((v): v is number => v !== null && v > 0);
    if (vols.length === 0) return null;
    return vols.reduce((a, b) => a + b, 0) / vols.length;
  }, [fullSeries, last]);

  if (history.length < 30 || !last || !signal) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Historique insuffisant pour l&apos;analyse technique
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {ticker} ne dispose pas d&apos;assez d&apos;observations (minimum 30
          séances) pour calculer les indicateurs techniques.
        </p>
      </div>
    );
  }

  const hasAnyVolume = filtered.some(
    (p) => p.volume !== null && p.volume !== undefined && p.volume > 0
  );

  // Prix min/max sur la période visible (pour zoom Y)
  const priceMin = Math.min(...filtered.map((p) => p.price));
  const priceMax = Math.max(...filtered.map((p) => p.price));
  const priceRange = priceMax - priceMin;
  const padding = priceRange * 0.05;

  const visiblePivots = showSR
    ? pivots.filter(
        (p) =>
          p.price >= priceMin - priceRange * 0.2 &&
          p.price <= priceMax + priceRange * 0.2
      )
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === BANDEAU SIGNAL GLOBAL === */}
      <div
        className={`rounded-lg border p-4 md:p-5 ${SIGNAL_STYLE[signal.label].cls}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              Signal technique agrégé
            </div>
            <div className="text-xl md:text-2xl font-semibold mt-1">
              {SIGNAL_STYLE[signal.label].icon} {signal.label}
            </div>
            <p className="text-sm mt-1 opacity-80">
              {signal.bullishCount} indicateurs haussiers ·{" "}
              {signal.bearishCount} baissiers · {signal.neutralCount} neutres
              {" — "}
              <span className="opacity-70">
                score {signal.score >= 0 ? "+" : ""}
                {signal.score} / {signal.total}
              </span>
            </p>
          </div>
          <div className="text-xs px-3 py-1 rounded-full bg-white/60 border border-current/30 font-mono">
            {ticker}
          </div>
        </div>

        {/* Détail des votes */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          {signal.entries.map((e) => (
            <div
              key={e.label}
              className="bg-white/70 border border-current/20 rounded-md px-2.5 py-1.5"
            >
              <div className="text-[11px] font-medium flex items-center gap-1.5">
                <span
                  className={
                    e.vote === 1
                      ? "text-green-700"
                      : e.vote === -1
                      ? "text-red-700"
                      : "text-slate-500"
                  }
                >
                  {e.vote === 1 ? "▲" : e.vote === -1 ? "▼" : "●"}
                </span>
                {e.label}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">
                {e.detail}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === CHART PRINCIPAL : prix + MM + Bollinger + volume === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <div>
            <h3 className="text-base font-medium">Cours et indicateurs de tendance</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} séances · clôture quotidienne
            </p>
          </div>
          <div className="flex gap-1.5 text-xs flex-wrap">
            {(["3M", "6M", "1A", "3A", "5A", "Max"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded border ${
                  period === p
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles overlays */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Toggle
            label="MM 20"
            color={COL.sma20}
            active={showSMA20}
            onClick={() => setShowSMA20(!showSMA20)}
          />
          <Toggle
            label="MM 50"
            color={COL.sma50}
            active={showSMA50}
            onClick={() => setShowSMA50(!showSMA50)}
          />
          <Toggle
            label="MM 200"
            color={COL.sma200}
            active={showSMA200}
            onClick={() => setShowSMA200(!showSMA200)}
          />
          <Toggle
            label="EMA 20"
            color={COL.ema20}
            active={showEMA20}
            onClick={() => setShowEMA20(!showEMA20)}
          />
          <Toggle
            label="EMA 50"
            color={COL.ema50}
            active={showEMA50}
            onClick={() => setShowEMA50(!showEMA50)}
          />
          <Toggle
            label="Bollinger 20·2"
            color={COL.bollUp}
            active={showBollinger}
            onClick={() => setShowBollinger(!showBollinger)}
          />
          <Toggle
            label="Support / Résistance"
            color={COL.resistance}
            active={showSR}
            onClick={() => setShowSR(!showSR)}
          />
        </div>

        <div className="h-80 md:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={dateLabel}
              />
              <YAxis
                yAxisId="price"
                stroke="#94a3b8"
                fontSize={11}
                domain={[priceMin - padding, priceMax + padding]}
                tickFormatter={(v) => formatFCFA(Number(v))}
              />
              {hasAnyVolume && (
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v) => formatVolumeAxis(Number(v))}
                  domain={[0, (dataMax: number) => dataMax * 4]}
                  allowDecimals={false}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => {
                  const v = Number(value ?? 0);
                  if (name === "volume") return [formatFCFA(v) + " titres", "Volume"];
                  return [formatFCFA(v) + " FCFA", labelOf(name as string)];
                }}
                labelFormatter={dateLabel}
              />

              {/* Bollinger : aire entre upper et lower */}
              {showBollinger && (
                <>
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="bollUpper"
                    stroke={COL.bollUp}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="#e2e8f0"
                    fillOpacity={0.4}
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="bollLower"
                    stroke={COL.bollLo}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="#ffffff"
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="bollMiddle"
                    stroke={COL.bollMid}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </>
              )}

              {/* Volume bars */}
              {hasAnyVolume && (
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  fill={COL.volume}
                  fillOpacity={0.45}
                  isAnimationActive={false}
                />
              )}

              {/* Prix */}
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke={COL.price}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />

              {/* Moyennes mobiles */}
              {showSMA20 && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma20"
                  stroke={COL.sma20}
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showSMA50 && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma50"
                  stroke={COL.sma50}
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showSMA200 && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma200"
                  stroke={COL.sma200}
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showEMA20 && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ema20"
                  stroke={COL.ema20}
                  strokeWidth={1.2}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showEMA50 && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ema50"
                  stroke={COL.ema50}
                  strokeWidth={1.2}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}

              {/* Support / Résistance */}
              {visiblePivots.map((p, i) => (
                <ReferenceLine
                  key={i}
                  yAxisId="price"
                  y={p.price}
                  stroke={p.type === "support" ? COL.support : COL.resistance}
                  strokeDasharray="5 4"
                  strokeOpacity={Math.min(0.3 + p.strength * 0.15, 0.85)}
                  label={{
                    value: `${p.type === "support" ? "S" : "R"} · ${formatFCFA(p.price)}`,
                    position: "right",
                    fill: p.type === "support" ? COL.support : COL.resistance,
                    fontSize: 10,
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === RSI === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-medium">RSI 14</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Indice de force relative · zones surachat (&gt;70) et survente (&lt;30)
            </p>
          </div>
          <div className="text-sm">
            Actuel :{" "}
            <span
              className={`font-mono font-semibold ${
                last.rsi14 > 70
                  ? "text-red-700"
                  : last.rsi14 < 30
                  ? "text-green-700"
                  : "text-slate-700"
              }`}
            >
              {formatNum(last.rsi14, 1)}
            </span>
          </div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={10}
                tickFormatter={dateLabel}
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
                formatter={(value) => [formatNum(Number(value), 1), "RSI 14"]}
                labelFormatter={dateLabel}
              />
              <ReferenceArea y1={70} y2={100} fill="#fee2e2" fillOpacity={0.4} />
              <ReferenceArea y1={0} y2={30} fill="#dcfce7" fillOpacity={0.4} />
              <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="#16a34a" strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 4" />
              <Line
                type="monotone"
                dataKey="rsi14"
                stroke={COL.rsi}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === MACD === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-medium">MACD 12·26·9</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Convergence/divergence des moyennes mobiles exponentielles
            </p>
          </div>
          <div className="text-sm flex gap-3 flex-wrap">
            <span>
              MACD :{" "}
              <span className="font-mono font-semibold">
                {formatNum(last.macd, 2)}
              </span>
            </span>
            <span>
              Signal :{" "}
              <span className="font-mono font-semibold">
                {formatNum(last.macdSignal, 2)}
              </span>
            </span>
            <span>
              Histogramme :{" "}
              <span
                className={`font-mono font-semibold ${
                  last.macdHist > 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {formatNum(last.macdHist, 2)}
              </span>
            </span>
          </div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={10}
                tickFormatter={dateLabel}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                tickFormatter={(v) => formatNum(Number(v), 1)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => {
                  const v = Number(value);
                  const labels: Record<string, string> = {
                    macd: "MACD",
                    macdSignal: "Signal",
                    macdHist: "Histogramme",
                  };
                  return [formatNum(v, 3), labels[name as string] || name];
                }}
                labelFormatter={dateLabel}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="macdHist" isAnimationActive={false} fillOpacity={0.55}>
                {filtered.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.macdHist > 0 ? COL.macdHistPos : COL.macdHistNeg}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="macd"
                stroke={COL.macd}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="macdSignal"
                stroke={COL.macdSignal}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === PANNEAU INDICATEURS === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Tendance */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-3">Tendance</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric
              label="Cours"
              value={formatFCFA(last.price) + " FCFA"}
            />
            <Metric
              label="MM 20"
              value={formatFCFA(last.sma20) + " FCFA"}
              hint={
                last.price > last.sma20
                  ? `+${formatPct((last.price - last.sma20) / last.sma20, 2)}`
                  : `${formatPct((last.price - last.sma20) / last.sma20, 2)}`
              }
              hintColor={last.price > last.sma20 ? "text-green-700" : "text-red-700"}
            />
            <Metric
              label="MM 50"
              value={formatFCFA(last.sma50) + " FCFA"}
              hint={
                isFinite(last.sma50)
                  ? formatPctSigned((last.price - last.sma50) / last.sma50, 2)
                  : undefined
              }
              hintColor={
                last.price > last.sma50 ? "text-green-700" : "text-red-700"
              }
            />
            <Metric
              label="MM 200"
              value={formatFCFA(last.sma200) + " FCFA"}
              hint={
                isFinite(last.sma200)
                  ? formatPctSigned(
                      (last.price - last.sma200) / last.sma200,
                      2
                    )
                  : undefined
              }
              hintColor={
                last.price > last.sma200 ? "text-green-700" : "text-red-700"
              }
            />
            <Metric
              label="EMA 20 / EMA 50"
              value={`${formatFCFA(last.ema20)} / ${formatFCFA(last.ema50)}`}
            />
            <Metric
              label="Configuration MM"
              value={
                isFinite(last.sma50) && isFinite(last.sma200)
                  ? last.sma50 > last.sma200
                    ? "Golden Cross"
                    : "Death Cross"
                  : "—"
              }
              hintColor={
                isFinite(last.sma50) && isFinite(last.sma200)
                  ? last.sma50 > last.sma200
                    ? "text-green-700"
                    : "text-red-700"
                  : ""
              }
            />
          </div>
        </div>

        {/* Momentum & volatilité */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-3">Momentum & volatilité</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric
              label="RSI 14"
              value={formatNum(last.rsi14, 1)}
              hint={
                last.rsi14 > 70
                  ? "Surachat"
                  : last.rsi14 < 30
                  ? "Survente"
                  : "Neutre"
              }
              hintColor={
                last.rsi14 > 70
                  ? "text-red-700"
                  : last.rsi14 < 30
                  ? "text-green-700"
                  : "text-slate-500"
              }
            />
            <Metric
              label="Stoch %K / %D"
              value={`${formatNum(last.stochK, 1)} / ${formatNum(last.stochD, 1)}`}
              hint={
                last.stochK > 80
                  ? "Surachat"
                  : last.stochK < 20
                  ? "Survente"
                  : "Neutre"
              }
              hintColor={
                last.stochK > 80
                  ? "text-red-700"
                  : last.stochK < 20
                  ? "text-green-700"
                  : "text-slate-500"
              }
            />
            <Metric
              label="ROC 10 séances"
              value={formatPctSigned(last.roc10, 2)}
              hintColor={last.roc10 > 0 ? "text-green-700" : "text-red-700"}
            />
            <Metric
              label="MACD - Signal"
              value={formatNum(last.macdHist, 3)}
              hintColor={last.macdHist > 0 ? "text-green-700" : "text-red-700"}
            />
            <Metric
              label="Bollinger %B"
              value={formatNum(last.bollPercentB, 2)}
              hint={
                last.bollPercentB > 1
                  ? "Au-dessus de la bande"
                  : last.bollPercentB < 0
                  ? "Sous la bande"
                  : last.bollPercentB > 0.8
                  ? "Proche du haut"
                  : last.bollPercentB < 0.2
                  ? "Proche du bas"
                  : "Centre de bande"
              }
            />
            <Metric
              label="Bollinger bandwidth"
              value={formatPct(last.bollBandwidth, 2)}
              hint={
                last.bollBandwidth < 0.05
                  ? "Compression — explosion possible"
                  : "Expansion normale"
              }
            />
          </div>
        </div>

        {/* Volume */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-3">Volume</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric
              label="Volume dernière séance"
              value={
                last.volume !== null && last.volume !== undefined
                  ? formatFCFA(last.volume) + " titres"
                  : "—"
              }
            />
            <Metric
              label="Volume moyen 20 séances"
              value={
                volumeMA20 !== null
                  ? formatFCFA(volumeMA20) + " titres"
                  : "—"
              }
            />
            <Metric
              label="Volume vs MA20"
              value={
                volumeMA20 !== null && last.volume !== null && last.volume !== undefined && volumeMA20 > 0
                  ? formatPctSigned(last.volume / volumeMA20 - 1, 0)
                  : "—"
              }
              hintColor={
                volumeMA20 !== null && last.volume !== null && last.volume !== undefined
                  ? last.volume > volumeMA20
                    ? "text-green-700"
                    : "text-slate-500"
                  : ""
              }
            />
            <Metric
              label="OBV — pente 30j"
              value={
                obvSlope > 0
                  ? "↗ Accumulation"
                  : obvSlope < 0
                  ? "↘ Distribution"
                  : "→ Stable"
              }
              hintColor={
                obvSlope > 0
                  ? "text-green-700"
                  : obvSlope < 0
                  ? "text-red-700"
                  : "text-slate-500"
              }
            />
          </div>
        </div>

        {/* Niveaux S/R */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-3">Niveaux clés</h3>
          {pivots.length === 0 ? (
            <div className="text-sm text-slate-500">
              Pas de niveaux pivots détectés sur l&apos;historique disponible.
            </div>
          ) : (
            <div className="space-y-1.5">
              {pivots
                .slice()
                .sort((a, b) => b.price - a.price)
                .map((p, i) => {
                  const dist = (p.price - last.price) / last.price;
                  const isAbove = p.price > last.price;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm border border-slate-100 rounded px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            p.type === "support"
                              ? "bg-green-50 text-green-800 border border-green-200"
                              : "bg-red-50 text-red-800 border border-red-200"
                          }`}
                        >
                          {p.type === "support" ? "Support" : "Résistance"}
                        </span>
                        <span className="font-mono">
                          {formatFCFA(p.price)} FCFA
                        </span>
                        <span className="text-xs text-slate-400">
                          {"●".repeat(Math.min(p.strength, 5))}
                        </span>
                      </div>
                      <div
                        className={`text-xs font-mono ${
                          isAbove ? "text-slate-600" : "text-slate-600"
                        }`}
                      >
                        {isAbove ? "+" : ""}
                        {formatPct(dist, 1)}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Pivots détectés sur 5 séances de chaque côté, regroupés à ±1%.
            Les points indiquent la force (nombre de tests).
          </p>
        </div>
      </section>

      {/* === MÉTHODOLOGIE === */}
      <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 md:p-4 border border-slate-100">
        <strong>Méthodologie :</strong> indicateurs calculés sur les cours de
        clôture quotidiens. MM = moyenne mobile arithmétique (SMA), EMA = α =
        2/(N+1). Bollinger = MM20 ± 2σ. RSI calculé en lissage de Wilder sur 14
        séances. MACD = EMA12 − EMA26, signal = EMA9 du MACD. Stochastique
        approximée à partir des plus haut/bas <em>de clôture</em> sur 14 séances
        (l&apos;absence d&apos;OHLC empêche la version intraday). OBV cumule le
        volume signé par la direction. Le signal global agrège jusqu&apos;à 10
        votes : ratio ≥ 60% = Achat fort, ≥ 20% = Achat, ≤ −60% = Vente fort, ≤
        −20% = Vente, sinon Neutre. Cette grille de lecture est mécanique et ne
        constitue pas une recommandation d&apos;investissement.
      </div>
    </div>
  );
}

// ===== sous-composants =====

function Toggle({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-2.5 py-1 rounded-md border transition ${
        active
          ? "border-slate-300 bg-white text-slate-800"
          : "border-slate-200 text-slate-400 bg-slate-50 hover:bg-white"
      }`}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
        style={{ backgroundColor: active ? color : "#cbd5e1" }}
      />
      {label}
    </button>
  );
}

function Metric({
  label,
  value,
  hint,
  hintColor,
}: {
  label: string;
  value: string;
  hint?: string;
  hintColor?: string;
}) {
  return (
    <div className="bg-slate-50/50 rounded-md border border-slate-100 p-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-mono font-semibold text-slate-900 mt-0.5">
        {value}
      </div>
      {hint && (
        <div className={`text-[11px] mt-0.5 ${hintColor || "text-slate-500"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

function labelOf(name: string): string {
  switch (name) {
    case "price": return "Cours";
    case "sma20": return "MM 20";
    case "sma50": return "MM 50";
    case "sma200": return "MM 200";
    case "ema20": return "EMA 20";
    case "ema50": return "EMA 50";
    case "bollUpper": return "Bollinger sup.";
    case "bollLower": return "Bollinger inf.";
    case "bollMiddle": return "Bollinger mid.";
    default: return name;
  }
}
