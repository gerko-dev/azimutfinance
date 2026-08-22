"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  Bar,
  ComposedChart,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { Quadrant } from "@/lib/stockStats";

// ════════════════════════════════════════════════════════════════════════
// ProStatsTab — onglet "Statistiques" du Pro Terminal.
// Tout est recalculé CÔTÉ CLIENT à partir de l'historique de cours, pour que
// l'utilisateur puisse changer la fenêtre d'analyse, le niveau de confiance
// VaR, la fenêtre de volatilité glissante, le nombre de bins, etc. et voir
// les résultats se mettre à jour instantanément.
// ════════════════════════════════════════════════════════════════════════

type PricePoint = { date: string; value: number };

type Props = {
  ticker: string;
  priceHistory: PricePoint[];
  brvmcHistory: PricePoint[];
  quadrant: Quadrant | null;
};

const TRADING_DAYS = 252;

const PERIODS = ["3M", "6M", "YTD", "1A", "3A", "5A", "Max"] as const;
type Period = (typeof PERIODS)[number];

const VAR_CONFS = [90, 95, 97.5, 99] as const;
type VarConf = (typeof VAR_CONFS)[number];

const ROLL_WINDOWS = [20, 30, 60, 90] as const;
const BIN_CHOICES = [15, 20, 30, 50] as const;

type ChartView =
  | "cumulative"
  | "rolling"
  | "drawdown"
  | "histogram"
  | "qq"
  | "scatter";

const CHART_VIEWS: { id: ChartView; label: string }[] = [
  { id: "cumulative", label: "Performance cumulée" },
  { id: "rolling", label: "Volatilité glissante" },
  { id: "drawdown", label: "Drawdown" },
  { id: "histogram", label: "Distribution" },
  { id: "qq", label: "Q-Q plot" },
  { id: "scatter", label: "Régression BRVMC" },
];

const QUADRANT_BADGE: Record<
  Quadrant,
  { emoji: string; name: string; desc: string; cls: string }
> = {
  cashcow: {
    emoji: "🎯",
    name: "Cash cow",
    desc: "Rendement élevé pour une volatilité faible.",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  hiddengem: {
    emoji: "💎",
    name: "Hidden gem",
    desc: "Rendement élevé mais volatilité élevée.",
    cls: "bg-purple-500/15 text-purple-300 border-purple-500/40",
  },
  defensive: {
    emoji: "🛡️",
    name: "Defensive",
    desc: "Rendement faible et volatilité faible.",
    cls: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  },
  speculative: {
    emoji: "⚡",
    name: "Spéculative",
    desc: "Rendement faible et volatilité élevée.",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
};

const MONTH_LABELS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

// ─── Formatters ──────────────────────────────────────────────────────────
const fmtPct = (v: number | null, d = 2) =>
  v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d).replace(".", ",")}%`;
const fmtPctSigned = (v: number | null, d = 2) => {
  if (v == null || !isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`;
};
const fmtNum = (v: number | null, d = 2) =>
  v == null || !isFinite(v) ? "—" : v.toFixed(d).replace(".", ",");
const colorOf = (v: number | null) =>
  v == null || !isFinite(v) || v === 0
    ? "text-slate-300"
    : v > 0
      ? "text-emerald-400"
      : "text-red-400";

// ─── Math ────────────────────────────────────────────────────────────────
function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}
function variance(a: number[], m = mean(a)): number {
  if (a.length < 2) return NaN;
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
}
function std(a: number[]): number {
  return Math.sqrt(variance(a));
}
/** Quantile (interpolation linéaire) sur un tableau trié ascendant. */
function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}
function skewness(a: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const m = mean(a);
  const s = std(a);
  if (!isFinite(s) || s === 0) return NaN;
  return (n / ((n - 1) * (n - 2))) * a.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0);
}
function excessKurtosis(a: number[]): number {
  const n = a.length;
  if (n < 4) return NaN;
  const m = mean(a);
  const s = std(a);
  if (!isFinite(s) || s === 0) return NaN;
  const t = a.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * t -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}
