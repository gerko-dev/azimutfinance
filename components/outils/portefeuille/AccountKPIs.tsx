import type { AccountSnapshot } from "@/lib/comptetitre/types";
import { fmtFCFA, fmtPct, pnlColor } from "./format";

export default function AccountKPIs({ snapshot }: { snapshot: AccountSnapshot }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI
          label="Valeur totale"
          value={`${fmtFCFA(snapshot.totalValue)} FCFA`}
          accent="text-slate-900"
          sub={`Investi net : ${fmtFCFA(snapshot.netInvested)} FCFA`}
        />
        <KPI
          label="Compte espèce"
          value={`${fmtFCFA(snapshot.cash)} FCFA`}
          accent="text-emerald-700"
          sub="Cash disponible pour achat / retrait"
        />
        <KPI
          label="Compte titre (investi)"
          value={`${fmtFCFA(snapshot.marketValue)} FCFA`}
          accent="text-blue-700"
          sub={`${snapshot.positions.length} ligne${snapshot.positions.length > 1 ? "s" : ""}`}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label="Performance totale"
          value={fmtPct(snapshot.totalReturnPct)}
          accent={pnlColor(snapshot.totalReturnPct)}
          sub="Net investi vs valeur totale"
        />
        <KPI
          label="P&L latente"
          value={`${snapshot.unrealizedPL >= 0 ? "+" : ""}${fmtFCFA(snapshot.unrealizedPL)}`}
          accent={pnlColor(snapshot.unrealizedPL)}
          sub="Positions ouvertes"
        />
        <KPI
          label="P&L réalisée"
          value={`${snapshot.realizedPL >= 0 ? "+" : ""}${fmtFCFA(snapshot.realizedPL)}`}
          accent={pnlColor(snapshot.realizedPL)}
          sub="Positions soldées"
        />
        <KPI
          label="Dividendes / Frais"
          value={`+${fmtFCFA(snapshot.totalDividends)}`}
          accent="text-emerald-700"
          sub={`Frais cumulés : ${fmtFCFA(snapshot.totalFees)}`}
        />
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`text-lg md:text-xl font-bold tabular-nums mt-1 ${accent}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
