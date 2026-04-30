"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import MacroChart, { COUNTRY_COLORS, type ChartPoint, type ChartSeries } from "./MacroChart";
import {
  COUNTRY_BY_CODE,
  type ExplorerFeuille,
  type MacroCountryCode,
} from "@/lib/macroTypes";

export type ExplorerSeriesPoint = {
  iso: string;
  label: string;
  sortKey: number;
  value: number;
};

export type ExplorerData = {
  feuille: string;
  indicator: string;
  periodicity: "yearly" | "monthly";
  // Données par pays. Vide si compare = false (pays unique).
  byCountry: Record<MacroCountryCode, ExplorerSeriesPoint[]>;
  primary: MacroCountryCode;
  primaryUnit: "raw" | "raw_pct" | "Mds_FCFA" | "pct";
};

type Transform = "level" | "yoy" | "base100" | "cagr_avg";

const TIME_WINDOWS: { id: string; label: string; months: number | null }[] = [
  { id: "1y", label: "1A", months: 12 },
  { id: "3y", label: "3A", months: 36 },
  { id: "5y", label: "5A", months: 60 },
  { id: "10y", label: "10A", months: 120 },
  { id: "max", label: "Max", months: null },
];

function applyWindow(
  points: ExplorerSeriesPoint[],
  windowId: string,
): ExplorerSeriesPoint[] {
  const w = TIME_WINDOWS.find((t) => t.id === windowId);
  if (!w || w.months === null || points.length === 0) return points;
  const lastSk = points[points.length - 1].sortKey;
  // sortKey est sur 100 (year*100 + month). months -> delta sortKey
  const minSk = lastSk - w.months;
  return points.filter((p) => p.sortKey >= minSk);
}

function applyTransform(
  points: ExplorerSeriesPoint[],
  mode: Transform,
  periodicity: "yearly" | "monthly",
): ExplorerSeriesPoint[] {
  if (mode === "level") return points;
  if (mode === "base100") {
    const base = points[0]?.value;
    if (!base) return points;
    return points.map((p) => ({ ...p, value: (p.value / base) * 100 }));
  }
  if (mode === "yoy") {
    const lookback = periodicity === "monthly" ? 12 : 1;
    const out: ExplorerSeriesPoint[] = [];
    for (let i = lookback; i < points.length; i++) {
      const prev = points[i - lookback].value;
      if (prev === 0) continue;
      out.push({
        ...points[i],
        value: ((points[i].value - prev) / Math.abs(prev)) * 100,
      });
    }
    return out;
  }
  if (mode === "cagr_avg") {
    // moyenne mobile glissante 3 ans
    const window = periodicity === "monthly" ? 36 : 3;
    const out: ExplorerSeriesPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = points.slice(start, i + 1);
      const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
      out.push({ ...points[i], value: avg });
    }
    return out;
  }
  return points;
}

function computeStats(points: ExplorerSeriesPoint[]) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const last = points[points.length - 1];
  const first = points[0];
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const minIdx = values.indexOf(min);
  const maxIdx = values.indexOf(max);

  // CAGR sur la fenêtre
  let cagr: number | null = null;
  if (first.value > 0 && last.value > 0) {
    const years = (last.sortKey - first.sortKey) / 12;
    if (years > 0.5) cagr = Math.pow(last.value / first.value, 1 / years) - 1;
  }

  return {
    last: last.value,
    lastLabel: last.label,
    mean,
    min,
    max,
    std,
    minLabel: points[minIdx].label,
    maxLabel: points[maxIdx].label,
    cagr,
    countObs: points.length,
    span: `${first.label} → ${last.label}`,
  };
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

function fmtVal(v: number, unit: ExplorerData["primaryUnit"], mode: Transform): string {
  if (!isFinite(v)) return "—";
  if (mode === "yoy") return `${v.toFixed(1).replace(".", ",")} %`;
  if (mode === "base100") return v.toFixed(1).replace(".", ",");
  switch (unit) {
    case "raw_pct":
      return `${v.toFixed(2).replace(".", ",")} %`;
    case "Mds_FCFA":
      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")} bn`;
      if (Math.abs(v) >= 10_000) return Math.round(v).toLocaleString("fr-FR");
      return v.toFixed(1).replace(".", ",");
    case "pct":
      return `${(v * 100).toFixed(2).replace(".", ",")} %`;
    case "raw":
    default:
      if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("fr-FR");
      if (Math.abs(v) >= 10) return v.toFixed(2).replace(".", ",");
      return v.toFixed(4).replace(".", ",");
  }
}

