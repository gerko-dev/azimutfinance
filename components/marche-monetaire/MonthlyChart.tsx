"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export type MonthlyPoint = {
  month: string; // YYYY-MM
  monthLabel: string;
  amountMds: number; // milliards FCFA
  yieldPct: number; // %
  count: number;
};

export default function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        Pas assez de données pour générer la série mensuelle.
      </div>
    );
  }

  return (
    <div className="p-4">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v) => v.toFixed(0)}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Mds FCFA",
              angle: -90,
              position: "insideLeft",
              fill: "#64748b",
              fontSize: 11,
              offset: 12,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v) => `${v.toFixed(1)}`}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Rdt %",
              angle: 90,
              position: "insideRight",
              fill: "#64748b",
              fontSize: 11,
            }}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<MonthlyTooltip />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="rect"
          />
          <Bar
            yAxisId="left"
            dataKey="amountMds"
            fill="#3b82f6"
            fillOpacity={0.7}
            name="Montant levé (Mds FCFA)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="yieldPct"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#f59e0b", strokeWidth: 0 }}
            name="Taux moyen pondéré (%)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipPayloadItem = {
  payload: MonthlyPoint;
};

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-lg p-2.5 text-xs min-w-[160px]">
      <div className="font-semibold text-slate-900 mb-1.5">{p.monthLabel}</div>
      <div className="flex items-center justify-between gap-3 text-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-blue-500 rounded-sm" />
          Volume
        </span>
        <span className="font-mono">{p.amountMds.toFixed(2)} Mds</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-700 mt-0.5">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-amber-500 rounded-sm" />
          Rdt pond.
        </span>
        <span className="font-mono">{p.yieldPct.toFixed(2)} %</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1 pt-1 border-t border-slate-100">
        {p.count} émission{p.count > 1 ? "s" : ""}
      </div>
    </div>
  );
}
