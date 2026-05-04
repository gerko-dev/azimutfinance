"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/comptetitre/types";
import { fmtFCFA } from "./format";

export default function EquityCurveChart({
  data,
}: {
  data: EquityPoint[];
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          Courbe de valorisation
        </h3>
        <div className="text-xs text-slate-400 text-center py-12 border border-dashed border-slate-200 rounded">
          Saisissez des transactions pour voir l&apos;évolution de votre portefeuille.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Courbe de valorisation
        </h3>
        <span className="text-[11px] text-slate-400">
          1 point / semaine · valorisation aux derniers cours connus
        </span>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: string) => v.slice(2, 7)}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`
                  : v >= 1_000
                    ? `${(v / 1_000).toFixed(0)} k`
                    : String(v)
              }
              width={60}
            />
            <Tooltip content={<CustomTip />} />
            <Legend
              verticalAlign="top"
              height={20}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Valeur portefeuille"
              stroke="#1d4ed8"
              strokeWidth={2}
              fill="url(#equityGrad)"
            />
            <Line
              type="monotone"
              dataKey="netInvested"
              name="Capital net investi"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type TipPayload = { active?: boolean; payload?: Array<{ payload: EquityPoint }> };

function CustomTip(props: TipPayload) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const p = props.payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm px-3 py-2 text-[11px] space-y-0.5">
      <div className="font-semibold text-slate-900 tabular-nums">
        {p.date}
      </div>
      <div className="text-slate-700 tabular-nums">
        Valeur : <span className="font-semibold">{fmtFCFA(p.value)}</span>
      </div>
      <div className="text-slate-500 tabular-nums">
        Investi : {fmtFCFA(p.netInvested)}
      </div>
    </div>
  );
}
