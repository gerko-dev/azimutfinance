"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { PeriodKey, PeriodicStatements } from "@/lib/fundamentals";

type Props = {
  periodic: PeriodicStatements;
  isBank: boolean;
};

type ViewMode = "montants" | "croissance";

// Ordre/libellés d'affichage des périodes. `lib/fundamentals` détient la même
// liste côté serveur pour le parsing ; on la redéclare ici car ce module ne
// peut importer que des types depuis ce loader server-only (dépend de `fs`).
const PERIODIC_PERIODS: readonly PeriodKey[] = ["T1", "S1", "9M", "Annuel"];
const PERIOD_LABELS: Record<PeriodKey, string> = {
  T1: "T1",
  S1: "S1",
  "9M": "9M",
  Annuel: "Année",
};

// Palette pour les lignes par exercice (du plus ancien au plus récent).
const YEAR_COLORS = [
  "#475569",
  "#64748b",
  "#0ea5e9",
  "#34d399",
  "#fbbf24",
  "#f87171",
];

function formatMillions(v: number | undefined): string {
  if (v === undefined || v === 0) return "—";
  const m = v / 1e6;
  const abs = Math.abs(m);
  const decimals = abs >= 100 ? 0 : 1;
  return m
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatPctSigned(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function growthColor(v: number | null): string {
  if (v === null || !isFinite(v) || v === 0) return "text-slate-400";
  return v > 0 ? "text-emerald-400" : "text-red-400";
}

/** Libellé d'affichage propre pour les soldes connus, sinon le libellé brut. */
function metricLabel(codePoste: string, libelle: string, isBank: boolean): string {
  switch (codePoste) {
    case "CR_CA":
      return isBank ? "Produit net bancaire" : "Chiffre d'affaires";
    case "CR_REXP":
      return "Résultat d'exploitation";
    case "CR_RNET":
      return "Résultat net";
    default:
      // Capitalise proprement un libellé tout en majuscules.
      return libelle.charAt(0) + libelle.slice(1).toLowerCase();
  }
}

export default function ProPeriodicStatements({ periodic, isBank }: Props) {
  const { exercices, metrics } = periodic;

  // Sélecteur de solde (CA / Rexp / RNet selon disponibilité).
  const [metricCode, setMetricCode] = useState<string>(
    metrics[0]?.codePoste ?? ""
  );
  const [view, setView] = useState<ViewMode>("montants");

  const metric = useMemo(
    () => metrics.find((m) => m.codePoste === metricCode) ?? metrics[0] ?? null,
    [metrics, metricCode]
  );

  // Exercices affichés : 6 derniers, les plus récents en premier pour le tableau.
  const yearsDesc = useMemo(
    () => [...exercices].sort((a, b) => b - a).slice(0, 6),
    [exercices]
  );
  const yearsAsc = useMemo(() => [...yearsDesc].sort((a, b) => a - b), [yearsDesc]);

  // Données du graphe : une ligne par exercice, x = période cumulée.
  const chartData = useMemo(() => {
    if (!metric) return [];
    return PERIODIC_PERIODS.map((p) => {
      const row: Record<string, number | string | null> = {
        periode: PERIOD_LABELS[p],
      };
      for (const y of yearsAsc) {
        const raw = metric.values[y]?.[p];
        row[String(y)] = raw !== undefined ? raw / 1e6 : null;
      }
      return row;
    });
  }, [metric, yearsAsc]);

  if (!metric || metrics.length === 0 || exercices.length === 0) return null;

  // Croissance a/a d'une cellule (même période, exercice précédent).
  const yoy = (year: number, period: PeriodKey): number | null => {
    const cur = metric.values[year]?.[period];
    const prev = metric.values[year - 1]?.[period];
    if (cur === undefined || prev === undefined || prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  };

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg">
      <div className="p-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            États financiers périodiques
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Publications infra-annuelles cumulées (T1, S1, 9M) puis exercice
            plein ·{" "}
            <strong className="text-slate-200">en millions de FCFA</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {/* Vue : montants ou croissance a/a */}
          <div className="inline-flex gap-1">
            <button
              type="button"
              onClick={() => setView("montants")}
              aria-pressed={view === "montants"}
              className={`px-2.5 py-1 rounded-md border transition ${
                view === "montants"
                  ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Montants
            </button>
            <button
              type="button"
              onClick={() => setView("croissance")}
              aria-pressed={view === "croissance"}
              className={`px-2.5 py-1 rounded-md border transition ${
                view === "croissance"
                  ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Croissance a/a
            </button>
          </div>
        </div>
      </div>

      {/* Sélecteur de solde */}
      {metrics.length > 1 && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5 text-xs">
          {metrics.map((m) => {
            const active = m.codePoste === metric.codePoste;
            return (
              <button
                key={m.codePoste}
                type="button"
                onClick={() => setMetricCode(m.codePoste)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded-md border transition ${
                  active
                    ? "bg-slate-700/70 text-slate-100 border-slate-500"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {metricLabel(m.codePoste, m.libelle, isBank)}
              </button>
            );
          })}
        </div>
      )}

      {/* Graphe : progression cumulée par exercice */}
      <div className="p-4">
        <h5 className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
          {metricLabel(metric.codePoste, metric.libelle, isBank)} cumulé · M FCFA
        </h5>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="periode" stroke="#64748b" fontSize={11} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) =>
                  Math.abs(Number(v)) >= 1000
                    ? `${(Number(v) / 1000).toFixed(0)} Md`
                    : `${Number(v).toFixed(0)}`
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "#e2e8f0",
                }}
                formatter={(value, name) => [
                  value === null
                    ? "—"
                    : `${Number(value)
                        .toFixed(0)
                        .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} M`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
              {yearsAsc.map((y, i) => (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={String(y)}
                  name={String(y)}
                  stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={
                    i === yearsAsc.length - 1 || i === yearsAsc.length - 2
                      ? 2.5
                      : 1.5
                  }
                  dot={{ r: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau : exercices × périodes */}
      <div className="overflow-x-auto border-t border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 bg-slate-900/60 border-b border-slate-700">
              <th className="text-left px-4 py-2 font-medium">Exercice</th>
              {PERIODIC_PERIODS.map((p) => (
                <th key={p} className="text-right px-3 py-2 font-medium">
                  {PERIOD_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearsDesc.map((y) => (
              <tr
                key={y}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-4 py-2 text-slate-200 font-medium">{y}</td>
                {PERIODIC_PERIODS.map((p) => {
                  if (view === "croissance") {
                    const g = yoy(y, p);
                    return (
                      <td
                        key={p}
                        className={`text-right px-3 py-2 font-mono text-xs ${growthColor(g)}`}
                      >
                        {formatPctSigned(g)}
                      </td>
                    );
                  }
                  const v = metric.values[y]?.[p];
                  return (
                    <td
                      key={p}
                      className="text-right px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-100"
                    >
                      {formatMillions(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-800">
        Données cumulées depuis le début de l&apos;exercice. « Croissance a/a » =
        variation vs la même période de l&apos;exercice précédent.
      </p>
    </section>
  );
}
