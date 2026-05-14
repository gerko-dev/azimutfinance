"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Attribution } from "@/lib/simulator/performance";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export default function PerformanceChart({
  attributions,
}: {
  attributions: Attribution[];
}) {
  // Trier par |totalPL| desc pour mettre en avant les plus contributeurs
  const sorted = [...attributions]
    .filter((a) => Math.abs(a.totalPL) > 0)
    .sort((a, b) => Math.abs(b.totalPL) - Math.abs(a.totalPL))
    .slice(0, 15);

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
        Aucune contribution P&amp;L à afficher pour l&apos;instant.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-bold text-slate-900">
          Attribution P&amp;L par titre
        </h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Top {sorted.length} contributeurs (positifs en vert, négatifs en rouge)
        </p>
      </div>
      <div className="h-72 px-3 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 5, right: 30, bottom: 5, left: 50 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              tickFormatter={(v) => fmtFCFA(v)}
            />
            <YAxis
              type="category"
              dataKey="code"
              tick={{ fontSize: 11, fontFamily: "monospace", fill: "#0f172a" }}
              stroke="#94a3b8"
              width={50}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                background: "rgba(255,255,255,0.97)",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
              }}
              formatter={(value) => [`${fmtFCFA(Number(value))} FCFA`, "P&L total"]}
              labelFormatter={(v) => `${v}`}
            />
            <Bar dataKey="totalPL" isAnimationActive={false}>
              {sorted.map((a) => (
                <Cell
                  key={a.code}
                  fill={a.totalPL >= 0 ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
