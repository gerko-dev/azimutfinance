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
import MemberGateDialog from "./MemberGateDialog";
import type { UserRole } from "@/lib/auth/userRole";

export type IndicesEvolutionSeries = {
  code: string;
  name: string;
  data: { date: string; value: number }[];
  color: string;
};

type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "MAX";

const PERIOD_TO_DAYS: Record<Period, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1A": 365,
  "3A": 365 * 3,
  "5A": 365 * 5,
  MAX: null,
};

function formatDateShort(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

type Props = {
  series: IndicesEvolutionSeries[];
  userRole: UserRole;
  /** Codes selectionnes par defaut. Defaut ["BRVMC", "BRVM30"]. */
  defaultActive?: string[];
};

export default function IndicesEvolutionChart({
  series,
  userRole,
  defaultActive = ["BRVMC", "BRVM30"],
}: Props) {
  const isMember = userRole !== null;
  const [activeIndices, setActiveIndices] = useState<Set<string>>(
    () => new Set(defaultActive),
  );
  const [period, setPeriod] = useState<Period>("1A");
  const [memberGateOpen, setMemberGateOpen] = useState(false);

  function toggleIndex(code: string) {
    const next = new Set(activeIndices);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setActiveIndices(next);
  }

  // Mode base 100 : actif quand >=2 indices selectionnes (permet la comparaison
  // d'indices d'echelles tres differentes — ex BRVMC ~400 vs BRVM-TEL ~100).
  const useBase100 = activeIndices.size >= 2;

  const chartData = useMemo(() => {
    const days = PERIOD_TO_DAYS[period];
    let cutoffDate: string | null = null;
    if (days !== null) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - days);
      cutoffDate = d.toISOString().substring(0, 10);
    }

    const dateMap = new Map<string, Record<string, number | string>>();
    for (const s of series) {
      if (!activeIndices.has(s.code)) continue;
      const filtered = cutoffDate
        ? s.data.filter((p) => p.date >= cutoffDate!)
        : s.data;
      const baseValue = filtered.find((p) => p.value > 0)?.value ?? 0;

      for (const point of filtered) {
        const entry = dateMap.get(point.date) || { date: point.date };
        if (useBase100 && baseValue > 0) {
          entry[s.code] = (point.value / baseValue) * 100;
        } else {
          entry[s.code] = point.value;
        }
        dateMap.set(point.date, entry);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [series, activeIndices, period, useBase100]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">
            📊 Évolution des indices BRVM
          </h2>
          {useBase100 ? (
            <div className="text-[11px] text-slate-500 mt-1">
              Base 100 au {(() => {
                const first = chartData[0];
                if (!first) return "—";
                const d = String(first.date);
                return new Date(d).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                });
              })()} · permet la comparaison entre indices
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 mt-1">
              Sélectionnez plusieurs indices pour comparer en base 100.
            </div>
          )}
        </div>
        <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
          {(["1M", "3M", "6M", "1A", "3A", "5A", "MAX"] as Period[]).map((p) => {
            const gated = p === "MAX" && !isMember;
            return (
              <button
                key={p}
                onClick={() => {
                  if (gated) {
                    setMemberGateOpen(true);
                    return;
                  }
                  setPeriod(p);
                }}
                aria-haspopup={gated ? "dialog" : undefined}
                title={gated ? "Vue Max — réservée aux membres" : undefined}
                className={`px-2.5 py-1 rounded transition inline-flex items-center gap-1 ${
                  period === p
                    ? "bg-white shadow-sm font-medium text-blue-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p}
                {gated && <span aria-hidden className="text-[10px]">🔒</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {series.map((s) => {
          const isActive = activeIndices.has(s.code);
          return (
            <button
              key={s.code}
              onClick={() => toggleIndex(s.code)}
              className={`text-xs px-3 py-1.5 rounded-md border transition ${
                isActive
                  ? "border-slate-300 shadow-sm"
                  : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: s.color + "15",
                      color: s.color,
                      borderColor: s.color + "40",
                    }
                  : {}
              }
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: isActive ? s.color : "#cbd5e1" }}
              />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="h-72 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(d) => formatDateShort(d as string)}
              minTickGap={50}
            />
            <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              labelFormatter={(d) =>
                new Date(d as string).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })
              }
              formatter={(value, name) => {
                const found = series.find((s) => s.code === name);
                const formatted = Number(value ?? 0)
                  .toFixed(2)
                  .replace(".", ",");
                return [
                  useBase100 ? `${formatted} (base 100)` : formatted,
                  found?.name || name,
                ];
              }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(value) => {
                const found = series.find((s) => s.code === value);
                return found?.name || value;
              }}
            />
            {series
              .filter((s) => activeIndices.has(s.code))
              .map((s) => (
                <Line
                  key={s.code}
                  type="monotone"
                  dataKey={s.code}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <MemberGateDialog
        open={memberGateOpen}
        onClose={() => setMemberGateOpen(false)}
        tier="member"
        title="Vue Max réservée aux membres"
        description="Inscrivez-vous gratuitement pour accéder à l'historique complet des indices BRVM (jusqu'à la première séance disponible)."
      />
    </section>
  );
}
