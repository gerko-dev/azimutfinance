"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; value: number };

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

const RANGES: { label: string; days: number | null }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "Tout", days: null },
];

export default function PriceHistoryChart({ history }: { history: Point[] }) {
  const [rangeIdx, setRangeIdx] = useState(2);
  const range = RANGES[rangeIdx];

  const filtered = useMemo(() => {
    if (!range.days) return history;
    const cutoffMs = Date.now() - range.days * 24 * 60 * 60 * 1000;
    return history.filter(
      (p) => new Date(p.date + "T00:00:00Z").getTime() >= cutoffMs,
    );
  }, [history, range]);

  const stats = useMemo(() => {
    if (filtered.length < 2) return null;
    const first = filtered[0].value;
    const last = filtered[filtered.length - 1].value;
    const min = Math.min(...filtered.map((p) => p.value));
    const max = Math.max(...filtered.map((p) => p.value));
    return {
      first,
      last,
      min,
      max,
      changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    };
  }, [filtered]);

  const positive = (stats?.changePct ?? 0) >= 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Historique de cours</h3>
        <div className="flex gap-1 bg-white border border-slate-200 rounded p-0.5">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition ${
                i === rangeIdx
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 flex gap-4 text-[10px] font-mono">
          <span className="text-slate-500">
            Var.{" "}
            <strong
              className={positive ? "text-emerald-700" : "text-rose-700"}
            >
              {positive ? "+" : ""}
              {stats.changePct.toFixed(2).replace(".", ",")} %
            </strong>
          </span>
          <span className="text-slate-500">
            Min{" "}
            <strong className="text-slate-900">{fmtNum(stats.min)}</strong>
          </span>
          <span className="text-slate-500">
            Max{" "}
            <strong className="text-slate-900">{fmtNum(stats.max)}</strong>
          </span>
          <span className="text-slate-500">
            Dernier{" "}
            <strong className="text-slate-900">{fmtNum(stats.last)}</strong>
          </span>
        </div>
      )}

      <div className="h-56">
        {filtered.length < 2 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            Pas assez de données pour afficher l&apos;historique.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={filtered}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <defs>
                <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={positive ? "#059669" : "#dc2626"}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={positive ? "#059669" : "#dc2626"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                stroke="#94a3b8"
                tickFormatter={(v: string) =>
                  v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : v
                }
                minTickGap={30}
              />
              <YAxis
                tick={{ fontSize: 9 }}
                stroke="#94a3b8"
                tickFormatter={(v: number) => fmtNum(v)}
                width={60}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v) => [`${fmtNum(Number(v))} FCFA`, "Cours"]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11, padding: "4px 8px" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={positive ? "#059669" : "#dc2626"}
                strokeWidth={1.5}
                fill="url(#histFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
