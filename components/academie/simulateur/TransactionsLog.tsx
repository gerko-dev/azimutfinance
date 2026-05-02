import type { Transaction } from "@/lib/simulator/types";
import { fmtDateTimeFr, fmtFCFA } from "./format";

export default function TransactionsLog({
  transactions,
}: {
  transactions: Transaction[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="text-sm text-slate-700 font-medium">Aucune transaction</div>
        <p className="text-[11px] text-slate-500 mt-1">
          Le journal de vos ordres exécutés apparaîtra ici.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Journal des transactions ({transactions.length})
        </h2>
        <span className="text-[11px] text-slate-400">Plus récents en haut</span>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 bg-white">
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Date</th>
              <th className="text-left font-medium py-2 px-2">Sens</th>
              <th className="text-left font-medium py-2 px-2">Code</th>
              <th className="text-right font-medium py-2 px-2">Unités</th>
              <th className="text-right font-medium py-2 px-2">Prix</th>
              <th className="text-right font-medium py-2 px-2">Brut</th>
              <th className="text-right font-medium py-2 px-2">Frais</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-1.5 pl-4 pr-2 text-slate-500 whitespace-nowrap">
                  {fmtDateTimeFr(t.executed_at)}
                </td>
                <td className="py-1.5 px-2">
                  <span
                    className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                      t.type === "BUY"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {t.type === "BUY" ? "Achat" : "Vente"}
                  </span>
                </td>
                <td className="py-1.5 px-2 font-medium text-slate-900">{t.code}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                  {t.units.toLocaleString("fr-FR")}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                  {t.price.toLocaleString("fr-FR")}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                  {fmtFCFA(t.gross_total)}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">
                  {t.fees > 0 ? fmtFCFA(t.fees) : "—"}
                </td>
                <td
                  className={`py-1.5 pr-4 pl-2 text-right tabular-nums font-semibold ${
                    t.type === "BUY" ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {t.type === "BUY" ? "−" : "+"}
                  {fmtFCFA(t.net_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
