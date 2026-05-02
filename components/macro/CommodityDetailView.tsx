"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Period = "1M" | "3M" | "6M" | "YTD" | "1A" | "3A" | "5A" | "MAX";

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

const MONTHS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

type DailyPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type DataByPeriod<T> = Record<Period, T>;

type SeasonalityCell = {
  year: number;
  month: number;
  changePct: number | null;
};

const fmtNum = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (v: number | null, dec = 1) =>
  v === null || !isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

function fmtDateFr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtVolume(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2).replace(".", ",")} K`;
  return v.toFixed(0);
}

function tickXFormatter(d: string): string {
  if (typeof d !== "string" || d.length < 7) return d;
  return d.slice(2, 7); // YY-MM
}

function seasonalityColor(v: number | null): string {
  if (v === null) return "#f8fafc";
  // Diverging :  rouge<->blanc<->vert
  if (v >= 0) {
    const t = Math.min(1, v / 10);
    const r = Math.round(248 + (4 - 248) * t);
    const g = Math.round(250 + (120 - 250) * t);
    const b = Math.round(252 + (87 - 252) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = Math.min(1, -v / 10);
    const r = Math.round(248 + (220 - 248) * t);
    const g = Math.round(250 + (38 - 250) * t);
    const b = Math.round(252 + (38 - 252) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export default function CommodityDetailView({
  slug,
  name,
  unit,
  color,
  initialPeriod,
  dailyByPeriod,
  ma200ByPeriod,
  drawdownByPeriod,
  seasonality,
}: {
  slug: string;
  name: string;
  unit: string;
  color: string;
  initialPeriod: Period;
  dailyByPeriod: DataByPeriod<DailyPoint[]>;
  ma200ByPeriod: DataByPeriod<{ date: string; ma: number | null }[]>;
  drawdownByPeriod: DataByPeriod<{ date: string; drawdown: number }[]>;
  seasonality: {
    years: number[];
    cells: SeasonalityCell[];
    monthlyAverages: (number | null)[];
    hitRate: (number | null)[];
  };
}) {
  void slug;
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [showMA, setShowMA] = useState<boolean>(true);
  const [chartType, setChartType] = useState<"price" | "volume" | "drawdown">("price");

  // Donnees fusionnees prix + MA pour la periode courante
  const priceData = useMemo(() => {
    const daily = dailyByPeriod[period] ?? [];
    const ma = ma200ByPeriod[period] ?? [];
    const maMap = new Map(ma.map((m) => [m.date, m.ma]));
    return daily.map((d) => ({
      date: d.date,
      close: d.close,
      high: d.high,
      low: d.low,
      ma: maMap.get(d.date) ?? null,
    }));
  }, [dailyByPeriod, ma200ByPeriod, period]);

  const volumeData = useMemo(() => {
    return (dailyByPeriod[period] ?? []).map((d) => ({
      date: d.date,
      volume: d.volume ?? 0,
    }));
  }, [dailyByPeriod, period]);

  const drawdownData = useMemo(
    () => drawdownByPeriod[period] ?? [],
    [drawdownByPeriod, period],
  );

  const hasVolume = useMemo(() => volumeData.some((v) => v.volume > 0), [volumeData]);

  // Heatmap saisonnalite : groupes par annee
  const heatmapByYear = useMemo(() => {
    const map = new Map<number, (SeasonalityCell | null)[]>();
    for (const y of seasonality.years) {
      map.set(y, Array(12).fill(null));
    }
    for (const c of seasonality.cells) {
      const row = map.get(c.year);
      if (row) row[c.month - 1] = c;
    }
    return map;
  }, [seasonality]);

  // Stats sur la fenetre courante
  const periodStats = useMemo(() => {
    const daily = dailyByPeriod[period] ?? [];
    if (daily.length < 2) return null;
    const first = daily[0];
    const last = daily[daily.length - 1];
    const closes = daily.map((d) => d.close);
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const ret = ((last.close - first.close) / first.close) * 100;
    // Volatilite annualisee sur la fenetre
    const logRets: number[] = [];
    for (let i = 1; i < daily.length; i++) {
      const a = daily[i - 1].close;
      const b = daily[i].close;
      if (a > 0 && b > 0) logRets.push(Math.log(b / a));
    }
    let vol: number | null = null;
    if (logRets.length >= 10) {
      const m = logRets.reduce((s, v) => s + v, 0) / logRets.length;
      const v = logRets.reduce((s, x) => s + (x - m) ** 2, 0) / logRets.length;
      vol = Math.sqrt(v) * Math.sqrt(252) * 100;
    }
    const dd = drawdownData[drawdownData.length - 1]?.drawdown ?? null;
    return { first, last, high, low, ret, vol, drawdown: dd };
  }, [dailyByPeriod, drawdownData, period]);

  return (
    <div className="space-y-4">
      {/* Bandeau de controle */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 md:px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
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
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setChartType("price")}
                className={`px-2 py-1 rounded ${
                  chartType === "price"
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Prix
              </button>
              <button
                onClick={() => setChartType("volume")}
                disabled={!hasVolume}
                className={`px-2 py-1 rounded ${
                  chartType === "volume"
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : hasVolume
                    ? "text-slate-500 hover:text-slate-700"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                title={hasVolume ? "" : "Volumes non disponibles"}
              >
                Volume
              </button>
              <button
                onClick={() => setChartType("drawdown")}
                className={`px-2 py-1 rounded ${
                  chartType === "drawdown"
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Drawdown
              </button>
            </div>
            {chartType === "price" && (
              <label className="flex items-center gap-1 text-slate-500">
                <input
                  type="checkbox"
                  checked={showMA}
                  onChange={(e) => setShowMA(e.target.checked)}
                  className="accent-slate-900"
                />
                MM 200j
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Stats de la fenetre courante */}
      {periodStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <PeriodStatCell label="Performance" value={fmtPct(periodStats.ret, 1)}
            color={periodStats.ret >= 0 ? "text-emerald-700" : "text-rose-700"} />
          <PeriodStatCell label="Plus haut" value={fmtNum(periodStats.high, periodStats.high >= 1000 ? 0 : 2)}
            sub={fmtDateFr(periodStats.first.date)} />
          <PeriodStatCell label="Plus bas" value={fmtNum(periodStats.low, periodStats.low >= 1000 ? 0 : 2)} />
          <PeriodStatCell label="Vol. annualisée" value={periodStats.vol === null ? "—" : `${periodStats.vol.toFixed(1).replace(".", ",")} %`} />
          <PeriodStatCell label="Drawdown courant"
            value={periodStats.drawdown === null ? "—" : `${periodStats.drawdown.toFixed(1).replace(".", ",")} %`}
            color={(periodStats.drawdown ?? 0) <= -10 ? "text-rose-700" : "text-slate-900"} />
        </div>
      )}

      {/* Chart principal */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 md:px-5 py-4">
        <div style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer>
            {chartType === "price" ? (
              <ComposedChart data={priceData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                  tickFormatter={tickXFormatter}
                  interval={Math.max(0, Math.floor(priceData.length / 10))}
                  tickMargin={6} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={["auto", "auto"]} width={56}
                  tickFormatter={(v) => fmtNum(v, v >= 1000 ? 0 : 1)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0",
                    borderRadius: 6, fontSize: 11 }}
                  labelFormatter={(l) => fmtDateFr(String(l))}
                  formatter={(v, n) => {
                    if (typeof v !== "number") return ["—", String(n)];
                    const label = n === "close" ? "Cours" : n === "ma" ? "MM 200j" : String(n);
                    return [`${fmtNum(v, v >= 1000 ? 0 : 2)} ${unit.split(" / ")[0]}`, label];
                  }}
                />
                <Area type="monotone" dataKey="close" stroke={color} strokeWidth={1.8}
                  fill={`url(#gradient-${color})`} dot={false} name="close" />
                {showMA && (
                  <Line type="monotone" dataKey="ma" stroke="#0f172a" strokeWidth={1.2}
                    strokeDasharray="4 3" dot={false} connectNulls name="ma" />
                )}
              </ComposedChart>
            ) : chartType === "volume" ? (
              <ComposedChart data={volumeData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                  tickFormatter={tickXFormatter}
                  interval={Math.max(0, Math.floor(volumeData.length / 10))}
                  tickMargin={6} />
                <YAxis stroke="#94a3b8" fontSize={10} width={56}
                  tickFormatter={(v) => fmtVolume(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0",
                    borderRadius: 6, fontSize: 11 }}
                  labelFormatter={(l) => fmtDateFr(String(l))}
                  formatter={(v) => typeof v === "number" ? [fmtVolume(v), "Volume"] : ["—", "Volume"]}
                />
                <Bar dataKey="volume" fill={color} fillOpacity={0.6} />
              </ComposedChart>
            ) : (
              <AreaChart data={drawdownData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="grad-dd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10}
                  tickFormatter={tickXFormatter}
                  interval={Math.max(0, Math.floor(drawdownData.length / 10))}
                  tickMargin={6} />
                <YAxis stroke="#94a3b8" fontSize={10} width={56}
                  tickFormatter={(v) => `${v.toFixed(0)} %`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0",
                    borderRadius: 6, fontSize: 11 }}
                  labelFormatter={(l) => fmtDateFr(String(l))}
                  formatter={(v) => typeof v === "number"
                    ? [`${v.toFixed(2).replace(".", ",")} %`, "Drawdown"]
                    : ["—", "Drawdown"]}
                />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Area type="monotone" dataKey="drawdown" stroke="#dc2626" strokeWidth={1.5}
                  fill="url(#grad-dd)" dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {chartType === "price"
            ? "Cours quotidiens de clôture. La MM 200j (moyenne mobile 200 jours, pointillé) sert de filtre de tendance long terme."
            : chartType === "volume"
            ? "Volume échangé sur le contrat de référence (estimation Investing.com)."
            : "Drawdown = recul cumulé depuis le dernier plus haut atteint dans la fenêtre. Sert à visualiser la profondeur des corrections."}
        </p>
      </div>

      {/* Saisonnalite */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 md:px-5 py-4">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Saisonnalité — rendements mensuels</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {seasonality.years.length} dernières années · variation mensuelle close-to-close · ligne du bas = moyenne historique &amp; % de mois positifs.
            </p>
          </div>
          <Legend2 />
        </div>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1 text-slate-400 font-medium text-left">Année</th>
                {MONTHS_FR.map((m) => (
                  <th key={m} className="px-2 py-1 text-slate-500 font-medium text-center" style={{ minWidth: 44 }}>
                    {m}
                  </th>
                ))}
                <th className="px-2 py-1 text-slate-400 font-medium text-center">Année</th>
              </tr>
            </thead>
            <tbody>
              {seasonality.years.map((y) => {
                const row = heatmapByYear.get(y) ?? [];
                // Cumul annuel : compose les changes mensuels
                const annual = row.reduce(
                  (acc, c) => (c?.changePct == null ? acc : (acc * (1 + c.changePct / 100))),
                  1,
                );
                const annualPct = (annual - 1) * 100;
                return (
                  <tr key={y}>
                    <td className="px-2 py-1 text-slate-700 font-medium text-left whitespace-nowrap">
                      {y}
                    </td>
                    {row.map((c, i) => (
                      <td
                        key={i}
                        className="text-center font-medium tabular-nums"
                        style={{
                          background: seasonalityColor(c?.changePct ?? null),
                          minWidth: 44,
                          height: 26,
                          color:
                            c?.changePct == null
                              ? "#cbd5e1"
                              : Math.abs(c.changePct) > 6
                              ? c.changePct > 0
                                ? "#064e3b"
                                : "#7f1d1d"
                              : "#334155",
                        }}
                      >
                        {c?.changePct == null
                          ? "—"
                          : (c.changePct > 0 ? "+" : "") + c.changePct.toFixed(1).replace(".", ",")}
                      </td>
                    ))}
                    <td
                      className="text-center font-semibold tabular-nums px-2"
                      style={{
                        color: annualPct >= 0 ? "#047857" : "#b91c1c",
                      }}
                    >
                      {row.every((c) => c?.changePct == null) ? "—" : (annualPct > 0 ? "+" : "") + annualPct.toFixed(1).replace(".", ",")}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-200">
                <td className="px-2 py-1 text-slate-500 italic text-left">Moy.</td>
                {seasonality.monthlyAverages.map((avg, i) => (
                  <td key={i} className="text-center text-[10px] tabular-nums px-2 py-1 font-medium"
                    style={{
                      color: avg === null ? "#cbd5e1" : avg >= 0 ? "#059669" : "#dc2626",
                    }}>
                    {avg === null ? "—" : (avg > 0 ? "+" : "") + avg.toFixed(1).replace(".", ",")}
                  </td>
                ))}
                <td className="px-2"></td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-slate-500 italic text-left">Hit %</td>
                {seasonality.hitRate.map((h, i) => (
                  <td key={i} className="text-center text-[10px] tabular-nums px-2 py-1 text-slate-600">
                    {h === null ? "—" : `${Math.round(h)} %`}
                  </td>
                ))}
                <td className="px-2"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Lecture : un mois &quot;Hit % = 70 %&quot; signifie que sur la fenêtre, ce mois a été positif 7 fois sur 10. Combiné à une moyenne &gt; 0, c&apos;est un signal saisonnier robuste.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Histogramme rendements mensuels */}
        <MonthlyAveragesChart name={name}
          monthlyAverages={seasonality.monthlyAverages}
          hitRate={seasonality.hitRate} />

        {/* Top 10 plus gros mois */}
        <BigMonthsTable cells={seasonality.cells} />
      </div>
    </div>
  );
}

function PeriodStatCell({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${color ?? "text-slate-900"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend2() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-500">
      <span>−10 %</span>
      <span className="inline-block w-3 h-3" style={{ background: seasonalityColor(-10) }} />
      <span className="inline-block w-3 h-3" style={{ background: seasonalityColor(-3) }} />
      <span className="inline-block w-3 h-3" style={{ background: seasonalityColor(0) }} />
      <span className="inline-block w-3 h-3" style={{ background: seasonalityColor(3) }} />
      <span className="inline-block w-3 h-3" style={{ background: seasonalityColor(10) }} />
      <span>+10 %</span>
    </div>
  );
}

function MonthlyAveragesChart({
  name,
  monthlyAverages,
  hitRate,
}: {
  name: string;
  monthlyAverages: (number | null)[];
  hitRate: (number | null)[];
}) {
  const data = monthlyAverages.map((avg, i) => ({
    month: MONTHS_FR[i],
    avg: avg ?? 0,
    hit: hitRate[i] ?? 0,
  }));
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Profil saisonnier moyen</h3>
      <p className="text-[11px] text-slate-500 mt-0.5">Rendement moyen et taux de réussite par mois.</p>
      <div style={{ width: "100%", height: 220 }} className="mt-2">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} width={40}
              tickFormatter={(v) => `${v.toFixed(0)} %`} />
            <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} width={40}
              domain={[0, 100]} tickFormatter={(v) => `${v.toFixed(0)} %`} />
            <Tooltip
              contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11 }}
              formatter={(v, n) => {
                if (typeof v !== "number") return ["—", String(n)];
                if (n === "avg") return [`${(v >= 0 ? "+" : "") + v.toFixed(2).replace(".", ",")} %`, `Moy. ${name}`];
                return [`${v.toFixed(0)} %`, "Hit rate"];
              }}
            />
            <ReferenceLine y={0} yAxisId="left" stroke="#94a3b8" />
            <Bar yAxisId="left" dataKey="avg" name="avg">
              {data.map((d, i) => (
                <rect key={i} fill={d.avg >= 0 ? "#059669" : "#dc2626"} />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="hit" name="hit"
              stroke="#0f172a" strokeWidth={1.4} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BigMonthsTable({ cells }: { cells: SeasonalityCell[] }) {
  const sorted = [...cells].filter((c) => c.changePct !== null);
  const top = [...sorted].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 5);
  const bottom = [...sorted].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 5);
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Mois extrêmes (10 ans)</h3>
      <p className="text-[11px] text-slate-500 mt-0.5">Plus fortes hausses et plus fortes baisses mensuelles.</p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <div className="text-[10px] text-emerald-700 font-medium mb-1">Top hausses</div>
          <ul className="space-y-1">
            {top.map((c) => (
              <li key={`${c.year}-${c.month}`} className="flex justify-between text-[11px]">
                <span className="text-slate-600">{MONTHS_FR[c.month - 1]} {c.year}</span>
                <span className="text-emerald-700 font-medium tabular-nums">+{(c.changePct ?? 0).toFixed(1).replace(".", ",")} %</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] text-rose-700 font-medium mb-1">Top baisses</div>
          <ul className="space-y-1">
            {bottom.map((c) => (
              <li key={`${c.year}-${c.month}`} className="flex justify-between text-[11px]">
                <span className="text-slate-600">{MONTHS_FR[c.month - 1]} {c.year}</span>
                <span className="text-rose-700 font-medium tabular-nums">{(c.changePct ?? 0).toFixed(1).replace(".", ",")} %</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
