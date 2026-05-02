import type { Position } from "@/lib/simulator/types";
import { fmtFCFA, fmtPct } from "./format";

export default function PositionsTable({
  positions,
  stockNames,
}: {
  positions: Position[];
  stockNames: Record<string, string>;
}) {
  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="text-sm text-slate-700 font-medium">Aucune position ouverte</div>
        <p className="text-[11px] text-slate-500 mt-1">
          Passez votre premier ordre d&apos;achat pour démarrer votre portefeuille.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">
          Positions ouvertes ({positions.length})
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Code</th>
              <th className="text-left font-medium py-2 px-2">Nom</th>
              <th className="text-right font-medium py-2 px-2">Unités</th>
              <th className="text-right font-medium py-2 px-2">PRU</th>
              <th className="text-right font-medium py-2 px-2">Cours</th>
              <th className="text-right font-medium py-2 px-2">Coût total</th>
              <th className="text-right font-medium py-2 px-2">Valeur marché</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">+/- value</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const isPositive = p.unrealizedPL >= 0;
              return (
                <tr
                  key={p.code}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-2 pl-4 pr-2 font-medium text-slate-900">{p.code}</td>
                  <td className="py-2 px-2 text-slate-700 truncate max-w-[200px]">
                    {stockNames[p.code] ?? "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {p.units.toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {Math.round(p.avgCost).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-900 font-medium">
                    {Math.round(p.currentPrice).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                    {fmtFCFA(p.costBasis)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-900 font-medium">
                    {fmtFCFA(p.marketValue)}
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right tabular-nums">
                    <div className={`font-semibold ${isPositive ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmtFCFA(p.unrealizedPL)}
                    </div>
                    <div className={`text-[10px] ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                      {fmtPct(p.unrealizedPLPct, 1)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
