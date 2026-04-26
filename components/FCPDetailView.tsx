"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

// ==========================================
// TYPES PROPS (alignés sur app/fcp/[slug]/page.tsx)
// ==========================================
type LatestVL = { date: string; vl: number; kind: "quarter" | "latest" } | null;

type PerfRow = {
  label: string;
  fromDate: string;
  toDate: string;
  fundValue: number | null;
  cohortValue: number | null;
  excess: number | null;
};

type RebasedPoint = { date: string; rebased: number; kind: "quarter" | "latest" };
type CohortRebasedPoint = { date: string; value: number | null };

type QuartileFrame = { date: string; quartile: 1 | 2 | 3 | 4 | null; perf: number | null };

type AumPoint = {
  date: string;
  aum: number;
  vl: number;
  perfQuarter: number | null;
  perfEffectAmount: number | null;
  netFlowAmount: number | null;
};

type ExcessFrame = {
  date: string;
  fundPerf: number | null;
  cohortMedianPerf: number | null;
  excess: number | null;
  cumulativeExcess: number | null;
};

type PeerEntry = {
  id: string;
  nom: string;
  gestionnaire: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

type ManagerEntry = {
  id: string;
  nom: string;
  categorie: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

type MarketShareFrame = {
  date: string;
  share: number | null;
  rank: number | null;
  nbInCat: number;
  fundAUM: number | null;
  totalCatAUM: number;
};

type CalendarCell = { year: number; quarter: 1 | 2 | 3 | 4; perf: number | null };

type AumGrowth = {
  fromDate: string;
  toDate: string;
  startAUM: number | null;
  endAUM: number | null;
  totalGrowth: number | null;
  perfEffect: number | null;
  netFlow: number | null;
  perfPct: number | null;
  netFlowPct: number | null;
};

type Cadence = {
  kind: "quotidienne" | "hebdomadaire" | "trimestrielle" | "irrégulière";
  publishedQuarters: number;
  expectedQuarters: number;
  regularity: number;
  intraTrim365: number;
  avgGapDays: number | null;
  lastPublicationDate: string;
  daysSinceLast: number | null;
};

type Rolling = {
  points: Array<{ asOf: string; perf1Y: number | null }>;
  min: number | null;
  median: number | null;
  max: number | null;
};

type Props = {
  fund: {
    id: string;
    nom: string;
    gestionnaire: string;
    type: string;
    categorie: string;
    categorieAtRef: string;
    firstObsDate: string | null;
  };
  refQuarter: string;
  latestVLGlobal: string;
  stalenessCutoff: string;
  aumRef: number | null;
  aumDelta1Y: number | null;
  latestVL: LatestVL;
  ytdQuartile: 1 | 2 | 3 | 4 | null;
  cohortSize: number;
  perfTable: PerfRow[];
  rebasedFundSeries: RebasedPoint[];
  cohortRebased: CohortRebasedPoint[];
  quartileFrame: QuartileFrame[];
  top2Pct: number | null;
  aumDecomp: AumPoint[];
  excess: ExcessFrame[];
  peerEntries: PeerEntry[];
  managerEntries: ManagerEntry[];
  marketShare: MarketShareFrame[];
  calendar: CalendarCell[];
  growth1Y: AumGrowth | null;
  growth3Y: AumGrowth | null;
  cadence: Cadence;
  rolling: Rolling;
};

// ==========================================
// HELPERS DE FORMATAGE
// ==========================================
function fmtBigFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtSignedFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const sign = v >= 0 ? "+" : "−";
  const abs = Math.abs(v);
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2).replace(".", ",") + " T";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(0) + " M";
  return sign + Math.round(abs).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return (sign + (v * 100).toFixed(digits)).replace(".", ",") + "%";
}
function fmtPctRaw(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
function managerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const QUARTILE_COLORS: Record<number, string> = {
  1: "#15803d",
  2: "#86efac",
  3: "#fbbf24",
  4: "#dc2626",
};
const QUARTILE_LABELS: Record<number, string> = {
  1: "Q1 (top)",
  2: "Q2",
  3: "Q3",
  4: "Q4 (bas)",
};

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};

