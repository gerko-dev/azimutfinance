"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDateFr, fmtFCFA } from "./format";

export default function EquityCurveChart({
  data,
  initialCapital,
}: {
  data: { date: string; value: number }[];
  initialCapital: number;
}) {
  if (data.length < 2) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="text-sm text-slate-700 font-medium">Pas encore d&apos;historique</div>
        <p className="text-[11px] text-slate-500 mt-1">
          La courbe de valorisation apparaîtra dès que vous aurez passé votre première transaction.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">Évolution du portefeuille</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Valorisation hebdomadaire (cash + titres aux derniers cours connus à chaque date).
        </p>
      </div>
      <div className="p-4 md:p-5">
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={10}
                tickFormatter={(d) => (typeof d === "string" && d.length >= 7 ? d.slice(2, 7) : d)}
                interval={Math.max(0, Math.floor(data.length / 8))}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                width={70}
                tickFormatter={(v) => fmtFCFA(v as number)}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelFormatter={(l) => fmtDateFr(String(l))}
                formatter={(v) =>
                  typeof v === "number"
                    ? [`${fmtFCFA(v)} FCFA`, "Valeur"]
                    : ["—", "Valeur"]
                }
              />
              <ReferenceLine
                y={initialCapital}
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{ value: "Capital initial", fontSize: 9, fill: "#64748b", position: "insideTopRight" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#1d4ed8"
                strokeWidth={2}
                fill="url(#eqGrad)"
                dot={{ r: 2, fill: "#1d4ed8" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
