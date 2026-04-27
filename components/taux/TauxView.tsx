"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import CountryFlag from "@/components/CountryFlag";
import { COUNTRY_TO_FLAG, COUNTRY_SHORT } from "@/lib/tauxTypes";
import type { SeriesPoint, TauxSeries } from "@/lib/tauxTypes";
import type { SeriesDescriptor } from "@/lib/tauxLoader";
import { fmtMdsFCFA, fmtMFCFA, fmtRate, fmtRatio } from "@/lib/tauxFormat";
import TauxStudio from "./TauxStudio";
import TauxComparator from "./TauxComparator";

// ---------- KPI strip ----------

type KPI = {
  label: string;
  value: string;
  hint?: string;
  delta?: { text: string; positive: boolean | null };
};

function KPICard({ k }: { k: KPI }) {
  const deltaColor =
    k.delta?.positive === true
      ? "text-red-600"
      : k.delta?.positive === false
      ? "text-green-600"
      : "text-slate-500";
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
      <div className="text-xs text-slate-500 mb-2">{k.label}</div>
      <div className="text-xl md:text-2xl font-semibold mb-1">{k.value}</div>
      {k.delta && <div className={`text-xs ${deltaColor}`}>{k.delta.text}</div>}
      {k.hint && <div className="text-xs text-slate-400 mt-1">{k.hint}</div>}
    </div>
  );
}

// ---------- Card wrapper ----------

