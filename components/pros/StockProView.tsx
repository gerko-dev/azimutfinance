"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import KlineChart, { type OhlcPoint } from "@/components/charting/KlineChart";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type {
  ReturnsMatrix,
  RiskMetrics,
  AdvancedStatsSnapshot,
  MonthlyReturn,
} from "@/lib/stockStats";
import type { FundRatios, StatementLine } from "@/lib/fundamentals";
import type { ListedBond } from "@/lib/listedBondsTypes";

// ─── TYPES ────────────────────────────────────────────────────────────

type StockShape = {
  code: string;
  name: string;
  sector: string;
  country: string;
  isin: string;
  description: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  per: number;
  yield: number;
  capitalization: number;
  sharesOutstanding: number;
  float: number;
  high52w: number;
  low52w: number;
  yearChange: number;
  volatility: number;
  hasPer: boolean;
  hasYield: boolean;
  hasYearChange: boolean;
  hasVolume: boolean;
};

type PricePoint = { date: string; value: number };

type Peer = {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  capitalization: number;
  per: number;
  yieldPct: number;
  hasPer: boolean;
  hasYield: boolean;
};

type NewsItem = {
  ticker: string;
  date: string;
  type: string;
  titre: string;
  source: string;
  url: string;
  resume: string;
};

type Statement = {
  exercices: number[];
  bilanActif: StatementLine[];
  bilanPassif: StatementLine[];
  compteResultat: StatementLine[];
  flux: StatementLine[];
};

type Props = {
  stock: StockShape;
  priceHistory: PricePoint[];
  ohlcHistory: OhlcPoint[];
  brvmcHistory: PricePoint[];
  sectorIndex: { code: string; name: string; history: PricePoint[] } | null;
  returnsMatrix: ReturnsMatrix;
  riskMetrics: RiskMetrics;
  advancedStats: AdvancedStatsSnapshot;
  peers: Peer[];
  peerSparklines: Record<string, PricePoint[]>;
  issuerBonds: ListedBond[];
  ratios: FundRatios[];
  statements: Statement;
  news: NewsItem[];
  livePrice: {
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
    hasLive: boolean;
  };
};

// ─── FORMATTERS ──────────────────────────────────────────────────────

const fmtInt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

const fmt2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number | null | undefined, digits = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits).replace(".", ",")} %`;
};

const fmtPctRaw = (n: number | null | undefined, digits = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits).replace(".", ",")} %`;
};

const fmtFCFA = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2).replace(".", ",")} Bn`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(".", ",")} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".", ",")} k`;
  return fmtInt(n);
};

const colorFor = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n)
    ? "text-slate-300"
    : n > 0
      ? "text-emerald-400"
      : n < 0
        ? "text-red-400"
        : "text-slate-300";

// ─── DRAWDOWN ─────────────────────────────────────────────────────────

function computeDrawdownSeries(history: PricePoint[]): Array<{
  date: string;
  drawdown: number;
}> {
  const out: Array<{ date: string; drawdown: number }> = [];
  let peak = -Infinity;
  for (const p of history) {
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? p.value / peak - 1 : 0;
    out.push({ date: p.date, drawdown: dd });
  }
  return out;
}

// Identifie les N pires drawdowns historiques (pic -> creux -> recovery
// optionnelle). Approche simple : decoupe la serie en periodes de
// "all-time high" successifs, et garde le min de chacune.
function findWorstDrawdowns(
  history: PricePoint[],
  topN = 3,
): Array<{ peakDate: string; troughDate: string; drawdown: number; days: number }> {
  if (history.length < 2) return [];
  const segments: Array<{
    peakDate: string;
    troughDate: string;
    drawdown: number;
    days: number;
  }> = [];
  let peakValue = history[0].value;
  let peakDate = history[0].date;
  let troughValue = history[0].value;
  let troughDate = history[0].date;
  for (let i = 1; i < history.length; i++) {
    const p = history[i];
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    if (p.value > peakValue) {
      // Recovery : on cloture le segment precedent si on a un creux
      if (troughValue < peakValue) {
        const dd = troughValue / peakValue - 1;
        if (dd < 0) {
          segments.push({
            peakDate,
            troughDate,
            drawdown: dd,
            days: Math.round(
              (new Date(troughDate).getTime() - new Date(peakDate).getTime()) /
                86400000,
            ),
          });
        }
      }
      peakValue = p.value;
      peakDate = p.date;
      troughValue = p.value;
      troughDate = p.date;
    } else if (p.value < troughValue) {
      troughValue = p.value;
      troughDate = p.date;
    }
  }
  // Dernier segment ouvert
  if (troughValue < peakValue) {
    const dd = troughValue / peakValue - 1;
    if (dd < 0) {
      segments.push({
        peakDate,
        troughDate,
        drawdown: dd,
        days: Math.round(
          (new Date(troughDate).getTime() - new Date(peakDate).getTime()) /
            86400000,
        ),
      });
    }
  }
  return segments.sort((a, b) => a.drawdown - b.drawdown).slice(0, topN);
}