function normPdf(x: number, mu: number, sd: number): number {
  return Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}
/** Inverse de la CDF normale standard (approximation d'Acklam). */
function invNorm(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function cutoffFor(period: Period, lastDate: string): string {
  if (period === "Max") return "";
  const d = new Date(lastDate + "T00:00:00Z");
  if (period === "YTD") return `${d.getUTCFullYear() - 1}-12-31`;
  switch (period) {
    case "3M": d.setUTCMonth(d.getUTCMonth() - 3); break;
    case "6M": d.setUTCMonth(d.getUTCMonth() - 6); break;
    case "1A": d.setUTCFullYear(d.getUTCFullYear() - 1); break;
    case "3A": d.setUTCFullYear(d.getUTCFullYear() - 3); break;
    case "5A": d.setUTCFullYear(d.getUTCFullYear() - 5); break;
  }
  return d.toISOString().slice(0, 10);
}

type ReturnPoint = { date: string; r: number; value: number };

function logReturns(points: PricePoint[]): ReturnPoint[] {
  const out: ReturnPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1].value;
    const p1 = points[i].value;
    if (p0 > 0 && p1 > 0) out.push({ date: points[i].date, r: Math.log(p1 / p0), value: p1 });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
export default function ProStatsTab({
  ticker,
  priceHistory,
  brvmcHistory,
  quadrant,
}: Props) {
  const [period, setPeriod] = useState<Period>("1A");
  const [varConf, setVarConf] = useState<VarConf>(95);
  const [rollWindow, setRollWindow] = useState<number>(30);
  const [bins, setBins] = useState<number>(30);
  const [view, setView] = useState<ChartView>("cumulative");
  const [showBench, setShowBench] = useState(true);

  // ─── Fenêtre d'analyse ────────────────────────────────────────────────
  const windowed = useMemo(() => {
    if (priceHistory.length === 0) return [];
    const last = priceHistory[priceHistory.length - 1].date;
    const cut = cutoffFor(period, last);
    return cut ? priceHistory.filter((p) => p.date >= cut) : priceHistory;
  }, [priceHistory, period]);

  const rets = useMemo(() => logReturns(windowed), [windowed]);
  const rValues = useMemo(() => rets.map((x) => x.r), [rets]);
  const sortedR = useMemo(() => [...rValues].sort((a, b) => a - b), [rValues]);

  // ─── Statistiques descriptives ────────────────────────────────────────
  const stats = useMemo(() => {
    const n = rValues.length;
    if (n < 2) return null;
    const m = mean(rValues);
    const sd = std(rValues);
    const annRet = m * TRADING_DAYS;
    const annVol = sd * Math.sqrt(TRADING_DAYS);
    const downside = rValues.filter((r) => r < 0);
    const downDev = downside.length
      ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) * Math.sqrt(TRADING_DAYS)
      : 0;
    return {
      n,
      mean: m,
      median: quantileSorted(sortedR, 0.5),
      std: sd,
      annRet,
      annVol,
      skew: skewness(rValues),
      kurt: excessKurtosis(rValues),
      min: sortedR[0],
      max: sortedR[sortedR.length - 1],
      q1: quantileSorted(sortedR, 0.25),
      q3: quantileSorted(sortedR, 0.75),
      sharpe: annVol > 0 ? annRet / annVol : null,
      sortino: downDev > 0 ? annRet / downDev : null,
      downDev,
      positiveDays: rValues.filter((r) => r > 0).length / n,
      avgPositive: mean(rValues.filter((r) => r > 0)),
      avgNegative: mean(rValues.filter((r) => r < 0)),
    };
  }, [rValues, sortedR]);

  // ─── Cumul / drawdown sur la fenêtre ──────────────────────────────────
  const cumulative = useMemo(() => {
    if (windowed.length === 0) return { series: [], totalReturn: null, maxDD: null };
    const base = windowed[0].value;
    const benchMap = new Map(brvmcHistory.map((p) => [p.date, p.value]));
    // Première valeur du benchmark à/avant la date de départ
    let benchBase: number | null = null;
    for (const p of brvmcHistory) {
      if (p.date <= windowed[0].date) benchBase = p.value;
      else break;
    }
    let peak = -Infinity;
    let maxDD = 0;
    const series = windowed.map((p) => {
      const stockIdx = base > 0 ? (p.value / base) * 100 : 100;
      if (p.value > peak) peak = p.value;
      const dd = peak > 0 ? p.value / peak - 1 : 0;
      if (dd < maxDD) maxDD = dd;
      const bv = benchMap.get(p.date);
      const benchIdx =
        benchBase && benchBase > 0 && bv !== undefined ? (bv / benchBase) * 100 : null;
      return { date: p.date, stock: stockIdx, bench: benchIdx, drawdown: dd };
    });
    const totalReturn = base > 0 ? windowed[windowed.length - 1].value / base - 1 : null;
    return { series, totalReturn, maxDD };
  }, [windowed, brvmcHistory]);

  // ─── Volatilité glissante ─────────────────────────────────────────────
  const rollingVol = useMemo(() => {
    if (rets.length < rollWindow) return [];
    const out: { date: string; vol: number }[] = [];
    for (let i = rollWindow; i <= rets.length; i++) {
      const slice = rValues.slice(i - rollWindow, i);
      out.push({ date: rets[i - 1].date, vol: std(slice) * Math.sqrt(TRADING_DAYS) });
    }
    return out;
  }, [rets, rValues, rollWindow]);

  // ─── VaR / CVaR au niveau de confiance choisi ─────────────────────────
  const risk = useMemo(() => {
    if (!stats || sortedR.length < 5) return null;
    const alpha = 1 - varConf / 100; // ex 0.05
    const hVaR = quantileSorted(sortedR, alpha); // négatif
    const z = invNorm(alpha);
    const pVaR = stats.mean + z * stats.std; // négatif
    const tail = sortedR.filter((r) => r <= hVaR);
    const cvar = tail.length ? mean(tail) : hVaR;
    const calmar = cumulative.maxDD && cumulative.maxDD < 0 ? stats.annRet / Math.abs(cumulative.maxDD) : null;
    return {
      hVaR: -hVaR,
      pVaR: -pVaR,
      cvar: -cvar,
      calmar,
    };
  }, [stats, sortedR, varConf, cumulative.maxDD]);

  // ─── Histogramme (bins ajustables) + densité normale ──────────────────
  const histogram = useMemo(() => {
    if (!stats || rValues.length < 10) return [];
    const lo = stats.min;
    const hi = stats.max;
    const width = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const r of rValues) {
      let idx = Math.floor((r - lo) / width);
      if (idx < 0) idx = 0;
      if (idx >= bins) idx = bins - 1;
      counts[idx]++;
    }
    const n = rValues.length;
    return counts.map((c, i) => {
      const mid = lo + (i + 0.5) * width;
      return {
        mid,
        density: c / (n * width),
        normal: normPdf(mid, stats.mean, stats.std),
      };
    });
  }, [stats, rValues, bins]);

  // ─── Q-Q plot ─────────────────────────────────────────────────────────
  const qq = useMemo(() => {
    if (!stats || sortedR.length < 10) return [];
    const n = sortedR.length;
    return sortedR.map((obs, i) => ({
      theoretical: stats.mean + stats.std * invNorm((i + 0.5) / n),
      observed: obs,
    }));
  }, [stats, sortedR]);

  // ─── Régression vs BRVMC (alignée par date) ───────────────────────────
  const regression = useMemo(() => {
    if (rets.length < 10) return null;
    const benchRets = logReturns(
      brvmcHistory.filter((p) => windowed.length > 0 && p.date >= windowed[0].date),
    );
    const benchByDate = new Map(benchRets.map((x) => [x.date, x.r]));
    const xs: number[] = [];
    const ys: number[] = [];
    const points: { x: number; y: number }[] = [];
    for (const s of rets) {
      const bx = benchByDate.get(s.date);
      if (bx !== undefined) {
        xs.push(bx);
        ys.push(s.r);
        points.push({ x: bx, y: s.r });
      }
    }
    if (xs.length < 10) return null;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - mx) * (ys[i] - my);
      vx += (xs[i] - mx) ** 2;
      vy += (ys[i] - my) ** 2;
    }
    const beta = vx > 0 ? cov / vx : NaN;
    const alpha = (my - beta * mx) * TRADING_DAYS;
    const corr = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN;
    const r2 = isFinite(corr) ? corr * corr : NaN;
    // Tracking error : volatilité annualisée de (stock - bench)
    const diffs = xs.map((x, i) => ys[i] - x);
    const te = std(diffs) * Math.sqrt(TRADING_DAYS);
    // Up / down capture
    const up = { s: 0, b: 0 };
    const down = { s: 0, b: 0 };
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] > 0) { up.s += ys[i]; up.b += xs[i]; }
      else if (xs[i] < 0) { down.s += ys[i]; down.b += xs[i]; }
    }
    return {
      beta,
      alpha,
      corr,
      r2,
      te,
      n: xs.length,
      upCapture: up.b !== 0 ? up.s / up.b : NaN,
      downCapture: down.b !== 0 ? down.s / down.b : NaN,
      points,
      mx,
      my,
    };
  }, [rets, brvmcHistory, windowed]);

  // ─── Heatmap mensuelle (historique complet, indépendant de la fenêtre) ─
  const heatmap = useMemo(() => {
    // dernier cours de chaque mois
    const monthLast = new Map<string, number>();
    for (const p of priceHistory) {
      monthLast.set(p.date.slice(0, 7), p.value); // p trié asc → garde le dernier
    }
    const keys = [...monthLast.keys()].sort();
    const grid: Record<number, Record<number, number>> = {};
    for (let i = 1; i < keys.length; i++) {
      const [y, m] = keys[i].split("-").map(Number);
      const prev = monthLast.get(keys[i - 1])!;
      const cur = monthLast.get(keys[i])!;
      if (prev > 0 && cur > 0) {
        if (!grid[y]) grid[y] = {};
        grid[y][m] = cur / prev - 1;
      }
    }
    const years = Object.keys(grid).map(Number).sort((a, b) => b - a);
    const yearTotal: Record<number, number> = {};
    for (const y of years) {
      let prod = 1;
      for (let mo = 1; mo <= 12; mo++) if (grid[y][mo] !== undefined) prod *= 1 + grid[y][mo];
      yearTotal[y] = prod - 1;
    }
    return { years, grid, yearTotal };
  }, [priceHistory]);

  const rangeLabel = useMemo(() => {
    if (windowed.length === 0) return "—";
    const f = windowed[0].date;
    const l = windowed[windowed.length - 1].date;
    return `${f} → ${l}`;
  }, [windowed]);

  if (!stats) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-10 text-center text-slate-400">
        <div className="text-4xl mb-3">📈</div>
        <h3 className="text-lg font-medium text-slate-200 mb-2">
          Historique insuffisant
        </h3>
        <p className="text-sm max-w-md mx-auto">
          {ticker} ne dispose pas d&apos;assez d&apos;observations sur cette
          période pour calculer les statistiques. Essayez une fenêtre plus
          large.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── BARRE DE CONTRÔLE STICKY ───────────────────────────────── */}
      <div className="sticky top-[5.5rem] z-10 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-700 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
              Fenêtre
            </span>
            {PERIODS.map((p) => (
              <Segment key={p} active={period === p} onClick={() => setPeriod(p)}>
                {p}
              </Segment>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {quadrant && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded border ${QUADRANT_BADGE[quadrant].cls}`}
                title={QUADRANT_BADGE[quadrant].desc}
              >
                {QUADRANT_BADGE[quadrant].emoji} {QUADRANT_BADGE[quadrant].name}
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
              {stats.n} obs · {rangeLabel}
            </span>
          </div>
        </div>

        {/* KPI live — se recalculent avec la fenêtre */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <MiniKpi label="Perf. période" value={fmtPctSigned(cumulative.totalReturn)} tone={cumulative.totalReturn} />
          <MiniKpi label="Vol. ann." value={fmtPct(stats.annVol, 1)} />
          <MiniKpi label="Sharpe" value={fmtNum(stats.sharpe)} tone={stats.sharpe} />
          <MiniKpi label="Max DD" value={fmtPct(cumulative.maxDD)} tone={cumulative.maxDD} />
          <MiniKpi label="Beta" value={fmtNum(regression?.beta ?? null)} />
          <MiniKpi label={`VaR ${varConf}%`} value={risk ? `-${fmtPct(risk.hVaR)}` : "—"} tone={-1} />
        </div>
      </div>

      {/* ─── GRAPHIQUE INTERACTIF MULTI-VUES ────────────────────────── */}
      <Panel
        title="Analyse graphique"
        subtitle={CHART_VIEWS.find((v) => v.id === view)?.label}
      >
        <div className="p-3 space-y-3">
          {/* Sélecteur de vue */}
          <div className="flex flex-wrap gap-1.5">
            {CHART_VIEWS.map((v) => (
              <Segment key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </Segment>
            ))}
          </div>

          {/* Contrôles contextuels */}
          {view === "cumulative" && (
            <button
              type="button"
              onClick={() => setShowBench((s) => !s)}
              aria-pressed={showBench}
              className={`text-[11px] px-2 py-1 rounded border transition inline-flex items-center gap-1.5 ${
                showBench
                  ? "border-blue-500/40 bg-blue-600/20 text-blue-300"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: showBench ? "#fbbf24" : "#475569" }} />
              Comparer au BRVM Composite
            </button>
          )}
          {view === "rolling" && (
            <ControlRow label="Fenêtre glissante (séances)">
              {ROLL_WINDOWS.map((w) => (
                <Segment key={w} active={rollWindow === w} onClick={() => setRollWindow(w)}>
                  {w}
                </Segment>
              ))}
            </ControlRow>
          )}
          {view === "histogram" && (
            <ControlRow label="Nombre de classes">
              {BIN_CHOICES.map((b) => (
                <Segment key={b} active={bins === b} onClick={() => setBins(b)}>
                  {b}
                </Segment>
              ))}
            </ControlRow>
          )}

          {/* Rendu de la vue */}
          <div className="h-[360px]">
            {view === "cumulative" && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulative.series}>
                  <defs>
                    <linearGradient id="proStockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={fmtAxisDate} minTickGap={40} />
                  <YAxis stroke="#64748b" fontSize={11} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(0)} />
                  <Tooltip {...darkTooltip} formatter={(v, n) => [Number(v).toFixed(2), n === "stock" ? ticker : "BRVMC"]} labelFormatter={fmtAxisDate} />
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="2 4" />
                  <Area type="monotone" dataKey="stock" stroke="#60a5fa" strokeWidth={2} fill="url(#proStockGrad)" isAnimationActive={false} />
                  {showBench && (
                    <Area type="monotone" dataKey="bench" stroke="#fbbf24" strokeWidth={1.4} fill="none" dot={false} connectNulls isAnimationActive={false} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}

            {view === "rolling" &&
              (rollingVol.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rollingVol}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={fmtAxisDate} minTickGap={40} />
                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                    <Tooltip {...darkTooltip} formatter={(v) => [fmtPct(Number(v), 1), `Vol. ${rollWindow}j ann.`]} labelFormatter={fmtAxisDate} />
                    {stats && <ReferenceLine y={stats.annVol} stroke="#f87171" strokeDasharray="4 3" label={{ value: "moyenne période", fill: "#f87171", fontSize: 10, position: "insideTopRight" }} />}
                    <Line type="monotone" dataKey="vol" stroke="#34d399" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty>Pas assez de séances pour une fenêtre de {rollWindow}.</ChartEmpty>
              ))}

            {view === "drawdown" && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulative.series}>
                  <defs>
                    <linearGradient id="proDdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={fmtAxisDate} minTickGap={40} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} domain={["auto", 0]} />
                  <Tooltip {...darkTooltip} formatter={(v) => [fmtPct(Number(v)), "Drawdown"]} labelFormatter={fmtAxisDate} />
                  <Area type="monotone" dataKey="drawdown" stroke="#f87171" strokeWidth={1.4} fill="url(#proDdGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {view === "histogram" && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="mid" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip {...darkTooltip} formatter={(v, n) => [Number(v).toFixed(2), n === "density" ? "Densité observée" : "Densité normale"]} labelFormatter={(v) => `Rendement ${(Number(v) * 100).toFixed(2)}%`} />
                  <ReferenceLine x={0} stroke="#475569" />
                  {risk && <ReferenceLine x={-risk.hVaR} stroke="#f87171" strokeDasharray="4 3" label={{ value: `VaR ${varConf}%`, fill: "#f87171", fontSize: 10, position: "insideTopLeft" }} />}
                  <Bar dataKey="density" fill="#60a5fa" fillOpacity={0.55} isAnimationActive={false} name="density" />
                  <Line type="monotone" dataKey="normal" stroke="#f87171" strokeWidth={2} dot={false} isAnimationActive={false} name="normal" />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {view === "qq" &&
              (qq.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" dataKey="theoretical" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} name="Théorique" />
                    <YAxis type="number" dataKey="observed" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} name="Observé" />
                    <Tooltip {...darkTooltip} cursor={{ strokeDasharray: "3 3", stroke: "#475569" }} formatter={(v, n) => [`${(Number(v) * 100).toFixed(2)}%`, n === "observed" ? "Observé" : "Théorique"]} />
                    <ReferenceLine
                      segment={[
                        { x: qq[0].theoretical, y: qq[0].theoretical },
                        { x: qq[qq.length - 1].theoretical, y: qq[qq.length - 1].theoretical },
                      ]}
                      stroke="#f87171"
                      strokeWidth={1.5}
                    />
                    <Scatter data={qq} fill="#60a5fa" fillOpacity={0.7} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty>Pas assez d&apos;observations.</ChartEmpty>
              ))}

            {view === "scatter" &&
              (regression ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" dataKey="x" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} name="BRVMC" />
                    <YAxis type="number" dataKey="y" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} name={ticker} />
                    <Tooltip {...darkTooltip} cursor={{ strokeDasharray: "3 3", stroke: "#475569" }} formatter={(v, n) => [`${(Number(v) * 100).toFixed(2)}%`, n === "y" ? ticker : "BRVMC"]} />
                    <ReferenceLine x={0} stroke="#475569" />
                    <ReferenceLine y={0} stroke="#475569" />
                    {(() => {
                      const xMin = Math.min(...regression.points.map((p) => p.x));
                      const xMax = Math.max(...regression.points.map((p) => p.x));
                      const a = regression.my - regression.beta * regression.mx;
                      return (
                        <ReferenceLine
                          segment={[
                            { x: xMin, y: a + regression.beta * xMin },
                            { x: xMax, y: a + regression.beta * xMax },
                          ]}
                          stroke="#fbbf24"
                          strokeWidth={1.8}
                        />
                      );
                    })()}
                    <Scatter data={regression.points} fill="#60a5fa" fillOpacity={0.55} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty>Données BRVMC insuffisantes pour la régression.</ChartEmpty>
              ))}
          </div>
        </div>
      </Panel>

      {/* ─── DESCRIPTIVES + RISQUE ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Distribution des rendements" subtitle="quotidiens, log-returns">
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat label="Observations" value={String(stats.n)} />
            <Stat label="Moy. quotidienne" value={fmtPctSigned(stats.mean, 3)} tone={stats.mean} />
            <Stat label="Médiane" value={fmtPctSigned(stats.median, 3)} tone={stats.median} />
            <Stat label="Écart-type" value={fmtPct(stats.std, 3)} />
            <Stat label="Moy. annualisée" value={fmtPctSigned(stats.annRet, 1)} tone={stats.annRet} />
            <Stat label="Vol. annualisée" value={fmtPct(stats.annVol, 1)} />
            <Stat label="Skewness" value={fmtNum(stats.skew)} hint={stats.skew < -0.5 ? "queue à gauche" : stats.skew > 0.5 ? "queue à droite" : "quasi-symétrique"} />
            <Stat label="Excess kurtosis" value={fmtNum(stats.kurt)} hint={stats.kurt > 1 ? "queues épaisses" : stats.kurt < -0.5 ? "queues fines" : "≈ normale"} />
            <Stat label="Pire séance" value={fmtPctSigned(stats.min, 2)} tone={-1} />
            <Stat label="Meilleure séance" value={fmtPctSigned(stats.max, 2)} tone={1} />
            <Stat label="1er quartile" value={fmtPctSigned(stats.q1, 2)} />
            <Stat label="3e quartile" value={fmtPctSigned(stats.q3, 2)} />
          </div>
        </Panel>

        <Panel
          title="Risque"
          subtitle="VaR / Expected Shortfall"
          right={
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 mr-0.5">Conf.</span>
              {VAR_CONFS.map((c) => (
                <Segment key={c} active={varConf === c} onClick={() => setVarConf(c)} small>
                  {c}%
                </Segment>
              ))}
            </div>
          }
        >
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat label={`VaR ${varConf}% (hist.)`} value={risk ? `-${fmtPct(risk.hVaR, 2)}` : "—"} tone={-1} hint="perte max 1 séance" />
            <Stat label={`VaR ${varConf}% (param.)`} value={risk ? `-${fmtPct(risk.pVaR, 2)}` : "—"} hint="hypothèse normale" />
            <Stat label={`CVaR ${varConf}%`} value={risk ? `-${fmtPct(risk.cvar, 2)}` : "—"} tone={-1} hint="Expected Shortfall" />
            <Stat label="Sharpe" value={fmtNum(stats.sharpe)} tone={stats.sharpe} />
            <Stat label="Sortino" value={fmtNum(stats.sortino)} tone={stats.sortino} hint="risque baissier seul" />
            <Stat label="Calmar" value={fmtNum(risk?.calmar ?? null)} tone={risk?.calmar ?? null} hint="rdt / max DD" />
            <Stat label="% séances +" value={fmtPct(stats.positiveDays, 1)} />
            <Stat label="Hausse moy." value={fmtPct(stats.avgPositive, 2)} tone={1} />
            <Stat label="Baisse moy." value={fmtPct(stats.avgNegative, 2)} tone={-1} />
          </div>
        </Panel>
      </div>

      {/* ─── RÉGRESSION ──────────────────────────────────────────────── */}
      {regression && (
        <Panel title="Régression vs BRVM Composite" subtitle={`${regression.n} séances appariées`}>
          <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Beta" value={fmtNum(regression.beta)} hint={regression.beta > 1.1 ? "plus volatile" : regression.beta < 0.9 ? "plus stable" : "aligné marché"} />
            <Stat label="Alpha (ann.)" value={fmtPctSigned(regression.alpha, 2)} tone={regression.alpha} hint="surperf. résiduelle" />
            <Stat label="R²" value={fmtPct(regression.r2, 1)} hint="variance expliquée" />
            <Stat label="Corrélation" value={fmtNum(regression.corr)} />
            <Stat label="Tracking error" value={fmtPct(regression.te, 2)} hint="écart annualisé" />
            <Stat label="Up-capture" value={fmtPct(regression.upCapture, 0)} tone={regression.upCapture > 1 ? 1 : 0} />
            <Stat label="Down-capture" value={fmtPct(regression.downCapture, 0)} tone={regression.downCapture < 1 ? 1 : -1} />
            <Stat label="Capture spread" value={fmtPctSigned(regression.upCapture - regression.downCapture, 0)} tone={regression.upCapture - regression.downCapture} />
          </div>
        </Panel>
      )}

      {/* ─── HEATMAP MENSUELLE INTERACTIVE ───────────────────────────── */}
      {heatmap.years.length > 0 && (
        <Panel title="Rendements mensuels" subtitle="historique complet · survol pour le détail">
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left px-2 py-1 font-medium">Année</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="text-center px-1 py-1 font-medium min-w-[42px]">{m}</th>
                  ))}
                  <th className="text-right px-2 py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.years.map((y) => (
                  <tr key={y}>
                    <td className="px-2 py-0.5 font-mono font-medium text-slate-300">{y}</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
                      const r = heatmap.grid[y][mo];
                      return (
                        <td key={mo} className="px-0.5 py-0.5 text-center" title={r !== undefined ? `${MONTH_LABELS[mo - 1]} ${y} : ${fmtPctSigned(r, 2)}` : "—"}>
                          {r !== undefined ? (
                            <span
                              className="inline-block w-full px-1 py-0.5 rounded font-mono text-white/90 transition hover:ring-1 hover:ring-white/40"
                              style={{ backgroundColor: heatColor(r) }}
                            >
                              {fmtPctSigned(r, 1)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-right">
                      <span className="inline-block px-2 py-0.5 rounded font-mono font-semibold text-white/90" style={{ backgroundColor: heatColor(heatmap.yearTotal[y]) }}>
                        {fmtPctSigned(heatmap.yearTotal[y], 1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-[11px] text-slate-500">
        Toutes les métriques sont recalculées en direct sur la fenêtre
        sélectionnée ({stats.n} séances, base 252 j/an, taux sans risque = 0).
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS UI
// ════════════════════════════════════════════════════════════════════════
const darkTooltip = {
  contentStyle: {
    backgroundColor: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#e2e8f0",
  },
} as const;

function fmtAxisDate(d: unknown): string {
  if (typeof d !== "string") return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

/** Couleur (hex) pour la heatmap mensuelle, clampée à ±10%. */
function heatColor(r: number): string {
  if (!isFinite(r) || r === 0) return "#334155";
  const t = Math.min(1, Math.abs(r) / 0.1);
  if (r > 0) {
    // slate → emerald
    const g = Math.round(60 + t * 120);
    return `rgba(16, ${g + 40}, 90, ${0.35 + t * 0.55})`;
  }
  return `rgba(${Math.round(180 + t * 60)}, 50, 60, ${0.35 + t * 0.55})`;
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </h3>
        {subtitle && <span className="text-[10px] text-slate-500 truncate min-w-0">· {subtitle}</span>}
        {right && <div className="ml-auto shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Segment({
  active,
  onClick,
  small = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} rounded border transition whitespace-nowrap ${
        active
          ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
          : "border-slate-700 text-slate-400 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-md px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className={`text-sm font-mono font-semibold mt-0.5 ${colorOf(tone === undefined ? null : tone)}`}>
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: number | null;
}) {
  return (
    <div className="bg-slate-900/50 rounded-md border border-slate-700 p-2.5">
      <div className="text-[11px] text-slate-500 truncate" title={label}>{label}</div>
      <div className={`text-sm font-mono font-semibold mt-0.5 ${tone === undefined ? "text-slate-100" : colorOf(tone)}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-500">
      {children}
    </div>
  );
}
