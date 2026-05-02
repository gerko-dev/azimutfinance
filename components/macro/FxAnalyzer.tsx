"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { FxSlug, ReturnHorizon } from "@/lib/fx";

type StatRow = {
  slug: FxSlug;
  pair: string;
  name: string;
  category: string;
  unitSuffix: string;
  decimals: number;
  color: string;
  last: number;
  lastDate: string;
  changeDayPct: number | null;
  returns: Record<ReturnHorizon, number | null>;
  volatility1Y: number | null;
  drawdownFromHigh5Y: number | null;
  high52w: number | null;
  low52w: number | null;
  zScore1Y: number | null;
};

type Period = "1M" | "3M" | "6M" | "YTD" | "1A" | "3A" | "5A" | "MAX";

type NormalizedSnapshot = {
  period: Period;
  points: { date: string; [key: string]: number | string }[];
  bases: Record<string, number>;
};

type CorrelationSnapshot = {
  period: Period;
  matrix: (number | null)[][];
  labels: string[];
  slugs: FxSlug[];
};

type CrossDataset = {
  slugs: FxSlug[];
  /** Map slug -> serie quotidienne sur chaque periode */
  byPeriod: Record<Period, { date: string; [slug: string]: number | string }[]>;
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "1M", label: "1 mois" },
  { id: "3M", label: "3 mois" },
  { id: "6M", label: "6 mois" },
  { id: "YTD", label: "YTD" },
  { id: "1A", label: "1 an" },
  { id: "3A", label: "3 ans" },
  { id: "5A", label: "5 ans" },
  { id: "MAX", label: "Max" },
];

const RETURN_HORIZONS: { id: ReturnHorizon; label: string }[] = [
  { id: "1S", label: "1 sem." },
  { id: "1M", label: "1 mois" },
  { id: "3M", label: "3 mois" },
  { id: "6M", label: "6 mois" },
  { id: "YTD", label: "YTD" },
  { id: "1A", label: "1 an" },
  { id: "3A", label: "3 ans" },
  { id: "5A", label: "5 ans" },
];

const fmtPct = (v: number | null, dec = 1) =>
  v === null || !isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

const fmtNum = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

