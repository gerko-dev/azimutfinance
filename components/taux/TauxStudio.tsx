"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { SeriesPoint, TauxRow, TauxSeries } from "@/lib/tauxTypes";
import type { SeriesDescriptor } from "@/lib/tauxLoader";
import {
  base100,
  computeStats,
  correlationMatrix,
  deltaPP,
  ratio,
  spread,
  yoy,
  zscore,
  type TransformMode,
} from "@/lib/tauxTransforms";
import { fmtPct, fmtNum } from "@/lib/tauxFormat";

const PALETTE = ["#1d4ed8", "#dc2626", "#16a34a", "#7c3aed", "#0891b2", "#ea580c", "#0284c7", "#be185d"];

const PRESETS: { id: string; label: string; description: string; ids: string[]; mode: TransformMode }[] = [
  {
    id: "transmission",
    label: "Transmission monétaire",
    description: "BCEAO → TMP → interbancaire 1j → conditions banque ensemble UEMOA → crédits",
    ids: [
      "1_Taux_directeurs_BCEAO|Taux minimum appels offres|UEMOA",
      "2_Marche_monetaire|TMP adjudication hebdomadaire|UEMOA",
      "8_Interbancaire_UMOA|Taux 1j|UMOA",
      "3_Credits_Depots_UEMOA|Taux moyen credits|UEMOA",
    ],
    mode: "level",
  },
  {
    id: "spread-bce",
    label: "Spread BCEAO − BCE",
    description: "Convergence/divergence du taux pension BCEAO vs BCE",
    ids: [
      "1_Taux_directeurs_BCEAO|Taux minimum appels offres|UEMOA",
      "6_Taux_directeurs_partenaires|Zone euro (BCE)|Zone euro (BCE)",
    ],
    mode: "spread",
  },
  {
    id: "stress-liq",
    label: "Stress liquidité",
    description: "Encours refinancement banques + ratio sur-réserves UMOA",
    ids: [
      "2_Marche_monetaire|Encours refinancement banques|UEMOA",
      "9_Reserves_const_vs_req|Ratio constituees sur requises|UMOA",
    ],
    mode: "level",
  },
  {
    id: "convergence-infl",
    label: "Convergence inflation UEMOA",
    description: "Agrégat UEMOA + médiane + 3 pays clés",
    ids: [
      "4_Inflation_pays_UEMOA|IPC glissement annuel|UEMOA",
      "4_Inflation_pays_UEMOA|IPC glissement annuel|Mediane UEMOA",
      "4_Inflation_pays_UEMOA|IPC glissement annuel|Cote d'Ivoire",
      "4_Inflation_pays_UEMOA|IPC glissement annuel|Senegal",
      "4_Inflation_pays_UEMOA|IPC glissement annuel|Niger",
    ],
    mode: "level",
  },
  {
    id: "pente-court",
    label: "Pente courbe interbancaire",
    description: "Spread Taux 3 mois − Taux 1j (proxy de la pente courte)",
    ids: [
      "8_Interbancaire_UMOA|Taux 3mois|UMOA",
      "8_Interbancaire_UMOA|Taux 1j|UMOA",
    ],
    mode: "spread",
  },
  {
    id: "directeurs-monde",
    label: "Taux directeurs G4",
    description: "Comparaison BCEAO vs BCE / Fed / BoE / BoJ",
    ids: [
      "1_Taux_directeurs_BCEAO|Taux minimum appels offres|UEMOA",
      "6_Taux_directeurs_partenaires|Zone euro (BCE)|Zone euro (BCE)",
      "6_Taux_directeurs_partenaires|USA (Fed funds)|USA (Fed funds)",
      "6_Taux_directeurs_partenaires|Royaume-Uni (Bank Rate)|Royaume-Uni (Bank Rate)",
      "6_Taux_directeurs_partenaires|Japon|Japon",
    ],
    mode: "level",
  },
];

const TIME_WINDOWS: { id: string; label: string; months: number | null }[] = [
  { id: "6m", label: "6M", months: 6 },
  { id: "1y", label: "1A", months: 12 },
  { id: "3y", label: "3A", months: 36 },
  { id: "5y", label: "5A", months: 60 },
  { id: "max", label: "Max", months: null },
];

const MAX_SERIES = 8;

