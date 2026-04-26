"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ==========================================
// TYPES
// ==========================================
type Manager = { slug: string; name: string; nbFunds: number; aumAtRef: number };

type CategoryBreakdown = { categorie: string; aum: number; nbFunds: number; share: number };
type MarketBreakdown = { categorie: string; aum: number; share: number };

type Quality = {
  topHalfShare: number | null;
  topQuartileShare: number | null;
  perfMedian1Y: number | null;
  perfWeighted1Y: number | null;
  nbEvaluated: number;
};

type FundRow = {
  id: string;
  nom: string;
  categorie: string;
  aum: number | null;
  ytd: number | null;
  y1: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
  latestVLDate: string;
  isStale: boolean;
};

type Growth = {
  startAUM: number;
  endAUM: number;
  totalGrowth: number;
  perfEffect: number;
  netFlow: number;
  perfPctApprox: number | null;
  fundsContributing: number;
};

type ManagerLeagueEntry = {
  slug: string;
  name: string;
  nbFunds: number;
  aumAtRef: number;
  marketShare: number;
  perfWeighted1Y: number | null;
  topQuartileShare: number | null;
};

type HeatmapCell = { categorie: string; date: string; perf: number | null; nbFunds: number };

type CadenceMix = {
  quotidienne: number;
  hebdomadaire: number;
  trimestrielle: number;
  irreguliere: number;
};

type Props = {
  manager: Manager;
  refQuarter: string;
  latestVLGlobal: string;
  marketTotalAUM: number;
  marketShare: number;
  aumDelta1Y: number | null;
  breakdown: CategoryBreakdown[];
  marketBreakdown: MarketBreakdown[];
  aumTimeline: Array<Record<string, number | string>>;
  quality: Quality;
  fundsList: FundRow[];
  growth1Y: Growth | null;
  growth3Y: Growth | null;
  allManagers: ManagerLeagueEntry[];
  myRank: number;
  perfHeatmap: HeatmapCell[];
  cadenceMix: CadenceMix;
};

