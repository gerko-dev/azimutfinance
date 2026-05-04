import Link from "next/link";
import {
  TXN_TYPE_LABELS,
  type BrokerageTransaction,
} from "@/lib/comptetitre/types";
import { fmtDateFr, fmtFCFA, fmtNum, pnlColor } from "./format";

export default function TransactionsLog({
  transactions,
  accountId,
}: {
  transactions: BrokerageTransaction[];
  accountId: string;
}) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="text-sm text-slate-500">Aucune transaction enregistrée.</div>
        <Link
          href={`/academie/compte-titre/${accountId}/transactions/nouvelle`}
          className="inline-block mt-3 text-xs bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          + Saisir la première transaction
        </Link>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Journal des transactions{" "}
          <span className="text-xs font-normal text-slate-500">
            ({transactions.length})
          </span>
        </h3>
        <Link
          href={`/academie/compte-titre/${accountId}/transactions/nouvelle`}
          className="text-xs bg-slate-900 hover:bg-slate-700 text-white font-medium px-2.5 py-1 rounded"
        >
          + Nouvelle transaction
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Date</th>
              <th className="text-left font-medium py-2 px-2">Type</th>
              <th className="text-left font-medium py-2 px-2">Valeur</th>
              <th className="text-right font-medium py-2 px-2">Qté</th>
              <th className="text-right font-medium py-2 px-2">Prix</th>
              <th className="text-right font-medium py-2 px-2">Frais</th>
              <th className="text-right font-medium py-2 px-2">Net cash</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const meta = TXN_TYPE_LABELS[t.type];
              return (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pl-4 pr-2 tabular-nums text-slate-700">
                    {fmtDateFr(t.txnDate)}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${typeBadgeClass(t.type)}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    {t.securityCode ? (
                      <div className="font-mono text-slate-900">{t.securityCode}</div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {t.securityName && (
                      <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                        {t.securityName}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {t.quantity != null ? fmtNum(t.quantity, t.quantity >= 100 ? 0 : 2) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {t.price != null ? fmtFCFA(t.price) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                    {t.totalFees > 0 ? fmtFCFA(t.totalFees) : "—"}
                  </td>
                  <td
                    className={`py-2 px-2 text-right tabular-nums font-semibold ${pnlColor(t.netAmount)}`}
                  >
                    {t.netAmount >= 0 ? "+" : ""}
                    {fmtFCFA(t.netAmount)}
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    <Link
                      href={`/academie/compte-titre/${accountId}/transactions/${t.id}`}
                      className="text-[11px] text-blue-700 hover:underline"
                    >
                      Éditer
                    </Link>
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

function typeBadgeClass(type: BrokerageTransaction["type"]): string {
  switch (type) {
    case "buy":
      return "bg-blue-100 text-blue-800";
    case "sell":
      return "bg-amber-100 text-amber-800";
    case "deposit":
      return "bg-emerald-100 text-emerald-800";
    case "withdrawal":
      return "bg-rose-100 text-rose-800";
    case "dividend":
      return "bg-emerald-100 text-emerald-800";
    case "interest":
      return "bg-emerald-50 text-emerald-700";
    case "fee":
      return "bg-slate-200 text-slate-700";
    case "split":
      return "bg-purple-100 text-purple-800";
  }
}
