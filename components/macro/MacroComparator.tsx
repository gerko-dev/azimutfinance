"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import CountryFlag from "@/components/CountryFlag";
import MacroChart, { COUNTRY_COLORS, type ChartPoint, type ChartSeries } from "./MacroChart";
import { COUNTRY_BY_CODE, type MacroCountryCode } from "@/lib/macroTypes";

export type ComparatorIndicatorOption = {
  key: string; // stable id utilisé dans l'URL (cmp=<key>)
  feuille: string;
  indicator: string;
  label: string; // libellé lisible pour le select
  unit: "raw" | "raw_pct" | "Mds_FCFA" | "pct";
  decimals?: number;
};

export type ComparatorSnapshot = {
  countryCode: MacroCountryCode;
  countryName: string;
  value: number | null;
  periodLabel: string | null;
  history: { label: string; value: number; iso: string; sortKey: number }[];
};

export type ComparatorPayload = {
  selected: ComparatorIndicatorOption;
  snapshots: ComparatorSnapshot[];
  // Chart data : chaque ligne est une période, colonnes = pays
  history: { label: string; iso: string; sortKey: number; [k: string]: number | string }[];
  countriesInChart: MacroCountryCode[];
};

function fmt(v: number | null, unit: ComparatorIndicatorOption["unit"], decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  switch (unit) {
    case "raw_pct":
      return `${v.toFixed(decimals).replace(".", ",")} %`;
    case "pct":
      return `${(v * 100).toFixed(decimals).replace(".", ",")} %`;
    case "Mds_FCFA":
      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")} bn`;
      if (Math.abs(v) >= 10_000) return Math.round(v).toLocaleString("fr-FR");
      return v.toFixed(decimals).replace(".", ",");
    case "raw":
    default:
      if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("fr-FR");
      return v.toFixed(decimals).replace(".", ",");
  }
}

export default function MacroComparator({
  data,
  options,
  basePath,
  baseParams,
  highlight,
}: {
  data: ComparatorPayload;
  options: ComparatorIndicatorOption[];
  basePath: string;
  baseParams: Record<string, string>;
  highlight?: MacroCountryCode;
}) {
  const router = useRouter();

  function selectIndicator(value: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) if (v) params.set(k, v);
    params.set("cmp", value);
    router.push(`${basePath}?${params.toString()}#comparateur`, { scroll: false });
  }

  const ranked = useMemo(() => {
    return [...data.snapshots]
      .filter((s) => s.value !== null)
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  }, [data.snapshots]);

  const chartSeries: ChartSeries[] = data.countriesInChart.map((c) => ({
    key: c,
    label: COUNTRY_BY_CODE[c]?.shortName ?? c,
    color: COUNTRY_COLORS[c] ?? "#475569",
    type: "line",
  }));

  const yFmt = (v: number) => fmt(v, data.selected.unit, data.selected.decimals ?? 1);

  return (
    <section
      id="comparateur"
      className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 scroll-mt-24"
    >
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="text-base md:text-lg font-semibold">Comparateur UEMOA</h2>
          <p className="text-xs text-slate-500 mt-1">
            Comparez les 8 pays UEMOA (et l&apos;agrégat Union) sur n&apos;importe quel indicateur clé.
            Snapshot du dernier point + historique sur la fenêtre disponible.
          </p>
        </div>
        <select
          value={data.selected.key}
          onChange={(e) => selectIndicator(e.target.value)}
          className="text-xs border border-slate-300 rounded px-2 py-1.5 max-w-full md:max-w-[320px]"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Ranking */}
        <div className="lg:col-span-4 border border-slate-200 rounded-lg p-3">
          <div className="text-[11px] text-slate-500 mb-2">
            Classement · {ranked[0]?.periodLabel ?? "—"}
          </div>
          <ul className="space-y-1.5">
            {ranked.map((s, i) => {
              const max = Math.max(...ranked.map((r) => Math.abs(r.value ?? 0)));
              const width = max > 0 ? (Math.abs(s.value ?? 0) / max) * 100 : 0;
              const isHi = highlight === s.countryCode;
              const positive = (s.value ?? 0) >= 0;
              return (
                <li
                  key={s.countryCode}
                  className={`text-xs ${isHi ? "bg-blue-50 -mx-1 px-1 rounded" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-slate-400 tabular-nums w-4 shrink-0">
                        {i + 1}
                      </span>
                      <CountryFlag
                        country={s.countryCode === "UMOA" ? "UEMOA" : s.countryCode}
                        size={12}
                      />
                      <span className="text-slate-700 truncate">{s.countryName}</span>
                    </span>
                    <span className="tabular-nums font-medium text-slate-900 shrink-0">
                      {fmt(s.value, data.selected.unit, data.selected.decimals ?? 1)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        positive ? "bg-blue-500" : "bg-red-500"
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Chart */}
        <div className="lg:col-span-8">
          <div className="text-xs font-medium text-slate-900 mb-2">
            {data.selected.label}
          </div>
          <MacroChart
            data={data.history as ChartPoint[]}
            series={chartSeries}
            yLeftFormatter={yFmt}
            zeroReference
            height={320}
            legend
            smallLabels
          />
        </div>
      </div>
    </section>
  );
}
