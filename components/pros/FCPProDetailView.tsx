"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
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
import type {
  QuartileFrame,
  ExcessFrame,
  AumPoint,
  MarketShareFrame,
  Rolling1YStats,
} from "@/lib/fcpMath";

// ============================================================================
// TYPES
// ============================================================================
export type FCPProDetailData = {
  fund: {
    id: string;
    nom: string;
    gestionnaire: string;
    gestionnaireSlug: string;
    type: string;
    categorie: string;
    firstObsDate: string | null;
    depositaire: string;
    frequenceCalcul: string;
    bocDate: string;
    bocVL: number | null;
    bocDayChange: number | null;
  };
  refQuarter: string;
  latestVL: { date: string; vl: number; kind: "quarter" | "latest" } | null;
  stalenessCutoff: string;
  aumRef: number | null;
  aumDelta1Y: number | null;
  ytdQuartile: 1 | 2 | 3 | 4 | null;
  cohortSize: number;
  perfTable: Array<{
    label: string;
    fromDate: string;
    toDate: string;
    fundValue: number | null;
    cohortValue: number | null;
    excess: number | null;
  }>;
  vlChart: Array<{ date: string; fund: number; cohort: number | null }>;
  quartileFrame: QuartileFrame[];
  top2Pct: number | null;
  aumDecomp: AumPoint[];
  excess: ExcessFrame[];
  rolling: Rolling1YStats;
  marketShare: MarketShareFrame[];
  cadence: {
    kind: string;
    regularity: number;
    daysSinceLast: number | null;
    lastPublicationDate: string;
    intraTrim365: number;
  };
  peerEntries: Array<{
    id: string;
    nom: string;
    gestionnaire: string;
    aum: number | null;
    ytd: number | null;
    y1: number | null;
  }>;
  managerEntries: Array<{
    id: string;
    nom: string;
    categorie: string;
    aum: number | null;
    ytd: number | null;
    y1: number | null;
  }>;
};

