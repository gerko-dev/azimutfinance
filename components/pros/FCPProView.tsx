"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { CategoryAggregate, ManagerAggregate } from "@/lib/fcpMath";

// ============================================================================
// TYPES
// ============================================================================
type FundRow = {
  id: string;
  nom: string;
  gestionnaire: string;
  categorie: string;
  type: string;
  aum: number | null;
  vl: number | null;
  vlDate: string;
  isStale: boolean;
  cadence: string;
  ytd: number | null;
  y1: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
  excess1Y: number | null;
};

export type FCPProData = {
  asOf: {
    refQuarter: string;
    prevQuarter: string;
    latestVL: string;
    latestBoc: string;
    freshBocCount: number;
  };
  kpis: {
    totalAUM: number;
    nbFunds: number;
    nbManagers: number;
    nbCategories: number;
    medianYTD: number | null;
    median1Y: number | null;
    staleCount: number;
  };
  categories: CategoryAggregate[];
  managers: Array<ManagerAggregate & { slug: string }>;
  aumTimeline: Array<Record<string, number | string>>;
  catKeys: string[];
  flows: Array<{
    categorie: string;
    perfEffect: number;
    netFlow: number;
    startAUM: number;
    endAUM: number;
    n: number;
  }>;
  heatmap: { quarters: string[]; categories: string[]; cells: Record<string, number | null> };
  funds: FundRow[];
};

type Tab = "marche" | "collecte" | "gestionnaires" | "performance" | "explorateur";