export default function MacroExplorer({
  catalog,
  data,
  basePath,
  baseParams,
  compare,
  initialMode = "level",
  initialWindow = "max",
}: {
  catalog: ExplorerFeuille[];
  data: ExplorerData;
  basePath: string;
  /** Params à préserver entre navigations (typiquement ?pays=…). */
  baseParams: Record<string, string>;
  compare: boolean;
  initialMode?: Transform;
  initialWindow?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Transform>(initialMode);
  const [windowId, setWindowId] = useState<string>(initialWindow);
  const [search, setSearch] = useState("");
  const detailsRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());

  // Auto-ouvrir le feuille active au montage
  useEffect(() => {
    const el = detailsRefs.current.get(data.feuille);
    if (el) el.open = true;
  }, [data.feuille]);

  // ---- Navigation : updater l'URL ----
  function updateUrl(next: { feuille?: string; indicator?: string; compare?: boolean }) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) {
      if (k === "xcompare" || k === "xfeuille" || k === "xind") continue;
      if (v) params.set(k, v);
    }
    params.set("xfeuille", next.feuille ?? data.feuille);
    params.set("xind", next.indicator ?? data.indicator);
    const cmp = next.compare !== undefined ? next.compare : compare;
    if (cmp) params.set("xcompare", "1");
    router.push(`${basePath}?${params.toString()}#studio`, { scroll: false });
  }

  // ---- Filtre catalogue ----
  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog
      .map((f) => ({
        ...f,
        indicators: f.indicators.filter((i) => i.indicator.toLowerCase().includes(q)),
      }))
      .filter((f) => f.indicators.length > 0);
  }, [catalog, search]);

  // ---- Transformation des séries ----
  const countryCodes = useMemo<MacroCountryCode[]>(
    () =>
      compare ? (Object.keys(data.byCountry) as MacroCountryCode[]) : [data.primary],
    [compare, data.byCountry, data.primary],
  );

  const seriesByCountry = useMemo(() => {
    const map = new Map<MacroCountryCode, ExplorerSeriesPoint[]>();
    for (const c of countryCodes) {
      const raw = data.byCountry[c] ?? [];
      const windowed = applyWindow(raw, windowId);
      const transformed = applyTransform(windowed, mode, data.periodicity);
      map.set(c, transformed);
    }
    return map;
  }, [countryCodes, data, mode, windowId]);

  // ---- Construction des données du chart ----
  const chartData: ChartPoint[] = useMemo(() => {
    const map = new Map<string, ChartPoint>();
    for (const [country, points] of seriesByCountry) {
      for (const p of points) {
        const row = map.get(p.iso) ?? ({ iso: p.iso, label: p.label, sortKey: p.sortKey } as ChartPoint);
        row[country] = p.value;
        map.set(p.iso, row);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.sortKey as number) - (b.sortKey as number),
    );
  }, [seriesByCountry]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    return countryCodes.map((c) => ({
      key: c,
      label: COUNTRY_BY_CODE[c]?.shortName ?? c,
      color: COUNTRY_COLORS[c] ?? "#475569",
      type: "line" as const,
    }));
  }, [countryCodes]);

  // ---- Stats du pays principal ----
  const primaryStats = useMemo(
    () => computeStats(seriesByCountry.get(data.primary) ?? []),
    [seriesByCountry, data.primary],
  );

  function handleExport() {
    const headers = ["Période", ...countryCodes.map((c) => COUNTRY_BY_CODE[c]?.shortName ?? c)];
    const rows: (string | number)[][] = chartData.map((d) => [
      String(d.label),
      ...countryCodes.map((c) => (typeof d[c] === "number" ? (d[c] as number) : "")),
    ]);
    const safe = (data.indicator || "indicateur").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    downloadCSV(`macro_${data.feuille}_${safe}_${mode}.csv`, headers, rows);
  }

  const yFmt = (v: number) => fmtVal(v, data.primaryUnit, mode);

  return (
    <section
      id="studio"
      className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 scroll-mt-24"
    >
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base md:text-lg font-semibold">Studio d&apos;analyse macro</h2>
          <p className="text-xs text-slate-500 mt-1">
            Toutes les feuilles BCEAO disponibles : {catalog.length} catégories ·{" "}
            {catalog.reduce((s, f) => s + f.indicators.length, 0)} indicateurs.
            Comparez les pays UEMOA, transformez les séries (YoY, base 100…),
            téléchargez les données.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="text-xs px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap gap-3 items-center text-xs border-y border-slate-200 py-3">
        <div className="flex gap-1 items-center">
          <span className="text-slate-500 mr-1">Mode :</span>
          {(
            [
              ["level", "Niveau"],
              ["yoy", "% YoY"],
              ["base100", "Base 100"],
              ["cagr_avg", "Moy. glissante"],
            ] as [Transform, string][]
          ).map(([m, l]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded ${
                mode === m
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
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
              className={`px-2 py-1 rounded ${
                windowId === w.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => updateUrl({ compare: e.target.checked })}
            className="accent-blue-600"
          />
          Comparer tous les pays UEMOA
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Picker */}
        <div
          className="lg:col-span-3 border border-slate-200 rounded-lg overflow-hidden flex flex-col"
          style={{ maxHeight: 540 }}
        >
          <input
            type="text"
            placeholder="Rechercher un indicateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border-b border-slate-200 px-2 py-2 w-full focus:outline-none"
          />
          <div className="overflow-y-auto flex-1 text-xs">
            {filteredCatalog.length === 0 && (
              <div className="text-center text-slate-400 py-4">Aucun résultat.</div>
            )}
            {filteredCatalog.map((f) => (
              <details
                key={f.feuille}
                ref={(el) => {
                  if (el) detailsRefs.current.set(f.feuille, el);
                }}
                className="border-b border-slate-100"
                open={f.feuille === data.feuille}
              >
                <summary className="cursor-pointer px-2 py-1.5 bg-slate-50 hover:bg-slate-100 font-medium text-slate-700 select-none flex items-center justify-between">
                  <span>{f.feuille}</span>
                  <span className="text-[10px] text-slate-400">
                    {f.periodicity === "monthly" ? "M" : "A"} · {f.indicators.length}
                  </span>
                </summary>
                <ul className="pl-2 pb-1">
                  {f.indicators.map((ind) => {
                    const active =
                      ind.indicator === data.indicator && f.feuille === data.feuille;
                    return (
                      <li key={ind.indicator}>
                        <button
                          onClick={() =>
                            updateUrl({ feuille: f.feuille, indicator: ind.indicator })
                          }
                          className={`text-left w-full px-2 py-1 rounded hover:bg-blue-50 ${
                            active ? "bg-blue-50 text-blue-800 font-medium" : "text-slate-700"
                          }`}
                          title={`${ind.count} obs. · jusqu'à ${ind.lastIso}`}
                        >
                          {ind.indicator}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-6">
          <div className="mb-2 text-xs text-slate-600">
            <div className="font-medium text-slate-900">{data.indicator}</div>
            <div className="text-slate-500">
              {data.feuille} · {data.periodicity === "monthly" ? "Mensuel" : "Annuel"}
            </div>
          </div>
          <MacroChart
            data={chartData}
            series={chartSeries}
            yLeftFormatter={yFmt}
            zeroReference={mode === "yoy"}
            height={360}
            legend={compare}
          />
          {primaryStats && (
            <div className="mt-2 text-[11px] text-slate-500">
              {primaryStats.countObs} observations sur {primaryStats.span}
              {compare && ` · pays mis en avant : ${COUNTRY_BY_CODE[data.primary]?.shortName}`}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="lg:col-span-3 text-xs space-y-3">
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-medium text-slate-900 mb-2">Statistiques</div>
            {!primaryStats ? (
              <div className="text-slate-400">Aucune donnée.</div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                <dt className="text-slate-500">Dernière</dt>
                <dd className="text-right tabular-nums font-medium text-slate-900">
                  {fmtVal(primaryStats.last, data.primaryUnit, mode)}
                </dd>
                <dt className="text-slate-500 col-span-2 text-[10px] -mt-1">
                  {primaryStats.lastLabel}
                </dt>
                <dt className="text-slate-500">Moyenne</dt>
                <dd className="text-right tabular-nums">
                  {fmtVal(primaryStats.mean, data.primaryUnit, mode)}
                </dd>
                <dt className="text-slate-500">Médiane σ</dt>
                <dd className="text-right tabular-nums">
                  {fmtVal(primaryStats.std, data.primaryUnit, mode)}
                </dd>
                <dt className="text-slate-500">Min</dt>
                <dd className="text-right tabular-nums">
                  {fmtVal(primaryStats.min, data.primaryUnit, mode)}
                </dd>
                <dt className="text-slate-400 col-span-2 text-[10px] -mt-1 text-right">
                  {primaryStats.minLabel}
                </dt>
                <dt className="text-slate-500">Max</dt>
                <dd className="text-right tabular-nums">
                  {fmtVal(primaryStats.max, data.primaryUnit, mode)}
                </dd>
                <dt className="text-slate-400 col-span-2 text-[10px] -mt-1 text-right">
                  {primaryStats.maxLabel}
                </dt>
                <dt className="text-slate-500">CAGR</dt>
                <dd className="text-right tabular-nums">
                  {primaryStats.cagr !== null
                    ? `${(primaryStats.cagr * 100).toFixed(1).replace(".", ",")} %`
                    : "—"}
                </dd>
                <dt className="text-slate-500">Observations</dt>
                <dd className="text-right tabular-nums">{primaryStats.countObs}</dd>
              </dl>
            )}
          </div>

          {compare && countryCodes.length > 1 && (
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="font-medium text-slate-900 mb-2">
                Snapshot pays · {primaryStats?.lastLabel ?? "—"}
              </div>
              <ul className="space-y-1">
                {countryCodes
                  .map((c) => {
                    const series = seriesByCountry.get(c) ?? [];
                    const last = series[series.length - 1];
                    return { c, value: last?.value ?? null };
                  })
                  .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
                  .map(({ c, value }, i) => (
                    <li
                      key={c}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-slate-400 tabular-nums w-4">{i + 1}.</span>
                        <span className="text-slate-700">
                          {COUNTRY_BY_CODE[c]?.shortName ?? c}
                        </span>
                      </span>
                      <span className="tabular-nums text-slate-900 font-medium">
                        {value === null ? "—" : fmtVal(value, data.primaryUnit, mode)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