function Card({
  id,
  title,
  subtitle,
  right,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 scroll-mt-24"
    >
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {right && <div className="text-xs text-slate-500">{right}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------- Charts utils ----------

function tooltipStyle() {
  return {
    backgroundColor: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    fontSize: "12px",
  };
}

function pctTickFormatter(v: number) {
  return (v * 100).toFixed(1) + "%";
}

/** Combine plusieurs séries en lignes alignées sur l'union des iso (pour Recharts) */
export function combineSeries(
  series: { key: string; points: SeriesPoint[] }[]
): { iso: string; label: string; sortKey: number; [k: string]: number | string }[] {
  const map = new Map<string, { iso: string; label: string; sortKey: number; [k: string]: number | string }>();
  for (const s of series) {
    for (const p of s.points) {
      const row = map.get(p.iso) ?? { iso: p.iso, label: p.label, sortKey: p.sortKey };
      row[s.key] = p.value;
      map.set(p.iso, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
}

// ---------- Section : Politique monétaire BCEAO ----------

function PolitiqueBCEAOSection({
  pretMarginal,
  pension,
  bceaoChanges,
}: {
  pretMarginal: TauxSeries;
  pension: TauxSeries;
  bceaoChanges: { iso: string; label: string; deltaBp: number }[];
}) {
  const data = combineSeries([
    { key: "pret", points: pretMarginal.points },
    { key: "pension", points: pension.points },
  ]);
  return (
    <Card
      id="politique"
      title="Politique monétaire BCEAO"
      subtitle="Taux directeurs depuis fin 2019"
      right={`Source : ${pension.points.length} points · dernier ${pension.points.at(-1)?.label ?? "—"}`}
    >
      <div className="h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(v) => [(Number(v) * 100).toFixed(2) + "%", ""]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="pret" name="Taux prêt marginal" stroke="#dc2626" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pension" name="Taux minimum appels d'offres (pension)" stroke="#1d4ed8" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {bceaoChanges.length > 0 && (
        <div className="mt-4 text-xs text-slate-600">
          <span className="font-medium">Changements détectés :</span>{" "}
          {bceaoChanges.map((c, i) => (
            <span key={c.iso} className="inline-block mr-2">
              {c.label}{" "}
              <span className={c.deltaBp >= 0 ? "text-red-600" : "text-green-600"}>
                ({c.deltaBp >= 0 ? "+" : ""}
                {c.deltaBp} bp)
              </span>
              {i < bceaoChanges.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Section : Marché monétaire UEMOA ----------

function MarcheMonetaireSection({
  tmpHebdo,
  tmpMensuel,
  encoursRefi,
}: {
  tmpHebdo: TauxSeries;
  tmpMensuel: TauxSeries;
  encoursRefi: TauxSeries;
}) {
  const data = combineSeries([
    { key: "hebdo", points: tmpHebdo.points },
    { key: "mensuel", points: tmpMensuel.points },
    { key: "refi", points: encoursRefi.points },
  ]);
  return (
    <Card
      id="marche-monetaire"
      title="Marché monétaire UEMOA"
      subtitle="Taux moyen pondéré des adjudications & encours refinancement banques"
    >
      <div className="h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} />
            <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => Math.round(v).toString()} />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(v, name) => {
                if (typeof v !== "number") return ["—", String(name)];
                if (name === "Encours refi (Mds FCFA)") return [fmtMdsFCFA(v), name];
                return [(v * 100).toFixed(2) + "%", String(name)];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="right" dataKey="refi" name="Encours refi (Mds FCFA)" fill="#cbd5e1" />
            <Line yAxisId="left" type="monotone" dataKey="hebdo" name="TMP hebdo" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="mensuel" name="TMP mensuel" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------- Section : Marché interbancaire UMOA ----------

function InterbancaireSection({
  taux,
  volumes,
}: {
  taux: { maturity: string; series: TauxSeries }[];
  volumes: { maturity: string; series: TauxSeries }[];
}) {
  // Pour chaque maturité, on affiche 3 mois (déc-25, jan-26, fév-26)
  const months = Array.from(
    new Set(taux.flatMap((t) => t.series.points.map((p) => p.label)))
  );

  // Données : x = maturité, y = taux pour chaque mois (multi-line)
  const tauxData = taux.map((t) => {
    const row: { maturity: string; [k: string]: number | string } = { maturity: t.maturity };
    for (const p of t.series.points) row[p.label] = p.value;
    return row;
  });

  // Volumes : barres groupées par maturité
  const volData = volumes.map((v) => {
    const row: { maturity: string; [k: string]: number | string } = { maturity: v.maturity };
    for (const p of v.series.points) row[p.label] = p.value;
    return row;
  });

  const colors = ["#94a3b8", "#0891b2", "#1d4ed8"];

  return (
    <Card
      id="interbancaire"
      title="Marché interbancaire UMOA"
      subtitle="Courbe des taux par maturité et volumes échangés (3 derniers mois)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium mb-2 text-slate-700">Taux par maturité</div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tauxData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="maturity" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => (Number(v) * 100).toFixed(2) + "%"} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {months.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-2 text-slate-700">Volumes (M FCFA)</div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="maturity" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => fmtMFCFA(v)} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => fmtMFCFA(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {months.map((m, i) => (
                  <Bar key={m} dataKey={m} fill={colors[i % colors.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Section : Inflation par pays ----------

function InflationSection({ series }: { series: TauxSeries[] }) {
  const data = combineSeries(series.map((s) => ({ key: s.country, points: s.points })));
  const colors: Record<string, string> = {
    Benin: "#0ea5e9",
    "Burkina Faso": "#f97316",
    "Cote d'Ivoire": "#16a34a",
    "Guinee-Bissau": "#a855f7",
    Mali: "#eab308",
    Niger: "#dc2626",
    Senegal: "#0891b2",
    Togo: "#7c3aed",
    UEMOA: "#0f172a",
    "Mediane UEMOA": "#64748b",
  };

  return (
    <Card
      id="inflation"
      title="Inflation IPC par pays UEMOA"
      subtitle="Glissement annuel — par pays + agrégat UEMOA + médiane"
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} />
            <Tooltip contentStyle={tooltipStyle()} formatter={(v) => (Number(v) * 100).toFixed(2) + "%"} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
            {series.map((s) => {
              const isHighlight = s.country === "UEMOA" || s.country === "Mediane UEMOA";
              return (
                <Line
                  key={s.country}
                  type="monotone"
                  dataKey={s.country}
                  name={s.country}
                  stroke={colors[s.country] ?? "#64748b"}
                  strokeWidth={isHighlight ? 2.5 : 1.5}
                  strokeDasharray={s.country === "Mediane UEMOA" ? "5 3" : undefined}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------- Section : Conditions de banque (heatmaps) ----------

function ConditionsHeatmap({
  title,
  rowLabel,
  rows,
  cols,
  values,
  period,
}: {
  title: string;
  rowLabel: string;
  rows: string[];
  cols: string[];
  values: Map<string, number>;
  period: string;
}) {
  const allVals = Array.from(values.values()).filter((v) => isFinite(v));
  const min = allVals.length > 0 ? Math.min(...allVals) : 0;
  const max = allVals.length > 0 ? Math.max(...allVals) : 1;

  function bg(v: number | undefined) {
    if (v === undefined || !isFinite(v)) return "bg-slate-50 text-slate-300";
    const t = max === min ? 0.5 : (v - min) / (max - min);
    if (t < 0.25) return "bg-emerald-50 text-emerald-900";
    if (t < 0.5) return "bg-amber-50 text-amber-900";
    if (t < 0.75) return "bg-orange-100 text-orange-900";
    return "bg-red-200 text-red-900";
  }

  return (
    <div>
      <div className="text-sm font-medium text-slate-700 mb-2">{title}</div>
      <div className="text-xs text-slate-500 mb-2">Période : {period}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-1 table-fixed min-w-[640px]">
          <colgroup>
            <col style={{ width: "180px" }} />
            {cols.map((c) => (
              <col key={c} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left text-slate-500 font-medium py-1 px-2">{rowLabel}</th>
              {cols.map((c) => (
                <th key={c} className="text-center text-slate-500 font-medium py-1 px-2">
                  <span className="inline-flex items-center gap-1">
                    <CountryFlag country={COUNTRY_TO_FLAG[c] ?? c} size={12} />
                    {COUNTRY_SHORT[c] ?? c}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td className="text-left py-1 px-2 text-slate-700 truncate" title={r}>{r}</td>
                {cols.map((c) => {
                  const v = values.get(`${r}|${c}`);
                  return (
                    <td key={c} className={`text-center py-2 px-2 rounded ${bg(v)}`}>
                      {v !== undefined && isFinite(v) ? (v * 100).toFixed(2).replace(".", ",") + "%" : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConditionsSection({
  cat,
  obj,
  period,
}: {
  cat: { rows: string[]; cols: string[]; values: [string, number][] };
  obj: { rows: string[]; cols: string[]; values: [string, number][] };
  period: string;
}) {
  return (
    <Card
      id="conditions"
      title="Conditions de banque par pays"
      subtitle="Taux débiteurs par catégorie de contrepartie et par objet de financement"
      right={`Snapshot ${period}`}
    >
      <div className="grid grid-cols-1 gap-6">
        <ConditionsHeatmap
          title="Par catégorie de contrepartie"
          rowLabel="Catégorie"
          rows={cat.rows}
          cols={cat.cols}
          values={new Map(cat.values)}
          period={period}
        />
        <ConditionsHeatmap
          title="Par objet de financement"
          rowLabel="Objet"
          rows={obj.rows}
          cols={obj.cols}
          values={new Map(obj.values)}
          period={period}
        />
      </div>
    </Card>
  );
}

// ---------- Section : Crédits & dépôts ----------

function CreditsDepotsSection({
  credits,
  depots,
  marge,
  volumes,
}: {
  credits: TauxSeries;
  depots: TauxSeries;
  marge: TauxSeries;
  volumes: TauxSeries;
}) {
  const data = combineSeries([
    { key: "credits", points: credits.points },
    { key: "depots", points: depots.points },
    { key: "marge", points: marge.points },
    { key: "volumes", points: volumes.points },
  ]);
  return (
    <Card
      id="credits-depots"
      title="Crédits et dépôts UEMOA"
      subtitle="Taux moyens, marge d'intérêt et volume de nouveaux crédits"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Taux moyens & marge</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => (Number(v) * 100).toFixed(2) + "%"} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="credits" name="Taux moyen crédits" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="depots" name="Taux moyen dépôts" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="marge" name="Marge d'intérêt" stroke="#7c3aed" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Volume nouveaux crédits</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => Math.round(v).toString()} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => fmtMdsFCFA(Number(v))} />
                <Bar dataKey="volumes" name="Volume (Mds FCFA)" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Section : Réserves obligatoires ----------

function ReservesSection({
  data,
  period,
}: {
  data: { country: string; req: number; cons: number; net: number; ratio: number }[];
  period: string;
}) {
  const maxRatio = Math.max(...data.map((d) => d.ratio));
  return (
    <Card
      id="reserves"
      title="Réserves obligatoires"
      subtitle="Réserves requises vs constituées — position de liquidité par pays"
      right={`Période ${period}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 px-2 font-medium">Pays</th>
              <th className="text-right py-2 px-2 font-medium">Requises (M FCFA)</th>
              <th className="text-right py-2 px-2 font-medium">Constituées (M FCFA)</th>
              <th className="text-right py-2 px-2 font-medium">Solde net</th>
              <th className="text-right py-2 px-2 font-medium">Ratio</th>
              <th className="text-left py-2 px-2 font-medium w-[30%]"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const isUnion = d.country === "UMOA" || d.country === "Union";
              const widthPct = (d.ratio / maxRatio) * 100;
              return (
                <tr key={d.country} className={`border-b border-slate-100 ${isUnion ? "bg-slate-50 font-medium" : ""}`}>
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-2">
                      <CountryFlag country={COUNTRY_TO_FLAG[d.country] ?? d.country} size={14} />
                      {d.country}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMFCFA(d.req)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMFCFA(d.cons)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-emerald-700">+{fmtMFCFA(d.net)}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtRatio(d.ratio)}</td>
                  <td className="py-2 px-2">
                    <div className="h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        className={`h-full ${d.ratio >= 3 ? "bg-emerald-500" : d.ratio >= 1.5 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Ratio = constituées / requises. Au-dessus de 1× les banques sont en sur-réserves (excès de liquidité).
      </div>
    </Card>
  );
}

// ---------- Section : Agrégats monétaires ----------

function AgregatsSection({
  data,
}: {
  data: { country: string; m2: number; fid: number; aen: number; cri: number }[];
}) {
  return (
    <Card
      id="agregats"
      title="Agrégats monétaires & contreparties"
      subtitle="Masse monétaire M2, circulation fiduciaire, actifs extérieurs nets, créances intérieures"
      right="Fin déc. 2025"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 px-2 font-medium">Pays</th>
              <th className="text-right py-2 px-2 font-medium">M2</th>
              <th className="text-right py-2 px-2 font-medium">Circulation fiduciaire</th>
              <th className="text-right py-2 px-2 font-medium">Actifs ext. nets</th>
              <th className="text-right py-2 px-2 font-medium">Créances intérieures</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const isUnion = d.country === "Union";
              return (
                <tr key={d.country} className={`border-b border-slate-100 ${isUnion ? "bg-slate-50 font-medium" : ""}`}>
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-2">
                      <CountryFlag country={COUNTRY_TO_FLAG[d.country] ?? d.country} size={14} />
                      {d.country}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMdsFCFA(d.m2)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMdsFCFA(d.fid)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMdsFCFA(d.aen)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMdsFCFA(d.cri)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Section : Taux directeurs partenaires ----------

function PartenairesSection({ series }: { series: TauxSeries[] }) {
  const data = combineSeries(series.map((s) => ({ key: s.country, points: s.points })));
  const colors: Record<string, string> = {
    "Zone euro (BCE)": "#0ea5e9",
    "USA (Fed funds)": "#dc2626",
    "Royaume-Uni (Bank Rate)": "#7c3aed",
    Japon: "#16a34a",
  };
  return (
    <Card
      id="partenaires"
      title="Taux directeurs partenaires"
      subtitle="BCE, Fed, BoE, BoJ — pour comparaison avec la BCEAO"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={pctTickFormatter} />
            <Tooltip contentStyle={tooltipStyle()} formatter={(v) => (Number(v) * 100).toFixed(2) + "%"} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s) => (
              <Line
                key={s.country}
                type="stepAfter"
                dataKey={s.country}
                stroke={colors[s.country] ?? "#64748b"}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------- Section : Change EUR / devises ----------

function ChangeSection({
  spots,
  yoyVar,
}: {
  spots: { pair: string; latest: number; latestLabel: string; moy2025: number; fev2025: number }[];
  yoyVar: { pair: string; value: number }[];
}) {
  const yoyByPair = new Map(yoyVar.map((y) => [y.pair, y.value]));
  return (
    <Card
      id="change"
      title="Marché des changes EUR"
      subtitle="EUR vs USD/GBP/JPY/CNY/FCFA — niveau spot et variation annuelle"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left py-2 px-2 font-medium">Paire</th>
              <th className="text-right py-2 px-2 font-medium">Spot</th>
              <th className="text-right py-2 px-2 font-medium">Moy. 2025</th>
              <th className="text-right py-2 px-2 font-medium">Fév. 2025</th>
              <th className="text-right py-2 px-2 font-medium">Variation YoY</th>
            </tr>
          </thead>
          <tbody>
            {spots.map((s) => {
              const yoy = yoyByPair.get(s.pair);
              const yoyColor = yoy !== undefined ? (yoy > 0 ? "text-emerald-700" : yoy < 0 ? "text-red-700" : "text-slate-500") : "text-slate-400";
              return (
                <tr key={s.pair} className="border-b border-slate-100">
                  <td className="py-2 px-2 font-medium">{s.pair}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {fmtRate(s.latest, 4)} <span className="text-xs text-slate-400">({s.latestLabel})</span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtRate(s.moy2025, 4)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtRate(s.fev2025, 4)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${yoyColor}`}>
                    {yoy !== undefined ? (yoy >= 0 ? "+" : "") + (yoy * 100).toFixed(2).replace(".", ",") + " %" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        EUR/FCFA est fixe à 655,957 (parité fixe par accord avec le Trésor français).
      </div>
    </Card>
  );
}

// ---------- Vue principale ----------

export type TauxViewProps = {
  kpis: KPI[];
  pretMarginal: TauxSeries;
  pension: TauxSeries;
  bceaoChanges: { iso: string; label: string; deltaBp: number }[];
  tmpHebdo: TauxSeries;
  tmpMensuel: TauxSeries;
  encoursRefi: TauxSeries;
  interbancaireTaux: { maturity: string; series: TauxSeries }[];
  interbancaireVolumes: { maturity: string; series: TauxSeries }[];
  inflationSeries: TauxSeries[];
  conditionsCat: { rows: string[]; cols: string[]; values: [string, number][] };
  conditionsObj: { rows: string[]; cols: string[]; values: [string, number][] };
  conditionsPeriod: string;
  credits: TauxSeries;
  depots: TauxSeries;
  marge: TauxSeries;
  volumes: TauxSeries;
  reserves: { country: string; req: number; cons: number; net: number; ratio: number }[];
  reservesPeriod: string;
  agregats: { country: string; m2: number; fid: number; aen: number; cri: number }[];
  partenaires: TauxSeries[];
  changeSpots: { pair: string; latest: number; latestLabel: string; moy2025: number; fev2025: number }[];
  changeYoy: { pair: string; value: number }[];
  studioDescriptors: SeriesDescriptor[];
  studioRows: import("@/lib/tauxTypes").TauxRow[];
  source: string;
};

export default function TauxView(props: TauxViewProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {props.kpis.map((k) => (
          <KPICard key={k.label} k={k} />
        ))}
      </div>

      <PolitiqueBCEAOSection
        pretMarginal={props.pretMarginal}
        pension={props.pension}
        bceaoChanges={props.bceaoChanges}
      />

      <MarcheMonetaireSection
        tmpHebdo={props.tmpHebdo}
        tmpMensuel={props.tmpMensuel}
        encoursRefi={props.encoursRefi}
      />

      <InterbancaireSection
        taux={props.interbancaireTaux}
        volumes={props.interbancaireVolumes}
      />

      <InflationSection series={props.inflationSeries} />

      <ConditionsSection
        cat={props.conditionsCat}
        obj={props.conditionsObj}
        period={props.conditionsPeriod}
      />

      <CreditsDepotsSection
        credits={props.credits}
        depots={props.depots}
        marge={props.marge}
        volumes={props.volumes}
      />

      <ReservesSection data={props.reserves} period={props.reservesPeriod} />

      <AgregatsSection data={props.agregats} />

      <PartenairesSection series={props.partenaires} />

      <ChangeSection spots={props.changeSpots} yoyVar={props.changeYoy} />

      <TauxComparator rows={props.studioRows} />

      <TauxStudio descriptors={props.studioDescriptors} rows={props.studioRows} bceaoChanges={props.bceaoChanges} />

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-xs text-blue-900">
        <span className="font-medium">Source :</span> {props.source}. Toutes les valeurs en pourcentage sont exprimées en taux annualisé (sauf mention contraire). Les ratios de réserves sont sans unité.
      </div>
    </div>
  );
}