function fmtDateFr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function correlationColor(v: number | null): string {
  if (v === null) return "#f1f5f9";
  if (v >= 0) {
    const t = Math.min(1, v);
    const r = Math.round(239 + (29 - 239) * t);
    const g = Math.round(246 + (78 - 246) * t);
    const b = Math.round(255 + (216 - 255) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = Math.min(1, -v);
    const r = Math.round(255 + (220 - 255) * t);
    const g = Math.round(246 + (38 - 246) * t);
    const b = Math.round(239 + (38 - 239) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export default function FxAnalyzer({
  initialPeriod,
  stats,
  normalizedByPeriod,
  correlationByPeriod,
  defaultSelection,
  crossData,
}: {
  initialPeriod: Period;
  stats: StatRow[];
  normalizedByPeriod: Record<Period, NormalizedSnapshot>;
  correlationByPeriod: Record<Period, CorrelationSnapshot>;
  defaultSelection: FxSlug[];
  /** Donnees brutes (close quotidien) pour chaque paire et periode, utilisees pour les cross synthetiques */
  crossData: CrossDataset;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [selected, setSelected] = useState<Set<FxSlug>>(new Set(defaultSelection));
  const [crossBase, setCrossBase] = useState<FxSlug>("GBP_XOF");
  const [crossQuote, setCrossQuote] = useState<FxSlug>("JPY_XOF");

  const normalized = normalizedByPeriod[period];
  const correlation = correlationByPeriod[period];

  const filteredPoints = useMemo(() => {
    if (!normalized) return [];
    if (selected.size === 0) return normalized.points;
    return normalized.points.map((p) => {
      const out: { date: string; [k: string]: number | string } = { date: p.date };
      for (const slug of selected) {
        if (typeof p[slug] === "number") out[slug] = p[slug] as number;
      }
      return out;
    });
  }, [normalized, selected]);

  const filteredCorrelation = useMemo(() => {
    if (!correlation) return null;
    if (selected.size === 0) return correlation;
    const keepIdx: number[] = [];
    correlation.slugs.forEach((s, i) => {
      if (selected.has(s)) keepIdx.push(i);
    });
    return {
      ...correlation,
      slugs: keepIdx.map((i) => correlation.slugs[i]),
      labels: keepIdx.map((i) => correlation.labels[i]),
      matrix: keepIdx.map((i) => keepIdx.map((j) => correlation.matrix[i][j])),
    };
  }, [correlation, selected]);

  function toggle(slug: FxSlug) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(stats.map((s) => s.slug)));
  }
  function selectNone() {
    setSelected(new Set());
  }
  function selectCategory(cat: string) {
    setSelected(new Set(stats.filter((s) => s.category === cat).map((s) => s.slug)));
  }

  // Cross-rate synthetique : derive une serie X/Y a partir des deux paires X/XOF et Y/XOF
  const crossSeries = useMemo(() => {
    const data = crossData.byPeriod[period] ?? [];
    const xofBase = crossData.slugs.includes(crossBase) ? crossBase : null;
    const xofQuote = crossData.slugs.includes(crossQuote) ? crossQuote : null;
    if (!xofBase || !xofQuote || xofBase === xofQuote) return [];
    return data
      .map((row) => {
        const a = row[xofBase];
        const b = row[xofQuote];
        if (typeof a !== "number" || typeof b !== "number" || b === 0) return null;
        return { date: row.date as string, value: a / b };
      })
      .filter((p): p is { date: string; value: number } => p !== null);
  }, [crossData, period, crossBase, crossQuote]);

  const crossStats = useMemo(() => {
    if (crossSeries.length < 2) return null;
    const first = crossSeries[0].value;
    const last = crossSeries[crossSeries.length - 1].value;
    const high = crossSeries.reduce((m, p) => Math.max(m, p.value), -Infinity);
    const low = crossSeries.reduce((m, p) => Math.min(m, p.value), Infinity);
    const ret = ((last - first) / first) * 100;
    let vol: number | null = null;
    const lr: number[] = [];
    for (let i = 1; i < crossSeries.length; i++) {
      const a = crossSeries[i - 1].value;
      const b = crossSeries[i].value;
      if (a > 0 && b > 0) lr.push(Math.log(b / a));
    }
    if (lr.length >= 10) {
      const m = lr.reduce((s, v) => s + v, 0) / lr.length;
      const va = lr.reduce((s, x) => s + (x - m) ** 2, 0) / lr.length;
      vol = Math.sqrt(va) * Math.sqrt(252) * 100;
    }
    return { first, last, high, low, ret, vol };
  }, [crossSeries]);

  const sortedStats = useMemo(() => {
    return [...stats].sort(
      (a, b) => (b.returns.YTD ?? -Infinity) - (a.returns.YTD ?? -Infinity),
    );
  }, [stats]);

  const xofPairs = stats.filter((s) => crossData.slugs.includes(s.slug));

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Bandeau de controle */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Studio devises &amp; FX
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Comparez les paires, calculez n&apos;importe quel cross synthetique, et mesurez les
              correlations sur 13 paires couvrant le FCFA, les majors et l&apos;Afrique.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`text-[11px] px-2.5 py-1 rounded border ${
                  period === p.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">Sélection :</span>
          {stats.map((s) => {
            const active = selected.has(s.slug);
            return (
              <button
                key={s.slug}
                onClick={() => toggle(s.slug)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition flex items-center gap-1.5 ${
                  active
                    ? "border-slate-300 bg-white"
                    : "border-slate-200 bg-slate-50 text-slate-400 line-through"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: s.color, opacity: active ? 1 : 0.3 }}
                />
                {s.pair}
              </button>
            );
          })}
          <span className="text-slate-300 mx-1">·</span>
          <button onClick={selectAll}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            Tout
          </button>
          <button onClick={() => selectCategory("global")}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            Majors
          </button>
          <button onClick={() => selectCategory("fcfa-major")}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            FCFA majeurs
          </button>
          <button onClick={() => selectCategory("fcfa-emerging")}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            FCFA emergents
          </button>
          <button onClick={() => selectCategory("africa")}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            Afrique
          </button>
          <button onClick={selectNone}
            className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            Aucune
          </button>
        </div>
      </div>

      {/* Comparateur normalise base 100 */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-200">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Performances normalisées (base 100)
          </h3>
          <span className="text-[10px] text-slate-400">
            {normalized?.points.length ?? 0} séances ·{" "}
            {filteredPoints[0]?.date ? fmtDateFr(filteredPoints[0].date as string) : "—"}
            {" → "}
            {filteredPoints[filteredPoints.length - 1]?.date
              ? fmtDateFr(filteredPoints[filteredPoints.length - 1].date as string)
              : "—"}
          </span>
        </div>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <LineChart data={filteredPoints} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                tickFormatter={(d) => {
                  if (typeof d !== "string" || d.length < 7) return d;
                  return d.slice(2, 7);
                }}
                interval={Math.max(0, Math.floor(filteredPoints.length / 12))}
                tickMargin={6} />
              <YAxis stroke="#94a3b8" fontSize={10}
                tickFormatter={(v) => v.toFixed(0)} width={40} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0",
                  borderRadius: 6, fontSize: 11 }}
                labelFormatter={(l) => fmtDateFr(String(l))}
                formatter={(v, name) => {
                  const meta = stats.find((s) => s.slug === name);
                  if (typeof v !== "number") return ["—", meta?.pair ?? String(name)];
                  return [
                    `${v.toFixed(1).replace(".", ",")}  (${(v - 100).toFixed(1).replace(".", ",")} %)`,
                    meta?.pair ?? String(name),
                  ];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8}
                formatter={(value) => stats.find((s) => s.slug === value)?.pair ?? value} />
              <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="2 2" />
              {stats
                .filter((s) => selected.has(s.slug))
                .map((s) => (
                  <Line key={s.slug} type="monotone" dataKey={s.slug} name={s.slug}
                    stroke={s.color} strokeWidth={1.8} dot={false} connectNulls />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Lecture : valeur à 100 = cours au début de la fenêtre. Une ligne au-dessus de 100 signifie
          une appréciation de la devise base sur la période. Un FCFA qui se déprécie face à l&apos;USD
          se traduit par USD/XOF qui monte au-dessus de 100.
        </p>
      </div>

      {/* Tableau performances + risque */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-200 overflow-x-auto">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Performances multi-horizons &amp; risque
          </h3>
          <span className="text-[10px] text-slate-400">
            Volatilité annualisée 1A · drawdown vs plus haut 5 ans · z-score 1A
          </span>
        </div>
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pr-3 sticky left-0 bg-white">Paire</th>
              <th className="text-right font-medium py-2 px-2">Cours</th>
              <th className="text-right font-medium py-2 px-2">Jour</th>
              {RETURN_HORIZONS.map((h) => (
                <th key={h.id} className="text-right font-medium py-2 px-2">{h.label}</th>
              ))}
              <th className="text-right font-medium py-2 px-2">Vol. 1A</th>
              <th className="text-right font-medium py-2 px-2">DD vs PH 5A</th>
              <th className="text-right font-medium py-2 px-2">z-score</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((s) => (
              <tr key={s.slug} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-1.5 pr-3 sticky left-0 bg-white group-hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full"
                      style={{ background: s.color }} />
                    <span className="font-medium text-slate-900">{s.pair}</span>
                    <span className="text-[10px] text-slate-400">{s.name}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums py-1.5 px-2 text-slate-900">
                  {fmtNum(s.last, s.decimals)}
                </td>
                <td className={`text-right tabular-nums py-1.5 px-2 ${
                  (s.changeDayPct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {fmtPct(s.changeDayPct, 2)}
                </td>
                {RETURN_HORIZONS.map((h) => {
                  const v = s.returns[h.id];
                  return (
                    <td key={h.id} className={`text-right tabular-nums py-1.5 px-2 ${
                      v === null ? "text-slate-300"
                        : v >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {fmtPct(v, 1)}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums py-1.5 px-2 text-slate-700">
                  {s.volatility1Y === null ? "—" : `${s.volatility1Y.toFixed(1).replace(".", ",")} %`}
                </td>
                <td className="text-right tabular-nums py-1.5 px-2 text-slate-700">
                  {s.drawdownFromHigh5Y === null
                    ? "—"
                    : `${s.drawdownFromHigh5Y.toFixed(1).replace(".", ",")} %`}
                </td>
                <td className="text-right tabular-nums py-1.5 px-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded ${
                    s.zScore1Y === null ? "text-slate-300"
                      : Math.abs(s.zScore1Y) > 1.5
                      ? s.zScore1Y > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      : "text-slate-700"
                  }`}>
                    {s.zScore1Y === null ? "—" : (s.zScore1Y > 0 ? "+" : "") + s.zScore1Y.toFixed(2).replace(".", ",")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-2">
          Lecture du z-score : écart entre le cours actuel et la moyenne 1 an, exprimé en
          écarts-types. |z| &gt; 2 = niveau extrême statistiquement.
        </p>
      </div>

      {/* Cross-rate calculator */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-200">
        <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Cross synthétique — calculateur
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Toute paire X/Y dérivée de deux paires X/XOF et Y/XOF déjà cotées.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select value={crossBase} onChange={(e) => setCrossBase(e.target.value as FxSlug)}
              className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-700">
              {xofPairs.map((s) => (
                <option key={s.slug} value={s.slug}>{s.pair.split("/")[0]}</option>
              ))}
            </select>
            <span className="text-slate-400">/</span>
            <select value={crossQuote} onChange={(e) => setCrossQuote(e.target.value as FxSlug)}
              className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-700">
              {xofPairs.map((s) => (
                <option key={s.slug} value={s.slug}>{s.pair.split("/")[0]}</option>
              ))}
            </select>
          </div>
        </div>

        {crossStats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
              <CrossStatCell label="Cours actuel" value={fmtNum(crossStats.last, 4)} />
              <CrossStatCell label="Performance"
                value={fmtPct(crossStats.ret, 1)}
                accent={crossStats.ret >= 0 ? "text-emerald-700" : "text-rose-700"} />
              <CrossStatCell label="Plus haut" value={fmtNum(crossStats.high, 4)} />
              <CrossStatCell label="Plus bas" value={fmtNum(crossStats.low, 4)} />
              <CrossStatCell label="Vol. annualisée"
                value={crossStats.vol === null ? "—" : `${crossStats.vol.toFixed(1).replace(".", ",")} %`} />
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={crossSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                    tickFormatter={(d) => typeof d === "string" && d.length >= 7 ? d.slice(2, 7) : d}
                    interval={Math.max(0, Math.floor(crossSeries.length / 8))} />
                  <YAxis stroke="#94a3b8" fontSize={10} domain={["auto", "auto"]} width={56}
                    tickFormatter={(v) => v.toFixed(v >= 100 ? 0 : 2)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0",
                      borderRadius: 6, fontSize: 11 }}
                    labelFormatter={(l) => fmtDateFr(String(l))}
                    formatter={(v) => typeof v === "number" ? [fmtNum(v, 4), "Cross"] : ["—", "Cross"]} />
                  <Line type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={1.6} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-slate-400">
            Sélectionnez deux devises distinctes pour calculer le cross.
          </div>
        )}
      </div>

      {/* Matrice de correlation */}
      <div className="px-4 md:px-6 py-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Matrice de corrélation</h3>
          <span className="text-[10px] text-slate-400">
            Pearson sur log-rendements quotidiens · fenêtre {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}
          </span>
        </div>
        {filteredCorrelation && filteredCorrelation.matrix.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className="p-1"></th>
                  {filteredCorrelation.labels.map((l) => (
                    <th key={l} className="p-1 text-slate-500 font-medium text-center align-bottom"
                      style={{ minWidth: 64 }}>
                      <div className="rotate-[-30deg] origin-bottom-left whitespace-nowrap pl-2">{l}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCorrelation.matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="p-1 text-slate-700 font-medium pr-2 whitespace-nowrap">
                      {filteredCorrelation.labels[i]}
                    </td>
                    {row.map((v, j) => (
                      <td key={j} className="p-0 text-center"
                        style={{ backgroundColor: correlationColor(v), minWidth: 64, height: 32 }}>
                        <span className="font-medium tabular-nums"
                          style={{
                            color: v !== null && Math.abs(v) > 0.6
                              ? v > 0 ? "#0c4a6e" : "#7f1d1d"
                              : "#334155",
                          }}>
                          {v === null ? "—" : v.toFixed(2).replace(".", ",")}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">Pas assez de séances communes sur cette fenêtre.</div>
        )}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
          <span>Lecture :</span>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3" style={{ background: correlationColor(-0.8) }} />
            <span>−1 (anti-corrélé)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3" style={{ background: correlationColor(0) }} />
            <span>0 (indépendant)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3" style={{ background: correlationColor(0.8) }} />
            <span>+1 (corrélé)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CrossStatCell({
  label, value, accent,
}: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