// ============================================================================
// FORMATAGE
// ============================================================================
function fmtBigFCFA(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2).replace(".", ",") + " T";
  if (a >= 1e9) return sign + (a / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(0) + " M";
  return sign + Math.round(a).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function fmtPctSigned(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return sign + (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function qLabel(iso: string): string {
  if (!iso || iso.length < 7) return iso;
  const m = iso.slice(5, 7);
  const yy = iso.slice(2, 4);
  const t = m === "03" ? "T1" : m === "06" ? "T2" : m === "09" ? "T3" : "T4";
  return `${t} ${yy}`;
}

const CAT_COLOR: Record<string, string> = {
  Obligataire: "#60a5fa",
  Monétaire: "#34d399",
  Diversifié: "#a78bfa",
  Actions: "#fbbf24",
  "Actifs non cotés": "#f472b6",
};
function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? "#94a3b8";
}

// Échelle verte→rouge pour la heatmap (perf décimale).
function heatBg(perf: number | null): string {
  if (perf == null || !isFinite(perf)) return "transparent";
  const pct = perf * 100;
  if (pct > 3) return "rgba(16,185,129,0.55)";
  if (pct > 1) return "rgba(16,185,129,0.32)";
  if (pct > 0) return "rgba(16,185,129,0.16)";
  if (pct > -1) return "rgba(244,63,94,0.16)";
  if (pct > -3) return "rgba(244,63,94,0.32)";
  return "rgba(244,63,94,0.55)";
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function FCPProView({ data }: { data: FCPProData }) {
  const [tab, setTab] = useState<Tab>("marche");
  const { kpis, asOf } = data;

  return (
    <div className="space-y-5">
      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Encours total" value={fmtBigFCFA(kpis.totalAUM)} sub={`au ${qLabel(asOf.refQuarter)}`} />
        <Kpi label="Fonds suivis" value={String(kpis.nbFunds)} sub={`${kpis.nbCategories} catégories`} />
        <Kpi label="Sociétés de gestion" value={String(kpis.nbManagers)} sub="gérants actifs" />
        <Kpi
          label="Perf médiane 1A"
          value={fmtPct(kpis.median1Y)}
          sub="marché"
          tone={kpis.median1Y == null ? "neutral" : kpis.median1Y >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Perf médiane YTD"
          value={fmtPct(kpis.medianYTD)}
          sub="depuis 1er janv."
          tone={kpis.medianYTD == null ? "neutral" : kpis.medianYTD >= 0 ? "up" : "down"}
        />
        <Kpi label="VL fraîches (BOC)" value={String(asOf.freshBocCount)} sub={asOf.latestBoc ? `BOC ${asOf.latestBoc}` : "—"} />
        <Kpi
          label="VL périmées"
          value={String(kpis.staleCount)}
          sub="> 15 j de retard"
          tone={kpis.staleCount > 0 ? "down" : "up"}
        />
      </div>

      {/* ====== TABS ====== */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {(
          [
            ["marche", "Vue marché"],
            ["collecte", "Collecte & flux"],
            ["gestionnaires", "Gestionnaires"],
            ["performance", "Performance"],
            ["explorateur", `Explorateur (${data.funds.length})`],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              tab === key
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "marche" && <MarcheTab data={data} />}
      {tab === "collecte" && <CollecteTab data={data} />}
      {tab === "gestionnaires" && <GestionnairesTab data={data} />}
      {tab === "performance" && <PerformanceTab data={data} />}
      {tab === "explorateur" && <ExplorateurTab data={data} />}
    </div>
  );
}

// ============================================================================
// ONGLET VUE MARCHE
// ============================================================================
function MarcheTab({ data }: { data: FCPProData }) {
  const { aumTimeline, catKeys, categories } = data;

  // Domaine commun pour les barres de dispersion (perf 1Y).
  const dispDomain = useMemo(() => {
    const vals: number[] = [];
    for (const c of categories) {
      if (c.perfMin1Y != null) vals.push(c.perfMin1Y);
      if (c.perfMax1Y != null) vals.push(c.perfMax1Y);
    }
    if (vals.length === 0) return { min: 0, max: 0.1 };
    return { min: Math.min(...vals, 0), max: Math.max(...vals) };
  }, [categories]);

  return (
    <div className="space-y-4">
      {/* Encours par catégorie dans le temps */}
      <Card title="Encours par catégorie" subtitle="AUM trimestriel · stacked">
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={aumTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={20} />
              <YAxis stroke="#64748b" fontSize={11} width={48} tickFormatter={(v) => fmtBigFCFA(Number(v))} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                labelFormatter={(d) => qLabel(String(d))}
                formatter={(v, n) => [fmtBigFCFA(Number(v)) + " FCFA", String(n)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
              {catKeys.map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  name={cat}
                  stackId="aum"
                  stroke={catColor(cat)}
                  fill={catColor(cat)}
                  fillOpacity={0.5}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Poids des catégories */}
        <Card title="Poids des catégories" subtitle="part de l'encours total">
          <div className="divide-y divide-slate-800">
            {categories.map((c) => {
              const share = data.kpis.totalAUM > 0 ? c.aumTotal / data.kpis.totalAUM : 0;
              return (
                <div key={c.categorie} className="px-4 py-2.5">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: catColor(c.categorie) }} />
                      {c.categorie}
                      <span className="text-[11px] text-slate-500">· {c.nbFunds} fonds</span>
                    </span>
                    <span className="font-mono text-slate-300">
                      {fmtBigFCFA(c.aumTotal)} <span className="text-slate-500">· {fmtPct(share, 1)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, share * 100)}%`, backgroundColor: catColor(c.categorie) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Dispersion des performances 1Y */}
        <Card title="Dispersion des perf. 1A" subtitle="min · Q1–médiane–Q3 · max par catégorie">
          <div className="divide-y divide-slate-800">
            {categories.map((c) => (
              <DispersionRow key={c.categorie} cat={c} domain={dispDomain} />
            ))}
          </div>
          <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800">
            Boîte = intervalle interquartile (Q1–Q3) · trait clair = médiane · moustaches = min/max.
          </p>
        </Card>
      </div>
    </div>
  );
}

function DispersionRow({
  cat,
  domain,
}: {
  cat: CategoryAggregate;
  domain: { min: number; max: number };
}) {
  const span = domain.max - domain.min || 1;
  const pos = (v: number | null) => (v == null ? null : ((v - domain.min) / span) * 100);
  const min = pos(cat.perfMin1Y);
  const max = pos(cat.perfMax1Y);
  const q1 = pos(cat.perfQ1_1Y);
  const q3 = pos(cat.perfQ3_1Y);
  const med = pos(cat.perfMedian1Y);
  const color = catColor(cat.categorie);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-slate-200">{cat.categorie}</span>
        <span className="font-mono text-xs text-slate-400">
          méd. {fmtPct(cat.perfMedian1Y)}
        </span>
      </div>
      <div className="relative h-4">
        {/* moustaches */}
        {min != null && max != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-px bg-slate-600"
            style={{ left: `${min}%`, width: `${Math.max(0, max - min)}%` }}
          />
        )}
        {/* boîte Q1–Q3 */}
        {q1 != null && q3 != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm opacity-40"
            style={{ left: `${q1}%`, width: `${Math.max(1, q3 - q1)}%`, backgroundColor: color }}
          />
        )}
        {/* médiane */}
        {med != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4"
            style={{ left: `${med}%`, backgroundColor: color }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ONGLET COLLECTE & FLUX
// ============================================================================
function CollecteTab({ data }: { data: FCPProData }) {
  const { flows, asOf } = data;

  const chartData = useMemo(
    () =>
      flows.map((f) => ({
        categorie: f.categorie,
        "Effet performance": Math.round(f.perfEffect),
        "Collecte nette": Math.round(f.netFlow),
      })),
    [flows]
  );

  const totals = useMemo(
    () =>
      flows.reduce(
        (acc, f) => {
          acc.perfEffect += f.perfEffect;
          acc.netFlow += f.netFlow;
          acc.start += f.startAUM;
          acc.end += f.endAUM;
          return acc;
        },
        { perfEffect: 0, netFlow: 0, start: 0, end: 0 }
      ),
    [flows]
  );

  if (flows.length === 0) {
    return (
      <Card title="Décomposition de la collecte">
        <div className="p-10 text-center text-sm text-slate-500">
          Décomposition indisponible : il faut deux trimestres canoniques consécutifs publiés.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Totaux marché */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="ΔEncours" value={fmtBigFCFA(totals.end - totals.start)} sub={`${qLabel(asOf.prevQuarter)} → ${qLabel(asOf.refQuarter)}`} tone={totals.end - totals.start >= 0 ? "up" : "down"} />
        <Kpi label="Effet performance" value={fmtBigFCFA(totals.perfEffect)} sub="revalorisation VL" tone={totals.perfEffect >= 0 ? "up" : "down"} />
        <Kpi label="Collecte nette" value={fmtBigFCFA(totals.netFlow)} sub="souscriptions − rachats" tone={totals.netFlow >= 0 ? "up" : "down"} />
        <Kpi label="Collecte / encours" value={fmtPctSigned(totals.start > 0 ? totals.netFlow / totals.start : null)} sub="taux de collecte" tone={totals.netFlow >= 0 ? "up" : "down"} />
      </div>

      <Card title="Décomposition ΔAUM par catégorie" subtitle={`${qLabel(asOf.prevQuarter)} → ${qLabel(asOf.refQuarter)} · effet prix vs flux`}>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="categorie" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={11} width={48} tickFormatter={(v) => fmtBigFCFA(Number(v))} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                formatter={(v, n) => [fmtBigFCFA(Number(v)) + " FCFA", String(n)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
              <ReferenceLine y={0} stroke="#475569" />
              <Bar dataKey="Effet performance" fill="#60a5fa" />
              <Bar dataKey="Collecte nette" fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Détail par catégorie" subtitle="valeurs en FCFA">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-4 py-2.5 text-left font-medium">Catégorie</th>
                <th className="px-3 py-2.5 text-right font-medium">Fonds</th>
                <th className="px-3 py-2.5 text-right font-medium">AUM début</th>
                <th className="px-3 py-2.5 text-right font-medium">AUM fin</th>
                <th className="px-3 py-2.5 text-right font-medium">Effet perf.</th>
                <th className="px-3 py-2.5 text-right font-medium">Collecte nette</th>
                <th className="px-3 py-2.5 text-right font-medium">Taux collecte</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.categorie} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: catColor(f.categorie) }} />
                      {f.categorie}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{f.n}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtBigFCFA(f.startAUM)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{fmtBigFCFA(f.endAUM)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${f.perfEffect >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtBigFCFA(f.perfEffect)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${f.netFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtBigFCFA(f.netFlow)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${f.netFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtPctSigned(f.startAUM > 0 ? f.netFlow / f.startAUM : null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800 leading-relaxed">
          Collecte nette = ΔAUM − (AUM début × perf VL). Seuls les fonds publiés aux deux dates entrent dans
          la décomposition ; les créations/fermetures de la période en sont exclues.
        </p>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET GESTIONNAIRES
// ============================================================================
function GestionnairesTab({ data }: { data: FCPProData }) {
  const { managers } = data;
  const maxShare = managers.length > 0 ? managers[0].marketShare : 1;

  const exportCsv = () => {
    const header = ["Gestionnaire", "Fonds", "AUM_FCFA", "Part_marche", "Perf_pondere_1Y", "Perf_mediane_1Y", "Part_Q1"];
    const lines = managers.map((m) =>
      [
        `"${m.gestionnaire.replace(/"/g, '""')}"`,
        m.nbFunds,
        Math.round(m.aumTotal),
        (m.marketShare * 100).toFixed(2).replace(".", ","),
        m.perfWeighted1Y != null ? (m.perfWeighted1Y * 100).toFixed(2).replace(".", ",") : "",
        m.perfMedian1Y != null ? (m.perfMedian1Y * 100).toFixed(2).replace(".", ",") : "",
        m.topQuartileShare != null ? (m.topQuartileShare * 100).toFixed(0) : "",
      ].join(";")
    );
    downloadCsv([header.join(";"), ...lines].join("\r\n"), "gestionnaires-fcp.csv");
  };

  return (
    <Card
      title="Classement des sociétés de gestion"
      subtitle={`${managers.length} gérants · pondéré par l'encours`}
      right={<CsvButton onClick={exportCsv} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
              <th className="px-4 py-2.5 text-left font-medium">#</th>
              <th className="px-3 py-2.5 text-left font-medium">Gestionnaire</th>
              <th className="px-3 py-2.5 text-right font-medium">Fonds</th>
              <th className="px-3 py-2.5 text-left font-medium">Part de marché</th>
              <th className="px-3 py-2.5 text-right font-medium">Perf. pondérée 1A</th>
              <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Perf. médiane 1A</th>
              <th className="px-3 py-2.5 text-right font-medium">% top quartile</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((m, i) => (
              <tr key={m.gestionnaire} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                <td className="px-4 py-2 font-mono text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/pros/sgo/${m.slug}`}
                    className="text-slate-200 hover:text-blue-300 transition"
                  >
                    {m.gestionnaire}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">{m.nbFunds}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${maxShare > 0 ? (m.marketShare / maxShare) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="font-mono text-slate-400 w-12 text-right">{fmtPct(m.marketShare, 1)}</span>
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${tone(m.perfWeighted1Y)}`}>{fmtPct(m.perfWeighted1Y)}</td>
                <td className={`px-3 py-2 text-right font-mono hidden md:table-cell ${tone(m.perfMedian1Y)}`}>
                  {fmtPct(m.perfMedian1Y)}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.topQuartileShare != null ? (
                    <span
                      className={`font-mono px-1.5 py-0.5 rounded ${
                        m.topQuartileShare >= 0.5
                          ? "bg-emerald-500/15 text-emerald-300"
                          : m.topQuartileShare > 0
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {(m.topQuartileShare * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800 leading-relaxed">
        Perf. pondérée = moyenne des perf. 1 an pondérée par l&apos;encours des fonds · % top quartile = part
        des fonds classés Q1 dans leur catégorie (qualité de gestion).
      </p>
    </Card>
  );
}

// ============================================================================
// ONGLET PERFORMANCE
// ============================================================================
function PerformanceTab({ data }: { data: FCPProData }) {
  const { heatmap, funds } = data;

  const ranked = useMemo(
    () => funds.filter((f) => f.y1 != null).sort((a, b) => (b.y1 ?? 0) - (a.y1 ?? 0)),
    [funds]
  );
  const top = ranked.slice(0, 8);
  const flop = ranked.slice(-8).reverse();

  return (
    <div className="space-y-4">
      {/* Heatmap trimestrielle */}
      <Card title="Perf. trimestrielle médiane par catégorie" subtitle="8 derniers trimestres · Δ VL médiane">
        <div className="overflow-x-auto p-4">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-[11px] text-slate-500 font-medium px-2"> </th>
                {heatmap.quarters.map((q) => (
                  <th key={q} className="text-center text-[11px] text-slate-400 font-medium px-2">
                    {qLabel(q)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.categories.map((cat) => (
                <tr key={cat}>
                  <td className="text-slate-300 whitespace-nowrap px-2 py-1 text-[11px]">{cat}</td>
                  {heatmap.quarters.map((q) => {
                    const v = heatmap.cells[`${q}|${cat}`] ?? null;
                    return (
                      <td
                        key={q}
                        className="text-center font-mono rounded px-2 py-1.5 text-slate-100"
                        style={{ backgroundColor: heatBg(v) }}
                        title={`${cat} · ${qLabel(q)} : ${fmtPctSigned(v)}`}
                      >
                        {v == null ? "—" : fmtPctSigned(v, 1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderTable title="Top 8 · perf. 1 an" rows={top} positive />
        <LeaderTable title="Flop 8 · perf. 1 an" rows={flop} positive={false} />
      </div>
    </div>
  );
}

function LeaderTable({ title, rows, positive }: { title: string; rows: FundRow[]; positive: boolean }) {
  return (
    <Card title={title} subtitle="rendement total 1 an">
      <div className="divide-y divide-slate-800">
        {rows.map((f) => (
          <Link
            key={f.id}
            href={`/pros/fcp/${f.id}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition text-sm"
          >
            <div className="min-w-0">
              <div className="text-slate-200 truncate">{f.nom}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {f.gestionnaire} · {f.categorie}
              </div>
            </div>
            <span className={`font-mono font-medium shrink-0 ${positive ? "text-emerald-400" : "text-red-400"}`}>
              {fmtPctSigned(f.y1)}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// ONGLET EXPLORATEUR
// ============================================================================
type SortKey = "nom" | "gestionnaire" | "categorie" | "aum" | "ytd" | "y1" | "excess1Y";

function ExplorateurTab({ data }: { data: FCPProData }) {
  const [cat, setCat] = useState<string>("Toutes");
  const [type, setType] = useState<string>("Tous");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("aum");
  const [sortDesc, setSortDesc] = useState(true);

  const cats = useMemo(
    () => ["Toutes", ...Array.from(new Set(data.funds.map((f) => f.categorie))).sort()],
    [data.funds]
  );
  const types = useMemo(
    () => ["Tous", ...Array.from(new Set(data.funds.map((f) => f.type))).sort()],
    [data.funds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = data.funds.filter((f) => {
      if (cat !== "Toutes" && f.categorie !== cat) return false;
      if (type !== "Tous" && f.type !== type) return false;
      if (q && !f.nom.toLowerCase().includes(q) && !f.gestionnaire.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDesc ? -1 : 1;
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number));
    });
    return out;
  }, [data.funds, cat, type, query, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  };

  const exportCsv = () => {
    const header = ["Fonds", "Gestionnaire", "Categorie", "Type", "AUM_FCFA", "VL", "Date_VL", "YTD", "Perf_1Y", "Quartile", "Exces_vs_cat", "Cadence"];
    const lines = filtered.map((f) =>
      [
        `"${f.nom.replace(/"/g, '""')}"`,
        `"${f.gestionnaire.replace(/"/g, '""')}"`,
        f.categorie,
        f.type,
        f.aum != null ? Math.round(f.aum) : "",
        f.vl != null ? String(f.vl).replace(".", ",") : "",
        f.vlDate,
        f.ytd != null ? (f.ytd * 100).toFixed(2).replace(".", ",") : "",
        f.y1 != null ? (f.y1 * 100).toFixed(2).replace(".", ",") : "",
        f.quartile ?? "",
        f.excess1Y != null ? (f.excess1Y * 100).toFixed(2).replace(".", ",") : "",
        f.cadence,
      ].join(";")
    );
    downloadCsv([header.join(";"), ...lines].join("\r\n"), "explorateur-fcp.csv");
  };

  return (
    <Card
      title="Explorateur de fonds"
      subtitle={`${filtered.length} / ${data.funds.length} fonds`}
      right={<CsvButton onClick={exportCsv} />}
    >
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un fonds ou gérant…"
          className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
        />
        <Select value={cat} onChange={setCat} options={cats} />
        <Select value={type} onChange={setType} options={types} />
      </div>

      <div className="overflow-x-auto max-h-[34rem]">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900">
              <Th onClick={() => toggleSort("nom")} active={sortKey === "nom"} desc={sortDesc}>Fonds</Th>
              <Th onClick={() => toggleSort("gestionnaire")} active={sortKey === "gestionnaire"} desc={sortDesc} cls="hidden md:table-cell">Gérant</Th>
              <Th onClick={() => toggleSort("categorie")} active={sortKey === "categorie"} desc={sortDesc}>Catégorie</Th>
              <Th onClick={() => toggleSort("aum")} active={sortKey === "aum"} desc={sortDesc} right>AUM</Th>
              <Th onClick={() => toggleSort("ytd")} active={sortKey === "ytd"} desc={sortDesc} right>YTD</Th>
              <Th onClick={() => toggleSort("y1")} active={sortKey === "y1"} desc={sortDesc} right>1A</Th>
              <Th onClick={() => toggleSort("excess1Y")} active={sortKey === "excess1Y"} desc={sortDesc} right cls="hidden lg:table-cell">Excès cat.</Th>
              <th className="px-3 py-2.5 text-center font-medium">Q</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                <td className="px-4 py-2">
                  <Link href={`/pros/fcp/${f.id}`} className="text-slate-200 hover:text-white transition flex items-center gap-1.5">
                    {f.nom}
                    {f.isStale && <span title="VL périmée (> 15 j)" className="text-amber-400 text-[10px]">⚠</span>}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-400 hidden md:table-cell truncate max-w-[10rem]">{f.gestionnaire}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-300">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: catColor(f.categorie) }} />
                    {f.categorie}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">{fmtBigFCFA(f.aum)}</td>
                <td className={`px-3 py-2 text-right font-mono ${tone(f.ytd)}`}>{fmtPctSigned(f.ytd)}</td>
                <td className={`px-3 py-2 text-right font-mono ${tone(f.y1)}`}>{fmtPctSigned(f.y1)}</td>
                <td className={`px-3 py-2 text-right font-mono hidden lg:table-cell ${tone(f.excess1Y)}`}>
                  {fmtPctSigned(f.excess1Y)}
                </td>
                <td className="px-3 py-2 text-center">
                  {f.quartile != null ? <QuartileBadge q={f.quartile} /> : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">Aucun fonds ne correspond aux filtres.</div>
        )}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800 leading-relaxed">
        Excès cat. = perf. 1 an du fonds − médiane 1 an de sa catégorie · Q = quartile dans la catégorie
        (Q1 = meilleur). ⚠ = dernière VL de plus de 15 jours.
      </p>
    </Card>
  );
}

// ============================================================================
// SOUS-COMPOSANTS PARTAGES
// ============================================================================
function tone(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-300";
}

function Kpi({
  label,
  value,
  sub,
  tone: t = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const subColor = t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-500";
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className="text-base md:text-lg font-semibold text-white font-mono mt-1">{value}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${subColor} truncate`}>{sub}</div>}
    </div>
  );
}

function Card({
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        {subtitle && <span className="text-[10px] text-slate-500">· {subtitle}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  desc,
  right,
  cls = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  right?: boolean;
  cls?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 font-medium cursor-pointer select-none hover:text-slate-300 ${
        right ? "text-right" : "text-left"
      } ${cls}`}
    >
      {children}
      {active && <span className="ml-1 text-blue-400">{desc ? "▼" : "▲"}</span>}
    </th>
  );
}

function QuartileBadge({ q }: { q: 1 | 2 | 3 | 4 }) {
  const cls =
    q === 1
      ? "bg-emerald-500/15 text-emerald-300"
      : q === 2
      ? "bg-blue-500/15 text-blue-300"
      : q === 3
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";
  return <span className={`font-mono px-1.5 py-0.5 rounded ${cls}`}>Q{q}</span>;
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition"
    >
      ⬇ Export CSV
    </button>
  );
}

function downloadCsv(body: string, filename: string) {
  const csv = "﻿" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
