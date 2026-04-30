"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  type?: "line" | "area" | "bar";
  yAxis?: "left" | "right";
  strokeDasharray?: string;
};

export type ChartPoint = {
  label: string;
  iso?: string;
  [key: string]: number | string | undefined;
};

// Palette / couleurs : exportees depuis `./macroColors.ts` (module sans
// "use client") pour qu'elles restent utilisables depuis un Server Component.
// Re-exportes ici pour ne pas casser les anciens imports cote client.
export { CHART, MACRO_PALETTE, COUNTRY_COLORS } from "./macroColors";

type Formatter = (v: number) => string;

/** Spécification d'unité d'axe — utilisable depuis un Server Component
 *  (les fonctions ne traversent pas la frontière server/client). */
export type AxisUnit =
  | "MdsFCFA"
  | "raw_pct" // valeur déjà en %, suffixée " %"
  | "pct" // décimal multiplié par 100
  | "num" // nombre brut auto-sized
  | "num0"
  | "num1"
  | "num2"
  | "num4";

function defaultFormatter(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("fr-FR");
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(".", ",");
  return v.toFixed(2).replace(".", ",");
}

const NUM_FR = new Intl.NumberFormat("fr-FR");

function makeFormatter(unit: AxisUnit | undefined, fallback: Formatter): Formatter {
  if (!unit) return fallback;
  return (v: number) => {
    if (!isFinite(v)) return "—";
    switch (unit) {
      case "MdsFCFA":
        if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} bn`;
        if (Math.abs(v) >= 10_000) return NUM_FR.format(Math.round(v));
        return v.toFixed(1).replace(".", ",");
      case "raw_pct":
        return `${v.toFixed(1).replace(".", ",")} %`;
      case "pct":
        return `${(v * 100).toFixed(2).replace(".", ",")} %`;
      case "num0":
        return NUM_FR.format(Math.round(v));
      case "num1":
        return v.toFixed(1).replace(".", ",");
      case "num2":
        return v.toFixed(2).replace(".", ",");
      case "num4":
        return v.toFixed(4).replace(".", ",");
      case "num":
      default:
        return defaultFormatter(v);
    }
  };
}

/**
 * Composant universel de chart pour les indicateurs macro.
 * Supporte line, area, bar, ou composition (line+bar) avec axe gauche/droit.
 */
export default function MacroChart({
  data,
  series,
  height = 320,
  yLeftFormatter,
  yRightFormatter,
  yLeftUnit,
  yRightUnit,
  zeroReference = false,
  legend = true,
  stacked = false,
  smallLabels = false,
}: {
  data: ChartPoint[];
  series: ChartSeries[];
  height?: number;
  /** Formatter explicite — uniquement utilisable depuis un Client Component. */
  yLeftFormatter?: Formatter;
  yRightFormatter?: Formatter;
  /** Spec d'unité — préférer côté Server Component (fonctions interdites). */
  yLeftUnit?: AxisUnit;
  yRightUnit?: AxisUnit;
  zeroReference?: boolean;
  legend?: boolean;
  stacked?: boolean;
  smallLabels?: boolean;
}) {
  const yLeft: Formatter = yLeftFormatter ?? makeFormatter(yLeftUnit, defaultFormatter);
  const yRight: Formatter = yRightFormatter ?? makeFormatter(yRightUnit, yLeft);
  if (!data.length || !series.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded"
        style={{ height }}
      >
        Aucune donnée disponible.
      </div>
    );
  }

  const hasMultiple = new Set(series.map((s) => s.type ?? "line")).size > 1;
  const hasBar = series.some((s) => s.type === "bar");
  const hasRight = series.some((s) => s.yAxis === "right");

  const fontSize = smallLabels ? 10 : 11;
  const xInterval =
    data.length > 50 ? Math.floor(data.length / 12) : data.length > 24 ? 2 : 0;

  // ---- Composition mixte (bar + line) ----
  if (hasMultiple || (hasBar && series.length > 1)) {
    return (
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={fontSize}
              interval={xInterval}
              tickMargin={6}
            />
            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              fontSize={fontSize}
              tickFormatter={yLeft}
              width={56}
            />
            {hasRight && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8"
                fontSize={fontSize}
                tickFormatter={yRight}
                width={56}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v, name, props) => {
                if (typeof v !== "number") return ["—", String(name)];
                const s = series.find((x) => x.key === props.dataKey);
                const fmt = s?.yAxis === "right" ? yRight : yLeft;
                return [fmt(v), s?.label ?? String(name)];
              }}
            />
            {legend && <Legend wrapperStyle={{ fontSize: fontSize + 1 }} iconSize={8} />}
            {zeroReference && (
              <ReferenceLine y={0} yAxisId="left" stroke="#94a3b8" strokeDasharray="2 2" />
            )}
            {series.map((s) => {
              const t = s.type ?? "line";
              const yId = s.yAxis === "right" ? "right" : "left";
              if (t === "bar") {
                return (
                  <Bar
                    key={s.key}
                    yAxisId={yId}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    fillOpacity={0.85}
                    stackId={stacked ? "stack" : undefined}
                  />
                );
              }
              if (t === "area") {
                return (
                  <Area
                    key={s.key}
                    yAxisId={yId}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                );
              }
              return (
                <Line
                  key={s.key}
                  yAxisId={yId}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.strokeDasharray}
                  dot={false}
                  connectNulls
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const allBar = series.every((s) => s.type === "bar");
  const allArea = series.every((s) => s.type === "area");

  // ---- Bar pur ----
  if (allBar) {
    return (
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={fontSize}
              interval={xInterval}
              tickMargin={6}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={fontSize}
              tickFormatter={yLeft}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v, name) =>
                typeof v === "number"
                  ? [yLeft(v), series.find((s) => s.key === name)?.label ?? String(name)]
                  : ["—", String(name)]
              }
            />
            {legend && series.length > 1 && (
              <Legend wrapperStyle={{ fontSize: fontSize + 1 }} iconSize={8} />
            )}
            {zeroReference && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                fillOpacity={0.85}
                stackId={stacked ? "stack" : undefined}
              >
                {series.length === 1 &&
                  data.map((entry, i) => {
                    const v = entry[s.key];
                    const positive = typeof v === "number" ? v >= 0 : true;
                    return (
                      <Cell
                        key={`c-${i}`}
                        fill={positive ? s.color : "#dc2626"}
                        fillOpacity={0.85}
                      />
                    );
                  })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ---- Area pur ----
  if (allArea) {
    return (
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={fontSize}
              interval={xInterval}
              tickMargin={6}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={fontSize}
              tickFormatter={yLeft}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v, name) =>
                typeof v === "number"
                  ? [yLeft(v), series.find((s) => s.key === name)?.label ?? String(name)]
                  : ["—", String(name)]
              }
            />
            {legend && series.length > 1 && (
              <Legend wrapperStyle={{ fontSize: fontSize + 1 }} iconSize={8} />
            )}
            {zeroReference && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={stacked ? 0.7 : 0.25}
                strokeWidth={2}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ---- Line pur (cas par défaut) ----
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={fontSize}
            interval={xInterval}
            tickMargin={6}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={fontSize}
            tickFormatter={yLeft}
            width={56}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v, name) =>
              typeof v === "number"
                ? [yLeft(v), series.find((s) => s.key === name)?.label ?? String(name)]
                : ["—", String(name)]
            }
          />
          {legend && series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: fontSize + 1 }} iconSize={8} />
          )}
          {zeroReference && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.strokeDasharray}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
