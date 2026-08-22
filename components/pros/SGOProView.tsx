"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type {
  CategoryBreakdown,
  ManagerQualityScore,
  ManagerCadenceMix,
} from "@/lib/fcpMath";

// ============================================================================
// TYPES
// ============================================================================
type Growth = {
  startAUM: number;
  endAUM: number;
  totalGrowth: number;
  perfEffect: number;
  netFlow: number;
  perfPctApprox: number | null;
  fundsContributing: number;
  newFundsCount: number;
  newFundsAUM: number;
  closedFundsCount: number;
  closedFundsAUM: number;
};

type ManagerRow = {
  slug: string;
  name: string;
  nbFunds: number;
  aumAtRef: number;
  marketShare: number;
  perfWeighted1Y: number | null;
  topQuartileShare: number | null;
};

export type SGOProData = {
  manager: { slug: string; name: string; nbFunds: number; aumAtRef: number };
  refQuarter: string;
  marketTotalAUM: number;
  marketShare: number;
  aumDelta1Y: number | null;
  myRank: number;
  nbManagers: number;
  breakdown: CategoryBreakdown[];
  marketShareByCat: Record<string, number>;
  aumTimeline: Array<Record<string, number | string>>;
  catKeys: string[];
  quality: ManagerQualityScore;
  fundsList: Array<{
    id: string;
    nom: string;
    categorie: string;
    aum: number | null;
    ytd: number | null;
    y1: number | null;
    quartile: 1 | 2 | 3 | 4 | null;
    isStale: boolean;
    vlLatest: number | null;
    dayChange: number | null;
  }>;
  growth1Y: Growth | null;
  growth3Y: Growth | null;
  allManagers: ManagerRow[];
  heatmap: { quarters: string[]; categories: string[]; cells: Record<string, number | null> };
  cadenceMix: ManagerCadenceMix;
};

