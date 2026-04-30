import { fmtKPIDelta, fmtKPIValue } from "@/lib/macroFormat";
import type { MacroKPI } from "@/lib/macroTypes";

const GROUP_META: Record<MacroKPI["group"], { label: string; color: string }> = {
  croissance: { label: "Croissance", color: "bg-blue-50 text-blue-700 border-blue-100" },
  prix: { label: "Prix", color: "bg-amber-50 text-amber-700 border-amber-100" },
  epargne: { label: "Épargne / Invest.", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  budget: { label: "Finances publiques", color: "bg-purple-50 text-purple-700 border-purple-100" },
  exterieur: { label: "Externe", color: "bg-rose-50 text-rose-700 border-rose-100" },
  monnaie: { label: "Monnaie", color: "bg-slate-100 text-slate-700 border-slate-200" },
};

function deltaClassFor(kpi: MacroKPI): string {
  if (kpi.delta === null || kpi.delta === 0) return "text-slate-500";
  // Pour la dette, l'inflation, le déficit (valeur "négative est meilleure") : un delta positif = pire.
  const negativeIsGood =
    kpi.key === "debt_stock" ||
    kpi.key === "debt_gdp" ||
    kpi.key === "inflation_avg" ||
    kpi.key === "inflation_dec";
  if (negativeIsGood) return kpi.delta > 0 ? "text-red-600" : "text-emerald-600";
  return kpi.delta > 0 ? "text-emerald-600" : "text-red-600";
}

export default function MacroKPIGrid({ kpis }: { kpis: MacroKPI[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {kpis.map((kpi) => {
        const meta = GROUP_META[kpi.group];
        const value = fmtKPIValue(kpi.value, kpi.unit);
        const delta = fmtKPIDelta(kpi.delta, kpi.unit);
        return (
          <div
            key={kpi.key}
            className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.color}`}>
                {meta.label}
              </span>
              {kpi.rank && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 tabular-nums"
                  title={`Rang du pays sur ${kpi.rank.total} pays UEMOA`}
                >
                  {kpi.rank.position}/{kpi.rank.total}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-600 font-medium leading-tight">
              {kpi.label}
            </div>
            <div className="text-lg md:text-xl font-semibold tabular-nums text-slate-900">
              {value}
            </div>
            <div className="flex items-center gap-2 flex-wrap min-h-[16px]">
              {delta && (
                <span className={`text-[11px] tabular-nums ${deltaClassFor(kpi)}`}>
                  {delta}
                </span>
              )}
              {kpi.convergence && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border tabular-nums ${
                    kpi.convergence.satisfied
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                  title={`Critère de convergence UEMOA : ${kpi.convergence.label}`}
                >
                  {kpi.convergence.satisfied ? "✓" : "⚠"} {kpi.convergence.label}
                </span>
              )}
            </div>
            {kpi.periodLabel && (
              <div className="text-[10px] text-slate-400">{kpi.periodLabel}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