// ─── COMPONENT ───────────────────────────────────────────────────────

export default function StockProView(props: Props) {
  const {
    stock,
    priceHistory,
    ohlcHistory,
    brvmcHistory,
    sectorIndex,
    returnsMatrix,
    riskMetrics,
    advancedStats,
    peers,
    peerSparklines,
    issuerBonds,
    ratios,
    statements,
    news,
    livePrice,
  } = props;

  const [tab, setTab] = useState<
    "vue" | "cotation" | "risque" | "fundamentaux" | "pairs" | "news"
  >("vue");

  // ─── Pre-calculs ────────────────────────────────────────────────────
  const drawdownSeries = useMemo(
    () => computeDrawdownSeries(priceHistory),
    [priceHistory],
  );
  const worstDD = useMemo(
    () => findWorstDrawdowns(priceHistory, 3),
    [priceHistory],
  );

  // Position dans la fourchette 52w (0 = bas, 1 = haut)
  const range52w =
    stock.high52w > stock.low52w
      ? (stock.price - stock.low52w) / (stock.high52w - stock.low52w)
      : null;

  // Last 30 sessions (cotation tab)
  const last30Sessions = useMemo(
    () => ohlcHistory.slice(-30).reverse(),
    [ohlcHistory],
  );

  return (
    <div className="space-y-3 -mt-2 -mb-2">
      {/* ═══ HEADER STICKY ═══════════════════════════════════════════ */}
      <StockProHeader stock={stock} livePrice={livePrice} />

      {/* ═══ TABS ════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1 border-b border-slate-800 -mx-4 px-4 md:-mx-6 md:px-6 overflow-x-auto">
        {[
          { id: "vue", label: "Vue" },
          { id: "cotation", label: "Cotation" },
          { id: "risque", label: "Risque" },
          { id: "fundamentaux", label: "Fondamentaux" },
          { id: "pairs", label: "Pairs" },
          { id: "news", label: "Actualités" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═════════════════════════════════════════════ */}
      {tab === "vue" && (
        <div className="grid grid-cols-12 gap-3">
          {/* Chart KLine */}
          <Panel className="col-span-12 lg:col-span-8" title="Cours OHLC" subtitle={`${ohlcHistory.length} séances`}>
            {ohlcHistory.length > 0 ? (
              <KlineChart
                data={ohlcHistory}
                code={stock.code}
                name={stock.name}
                theme="dark"
                height={460}
                pricePrecision={0}
              />
            ) : (
              <div className="h-[420px]">
                <EmptyMessage>Aucun historique disponible.</EmptyMessage>
              </div>
            )}
          </Panel>

          {/* KPI grid */}
          <Panel className="col-span-12 lg:col-span-4" title="Indicateurs clés">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs">
              <Kpi label="Cours" value={`${fmtInt(stock.price)}`} unit="FCFA" />
              <Kpi label="Variation J" value={fmtPctRaw(stock.changePercent)} tone={stock.changePercent} />
              <Kpi label="Volume J" value={stock.hasVolume ? fmtInt(stock.volume) : "—"} />
              <Kpi
                label="Capitalisation"
                value={fmtFCFA(stock.capitalization)}
                unit="FCFA"
              />
              <Kpi label="PER" value={stock.hasPer ? fmt2(stock.per) : "—"} unit="x" />
              <Kpi
                label="Dividend Yield"
                value={stock.hasYield ? fmtPctRaw(stock.yield) : "—"}
              />
              <Kpi
                label="52w Haut"
                value={fmtInt(stock.high52w)}
                unit="FCFA"
              />
              <Kpi
                label="52w Bas"
                value={fmtInt(stock.low52w)}
                unit="FCFA"
              />
              <Kpi
                label="1A"
                value={stock.hasYearChange ? fmtPctRaw(stock.yearChange) : "—"}
                tone={stock.yearChange}
              />
              <Kpi
                label="Volatilité 1A"
                value={
                  riskMetrics.volatility1A != null
                    ? fmtPct(riskMetrics.volatility1A)
                    : "—"
                }
              />
              <Kpi
                label="Beta vs BRVMC"
                value={
                  riskMetrics.beta != null ? fmt2(riskMetrics.beta) : "—"
                }
              />
              <Kpi
                label="Sharpe 1A"
                value={
                  riskMetrics.sharpe1A != null ? fmt2(riskMetrics.sharpe1A) : "—"
                }
              />
              <Kpi
                label="Max DD"
                value={
                  riskMetrics.maxDrawdownAll != null
                    ? fmtPct(riskMetrics.maxDrawdownAll)
                    : "—"
                }
                tone={riskMetrics.maxDrawdownAll}
              />
              <Kpi
                label="Flottant"
                value={stock.float > 0 ? fmtPctRaw(stock.float * 100, 1) : "—"}
              />
            </div>

            {/* Position dans la fourchette 52w */}
            {range52w != null && (
              <div className="px-3 pb-3">
                <div className="text-[10px] text-slate-500 mb-1 flex justify-between">
                  <span>{fmtInt(stock.low52w)}</span>
                  <span>Position 52w</span>
                  <span>{fmtInt(stock.high52w)}</span>
                </div>
                <div className="h-1.5 bg-slate-700/60 rounded-full relative">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50"
                    style={{ left: `calc(${(range52w * 100).toFixed(1)}% - 4px)` }}
                  />
                </div>
              </div>
            )}
          </Panel>

          {/* Matrice rendements */}
          <Panel className="col-span-12 lg:col-span-8" title="Rendements multi-périodes" subtitle="Cours BRVM, log-returns">
            <ReturnsMatrixRow matrix={returnsMatrix} />
          </Panel>

          {/* Mini-card pairs */}
          <Panel className="col-span-12 lg:col-span-4" title="Pairs du secteur" subtitle={stock.sector || "—"}>
            <PeersTable peers={peers.slice(0, 4)} sparklines={peerSparklines} compact />
          </Panel>

          {/* Heatmap mensuelle */}
          <Panel className="col-span-12 lg:col-span-7" title="Rendements mensuels" subtitle="Convention Bloomberg : (close mois M) / (close mois M-1)">
            <MonthlyHeatmap data={advancedStats.monthlyReturns} />
          </Panel>

          {/* Drawdown */}
          <Panel className="col-span-12 lg:col-span-5" title="Drawdown" subtitle="vs all-time high">
            <DrawdownPanel series={drawdownSeries} worst={worstDD} />
          </Panel>

          {/* Obligations emetteur + News (col 12) */}
          {issuerBonds.length > 0 && (
            <Panel className="col-span-12 lg:col-span-7" title="Obligations cotées de l'émetteur">
              <IssuerBondsTable bonds={issuerBonds} />
            </Panel>
          )}
          <Panel
            className={`col-span-12 ${issuerBonds.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}`}
            title="Dernières actualités"
            subtitle={`${news.length} entrées`}
          >
            <NewsList items={news.slice(0, 5)} />
          </Panel>
        </div>
      )}

      {tab === "cotation" && (
        <div className="grid grid-cols-12 gap-3">
          <Panel className="col-span-12 lg:col-span-8" title="30 dernières séances">
            <SessionsTable rows={last30Sessions} />
          </Panel>
          <Panel className="col-span-12 lg:col-span-4" title="Récap cotation">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs">
              <Kpi label="Dernier cours" value={fmtInt(stock.price)} unit="FCFA" />
              <Kpi
                label="Variation J"
                value={fmtPctRaw(stock.changePercent)}
                tone={stock.changePercent}
              />
              <Kpi label="Variation FCFA" value={fmtInt(stock.change)} unit="FCFA" tone={stock.change} />
              <Kpi label="Volume J" value={stock.hasVolume ? fmtInt(stock.volume) : "—"} />
              <Kpi label="Capi. boursière" value={fmtFCFA(stock.capitalization)} unit="FCFA" />
              <Kpi label="Titres en circulation" value={fmtFCFA(stock.sharesOutstanding)} />
              <Kpi
                label="ISIN"
                value={stock.isin || "—"}
              />
              <Kpi label="Secteur" value={stock.sector || "—"} />
              <Kpi label="Pays" value={stock.country || "—"} />
              {sectorIndex && (
                <Kpi
                  label="Indice sectoriel"
                  value={sectorIndex.code}
                />
              )}
            </div>
          </Panel>
        </div>
      )}

      {tab === "risque" && (
        <div className="grid grid-cols-12 gap-3">
          <Panel className="col-span-12 lg:col-span-6" title="VaR & Expected Shortfall" subtitle="Log-returns quotidiens, fenêtre complète">
            <RiskTable risk={advancedStats.risk} />
          </Panel>
          <Panel className="col-span-12 lg:col-span-6" title="Statistiques avancées">
            <AdvancedRiskStats
              risk={advancedStats.risk}
              regression={advancedStats.regression}
              descriptive={advancedStats.descriptive}
            />
          </Panel>
          <Panel className="col-span-12 lg:col-span-7" title="Distribution des rendements" subtitle="Histogramme 30 bins">
            <DistributionChart bins={advancedStats.histogram} />
          </Panel>
          <Panel className="col-span-12 lg:col-span-5" title="Test de normalité" subtitle="Jarque-Bera">
            <NormalityPanel normality={advancedStats.normality} />
          </Panel>
          <Panel className="col-span-12" title="Drawdown historique" subtitle="vs all-time high cumulés depuis cotation">
            <DrawdownPanel series={drawdownSeries} worst={worstDD} full />
          </Panel>
        </div>
      )}

      {tab === "fundamentaux" && (
        <div className="grid grid-cols-12 gap-3">
          <Panel className="col-span-12" title="Ratios fondamentaux" subtitle={`${ratios.length} exercice${ratios.length > 1 ? "s" : ""} disponibles`}>
            <RatiosTable ratios={ratios} />
          </Panel>
          {statements.exercices.length > 0 && (
            <>
              <Panel className="col-span-12 lg:col-span-6" title="Compte de résultat (synthèse)" subtitle={`Exercices ${statements.exercices.join(" · ")}`}>
                <StatementTable rows={statements.compteResultat.slice(0, 10)} years={statements.exercices} />
              </Panel>
              <Panel className="col-span-12 lg:col-span-6" title="Bilan actif (synthèse)" subtitle={`Exercices ${statements.exercices.join(" · ")}`}>
                <StatementTable rows={statements.bilanActif.slice(0, 10)} years={statements.exercices} />
              </Panel>
            </>
          )}
        </div>
      )}

      {tab === "pairs" && (
        <Panel className="col-span-12" title="Pairs du secteur" subtitle={stock.sector || "—"}>
          <PeersTable peers={peers} sparklines={peerSparklines} />
        </Panel>
      )}

      {tab === "news" && (
        <Panel title="Toutes les actualités">
          <NewsList items={news} full />
        </Panel>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function StockProHeader({
  stock,
  livePrice,
}: {
  stock: StockShape;
  livePrice: Props["livePrice"];
}) {
  return (
    <div className="sticky top-12 z-10 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-slate-900/90 backdrop-blur border-b border-slate-800">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-mono font-bold text-white">{stock.code}</span>
            <span className="text-sm text-slate-300 truncate max-w-md">{stock.name}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
            <span>{stock.isin || "ISIN —"}</span>
            <span>·</span>
            <span>{stock.sector || "—"}</span>
            <span>·</span>
            <span>{stock.country || "—"}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  livePrice.isClosed === false
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-slate-500"
                }`}
              />
              {livePrice.hasLive
                ? livePrice.isClosed === false
                  ? "Live BRVM"
                  : "BRVM clôturée"
                : "Historique"}
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-white tabular-nums">
              {fmtInt(stock.price)}
            </div>
            <div className="text-[10px] text-slate-500">FCFA</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-mono font-medium ${colorFor(stock.changePercent)}`}>
              {fmtPctRaw(stock.changePercent)}
            </div>
            <div className={`text-[11px] font-mono ${colorFor(stock.change)}`}>
              {stock.change >= 0 ? "+" : ""}{fmtInt(stock.change)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden ${className}`}
    >
      <div className="px-3 py-1.5 border-b border-slate-700 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-slate-500 truncate min-w-0">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: number | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${colorFor(tone)}`}>
        {value}
        {unit && <span className="text-[9px] text-slate-500 ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-slate-500">
      {children}
    </div>
  );
}

// ─── RETURNS MATRIX ───────────────────────────────────────────────────

function ReturnsMatrixRow({ matrix }: { matrix: ReturnsMatrix }) {
  const cols: Array<[string, number | null]> = [
    ["1M", matrix["1M"]],
    ["3M", matrix["3M"]],
    ["6M", matrix["6M"]],
    ["YTD", matrix.YTD],
    ["1A", matrix["1A"]],
    ["3A", matrix["3A"]],
    ["5A", matrix["5A"]],
    ["Depuis cotation", matrix.depuis],
  ];
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 divide-x divide-slate-700 border-t border-slate-700">
      {cols.map(([label, value]) => (
        <div key={label} className="p-2 flex flex-col items-center">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">
            {label}
          </span>
          <span className={`font-mono text-xs tabular-nums mt-0.5 ${colorFor(value)}`}>
            {fmtPct(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── PEERS ────────────────────────────────────────────────────────────

function PeersTable({
  peers,
  sparklines,
  compact = false,
}: {
  peers: Peer[];
  sparklines: Record<string, PricePoint[]>;
  compact?: boolean;
}) {
  if (peers.length === 0) {
    return <EmptyMessage>Aucun pair du secteur.</EmptyMessage>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
          <th className="px-3 py-1.5 text-left">Code</th>
          {!compact && <th className="px-2 py-1.5 text-right">Cours</th>}
          <th className="px-2 py-1.5 text-right">Var J</th>
          {!compact && <th className="px-2 py-1.5 text-right">PER</th>}
          {!compact && <th className="px-2 py-1.5 text-right">Yield</th>}
          <th className="px-2 py-1.5 text-right">Capi</th>
          <th className="px-2 py-1.5 text-right w-20">30j</th>
        </tr>
      </thead>
      <tbody>
        {peers.map((p) => (
          <tr key={p.code} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
            <td className="px-3 py-1.5">
              <Link
                href={`/pros/titre/${p.code}`}
                className="font-mono text-slate-200 hover:text-blue-300"
              >
                {p.code}
              </Link>
              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{p.name}</div>
            </td>
            {!compact && (
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                {fmtInt(p.price)}
              </td>
            )}
            <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${colorFor(p.changePercent)}`}>
              {fmtPctRaw(p.changePercent)}
            </td>
            {!compact && (
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                {p.hasPer ? fmt2(p.per) : "—"}
              </td>
            )}
            {!compact && (
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                {p.hasYield ? fmtPctRaw(p.yieldPct) : "—"}
              </td>
            )}
            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
              {fmtFCFA(p.capitalization)}
            </td>
            <td className="px-2 py-1.5">
              <Sparkline points={sparklines[p.code] || []} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return <span className="text-slate-600">—</span>;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const positive = last >= first;
  return (
    <div className="h-6 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={positive ? "#34d399" : "#f87171"}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── MONTHLY HEATMAP ─────────────────────────────────────────────────

function MonthlyHeatmap({ data }: { data: MonthlyReturn[] }) {
  if (data.length === 0) {
    return <EmptyMessage>Pas assez d'historique.</EmptyMessage>;
  }
  const years = Array.from(new Set(data.map((d) => d.year))).sort((a, b) => b - a).slice(0, 6);
  const byYearMonth = new Map<string, number>();
  for (const d of data) byYearMonth.set(`${d.year}-${d.month}`, d.ret);

  // Couleur : interpolation discrete sur seuils
  const cellColor = (ret: number | null | undefined): string => {
    if (ret == null || !Number.isFinite(ret)) return "bg-slate-800/40 text-slate-600";
    const abs = Math.abs(ret);
    if (ret > 0) {
      if (abs > 0.10) return "bg-emerald-600/80 text-white";
      if (abs > 0.05) return "bg-emerald-700/70 text-emerald-50";
      if (abs > 0.02) return "bg-emerald-800/60 text-emerald-200";
      return "bg-emerald-900/40 text-emerald-300";
    }
    if (abs > 0.10) return "bg-red-700/80 text-white";
    if (abs > 0.05) return "bg-red-800/70 text-red-50";
    if (abs > 0.02) return "bg-red-900/60 text-red-200";
    return "bg-red-950/50 text-red-300";
  };

  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

  // Cumul par annee
  const yearTotal: Record<number, number> = {};
  for (const y of years) {
    let cum = 1;
    let hasAny = false;
    for (let m = 1; m <= 12; m++) {
      const r = byYearMonth.get(`${y}-${m}`);
      if (r != null && Number.isFinite(r)) {
        cum *= 1 + r;
        hasAny = true;
      }
    }
    if (hasAny) yearTotal[y] = cum - 1;
  }

  return (
    <div className="p-2 overflow-x-auto">
      <table className="text-[10px] w-full">
        <thead>
          <tr className="text-slate-500">
            <th className="px-1 py-1 text-left font-normal">An</th>
            {months.map((m) => (
              <th key={m} className="px-1 py-1 text-center font-normal w-9">{m}</th>
            ))}
            <th className="px-1 py-1 text-center font-normal w-12">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td className="px-1 py-0.5 font-mono text-slate-400">{y}</td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const ret = byYearMonth.get(`${y}-${m}`);
                return (
                  <td key={m} className="px-0.5 py-0.5">
                    <div
                      className={`rounded text-center py-1 font-mono tabular-nums ${cellColor(ret)}`}
                      title={ret != null ? `${y}-${String(m).padStart(2, "0")} : ${fmtPct(ret)}` : "—"}
                    >
                      {ret != null ? (ret * 100).toFixed(1) : "—"}
                    </div>
                  </td>
                );
              })}
              <td className="px-0.5 py-0.5">
                <div
                  className={`rounded text-center py-1 font-mono tabular-nums font-semibold ${cellColor(yearTotal[y])}`}
                >
                  {yearTotal[y] != null ? fmtPctRaw(yearTotal[y] * 100, 1) : "—"}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── DRAWDOWN ────────────────────────────────────────────────────────

function DrawdownPanel({
  series,
  worst,
  full = false,
}: {
  series: Array<{ date: string; drawdown: number }>;
  worst: Array<{ peakDate: string; troughDate: string; drawdown: number; days: number }>;
  full?: boolean;
}) {
  if (series.length === 0) {
    return <EmptyMessage>Pas d&apos;historique.</EmptyMessage>;
  }
  return (
    <div className="p-2">
      <div className={full ? "h-64" : "h-32"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              domain={["dataMin", 0]}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                fontSize: 11,
              }}
              formatter={(v) => fmtPct(Number(v))}
              labelStyle={{ color: "#cbd5e1" }}
            />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke="#f87171"
              strokeWidth={1}
              fill="url(#ddGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {worst.length > 0 && (
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
              <th className="px-2 py-1 text-left">Pic</th>
              <th className="px-2 py-1 text-left">Creux</th>
              <th className="px-2 py-1 text-right">DD</th>
              <th className="px-2 py-1 text-right">Durée</th>
            </tr>
          </thead>
          <tbody>
            {worst.map((dd, i) => (
              <tr key={`${dd.peakDate}-${i}`} className="border-b border-slate-800 last:border-0">
                <td className="px-2 py-1 font-mono text-slate-300">{dd.peakDate}</td>
                <td className="px-2 py-1 font-mono text-slate-300">{dd.troughDate}</td>
                <td className="px-2 py-1 text-right font-mono text-red-400">{fmtPct(dd.drawdown)}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-400">{dd.days} j</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── ISSUER BONDS ─────────────────────────────────────────────────────

function IssuerBondsTable({ bonds }: { bonds: ListedBond[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
          <th className="px-3 py-1.5 text-left">ISIN</th>
          <th className="px-2 py-1.5 text-left">Nom</th>
          <th className="px-2 py-1.5 text-right">Coupon</th>
          <th className="px-2 py-1.5 text-right">Échéance</th>
          <th className="px-2 py-1.5 text-right">Encours</th>
        </tr>
      </thead>
      <tbody>
        {bonds.map((b) => (
          <tr key={b.isin} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
            <td className="px-3 py-1.5">
              <Link
                href={`/obligation/${b.isin}`}
                className="font-mono text-slate-200 hover:text-blue-300"
              >
                {b.isin}
              </Link>
            </td>
            <td className="px-2 py-1.5 text-slate-400 truncate max-w-[200px]">{b.name}</td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
              {fmtPctRaw(b.couponRate * 100)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono text-slate-400">{b.maturityDate}</td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
              {fmtFCFA(b.outstanding)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── NEWS ─────────────────────────────────────────────────────────────

function NewsList({ items, full = false }: { items: NewsItem[]; full?: boolean }) {
  if (items.length === 0) {
    return <EmptyMessage>Aucune actualité.</EmptyMessage>;
  }
  return (
    <ul className={`divide-y divide-slate-800 ${full ? "" : "max-h-96 overflow-y-auto"}`}>
      {items.map((n, i) => (
        <li key={`${n.date}-${i}`} className="p-3 hover:bg-slate-800/30">
          <a
            href={n.url || "#"}
            target={n.url ? "_blank" : undefined}
            rel={n.url ? "noopener noreferrer" : undefined}
            className="text-xs text-slate-200 hover:text-blue-300 line-clamp-2"
          >
            {n.titre}
          </a>
          <div className="text-[10px] text-slate-500 mt-1 flex gap-2 flex-wrap">
            <span>{n.date}</span>
            {n.type && <span>· {n.type}</span>}
            {n.source && <span>· {n.source}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── SESSIONS ─────────────────────────────────────────────────────────

function SessionsTable({ rows }: { rows: OhlcPoint[] }) {
  if (rows.length === 0) return <EmptyMessage>Aucune séance.</EmptyMessage>;
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-800/95 backdrop-blur">
          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
            <th className="px-3 py-1.5 text-left">Date</th>
            <th className="px-2 py-1.5 text-right">Ouv</th>
            <th className="px-2 py-1.5 text-right">+ Haut</th>
            <th className="px-2 py-1.5 text-right">+ Bas</th>
            <th className="px-2 py-1.5 text-right">Clôture</th>
            <th className="px-2 py-1.5 text-right">Var %</th>
            <th className="px-2 py-1.5 text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const varPct = prev ? r.close / prev.close - 1 : null;
            return (
              <tr key={r.timestamp} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <td className="px-3 py-1 font-mono text-slate-400">
                  {new Date(r.timestamp).toISOString().slice(0, 10)}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-300">{fmtInt(r.open)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-300">{fmtInt(r.high)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-300">{fmtInt(r.low)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-200">{fmtInt(r.close)}</td>
                <td className={`px-2 py-1 text-right font-mono tabular-nums ${colorFor(varPct)}`}>{fmtPct(varPct)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-400">{fmtInt(r.volume ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RISK TABLES ──────────────────────────────────────────────────────

function RiskTable({ risk }: { risk: AdvancedStatsSnapshot["risk"] }) {
  if (!risk) {
    return <EmptyMessage>Pas assez d&apos;historique (&lt; 30 séances).</EmptyMessage>;
  }
  return (
    <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <Kpi label="VaR 95% (hist.)" value={fmtPct(-risk.varHistorical95)} />
      <Kpi label="VaR 99% (hist.)" value={fmtPct(-risk.varHistorical99)} />
      <Kpi label="VaR 95% (param.)" value={fmtPct(-risk.varParametric95)} />
      <Kpi label="VaR 99% (param.)" value={fmtPct(-risk.varParametric99)} />
      <Kpi label="CVaR 95%" value={fmtPct(-risk.cvar95)} />
      <Kpi label="CVaR 99%" value={fmtPct(-risk.cvar99)} />
      <Kpi label="Pire séance" value={fmtPct(risk.worstDay)} tone={risk.worstDay} />
      <Kpi label="Meilleure séance" value={fmtPct(risk.bestDay)} tone={risk.bestDay} />
    </div>
  );
}

function AdvancedRiskStats({
  risk,
  regression,
  descriptive,
}: {
  risk: AdvancedStatsSnapshot["risk"];
  regression: AdvancedStatsSnapshot["regression"];
  descriptive: AdvancedStatsSnapshot["descriptive"];
}) {
  return (
    <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <Kpi
        label="Sortino"
        value={risk?.sortinoRatio != null ? fmt2(risk.sortinoRatio) : "—"}
      />
      <Kpi
        label="Calmar"
        value={risk?.calmarRatio != null ? fmt2(risk.calmarRatio) : "—"}
      />
      <Kpi
        label="% séances positives"
        value={risk ? fmtPct(risk.positiveDays) : "—"}
      />
      <Kpi
        label="Downside deviation"
        value={risk ? fmtPct(risk.downsideDeviation) : "—"}
      />
      <Kpi
        label="Alpha annualisé"
        value={regression?.alpha != null ? fmtPct(regression.alpha) : "—"}
        tone={regression?.alpha}
      />
      <Kpi
        label="Beta (régr.)"
        value={regression?.beta != null ? fmt2(regression.beta) : "—"}
      />
      <Kpi
        label="R² vs BRVMC"
        value={regression?.rSquared != null ? fmt2(regression.rSquared) : "—"}
      />
      <Kpi
        label="Skewness"
        value={descriptive?.skewness != null ? fmt2(descriptive.skewness) : "—"}
      />
      <Kpi
        label="Kurtosis (excès)"
        value={descriptive?.excessKurtosis != null ? fmt2(descriptive.excessKurtosis) : "—"}
      />
      <Kpi
        label="Moyenne quotidienne"
        value={descriptive?.mean != null ? fmtPct(descriptive.mean, 3) : "—"}
      />
    </div>
  );
}

function DistributionChart({ bins }: { bins: AdvancedStatsSnapshot["histogram"] }) {
  if (bins.length === 0) {
    return <EmptyMessage>Pas assez de données.</EmptyMessage>;
  }
  return (
    <div className="h-64 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins}>
          <XAxis
            dataKey="binStart"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
          />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={28} />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              fontSize: 11,
            }}
            labelFormatter={(label) => `Bin: ${(Number(label) * 100).toFixed(2)}%`}
            formatter={(v) => [String(v), "Fréquence"]}
          />
          <Bar dataKey="count" isAnimationActive={false}>
            {bins.map((b, i) => (
              <Cell key={i} fill={b.binStart >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function NormalityPanel({
  normality,
}: {
  normality: AdvancedStatsSnapshot["normality"];
}) {
  if (!normality) {
    return <EmptyMessage>Pas assez de données.</EmptyMessage>;
  }
  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Kpi label="Jarque-Bera" value={fmt2(normality.jbStatistic)} />
        <Kpi label="p-value" value={fmt2(normality.pValue)} />
      </div>
      <div
        className={`mt-2 p-2 rounded border text-[11px] ${
          normality.isNormal5
            ? "bg-emerald-900/20 border-emerald-700/40 text-emerald-300"
            : "bg-amber-900/20 border-amber-700/40 text-amber-300"
        }`}
      >
        {normality.isNormal5
          ? "Distribution compatible avec la loi normale (p > 5%)."
          : "Distribution non-normale (p < 5%) — queues épaisses ou asymétrie."}
      </div>
    </div>
  );
}

// ─── RATIOS ───────────────────────────────────────────────────────────

function RatiosTable({ ratios }: { ratios: FundRatios[] }) {
  if (ratios.length === 0) {
    return <EmptyMessage>Aucun fondamental disponible.</EmptyMessage>;
  }
  const exercices = ratios.map((r) => r.exercice);
  const rows: Array<{ label: string; getter: (r: FundRatios) => number | null; isPct?: boolean; isCurrency?: boolean }> = [
    { label: "Chiffre d'affaires", getter: (r) => r.ca, isCurrency: true },
    { label: "Résultat net", getter: (r) => r.resultatNet, isCurrency: true },
    { label: "Total actif", getter: (r) => r.totalActif, isCurrency: true },
    { label: "Capitaux propres", getter: (r) => r.capitauxPropres, isCurrency: true },
    { label: "Marge nette", getter: (r) => r.margeNette, isPct: true },
    { label: "Marge opérationnelle", getter: (r) => r.margeOperationnelle, isPct: true },
    { label: "ROE", getter: (r) => r.roe, isPct: true },
    { label: "ROA", getter: (r) => r.roa, isPct: true },
    { label: "Gearing", getter: (r) => r.gearing, isPct: true },
    { label: "Autonomie financière", getter: (r) => r.autonomieFinanciere, isPct: true },
    { label: "Solvabilité", getter: (r) => r.solvabilite, isPct: true },
    { label: "Capi. boursière", getter: (r) => r.capiBoursiere, isCurrency: true },
    { label: "DPA", getter: (r) => r.dpa, isCurrency: true },
  ];
  return (
    <div className="max-h-[500px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-800/95 backdrop-blur">
          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
            <th className="px-3 py-1.5 text-left">Indicateur</th>
            {exercices.map((y) => (
              <th key={y} className="px-2 py-1.5 text-right font-mono">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-800 last:border-0">
              <td className="px-3 py-1 text-slate-400">{row.label}</td>
              {ratios.map((r) => {
                const v = row.getter(r);
                return (
                  <td key={r.exercice} className="px-2 py-1 text-right font-mono tabular-nums text-slate-200">
                    {v == null
                      ? "—"
                      : row.isPct
                        ? fmtPct(v)
                        : row.isCurrency
                          ? fmtFCFA(v)
                          : fmt2(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatementTable({
  rows,
  years,
}: {
  rows: StatementLine[];
  years: number[];
}) {
  if (rows.length === 0) return <EmptyMessage>Aucune donnée.</EmptyMessage>;
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-800/95 backdrop-blur">
          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700">
            <th className="px-3 py-1.5 text-left">Ligne</th>
            {years.map((y) => (
              <th key={y} className="px-2 py-1.5 text-right font-mono">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.codePoste}-${idx}`} className="border-b border-slate-800 last:border-0">
              <td className="px-3 py-1 text-slate-400 truncate max-w-[280px]">{row.libelle}</td>
              {years.map((y) => (
                <td key={y} className="px-2 py-1 text-right font-mono tabular-nums text-slate-200">
                  {fmtFCFA(row.values[y])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