function perfHeatColor(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "#f1f5f9";
  const clamped = Math.max(-0.1, Math.min(0.1, p));
  const t = (clamped + 0.1) / 0.2;
  if (t < 0.5) return interpolate("#dc2626", "#fbbf24", t * 2);
  return interpolate("#fbbf24", "#16a34a", (t - 0.5) * 2);
}
function hexToRgb(h: string) {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
function interpolate(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const m = ra.map((c, i) => Math.round(c + (rb[i] - c) * t));
  return `#${m.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ==========================================
// COMPONENT
// ==========================================
type ChartPeriod = "1A" | "3A" | "5A" | "MAX";
const CHART_PERIODS: ChartPeriod[] = ["1A", "3A", "5A", "MAX"];

export default function FCPDetailView(props: Props) {
  const {
    fund,
    refQuarter,
    latestVLGlobal,
    aumRef,
    aumDelta1Y,
    latestVL,
    ytdQuartile,
    cohortSize,
    perfTable,
    rebasedFundSeries,
    cohortRebased,
    quartileFrame,
    top2Pct,
    aumDecomp,
    excess,
    peerEntries,
    managerEntries,
    marketShare,
    calendar,
    growth1Y,
    growth3Y,
    cadence,
    rolling,
  } = props;

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("3A");

  // === Filtrage du graphe VL selon la période ===
  const vlChartData = useMemo(() => {
    if (rebasedFundSeries.length === 0) return [];
    const lastDate = rebasedFundSeries[rebasedFundSeries.length - 1].date;
    let cutoff = "";
    if (chartPeriod !== "MAX") {
      const years = chartPeriod === "1A" ? 1 : chartPeriod === "3A" ? 3 : 5;
      const ms = new Date(lastDate + "T00:00:00Z").getTime() - years * 365.25 * 86400000;
      cutoff = new Date(ms).toISOString().slice(0, 10);
    }
    const cohortMap = new Map(cohortRebased.map((c) => [c.date, c.value]));
    return rebasedFundSeries
      .filter((p) => !cutoff || p.date >= cutoff)
      .map((p) => ({
        date: p.date,
        fund: p.rebased,
        cohort: cohortMap.get(p.date) ?? null,
        kind: p.kind,
      }));
  }, [rebasedFundSeries, cohortRebased, chartPeriod]);

  // === AUM decomp : visible quarters & data ===
  const aumDecompData = useMemo(
    () =>
      aumDecomp.slice(-12).map((p) => ({
        date: p.date.slice(0, 7),
        aum: p.aum / 1e9,
        perfEffect: p.perfEffectAmount !== null ? p.perfEffectAmount / 1e9 : null,
        netFlow: p.netFlowAmount !== null ? p.netFlowAmount / 1e9 : null,
      })),
    [aumDecomp]
  );

  // === Excess data : 12 derniers trimestres ===
  const excessData = useMemo(
    () =>
      excess.slice(-12).map((e) => ({
        date: e.date.slice(0, 7),
        excess: e.excess !== null ? e.excess * 100 : null,
        cumulative: e.cumulativeExcess !== null ? e.cumulativeExcess * 100 : null,
      })),
    [excess]
  );

  // === Market share data ===
  const marketShareData = useMemo(
    () =>
      marketShare.filter((m) => m.share !== null).map((m) => ({
        date: m.date.slice(0, 7),
        share: m.share !== null ? m.share * 100 : null,
        rank: m.rank,
      })),
    [marketShare]
  );

  // === Calendrier : matrix année × Q1..Q4 ===
  const calendarMatrix = useMemo(() => {
    const years = Array.from(new Set(calendar.map((c) => c.year))).sort();
    const lastYears = years.slice(-5);
    return lastYears.map((y) => {
      const cells: Array<{ q: 1 | 2 | 3 | 4; perf: number | null }> = [];
      for (const q of [1, 2, 3, 4] as const) {
        const cell = calendar.find((c) => c.year === y && c.quarter === q);
        cells.push({ q, perf: cell?.perf ?? null });
      }
      return { year: y, cells };
    });
  }, [calendar]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* ============================================ */}
      {/* BLOCK 1 : HEADER IDENTITE */}
      {/* ============================================ */}
      <header className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              <Link href="/marches/fcp" className="hover:underline">
                FCP / OPCVM
              </Link>{" "}
              ·{" "}
              <Link
                href={`/sgp/${managerSlug(fund.gestionnaire)}`}
                className="hover:underline text-slate-700 font-medium"
              >
                {fund.gestionnaire}
              </Link>
            </p>
            <h1 className="text-3xl font-bold text-slate-900">{fund.nom}</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md"
                style={{
                  background: CATEGORY_COLORS[fund.categorie] + "1a" || "#e2e8f0",
                  color: CATEGORY_COLORS[fund.categorie] || "#475569",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: CATEGORY_COLORS[fund.categorie] || "#94a3b8" }}
                />
                {fund.categorie}
              </span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600">
                {fund.type}
              </span>
              {ytdQuartile !== null && (
                <span
                  className="px-2.5 py-1 text-xs font-bold rounded-md"
                  style={{
                    background: QUARTILE_COLORS[ytdQuartile] + "22",
                    color: QUARTILE_COLORS[ytdQuartile],
                  }}
                >
                  {QUARTILE_LABELS[ytdQuartile]} YTD
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[280px]">
            <KPI
              label="Encours"
              value={fmtBigFCFA(aumRef) + " FCFA"}
              sub={
                aumDelta1Y !== null
                  ? `1 an · ${fmtPct(aumDelta1Y)}`
                  : `au ${fmtDateFR(refQuarter)}`
              }
            />
            <KPI
              label="Dernière VL"
              value={
                latestVL ? Math.round(latestVL.vl).toLocaleString("fr-FR").replace(/,/g, " ") : "—"
              }
              sub={
                latestVL
                  ? fmtDateFR(latestVL.date) +
                    (latestVL.kind === "latest" ? " · intra-trim" : "")
                  : "—"
              }
            />
          </div>
        </div>
      </header>

      {/* ============================================ */}
      {/* BLOCK 2 : TABLEAU DE PERFORMANCE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Performance vs catégorie</h2>
          <p className="text-xs text-slate-500">
            Comparaison à la médiane des {cohortSize} fonds {fund.categorie.toLowerCase()}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className="text-left px-6 py-2 text-xs font-semibold text-slate-600">Fenêtre</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Fonds</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                Médiane catégorie
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Écart</th>
              <th className="text-right px-6 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                Période
              </th>
            </tr>
          </thead>
          <tbody>
            {perfTable.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0">
                <td className="px-6 py-2.5 font-medium text-slate-700">{r.label}</td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    r.fundValue !== null && r.fundValue >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.fundValue, 2)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {fmtPct(r.cohortValue, 2)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    r.excess !== null && r.excess >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.excess, 2)}
                </td>
                <td className="px-6 py-2.5 text-right text-xs text-slate-400 hidden md:table-cell">
                  {r.fromDate ? `${fmtDateFR(r.fromDate)} → ${fmtDateFR(r.toDate)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ============================================ */}
      {/* BLOCK 3 : GRAPHE VL REBASE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">VL rebasée à 100</h2>
            <p className="text-xs text-slate-500">
              Fonds vs médiane catégorie · base = {fmtDateFR(rebasedFundSeries[0]?.date || "")}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
            {CHART_PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  chartPeriod === p
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <LineChart data={vlChartData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) => String(d).slice(0, 7)}
              />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip
                formatter={(v, name) => [
                  Number(v).toFixed(2),
                  name === "fund" ? fund.nom : "Médiane catégorie",
                ]}
                labelFormatter={(d) => fmtDateFR(String(d))}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => (value === "fund" ? fund.nom : "Médiane catégorie")}
              />
              <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="fund"
                stroke="#185FA5"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="cohort"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {latestVL && latestVL.kind === "latest" && (
          <p className="text-[11px] text-slate-400 mt-1">
            ● Dernier point ({fmtDateFR(latestVL.date)}) = VL intra-trim publiée par la SGP
          </p>
        )}
      </section>

      {/* ============================================ */}
      {/* BLOCK 4 + 13 : QUARTILES + ROLLING 1Y */}
      {/* ============================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Frise quartiles */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Régularité — quartiles</h2>
            <p className="text-xs text-slate-500">
              Quartile dans la catégorie sur chaque trimestre (Q1 = top, Q4 = bas)
            </p>
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {quartileFrame.map((q) => (
              <div
                key={q.date}
                title={`${q.date} · ${q.quartile ? `Q${q.quartile}` : "—"} · perf ${fmtPct(
                  q.perf
                )}`}
                className="w-7 h-10 rounded flex flex-col items-center justify-center text-[9px] font-bold text-white"
                style={{
                  background: q.quartile ? QUARTILE_COLORS[q.quartile] : "#e2e8f0",
                  color: q.quartile ? "#fff" : "#94a3b8",
                }}
              >
                <span>{q.quartile ? `Q${q.quartile}` : "—"}</span>
                <span className="text-[8px] opacity-80">{q.date.slice(2, 7)}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-600">
            <strong>{fmtPct(top2Pct, 0)}</strong> des trimestres en Q1+Q2 · {quartileFrame.filter((q) => q.quartile !== null).length} trimestres évalués
          </div>
        </div>

        {/* Rolling 1Y */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Performances 1 an glissantes</h2>
            <p className="text-xs text-slate-500">
              Évite l&apos;effet « année calendaire » — fenêtre 1A à chaque fin de trimestre
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Min" value={fmtPct(rolling.min, 1)} tone={rolling.min !== null && rolling.min < 0 ? "rose" : "neutral"} />
            <Stat label="Médiane" value={fmtPct(rolling.median, 1)} tone="neutral" />
            <Stat label="Max" value={fmtPct(rolling.max, 1)} tone={rolling.max !== null && rolling.max >= 0 ? "emerald" : "neutral"} />
          </div>
          <div style={{ width: "100%", height: 140 }}>
            <ResponsiveContainer>
              <BarChart data={rolling.points.map((p) => ({ date: p.asOf.slice(0, 7), perf: p.perf1Y !== null ? p.perf1Y * 100 : null }))}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v + "%"} width={40} />
                <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="perf" fill="#185FA5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 6 : EXCES VS CATEGORIE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Excès trimestriel vs médiane catégorie
          </h2>
          <p className="text-xs text-slate-500">
            Barre = perf trim − perf médiane cat · ligne = excès cumulé composé
          </p>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={excessData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="bar"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v + "%"}
                width={50}
              />
              <YAxis
                yAxisId="line"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v + "%"}
                width={50}
              />
              <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
              <ReferenceLine y={0} yAxisId="bar" stroke="#94a3b8" />
              <Bar
                yAxisId="bar"
                dataKey="excess"
                name="Excès trimestriel"
                fill="#185FA5"
              />
              <Line
                yAxisId="line"
                type="monotone"
                dataKey="cumulative"
                name="Excès cumulé"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 5 + 11 : DECOMPOSITION AUM + CROISSANCE */}
      {/* ============================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Dynamique d&apos;encours — perf vs collecte
            </h2>
            <p className="text-xs text-slate-500">
              Décomposition trimestrielle ΔAUM = effet performance + collecte nette implicite
            </p>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={aumDecompData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="aum"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toFixed(0) + " Mds"}
                  width={70}
                />
                <YAxis
                  yAxisId="flow"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toFixed(1) + " Mds"}
                  width={60}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const num = Number(v);
                    if (name === "aum") return [num.toFixed(2) + " Mds", "AUM"];
                    if (name === "perfEffect") return [num.toFixed(2) + " Mds", "Effet perf"];
                    if (name === "netFlow") return [num.toFixed(2) + " Mds", "Collecte nette"];
                    return [num.toFixed(2), String(name)];
                  }}
                />
                <ReferenceLine yAxisId="flow" y={0} stroke="#94a3b8" />
                <Bar yAxisId="flow" dataKey="netFlow" fill="#0F6E56" name="Collecte nette" />
                <Bar yAxisId="flow" dataKey="perfEffect" fill="#94a3b8" name="Effet perf" />
                <Line
                  yAxisId="aum"
                  type="monotone"
                  dataKey="aum"
                  stroke="#185FA5"
                  strokeWidth={2}
                  name="AUM"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Croissance décomposée</h3>
            <p className="text-xs text-slate-500">
              D&apos;où vient la variation d&apos;encours ?
            </p>
          </div>
          <GrowthBlock title="Sur 1 an" g={growth1Y} />
          <GrowthBlock title="Sur 3 ans" g={growth3Y} />
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 9 + 10 : MARKET SHARE + CALENDRIER */}
      {/* ============================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Market share */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Part de marché dans la catégorie
            </h2>
            <p className="text-xs text-slate-500">
              {marketShareData.length > 0 && marketShareData[marketShareData.length - 1].rank !== null
                ? `Rang ${marketShareData[marketShareData.length - 1].rank} sur ${
                    marketShare[marketShare.length - 1]?.nbInCat ?? "—"
                  } fonds dans la catégorie`
                : "Évolution de la part de marché"}
            </p>
          </div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={marketShareData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toFixed(1) + "%"}
                  width={50}
                />
                <Tooltip formatter={(v) => Number(v).toFixed(2) + "%"} />
                <Area
                  type="monotone"
                  dataKey="share"
                  stroke="#185FA5"
                  fill="#185FA5"
                  fillOpacity={0.25}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calendrier */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Calendrier des trimestres</h2>
            <p className="text-xs text-slate-500">Performance trimestrielle du fonds</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 px-2 py-1.5"></th>
                {[1, 2, 3, 4].map((q) => (
                  <th
                    key={q}
                    className="text-center text-xs font-semibold text-slate-600 px-2 py-1.5"
                  >
                    Q{q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarMatrix.map((row) => (
                <tr key={row.year}>
                  <td className="text-xs font-bold text-slate-700 px-2 py-1.5">{row.year}</td>
                  {row.cells.map((c, idx) => (
                    <td
                      key={idx}
                      className="px-1.5 py-2 text-center text-xs font-medium"
                      style={{
                        background: perfHeatColor(c.perf),
                        color: "#0f172a",
                      }}
                    >
                      {fmtPct(c.perf, 1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 7 + 8 : PEER GROUP + AUTRES FONDS GESTIONNAIRE */}
      {/* ============================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PeerTable
          title="Concurrents directs (catégorie)"
          subtitle={`Top 10 ${fund.categorie.toLowerCase()} par AUM`}
          rows={peerEntries.map((e) => ({
            id: e.id,
            nom: e.nom,
            sub: e.gestionnaire,
            aum: e.aum,
            ytd: e.ytd,
            y1: e.y1,
          }))}
        />
        <PeerTable
          title={
            <>
              Autres fonds{" "}
              <Link
                href={`/sgp/${managerSlug(fund.gestionnaire)}`}
                className="hover:underline text-blue-700"
              >
                {fund.gestionnaire}
              </Link>
            </>
          }
          subtitle={`${managerEntries.length} fonds gérés par la même SGP`}
          rows={managerEntries.map((e) => ({
            id: e.id,
            nom: e.nom,
            sub: e.categorie,
            aum: e.aum,
            ytd: e.ytd,
            y1: e.y1,
          }))}
        />
      </section>

      {/* ============================================ */}
      {/* BLOCK 12 : CADENCE DE PUBLICATION */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Qualité de publication</h2>
            <p className="text-xs text-slate-500">
              Cadence et régularité de publication des VL par la SGP
            </p>
          </div>
          <span
            className="px-3 py-1.5 text-xs font-bold rounded-md uppercase tracking-wider"
            style={{
              background:
                cadence.kind === "quotidienne"
                  ? "#15803d22"
                  : cadence.kind === "hebdomadaire"
                  ? "#0F6E5622"
                  : cadence.kind === "trimestrielle"
                  ? "#185FA522"
                  : "#dc262622",
              color:
                cadence.kind === "quotidienne"
                  ? "#15803d"
                  : cadence.kind === "hebdomadaire"
                  ? "#0F6E56"
                  : cadence.kind === "trimestrielle"
                  ? "#185FA5"
                  : "#dc2626",
            }}
          >
            Cadence {cadence.kind}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Trimestres publiés"
            value={`${cadence.publishedQuarters} / ${cadence.expectedQuarters}`}
            sub={`régularité ${fmtPctRaw(cadence.regularity, 0)}`}
            tone="neutral"
          />
          <Stat
            label="Points 365 j"
            value={String(cadence.intraTrim365)}
            sub="VL intra-trimestre"
            tone="neutral"
          />
          <Stat
            label="Gap moyen"
            value={cadence.avgGapDays !== null ? Math.round(cadence.avgGapDays) + " j" : "—"}
            sub="entre publications"
            tone="neutral"
          />
          <Stat
            label="Délai depuis dernière VL"
            value={cadence.daysSinceLast !== null ? Math.round(cadence.daysSinceLast) + " j" : "—"}
            sub={`au ${fmtDateFR(latestVLGlobal)}`}
            tone={
              cadence.daysSinceLast !== null && cadence.daysSinceLast > 15 ? "rose" : "emerald"
            }
          />
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Source : publications BRVM / SGP UEMOA. Encours ponctuel à la date de publication
        trimestrielle (non cumulatif). Indicateurs de risque (volatilité, Sharpe, drawdown) non
        calculés : la fréquence de publication des VL est hétérogène entre fonds.
      </p>
    </main>
  );
}

// ==========================================
// SOUS-COMPOSANTS
// ==========================================
function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
      ? "text-rose-700"
      : "text-slate-900";
  return (
    <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function GrowthBlock({ title, g }: { title: string; g: AumGrowth | null }) {
  if (!g || g.startAUM === null || g.endAUM === null) {
    return (
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">{title}</div>
        <p className="text-xs text-slate-400">Historique insuffisant.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-1">{title}</div>
      <div className="text-sm text-slate-700">
        AUM <strong>{fmtBigFCFA(g.startAUM)}</strong> → <strong>{fmtBigFCFA(g.endAUM)}</strong>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Variation totale</span>
          <span className="font-semibold text-slate-900">{fmtSignedFCFA(g.totalGrowth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont effet performance</span>
          <span className="font-medium text-slate-700">
            {fmtSignedFCFA(g.perfEffect)} ({fmtPct(g.perfPct)})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont collecte nette</span>
          <span
            className={`font-medium ${
              g.netFlow !== null && g.netFlow >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {fmtSignedFCFA(g.netFlow)} ({fmtPct(g.netFlowPct)})
          </span>
        </div>
      </div>
    </div>
  );
}

type PeerRow = {
  id: string;
  nom: string;
  sub: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
};

function PeerTable({
  title,
  subtitle,
  rows,
}: {
  title: React.ReactNode;
  subtitle: string;
  rows: PeerRow[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400">Aucun fonds.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Fonds</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">AUM</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">YTD</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">1 an</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 min-w-0">
                  <Link href={`/fcp/${r.id}`} className="text-sm font-medium text-slate-900 hover:underline truncate block">
                    {r.nom}
                  </Link>
                  <div className="text-[11px] text-slate-500 truncate">{r.sub}</div>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                  {fmtBigFCFA(r.aum)}
                </td>
                <td
                  className={`px-3 py-2 text-right text-xs tabular-nums font-medium ${
                    r.ytd !== null && r.ytd >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.ytd, 1)}
                </td>
                <td
                  className={`px-4 py-2 text-right text-xs tabular-nums font-medium ${
                    r.y1 !== null && r.y1 >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {fmtPct(r.y1, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