type Tab = "synthese" | "quartiles" | "encours" | "pairs";

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
function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
function tone(v: number | null): string {
  if (v == null) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-300";
}
function quartileColor(q: 1 | 2 | 3 | 4 | null): string {
  if (q == null) return "bg-slate-800 text-slate-600";
  return q === 1
    ? "bg-emerald-500/25 text-emerald-200"
    : q === 2
    ? "bg-blue-500/25 text-blue-200"
    : q === 3
    ? "bg-amber-500/25 text-amber-200"
    : "bg-red-500/25 text-red-200";
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function FCPProDetailView({ data }: { data: FCPProDetailData }) {
  const { fund, latestVL } = data;
  const [tab, setTab] = useState<Tab>("synthese");

  const isStale =
    data.stalenessCutoff !== "" && (latestVL?.date ?? "") < data.stalenessCutoff && !!latestVL;

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4">
        <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
          <Link href="/pros" className="hover:text-slate-300 transition">Pro Terminal</Link>
          <span className="text-slate-700">›</span>
          <Link href="/pros/fcp" className="hover:text-slate-300 transition">Marché FCP</Link>
          <span className="text-slate-700">›</span>
          <span className="text-slate-400">{fund.nom}</span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-white flex items-center gap-2 flex-wrap">
              {fund.nom}
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                {fund.type}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">
                {fund.categorie}
              </span>
              {isStale && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium">
                  VL périmée
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              <Link href={`/pros/sgo/${fund.gestionnaireSlug}`} className="hover:text-blue-300 transition">
                {fund.gestionnaire}
              </Link>
              {fund.depositaire && <> · dépositaire {fund.depositaire}</>}
              {fund.frequenceCalcul && <> · VL {fund.frequenceCalcul.toLowerCase()}</>}
            </p>
          </div>
          <Link
            href={`/fcp/${fund.id}`}
            className="text-[11px] px-2.5 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
          >
            Fiche publique ↗
          </Link>
        </div>
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Encours" value={fmtBigFCFA(data.aumRef)} sub={`au ${qLabel(data.refQuarter)}`} />
        <Kpi
          label="Δ Encours 1A"
          value={fmtPctSigned(data.aumDelta1Y)}
          sub="vs an dernier"
          tone={data.aumDelta1Y == null ? "neutral" : data.aumDelta1Y >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Dernière VL"
          value={latestVL ? latestVL.vl.toLocaleString("fr-FR") : "—"}
          sub={latestVL ? formatDate(latestVL.date) : "—"}
        />
        <Kpi
          label="VL du jour (BOC)"
          value={fund.bocVL != null ? fund.bocVL.toLocaleString("fr-FR") : "—"}
          sub={fund.bocDayChange != null ? fmtPctSigned(fund.bocDayChange) : fund.bocDate ? formatDate(fund.bocDate) : "—"}
          tone={fund.bocDayChange == null ? "neutral" : fund.bocDayChange >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Quartile YTD"
          value={data.ytdQuartile != null ? `Q${data.ytdQuartile}` : "—"}
          sub={`sur ${data.cohortSize} fonds`}
          tone={data.ytdQuartile == null ? "neutral" : data.ytdQuartile <= 2 ? "up" : "down"}
        />
        <Kpi
          label="Top-moitié"
          value={data.top2Pct != null ? `${Math.round(data.top2Pct * 100)}%` : "—"}
          sub="des trimestres"
          tone={data.top2Pct == null ? "neutral" : data.top2Pct >= 0.5 ? "up" : "down"}
        />
      </div>

      {/* ====== TABS ====== */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {(
          [
            ["synthese", "Synthèse & performance"],
            ["quartiles", "Quartiles & risque"],
            ["encours", "Encours & flux"],
            ["pairs", "Pairs & gérant"],
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
      {tab === "quartiles" && <QuartilesTab data={data} />}
      {tab === "encours" && <EncoursTab data={data} />}
      {tab === "pairs" && <PairsTab data={data} />}
    </div>
  );
}

// ============================================================================
// ONGLET SYNTHESE & PERFORMANCE
// ============================================================================
function SyntheseTab({ data }: { data: FCPProDetailData }) {
  return (
    <div className="space-y-4">
      <Card title="Performance vs médiane de catégorie" subtitle="rendement total · excès = fonds − médiane">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-4 py-2.5 text-left font-medium">Fenêtre</th>
                <th className="px-3 py-2.5 text-right font-medium">Fonds</th>
                <th className="px-3 py-2.5 text-right font-medium">Médiane cat.</th>
                <th className="px-3 py-2.5 text-right font-medium">Excès</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Période</th>
              </tr>
            </thead>
            <tbody>
              {data.perfTable.map((r) => (
                <tr key={r.label} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">{r.label}</td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${tone(r.fundValue)}`}>
                    {fmtPctSigned(r.fundValue)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtPctSigned(r.cohortValue)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tone(r.excess)}`}>{fmtPctSigned(r.excess)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 hidden md:table-cell">
                    {r.fromDate ? `${formatDate(r.fromDate)} → ${formatDate(r.toDate)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="VL rebasée (base 100)" subtitle="fonds vs médiane de catégorie">
        {data.vlChart.length > 1 ? (
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.vlChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={36} />
                <YAxis stroke="#64748b" fontSize={11} width={44} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(v, n) => [Number(v).toFixed(1).replace(".", ","), n === "fund" ? "Fonds" : "Médiane cat."]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="cohort" name="Médiane cat." stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="fund" name="Fonds" stroke="#34d399" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Historique de VL insuffisant.</div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET QUARTILES & RISQUE
// ============================================================================
function QuartilesTab({ data }: { data: FCPProDetailData }) {
  const { rolling, excess } = data;

  const excessChart = useMemo(
    () => excess.map((e) => ({ date: e.date, excess: e.excess != null ? e.excess * 100 : null, cum: e.cumulativeExcess != null ? e.cumulativeExcess * 100 : null })),
    [excess]
  );

  return (
    <div className="space-y-4">
      <Card title="Frise des quartiles" subtitle="par trimestre · dans la catégorie · Q1 = meilleur">
        <div className="p-4 flex flex-wrap gap-1.5">
          {data.quartileFrame.map((q) => (
            <div
              key={q.date}
              className={`w-12 text-center rounded py-1.5 ${quartileColor(q.quartile)}`}
              title={`${qLabel(q.date)} · ${q.quartile ? `Q${q.quartile}` : "n/d"} · ${fmtPctSigned(q.perf)}`}
            >
              <div className="text-[9px] text-slate-400">{qLabel(q.date)}</div>
              <div className="text-xs font-mono font-semibold">{q.quartile ? `Q${q.quartile}` : "—"}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Performance 1 an glissante" subtitle="8 trimestres · min / médiane / max">
          <div className="grid grid-cols-3 gap-3 p-4">
            <Stat label="Min" value={fmtPctSigned(rolling.min)} hint="pire fenêtre 1A" />
            <Stat label="Médiane" value={fmtPctSigned(rolling.median)} hint="fenêtre typique" />
            <Stat label="Max" value={fmtPctSigned(rolling.max)} hint="meilleure fenêtre" />
          </div>
          <div className="px-4 pb-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rolling.points.map((p) => ({ date: p.asOf, v: p.perf1Y != null ? p.perf1Y * 100 : null }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={30} />
                <YAxis stroke="#64748b" fontSize={11} width={40} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => qLabel(String(d))}
                  formatter={(v) => [`${Number(v).toFixed(2).replace(".", ",")}%`, "Perf 1A"]}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Line type="monotone" dataKey="v" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Excès cumulé vs catégorie" subtitle="surperformance composée">
          {excessChart.length > 1 ? (
            <div className="p-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={excessChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={30} />
                  <YAxis stroke="#64748b" fontSize={11} width={44} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                    labelFormatter={(d) => qLabel(String(d))}
                    formatter={(v, n) => [`${Number(v).toFixed(2).replace(".", ",")}%`, n === "cum" ? "Excès cumulé" : "Excès trim."]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Line type="monotone" dataKey="cum" name="Excès cumulé" stroke="#34d399" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="excess" name="Excès trim." stroke="#64748b" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">Données d&apos;excès insuffisantes.</div>
          )}
        </Card>
      </div>

      <Card title="Cadence de publication" subtitle="fraîcheur & régularité de la VL">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          <Stat label="Cadence" value={data.cadence.kind} hint="rythme observé" />
          <Stat label="Régularité" value={fmtPct(data.cadence.regularity, 0)} hint="trim. publiés" />
          <Stat label="Points / an" value={String(data.cadence.intraTrim365)} hint="VL intra-trim 365 j" />
          <Stat
            label="Dernière VL"
            value={data.cadence.daysSinceLast != null ? `${Math.round(data.cadence.daysSinceLast)} j` : "—"}
            hint={data.cadence.lastPublicationDate ? formatDate(data.cadence.lastPublicationDate) : "—"}
          />
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET ENCOURS & FLUX
// ============================================================================
function EncoursTab({ data }: { data: FCPProDetailData }) {
  const flowChart = useMemo(
    () =>
      data.aumDecomp.map((p) => ({
        date: p.date,
        "Effet perf.": p.perfEffectAmount != null ? Math.round(p.perfEffectAmount) : 0,
        "Collecte nette": p.netFlowAmount != null ? Math.round(p.netFlowAmount) : 0,
      })),
    [data.aumDecomp]
  );

  const shareChart = useMemo(
    () => data.marketShare.map((m) => ({ date: m.date, share: m.share != null ? m.share * 100 : null, rank: m.rank })),
    [data.marketShare]
  );

  return (
    <div className="space-y-4">
      <Card title="Décomposition de l'encours" subtitle="effet performance vs collecte nette · par trimestre">
        {flowChart.length > 0 ? (
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={20} />
                <YAxis stroke="#64748b" fontSize={11} width={48} tickFormatter={(v) => fmtBigFCFA(Number(v))} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => qLabel(String(d))}
                  formatter={(v, n) => [fmtBigFCFA(Number(v)) + " FCFA", String(n)]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="Effet perf." stackId="a" fill="#60a5fa" />
                <Bar dataKey="Collecte nette" stackId="a" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Pas d&apos;historique d&apos;encours trimestriel.</div>
        )}
      </Card>

      <Card title="Part de marché dans la catégorie" subtitle="poids du fonds & rang">
        {shareChart.filter((s) => s.share != null).length > 1 ? (
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shareChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={qLabel} minTickGap={30} />
                <YAxis stroke="#64748b" fontSize={11} width={40} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => qLabel(String(d))}
                  formatter={(v, n, p) => {
                    if (n === "share") {
                      const rank = p?.payload?.rank;
                      return [`${Number(v).toFixed(1).replace(".", ",")}%${rank ? ` · rang ${rank}` : ""}`, "Part cat."];
                    }
                    return [String(v), String(n)];
                  }}
                />
                <Line type="monotone" dataKey="share" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Part de marché indisponible.</div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET PAIRS & GERANT
// ============================================================================
function PairsTab({ data }: { data: FCPProDetailData }) {
  return (
    <div className="space-y-4">
      <Card title="Fonds pairs de la catégorie" subtitle={`top 10 par encours · ${data.fund.categorie}`}>
        <PeerTable
          rows={data.peerEntries.map((p) => ({ id: p.id, label: p.nom, sub: p.gestionnaire, aum: p.aum, ytd: p.ytd, y1: p.y1 }))}
        />
      </Card>

      {data.managerEntries.length > 0 && (
        <Card title="Autres fonds du gérant" subtitle={data.fund.gestionnaire}>
          <PeerTable
            rows={data.managerEntries.map((p) => ({ id: p.id, label: p.nom, sub: p.categorie, aum: p.aum, ytd: p.ytd, y1: p.y1 }))}
          />
        </Card>
      )}
    </div>
  );
}

function PeerTable({
  rows,
}: {
  rows: Array<{ id: string; label: string; sub: string; aum: number | null; ytd: number | null; y1: number | null }>;
}) {
  if (rows.length === 0) {
    return <div className="p-10 text-center text-sm text-slate-500">Aucun fonds.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
            <th className="px-4 py-2.5 text-left font-medium">Fonds</th>
            <th className="px-3 py-2.5 text-right font-medium">Encours</th>
            <th className="px-3 py-2.5 text-right font-medium">YTD</th>
            <th className="px-3 py-2.5 text-right font-medium">1 an</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
              <td className="px-4 py-2">
                <Link href={`/pros/fcp/${r.id}`} className="text-slate-200 hover:text-white transition block truncate max-w-[16rem]">
                  {r.label}
                </Link>
                <div className="text-[10px] text-slate-500 truncate max-w-[16rem]">{r.sub}</div>
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-300">{fmtBigFCFA(r.aum)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(r.ytd)}`}>{fmtPctSigned(r.ytd)}</td>
              <td className={`px-3 py-2 text-right font-mono ${tone(r.y1)}`}>{fmtPctSigned(r.y1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-semibold text-white font-mono mt-1 capitalize">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
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