type Tab = "synthese" | "performance" | "encours" | "concurrence";

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
function fmtPct(v: number | null, digits = 1): string {
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
function tone(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-300";
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
function quartileColor(q: 1 | 2 | 3 | 4 | null): string {
  if (q == null) return "bg-slate-700 text-slate-400";
  return q === 1
    ? "bg-emerald-500/15 text-emerald-300"
    : q === 2
    ? "bg-blue-500/15 text-blue-300"
    : q === 3
    ? "bg-amber-500/15 text-amber-300"
    : "bg-red-500/15 text-red-300";
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function SGOProView({ data }: { data: SGOProData }) {
  const { manager, quality } = data;
  const [tab, setTab] = useState<Tab>("synthese");

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4">
        <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
          <Link href="/pros" className="hover:text-slate-300 transition">Pro Terminal</Link>
          <span className="text-slate-700">›</span>
          <Link href="/pros/sgo" className="hover:text-slate-300 transition">Sociétés de gestion</Link>
          <span className="text-slate-700">›</span>
          <span className="text-slate-400">{manager.name}</span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-white">{manager.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              Société de gestion · OPCVM UEMOA · {manager.nbFunds} fonds · rang {data.myRank}/{data.nbManagers} par encours
            </p>
          </div>
          <Link
            href={`/sgo/${manager.slug}`}
            className="text-[11px] px-2.5 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
          >
            Fiche publique ↗
          </Link>
        </div>
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Encours géré" value={fmtBigFCFA(manager.aumAtRef)} sub={`au ${qLabel(data.refQuarter)}`} />
        <Kpi label="Part de marché" value={fmtPct(data.marketShare)} sub={`rang ${data.myRank}/${data.nbManagers}`} />
        <Kpi
          label="Δ Encours 1A"
          value={fmtPctSigned(data.aumDelta1Y)}
          sub="vs an dernier"
          tone={data.aumDelta1Y == null ? "neutral" : data.aumDelta1Y >= 0 ? "up" : "down"}
        />
        <Kpi label="Fonds gérés" value={String(manager.nbFunds)} sub={`${data.breakdown.length} catégories`} />
        <Kpi
          label="% top quartile"
          value={quality.topQuartileShare != null ? `${Math.round(quality.topQuartileShare * 100)}%` : "—"}
          sub={`${quality.nbEvaluated} fonds évalués`}
          tone={quality.topQuartileShare == null ? "neutral" : quality.topQuartileShare >= 0.5 ? "up" : "down"}
        />
        <Kpi
          label="Perf. pondérée 1A"
          value={fmtPctSigned(quality.perfWeighted1Y)}
          sub="par encours"
          tone={quality.perfWeighted1Y == null ? "neutral" : quality.perfWeighted1Y >= 0 ? "up" : "down"}
        />
      </div>

      {/* ====== TABS ====== */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {(
          [
            ["synthese", "Synthèse & encours"],
            ["performance", "Performance & fonds"],
            ["encours", "Croissance & cadence"],
            ["concurrence", "Position concurrentielle"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              tab === key ? "border-blue-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "synthese" && <SyntheseTab data={data} />}
      {tab === "performance" && <PerformanceTab data={data} />}
      {tab === "encours" && <EncoursTab data={data} />}
      {tab === "concurrence" && <ConcurrenceTab data={data} />}
    </div>
  );
}

// ============================================================================
// ONGLET SYNTHESE & ENCOURS
// ============================================================================
function SyntheseTab({ data }: { data: SGOProData }) {
  const { breakdown, marketShareByCat, aumTimeline, catKeys } = data;
  return (
    <div className="space-y-4">
      <Card title="Évolution de l'encours géré" subtitle="par catégorie · trimestriel">
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

      <Card title="Répartition catégorielle" subtitle="poids interne vs part de marché de la SGO dans la catégorie">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-4 py-2.5 text-left font-medium">Catégorie</th>
                <th className="px-3 py-2.5 text-right font-medium">Fonds</th>
                <th className="px-3 py-2.5 text-right font-medium">Encours</th>
                <th className="px-3 py-2.5 text-left font-medium">Poids interne</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Part de marché cat.</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.categorie} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: catColor(b.categorie) }} />
                      {b.categorie}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{b.nbFunds}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{fmtBigFCFA(b.aum)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, b.share * 100)}%`, backgroundColor: catColor(b.categorie) }} />
                      </div>
                      <span className="font-mono text-slate-400 w-12 text-right">{fmtPct(b.share)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400 hidden md:table-cell">
                    {marketShareByCat[b.categorie] != null
                      ? fmtPct(b.aum / (data.marketTotalAUM * marketShareByCat[b.categorie]))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800">
          Part de marché cat. = encours de la SGO dans la catégorie / encours total de la catégorie au {qLabel(data.refQuarter)}.
        </p>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET PERFORMANCE & FONDS
// ============================================================================
function PerformanceTab({ data }: { data: SGOProData }) {
  const { heatmap, fundsList } = data;
  return (
    <div className="space-y-4">
      {heatmap.categories.length > 0 && heatmap.quarters.length > 0 && (
        <Card title="Performance médiane par catégorie" subtitle="8 derniers trimestres · fonds de la SGO">
          <div className="overflow-x-auto p-4">
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-[11px] text-slate-500 font-medium px-2"> </th>
                  {heatmap.quarters.map((q) => (
                    <th key={q} className="text-center text-[11px] text-slate-400 font-medium px-2">{qLabel(q)}</th>
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
      )}

      <Card title="Fonds gérés" subtitle={`${fundsList.length} fonds · triés par encours`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-4 py-2.5 text-left font-medium">Fonds</th>
                <th className="px-3 py-2.5 text-left font-medium">Catégorie</th>
                <th className="px-3 py-2.5 text-right font-medium">Encours</th>
                <th className="px-3 py-2.5 text-right font-medium">YTD</th>
                <th className="px-3 py-2.5 text-right font-medium">1 an</th>
                <th className="px-3 py-2.5 text-center font-medium">Q</th>
              </tr>
            </thead>
            <tbody>
              {fundsList.map((f) => (
                <tr key={f.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2">
                    <Link href={`/pros/fcp/${f.id}`} className="text-slate-200 hover:text-white transition flex items-center gap-1.5">
                      {f.nom}
                      {f.isStale && <span title="VL périmée" className="text-amber-400 text-[10px]">⚠</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: catColor(f.categorie) }} />
                      {f.categorie}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{fmtBigFCFA(f.aum)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(f.ytd)}`}>{fmtPctSigned(f.ytd)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(f.y1)}`}>{fmtPctSigned(f.y1)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-mono px-1.5 py-0.5 rounded ${quartileColor(f.quartile)}`}>
                      {f.quartile ? `Q${f.quartile}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET CROISSANCE & CADENCE
// ============================================================================
function EncoursTab({ data }: { data: SGOProData }) {
  const { cadenceMix } = data;
  const cadenceTotal =
    cadenceMix.quotidienne + cadenceMix.hebdomadaire + cadenceMix.trimestrielle + cadenceMix.irreguliere;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GrowthCard title="Croissance d'encours 1 an" growth={data.growth1Y} />
        <GrowthCard title="Croissance d'encours 3 ans" growth={data.growth3Y} />
      </div>

      <Card title="Cadence de publication agrégée" subtitle={`${cadenceTotal} fonds`}>
        <div className="p-4 space-y-2">
          {(
            [
              ["Quotidienne", cadenceMix.quotidienne, "#34d399"],
              ["Hebdomadaire", cadenceMix.hebdomadaire, "#60a5fa"],
              ["Trimestrielle", cadenceMix.trimestrielle, "#fbbf24"],
              ["Irrégulière", cadenceMix.irreguliere, "#f87171"],
            ] as Array<[string, number, string]>
          ).map(([label, n, color]) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-28 text-slate-400">{label}</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${cadenceTotal > 0 ? (n / cadenceTotal) * 100 : 0}%`, backgroundColor: color }} />
              </div>
              <span className="w-10 text-right font-mono text-slate-300">{n}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function GrowthCard({ title, growth }: { title: string; growth: Growth | null }) {
  if (!growth || growth.startAUM === 0) {
    return (
      <Card title={title}>
        <div className="p-10 text-center text-sm text-slate-500">Historique insuffisant.</div>
      </Card>
    );
  }
  return (
    <Card title={title} subtitle={`${growth.fundsContributing} fonds comparables`}>
      <dl className="divide-y divide-slate-800">
        <Row label="AUM début" value={`${fmtBigFCFA(growth.startAUM)} FCFA`} />
        <Row label="AUM fin" value={`${fmtBigFCFA(growth.endAUM)} FCFA`} />
        <Row
          label="Croissance totale"
          value={fmtBigFCFA(growth.totalGrowth) + " FCFA"}
          valueClass={growth.totalGrowth >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <Row
          label="Effet performance"
          value={fmtBigFCFA(growth.perfEffect) + " FCFA"}
          valueClass={growth.perfEffect >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <Row
          label="Collecte nette"
          value={fmtBigFCFA(growth.netFlow) + " FCFA"}
          valueClass={growth.netFlow >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <Row label="Perf. agrégée (pondérée)" value={fmtPctSigned(growth.perfPctApprox)} />
        {(growth.newFundsCount > 0 || growth.closedFundsCount > 0) && (
          <Row
            label="Créations / fermetures"
            value={`+${growth.newFundsCount} (${fmtBigFCFA(growth.newFundsAUM)}) · −${growth.closedFundsCount} (${fmtBigFCFA(growth.closedFundsAUM)})`}
          />
        )}
      </dl>
      <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-800">
        Décomposition sur les fonds publiés aux deux dates. Créations/fermetures remontées séparément.
      </p>
    </Card>
  );
}

// ============================================================================
// ONGLET POSITION CONCURRENTIELLE
// ============================================================================
function ConcurrenceTab({ data }: { data: SGOProData }) {
  const { allManagers, manager } = data;
  const maxShare = allManagers.length > 0 ? allManagers[0].marketShare : 1;

  return (
    <Card title="League table des sociétés de gestion" subtitle={`${allManagers.length} SGO · pondéré par encours`}>
      <div className="overflow-x-auto max-h-[40rem]">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900">
              <th className="px-4 py-2.5 text-left font-medium">#</th>
              <th className="px-3 py-2.5 text-left font-medium">Gestionnaire</th>
              <th className="px-3 py-2.5 text-right font-medium">Fonds</th>
              <th className="px-3 py-2.5 text-left font-medium">Part de marché</th>
              <th className="px-3 py-2.5 text-right font-medium">Perf. pondérée 1A</th>
              <th className="px-3 py-2.5 text-right font-medium">% top Q</th>
            </tr>
          </thead>
          <tbody>
            {allManagers.map((m, i) => {
              const isMe = m.slug === manager.slug;
              return (
                <tr
                  key={m.slug}
                  className={`border-b border-slate-800 last:border-0 ${
                    isMe ? "bg-blue-500/10" : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="px-4 py-2 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pros/sgo/${m.slug}`}
                      className={`hover:text-white transition ${isMe ? "text-blue-300 font-medium" : "text-slate-200"}`}
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{m.nbFunds}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                        <div
                          className={`h-full rounded-full ${isMe ? "bg-blue-400" : "bg-blue-500/60"}`}
                          style={{ width: `${maxShare > 0 ? (m.marketShare / maxShare) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-slate-400 w-12 text-right">{fmtPct(m.marketShare)}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(m.perfWeighted1Y)}`}>
                    {fmtPctSigned(m.perfWeighted1Y)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {m.topQuartileShare != null ? `${Math.round(m.topQuartileShare * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// SOUS-COMPOSANTS PARTAGES
// ============================================================================
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

function Row({
  label,
  value,
  valueClass = "text-slate-200",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className={`text-right font-mono text-xs ${valueClass}`}>{value}</dd>
    </div>
  );
}