function buildSeriesFromRows(rows: TauxRow[], id: string): TauxSeries | null {
  const [section, indicator, country] = id.split("|");
  const matching = rows.filter(
    (r) => r.section === section && r.indicator === indicator && r.country === country
  );
  if (matching.length === 0) return null;
  const points: SeriesPoint[] = matching
    .map((r) => ({
      iso: r.period.iso,
      label: r.period.label,
      sortKey: r.period.sortKey,
      value: r.value,
    }))
    .sort((a, b) => a.sortKey - b.sortKey);
  return {
    id,
    section: matching[0].section,
    indicator,
    country,
    unit: matching[0].unit,
    points,
  };
}

function applyTransform(
  series: TauxSeries[],
  mode: TransformMode,
  spreadAId: string | null,
  spreadBId: string | null,
  pivotIso: string | null
): TauxSeries[] {
  if (series.length === 0) return [];
  switch (mode) {
    case "level":
      return series;
    case "base100":
      return series.map((s) => base100(s, pivotIso ?? undefined));
    case "yoy":
      return series.map((s) => yoy(s));
    case "deltaPP":
      return series.map((s) => deltaPP(s));
    case "zscore":
      return series.map((s) => zscore(s));
    case "spread": {
      const a = series.find((s) => s.id === spreadAId) ?? series[0];
      const b = series.find((s) => s.id === spreadBId) ?? series[1];
      if (!a || !b) return series;
      return [spread(a, b)];
    }
    case "ratio": {
      const a = series.find((s) => s.id === spreadAId) ?? series[0];
      const b = series.find((s) => s.id === spreadBId) ?? series[1];
      if (!a || !b) return series;
      return [ratio(a, b)];
    }
    default:
      return series;
  }
}

