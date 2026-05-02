import type { PortfolioSnapshot } from "@/lib/simulator/types";
import { fmtFCFA, fmtPct } from "./format";

export default function PortfolioHeader({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const cashPct =
    snapshot.totalValue > 0 ? (snapshot.cash / snapshot.totalValue) * 100 : 0;
  const positionsPct =
    snapshot.totalValue > 0 ? (snapshot.marketValue / snapshot.totalValue) * 100 : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <Kpi
        label="Valeur totale"
        value={`${fmtFCFA(snapshot.totalValue)} FCFA`}
        sub={`vs ${fmtFCFA(snapshot.initialCapital)} initial`}
        accent="text-slate-900"
        big
      />
      <Kpi
        label="Performance"
        value={fmtPct(snapshot.totalReturn, 2)}
        sub="depuis le début"
        accent={
          snapshot.totalReturn >= 0 ? "text-emerald-700" : "text-rose-700"
        }
        big
      />
      <Kpi
        label="Cash disponible"
        value={fmtFCFA(snapshot.cash)}
        sub={`${cashPct.toFixed(0)} % du portefeuille`}
      />
      <Kpi
        label="Valeur titres"
        value={fmtFCFA(snapshot.marketValue)}
        sub={`${positionsPct.toFixed(0)} % du portefeuille`}
      />
      <Kpi
        label="Plus-value latente"
        value={fmtFCFA(snapshot.unrealizedPL)}
        accent={
          snapshot.unrealizedPL >= 0 ? "text-emerald-700" : "text-rose-700"
        }
        sub="positions ouvertes"
      />
      <Kpi
        label="Plus-value réalisée"
        value={fmtFCFA(snapshot.realizedPL)}
        accent={
          snapshot.realizedPL >= 0 ? "text-emerald-700" : "text-rose-700"
        }
        sub="ventes effectuées"
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className={`${big ? "text-lg md:text-xl" : "text-base md:text-lg"} font-semibold tabular-nums mt-1 ${
          accent ?? "text-slate-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
