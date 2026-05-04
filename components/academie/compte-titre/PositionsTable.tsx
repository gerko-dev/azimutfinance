import Link from "next/link";
import {
  SECURITY_TYPE_LABELS,
  type AccountPosition,
} from "@/lib/comptetitre/types";
import { fmtFCFA, fmtNum, fmtPct, pnlColor } from "./format";

export default function PositionsTable({
  positions,
}: {
  positions: AccountPosition[];
}) {
  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="text-sm text-slate-500">Aucune position ouverte.</div>
        <div className="text-xs text-slate-400 mt-1">
          Saisissez un achat dans le journal pour commencer le suivi.
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900">Positions ouvertes</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Ticker</th>
              <th className="text-left font-medium py-2 px-2">Type</th>
              <th className="text-right font-medium py-2 px-2">Qté</th>
              <th className="text-right font-medium py-2 px-2">PRU</th>
              <th className="text-right font-medium py-2 px-2">Cours</th>
              <th className="text-right font-medium py-2 px-2">Valorisation</th>
              <th className="text-right font-medium py-2 px-2">P&L latente</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Poids</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr
                key={p.code}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="py-2 pl-4 pr-2">
                  {p.securityType === "stock" ? (
                    <Link
                      href={`/titre/${p.code}`}
                      className="font-mono font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {p.code}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold text-slate-900">
                      {p.code}
                    </span>
                  )}
                  <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                    {p.name}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    {SECURITY_TYPE_LABELS[p.securityType]}
                  </span>
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {fmtNum(p.units, p.units >= 100 ? 0 : 2)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                  {fmtFCFA(p.avgCost)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {fmtFCFA(p.currentPrice)}
                  {p.priceDate && (
                    <div className="text-[9px] text-slate-400">
                      {p.priceDate.slice(0, 10)}
                    </div>
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-900">
                  {fmtFCFA(p.marketValue)}
                </td>
                <td className={`py-2 px-2 text-right tabular-nums ${pnlColor(p.unrealizedPL)}`}>
                  <div className="font-semibold">
                    {p.unrealizedPL >= 0 ? "+" : ""}
                    {fmtFCFA(p.unrealizedPL)}
                  </div>
                  <div className="text-[10px]">{fmtPct(p.unrealizedPLPct)}</div>
                </td>
                <td className="py-2 pr-4 pl-2 text-right tabular-nums text-slate-600">
                  {p.weightPct.toFixed(1).replace(".", ",")} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