function combine(
  series: TauxSeries[]
): { sortKey: number; label: string; iso: string; [k: string]: number | string }[] {
  const map = new Map<string, { sortKey: number; label: string; iso: string; [k: string]: number | string }>();
  for (const s of series) {
    for (const p of s.points) {
      const row = map.get(p.iso) ?? { sortKey: p.sortKey, label: p.label, iso: p.iso };
      row[s.id] = p.value;
      map.set(p.iso, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TauxStudio({
  descriptors,
  rows,
  bceaoChanges,
}: {
  descriptors: SeriesDescriptor[];
  rows: TauxRow[];
  bceaoChanges: { iso: string; label: string; deltaBp: number }[];
}) {
  // ---- State ----
  const [selectedIds, setSelectedIds] = useState<string[]>(PRESETS[0].ids);
  const [mode, setMode] = useState<TransformMode>("level");
  const [spreadAId, setSpreadAId] = useState<string | null>(null);
  const [spreadBId, setSpreadBId] = useState<string | null>(null);
  const [pivotIso, setPivotIso] = useState<string | null>(null);
  const [windowId, setWindowId] = useState<string>("max");
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [search, setSearch] = useState("");
  const [showStats, setShowStats] = useState(true);

  // ---- Hydratation depuis l'URL (lecture browser-only au mount) ----
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.hash.replace(/^#studio\??/, ""));
    const ids = params.get("s");
    const m = params.get("t") as TransformMode | null;
    const w = params.get("w");
    const a = params.get("a");
    const b = params.get("b");
    if (ids) setSelectedIds(ids.split("~"));
    if (m) setMode(m);
    if (w) setWindowId(w);
    if (a) setSpreadAId(a);
    if (b) setSpreadBId(b);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---- Construction des séries ----
  const baseSeries = useMemo(() => {
    return selectedIds
      .map((id) => buildSeriesFromRows(rows, id))
      .filter((s): s is TauxSeries => s !== null);
  }, [selectedIds, rows]);

  // ---- Fenêtre temporelle ----
  const windowStart = useMemo(() => {
    const w = TIME_WINDOWS.find((t) => t.id === windowId);
    if (!w || w.months === null) return 0;
    const allPts = baseSeries.flatMap((s) => s.points.map((p) => p.sortKey));
    if (allPts.length === 0) return 0;
    const max = Math.max(...allPts);
    return max - w.months * 30 * 24 * 3600 * 1000;
  }, [windowId, baseSeries]);

  const clippedSeries = useMemo(
    () => baseSeries.map((s) => ({ ...s, points: s.points.filter((p) => p.sortKey >= windowStart) })),
    [baseSeries, windowStart]
  );

  // ---- Transformation ----
  const transformed = useMemo(
    () => applyTransform(clippedSeries, mode, spreadAId, spreadBId, pivotIso),
    [clippedSeries, mode, spreadAId, spreadBId, pivotIso]
  );

  const chartData = useMemo(() => combine(transformed), [transformed]);

  // ---- Stats ----
  const stats = useMemo(() => transformed.map((s) => ({ series: s, stats: computeStats(s) })), [transformed]);
  const corrMatrix = useMemo(() => (transformed.length >= 2 ? correlationMatrix(transformed) : null), [transformed]);

  // ---- Catalogue groupé ----
  const catalog = useMemo(() => {
    const filtered = descriptors.filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.indicator.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q) ||
        d.section.toLowerCase().includes(q)
      );
    });
    const groups = new Map<string, Map<string, SeriesDescriptor[]>>();
    for (const d of filtered) {
      const sectionGroup = groups.get(d.section) ?? new Map();
      const indGroup = sectionGroup.get(d.indicator) ?? [];
      indGroup.push(d);
      sectionGroup.set(d.indicator, indGroup);
      groups.set(d.section, sectionGroup);
    }
    return groups;
  }, [descriptors, search]);

  function toggleSeries(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_SERIES) return prev;
      return [...prev, id];
    });
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    setSelectedIds(preset.ids);
    setMode(preset.mode);
    if (preset.mode === "spread" || preset.mode === "ratio") {
      setSpreadAId(preset.ids[0]);
      setSpreadBId(preset.ids[1]);
    }
  }

  function copyShareLink() {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("s", selectedIds.join("~"));
    params.set("t", mode);
    params.set("w", windowId);
    if (spreadAId) params.set("a", spreadAId);
    if (spreadBId) params.set("b", spreadBId);
    const url = `${window.location.origin}${window.location.pathname}#studio?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("Lien copié dans le presse-papier !");
    });
  }

  function exportSeriesCSV() {
    if (transformed.length === 0) return;
    const headers = ["iso", "label", ...transformed.map((s) => s.id)];
    const data = chartData.map((row) => [
      row.iso,
      row.label,
      ...transformed.map((s) => (typeof row[s.id] === "number" ? (row[s.id] as number) : "")),
    ]);
    downloadCSV(`taux-studio-${mode}-${Date.now()}.csv`, headers, data);
  }

  // ---- Rendu ----
  const showSpreadPicker = mode === "spread" || mode === "ratio";
  const yTickFormatter = (v: number) => {
    if (mode === "level" || mode === "yoy" || mode === "deltaPP") {
      const u = transformed[0]?.unit;
      if (u === "pct") return (v * 100).toFixed(1) + "%";
      if (u === "Mds_FCFA") return Math.round(v).toString();
      if (u === "M_FCFA") return Math.round(v).toString();
      return v.toFixed(2);
    }
    return v.toFixed(1);
  };

  // Annotations BCEAO : positions sur l'axe X (par iso match)
  const annotationLabels = useMemo(() => {
    if (!showAnnotations) return [];
    const isos = new Set(chartData.map((r) => r.iso));
    return bceaoChanges.filter((c) => isos.has(c.iso));
  }, [showAnnotations, bceaoChanges, chartData]);

  return (
    <section
      id="studio"
      className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 scroll-mt-24"
    >
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold">Studio d&apos;analyse des taux</h2>
          <p className="text-xs text-slate-500 mt-1">
            Sélectionnez jusqu&apos;à {MAX_SERIES} séries, appliquez une transformation, comparez. Tout y passe : taux directeurs,
            inflation, conditions de banque, change, agrégats.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportSeriesCSV}
            className="text-xs px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
            disabled={transformed.length === 0}
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={copyShareLink}
            className="text-xs px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
          >
            🔗 Copier le lien
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <span className="text-xs text-slate-500 self-center mr-1">Presets :</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p)}
            className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-700 transition"
            title={p.description}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Toolbar : transformations + fenêtre */}
      <div className="mb-4 flex flex-wrap gap-3 items-center text-xs border-y border-slate-200 py-3">
        <div className="flex gap-1 items-center">
          <span className="text-slate-500 mr-1">Mode :</span>
          {(
            [
              ["level", "Niveau"],
              ["base100", "Base 100"],
              ["yoy", "% YoY"],
              ["deltaPP", "Δ pp"],
              ["spread", "Spread"],
              ["ratio", "Ratio"],
              ["zscore", "Z-score"],
            ] as [TransformMode, string][]
          ).map(([m, l]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded ${mode === m ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-1 items-center">
          <span className="text-slate-500 mr-1">Fenêtre :</span>
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWindowId(w.id)}
              className={`px-2 py-1 rounded ${windowId === w.id ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-slate-600">
          <input
            type="checkbox"
            checked={showAnnotations}
            onChange={(e) => setShowAnnotations(e.target.checked)}
            className="accent-blue-600"
          />
          Annotations BCEAO ({bceaoChanges.length})
        </label>
      </div>

      {/* Picker spread/ratio */}
      {showSpreadPicker && baseSeries.length >= 2 && (
        <div className="mb-3 flex flex-wrap gap-2 items-center text-xs bg-slate-50 rounded p-2">
          <span className="text-slate-600">{mode === "spread" ? "Spread" : "Ratio"} :</span>
          <select
            value={spreadAId ?? baseSeries[0].id}
            onChange={(e) => setSpreadAId(e.target.value)}
            className="text-xs border border-slate-300 rounded px-1.5 py-0.5"
          >
            {baseSeries.map((s) => (
              <option key={s.id} value={s.id}>{s.indicator} ({s.country})</option>
            ))}
          </select>
          <span>{mode === "spread" ? "−" : "÷"}</span>
          <select
            value={spreadBId ?? baseSeries[1]?.id ?? ""}
            onChange={(e) => setSpreadBId(e.target.value)}
            className="text-xs border border-slate-300 rounded px-1.5 py-0.5"
          >
            {baseSeries.map((s) => (
              <option key={s.id} value={s.id}>{s.indicator} ({s.country})</option>
            ))}
          </select>
        </div>
      )}

      {/* Body : picker à gauche, chart au centre, stats à droite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Picker */}
        <div className="lg:col-span-3 border border-slate-200 rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: 540 }}>
          <input
            type="text"
            placeholder="Rechercher un indicateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border-b border-slate-200 px-2 py-2 w-full focus:outline-none"
          />
          <div className="overflow-y-auto flex-1 text-xs">
            {Array.from(catalog.entries()).map(([section, indicators]) => (
              <details key={section} className="border-b border-slate-100">
                <summary className="cursor-pointer px-2 py-1.5 bg-slate-50 hover:bg-slate-100 font-medium text-slate-700 select-none">
                  {section.replace(/^\d+[a-z]?_/, "").replace(/_/g, " ")}
                </summary>
                <div className="pl-2">
                  {Array.from(indicators.entries()).map(([indicator, items]) => (
                    <details key={indicator}>
                      <summary className="cursor-pointer px-2 py-1 hover:bg-slate-50 text-slate-600 select-none">
                        {indicator}
                      </summary>
                      <ul className="pl-3 pb-1">
                        {items.map((d) => (
                          <li key={d.id}>
                            <label className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-blue-50 cursor-pointer rounded">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(d.id)}
                                onChange={() => toggleSeries(d.id)}
                                disabled={!selectedIds.includes(d.id) && selectedIds.length >= MAX_SERIES}
                                className="accent-blue-600"
                              />
                              <span className="text-slate-700">{d.country}</span>
                              <span className="text-slate-400 ml-auto">{d.pointCount} pts</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            {catalog.size === 0 && (
              <div className="text-center text-slate-400 py-4">Aucun résultat.</div>
            )}
          </div>
        </div>

        {/* Chart + chips */}
        <div className={showStats ? "lg:col-span-6" : "lg:col-span-9"}>
          {/* Chips séries actives */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {baseSeries.length === 0 && (
              <span className="text-xs text-slate-400">Aucune série sélectionnée — choisissez dans le panneau de gauche ou cliquez un preset.</span>
            )}
            {baseSeries.map((s, i) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] + "22", color: PALETTE[i % PALETTE.length] }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                {s.indicator} · {s.country}
                <button onClick={() => toggleSeries(s.id)} className="ml-1 hover:opacity-70">×</button>
              </span>
            ))}
          </div>

          {/* Chart */}
          <div className="h-80 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={yTickFormatter} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12 }}
                  formatter={(v) => (typeof v === "number" ? yTickFormatter(v) : "—")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(mode === "spread" || mode === "deltaPP" || mode === "yoy" || mode === "zscore") && (
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
                )}
                {transformed.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={`${s.indicator} · ${s.country}`}
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
                {annotationLabels.map((a) => (
                  <ReferenceLine
                    key={a.iso}
                    x={chartData.find((r) => r.iso === a.iso)?.label}
                    stroke="#dc2626"
                    strokeDasharray="2 4"
                    label={{
                      value: `${a.deltaBp >= 0 ? "+" : ""}${a.deltaBp}bp`,
                      position: "top",
                      fontSize: 10,
                      fill: "#dc2626",
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {mode === "base100" && (
            <div className="mt-2 text-xs text-slate-500">
              Pivot : <span className="font-medium">{transformed[0]?.points[0]?.label ?? "—"}</span> = 100.
              Cliquez sur un point pour changer le pivot (saisie manuelle ci-dessous).
              <input
                type="text"
                placeholder="ISO ex: 2022-01"
                value={pivotIso ?? ""}
                onChange={(e) => setPivotIso(e.target.value || null)}
                className="ml-2 text-xs border border-slate-300 rounded px-1.5 py-0.5"
              />
            </div>
          )}
        </div>

        {/* Stats panel */}
        {showStats && (
          <div className="lg:col-span-3 text-xs">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-slate-700">Statistiques</span>
              <button
                onClick={() => setShowStats(false)}
                className="text-slate-400 hover:text-slate-700"
                title="Masquer"
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              {stats.map(({ series, stats }, i) => (
                <div key={series.id} className="border border-slate-200 rounded p-2">
                  <div className="flex items-center gap-1.5 font-medium mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                    <span className="truncate" title={`${series.indicator} · ${series.country}`}>
                      {series.indicator}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] mb-1">{series.country}</div>
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                    <dt className="text-slate-500">Dernier</dt>
                    <dd className="text-right tabular-nums font-medium">{fmtForUnit(stats.last, series.unit)}</dd>
                    <dt className="text-slate-500">Moy.</dt>
                    <dd className="text-right tabular-nums">{fmtForUnit(stats.mean, series.unit)}</dd>
                    <dt className="text-slate-500">σ</dt>
                    <dd className="text-right tabular-nums">{fmtForUnit(stats.std, series.unit)}</dd>
                    <dt className="text-slate-500">Min</dt>
                    <dd className="text-right tabular-nums">{fmtForUnit(stats.min, series.unit)}</dd>
                    <dt className="text-slate-500">Max</dt>
                    <dd className="text-right tabular-nums">{fmtForUnit(stats.max, series.unit)}</dd>
                    <dt className="text-slate-500">YTD</dt>
                    <dd className="text-right tabular-nums">{stats.ytd !== null ? fmtPct(stats.ytd) : "—"}</dd>
                    <dt className="text-slate-500">1 A</dt>
                    <dd className="text-right tabular-nums">{stats.oneYear !== null ? fmtPct(stats.oneYear) : "—"}</dd>
                  </dl>
                </div>
              ))}
            </div>

            {/* Matrice de corrélation */}
            {corrMatrix && (
              <div className="mt-3 border border-slate-200 rounded p-2">
                <div className="font-medium text-slate-700 mb-2">Corrélation Pearson</div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr>
                      <th></th>
                      {transformed.map((_, j) => (
                        <th key={j} className="text-center text-slate-500 px-1">{j + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrMatrix.map((row, i) => (
                      <tr key={i}>
                        <td className="text-slate-500 pr-1 truncate max-w-[80px]" title={transformed[i].indicator}>
                          {i + 1}.
                        </td>
                        {row.map((v, j) => {
                          const color = !isFinite(v)
                            ? "bg-slate-50 text-slate-300"
                            : v > 0.7
                            ? "bg-emerald-100 text-emerald-900"
                            : v > 0.3
                            ? "bg-emerald-50 text-emerald-800"
                            : v > -0.3
                            ? "bg-slate-50 text-slate-600"
                            : v > -0.7
                            ? "bg-orange-50 text-orange-800"
                            : "bg-red-100 text-red-900";
                          return (
                            <td key={j} className={`text-center tabular-nums px-1 py-0.5 rounded ${color}`}>
                              {isFinite(v) ? v.toFixed(2).replace(".", ",") : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1 text-[10px] text-slate-400">
                  {transformed.map((s, i) => (
                    <div key={s.id}>
                      <span className="font-medium">{i + 1}.</span> {s.indicator} ({s.country})
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!showStats && (
          <div className="lg:col-span-3 hidden lg:flex items-start justify-end">
            <button
              onClick={() => setShowStats(true)}
              className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50"
            >
              Afficher stats
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function fmtForUnit(v: number, unit: TauxSeries["unit"]): string {
  if (!isFinite(v)) return "—";
  switch (unit) {
    case "pct": return fmtPct(v);
    case "Mds_FCFA": return fmtNum(v, 0);
    case "M_FCFA": return fmtNum(v, 0);
    case "x": return fmtNum(v, 2) + "×";
    case "rate": return fmtNum(v, 4);
    default: return fmtNum(v, 2);
  }
}