// ==========================================
// HELPERS
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

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};
const QUARTILE_COLORS: Record<number, string> = {
  1: "#15803d",
  2: "#86efac",
  3: "#fbbf24",
  4: "#dc2626",
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
export default function SGPDetailView(props: Props) {
  const {
    manager,
    refQuarter,
    latestVLGlobal,
    marketShare,
    aumDelta1Y,
    breakdown,
    marketBreakdown,
    aumTimeline,
    quality,
    fundsList,
    growth1Y,
    growth3Y,
    allManagers,
    myRank,
    perfHeatmap,
    cadenceMix,
  } = props;

  // === Heatmap : matrice cat × dates (8 derniers trimestres) ===
  const heatmapDates = useMemo(
    () => Array.from(new Set(perfHeatmap.map((c) => c.date))).sort().slice(-8),
    [perfHeatmap]
  );
  const heatmapCats = useMemo(
    () => Array.from(new Set(perfHeatmap.map((c) => c.categorie))),
    [perfHeatmap]
  );
  const heatmapMap = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    for (const c of perfHeatmap) m.set(`${c.date}__${c.categorie}`, c);
    return m;
  }, [perfHeatmap]);

  // === Pie data (répartition SGP) ===
  const pieData = useMemo(
    () => breakdown.map((b) => ({ name: b.categorie, value: b.aum })),
    [breakdown]
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* ============================================ */}
      {/* BLOCK 1 : HEADER */}
      {/* ============================================ */}
      <header className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              <Link href="/marches/fcp" className="hover:underline">
                FCP / OPCVM
              </Link>{" "}
              · Société de gestion
            </p>
            <h1 className="text-3xl font-bold text-slate-900">{manager.name}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {breakdown.map((b) => (
                <span
                  key={b.categorie}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md"
                  style={{
                    background: (CATEGORY_COLORS[b.categorie] || "#94a3b8") + "1a",
                    color: CATEGORY_COLORS[b.categorie] || "#475569",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: CATEGORY_COLORS[b.categorie] || "#94a3b8" }}
                  />
                  {b.categorie} · {b.nbFunds}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[320px]">
            <KPI
              label="Encours total"
              value={fmtBigFCFA(manager.aumAtRef) + " FCFA"}
              sub={
                aumDelta1Y !== null
                  ? `1 an · ${fmtPct(aumDelta1Y)}`
                  : `au ${fmtDateFR(refQuarter)}`
              }
            />
            <KPI
              label="Part de marché"
              value={fmtPctRaw(marketShare, 1)}
              sub={`rang ${myRank}/${allManagers.length}`}
            />
            <KPI
              label="Fonds gérés"
              value={String(manager.nbFunds)}
              sub={`au ${fmtDateFR(refQuarter)}`}
            />
            <KPI
              label="Top quartile 1A"
              value={fmtPctRaw(quality.topQuartileShare, 0)}
              sub={`${quality.nbEvaluated} fonds évalués`}
            />
          </div>
        </div>
      </header>

      {/* ============================================ */}
      {/* BLOCK 2 + 4 : REPARTITION + SCORE QUALITE */}
      {/* ============================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Répartition catégorie */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Répartition par catégorie</h2>
            <p className="text-xs text-slate-500">
              Allocation interne vs marché — où la SGP est sur/sous-pondérée
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[d.name] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtBigFCFA(Number(v)) + " FCFA"} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {breakdown.map((b) => {
                const market = marketBreakdown.find((m) => m.categorie === b.categorie);
                const overweight = market ? b.share - market.share : 0;
                return (
                  <div key={b.categorie} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: CATEGORY_COLORS[b.categorie] || "#94a3b8" }}
                      />
                      <span className="font-medium text-slate-700 truncate">{b.categorie}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-700 font-semibold">{fmtPctRaw(b.share, 0)}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          overweight > 0.05
                            ? "bg-emerald-50 text-emerald-700"
                            : overweight < -0.05
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        vs marché {overweight >= 0 ? "+" : ""}
                        {(overweight * 100).toFixed(0)}pp
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Score qualité */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Score qualité (1 an)</h2>
            <p className="text-xs text-slate-500">
              Performance et positionnement vs catégorie sur 12 mois
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Perf pondérée AUM"
              value={fmtPct(quality.perfWeighted1Y, 2)}
              sub="moyenne capitalisée"
              tone={quality.perfWeighted1Y !== null && quality.perfWeighted1Y >= 0 ? "emerald" : "rose"}
            />
            <Stat
              label="Perf médiane fonds"
              value={fmtPct(quality.perfMedian1Y, 2)}
              sub="par fonds"
              tone={quality.perfMedian1Y !== null && quality.perfMedian1Y >= 0 ? "emerald" : "rose"}
            />
            <Stat
              label="% en top quartile"
              value={fmtPctRaw(quality.topQuartileShare, 0)}
              sub={`Q1 dans la catégorie`}
              tone="neutral"
            />
            <Stat
              label="% en top moitié"
              value={fmtPctRaw(quality.topHalfShare, 0)}
              sub="Q1 + Q2"
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 3 : EVOLUTION AUM (stacked area) */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Évolution de l&apos;encours par catégorie
          </h2>
          <p className="text-xs text-slate-500">
            Empilement trimestriel — révèle la stratégie d&apos;allocation de la SGP dans le temps
          </p>
        </div>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={aumTimeline}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) => String(d).slice(0, 7)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtBigFCFA(Number(v))}
                width={70}
              />
              <Tooltip
                formatter={(v) => fmtBigFCFA(Number(v)) + " FCFA"}
                labelFormatter={(d) => fmtDateFR(String(d))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stackId="1"
                  stroke={CATEGORY_COLORS[cat]}
                  fill={CATEGORY_COLORS[cat]}
                  fillOpacity={0.75}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 6 : DECOMPOSITION AUM AGREGEE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Décomposition de la croissance d&apos;encours
          </h2>
          <p className="text-xs text-slate-500">
            ΔAUM agrégé = effet performance + collecte nette implicite
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ManagerGrowthBlock title="Sur 1 an" g={growth1Y} />
          <ManagerGrowthBlock title="Sur 3 ans" g={growth3Y} />
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 5 : LISTE DES FONDS */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Fonds gérés ({manager.nbFunds})</h2>
          <p className="text-xs text-slate-500">Trié par AUM décroissant</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Fonds</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                  Catégorie
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">AUM</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden sm:table-cell">
                  YTD
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">1 an</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                  Q
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 hidden lg:table-cell">
                  Dernière VL
                </th>
              </tr>
            </thead>
            <tbody>
              {fundsList.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 min-w-0">
                    <Link
                      href={`/fcp/${f.id}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {f.nom}
                    </Link>
                    <div className="text-[11px] text-slate-500 md:hidden">{f.categorie}</div>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: CATEGORY_COLORS[f.categorie] || "#94a3b8" }}
                      />
                      {f.categorie}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                    {fmtBigFCFA(f.aum)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-xs tabular-nums font-medium hidden sm:table-cell ${
                      f.ytd !== null && f.ytd >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {fmtPct(f.ytd, 1)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-xs tabular-nums font-semibold ${
                      f.y1 !== null && f.y1 >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {fmtPct(f.y1, 1)}
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">
                    {f.quartile !== null ? (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold rounded"
                        style={{
                          background: QUARTILE_COLORS[f.quartile] + "33",
                          color: QUARTILE_COLORS[f.quartile],
                        }}
                      >
                        Q{f.quartile}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-xs hidden lg:table-cell">
                    <span className={f.isStale ? "text-slate-400" : "text-slate-600"}>
                      {fmtDateFR(f.latestVLDate)}
                    </span>
                    {f.isStale && (
                      <span className="ml-1 text-[10px] text-rose-600">stale</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 8 : HEATMAP PERF SGP */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 overflow-x-auto">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Performance trimestrielle de la SGP par catégorie
          </h2>
          <p className="text-xs text-slate-500">
            Médiane des fonds de la SGP dans chaque catégorie — révèle où elle excelle ou sous-perf
          </p>
        </div>
        {heatmapCats.length === 0 ? (
          <p className="text-xs text-slate-400">Pas encore d&apos;historique trimestriel.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 px-2 py-2 sticky left-0 bg-white">
                  Catégorie
                </th>
                {heatmapDates.map((d) => (
                  <th
                    key={d}
                    className="text-xs font-semibold text-slate-600 px-2 py-2 whitespace-nowrap"
                  >
                    {d.slice(0, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapCats.map((cat) => (
                <tr key={cat}>
                  <td className="text-xs font-medium text-slate-800 px-2 py-1.5 whitespace-nowrap sticky left-0 bg-white">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: CATEGORY_COLORS[cat] || "#94a3b8" }}
                      />
                      {cat}
                    </span>
                  </td>
                  {heatmapDates.map((d) => {
                    const c = heatmapMap.get(`${d}__${cat}`);
                    return (
                      <td
                        key={d}
                        className="px-1.5 py-1.5 text-center text-xs font-medium"
                        title={c ? `${c.nbFunds} fonds` : ""}
                        style={{
                          background: perfHeatColor(c?.perf ?? null),
                          color: "#0f172a",
                          minWidth: 70,
                        }}
                      >
                        {c?.perf === null || c?.perf === undefined ? "—" : fmtPct(c.perf, 1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ============================================ */}
      {/* BLOCK 9 : CADENCE DE PUBLICATION AGREGEE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Transparence des publications</h2>
          <p className="text-xs text-slate-500">
            Cadence de publication des VL des {manager.nbFunds} fonds gérés ·{" "}
            référence {fmtDateFR(latestVLGlobal)}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CadenceTile label="Quotidienne" count={cadenceMix.quotidienne} total={manager.nbFunds} color="#15803d" />
          <CadenceTile label="Hebdomadaire" count={cadenceMix.hebdomadaire} total={manager.nbFunds} color="#0F6E56" />
          <CadenceTile label="Trimestrielle" count={cadenceMix.trimestrielle} total={manager.nbFunds} color="#185FA5" />
          <CadenceTile label="Irrégulière" count={cadenceMix.irreguliere} total={manager.nbFunds} color="#dc2626" />
        </div>
      </section>

      {/* ============================================ */}
      {/* BLOCK 7 : LEAGUE TABLE */}
      {/* ============================================ */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Position concurrentielle</h2>
          <p className="text-xs text-slate-500">
            Toutes les SGP UEMOA — {manager.name} surlignée
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-12">#</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">SGP</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Fonds</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">AUM</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">PdM</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden sm:table-cell">
                  Perf 1A pondérée
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">
                  % top Q
                </th>
              </tr>
            </thead>
            <tbody>
              {allManagers.map((m, i) => {
                const isMe = m.slug === manager.slug;
                return (
                  <tr
                    key={m.slug}
                    className={`border-b border-slate-100 last:border-0 ${
                      isMe ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-3 py-2 text-xs font-bold text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/sgp/${m.slug}`}
                        className={`text-sm hover:underline ${
                          isMe ? "font-bold text-blue-900" : "font-medium text-slate-900"
                        }`}
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                      {m.nbFunds}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                      {fmtBigFCFA(m.aumAtRef)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                      {fmtPctRaw(m.marketShare, 1)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-xs tabular-nums font-medium hidden sm:table-cell ${
                        m.perfWeighted1Y !== null && m.perfWeighted1Y >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {fmtPct(m.perfWeighted1Y, 1)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-700 hidden md:table-cell">
                      {fmtPctRaw(m.topQuartileShare, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Source : publications BRVM / SGP UEMOA. Encours ponctuel à la date trimestrielle. Quartiles
        et scores qualité calculés sur la cohorte de chaque catégorie. Indicateurs de risque non
        affichés (fréquence de publication des VL hétérogène entre fonds).
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

function CadenceTile({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div className="p-3 rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{count}</div>
      <div className="text-[11px] text-slate-500">
        {(pct * 100).toFixed(0)}% des fonds
      </div>
    </div>
  );
}

function ManagerGrowthBlock({ title, g }: { title: string; g: Growth | null }) {
  if (!g || g.fundsContributing === 0) {
    return (
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
          {title}
        </div>
        <p className="text-xs text-slate-400">Historique insuffisant.</p>
      </div>
    );
  }
  const collectePctOfGrowth =
    g.totalGrowth !== 0 ? g.netFlow / Math.abs(g.totalGrowth) : 0;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
        {title}
      </div>
      <div className="text-sm text-slate-700 mb-2">
        AUM <strong>{fmtBigFCFA(g.startAUM)}</strong> →{" "}
        <strong>{fmtBigFCFA(g.endAUM)}</strong>{" "}
        <span className="text-xs text-slate-500">
          ({g.fundsContributing} fonds)
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Variation totale</span>
          <span className="font-semibold text-slate-900">{fmtSignedFCFA(g.totalGrowth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont effet performance</span>
          <span className="font-medium text-slate-700">
            {fmtSignedFCFA(g.perfEffect)} ({fmtPct(g.perfPctApprox)})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">dont collecte nette</span>
          <span
            className={`font-medium ${
              g.netFlow >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {fmtSignedFCFA(g.netFlow)}
          </span>
        </div>
        <div className="flex justify-between pt-1 border-t border-slate-100">
          <span className="text-slate-500">Part de la collecte dans la variation</span>
          <span className="font-semibold text-slate-700">
            {fmtPctRaw(collectePctOfGrowth, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
