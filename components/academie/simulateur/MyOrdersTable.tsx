"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/lib/simulator/actions";
import type { OrderRow } from "@/lib/simulator/types";
import { fmtFCFAExact } from "@/lib/format";

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

export default function MyOrdersTable({
  openOrders,
  history,
}: {
  openOrders: OrderRow[];
  history: OrderRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "history">("open");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancel(orderId: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await cancelOrderAction(orderId);
      if (res.ok) {
        setFeedback({
          ok: true,
          msg:
            res.data.refund > 0
              ? `Ordre annulé. ${fmtFCFAExact(res.data.refund)} FCFA remboursés.`
              : "Ordre annulé.",
        });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  const rows = tab === "open" ? openOrders : history;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Mes ordres</h3>
        <div className="flex gap-1 bg-slate-100 rounded p-0.5">
          <button
            type="button"
            onClick={() => setTab("open")}
            className={`text-[11px] font-medium px-2 py-0.5 rounded transition ${
              tab === "open"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Ouverts ({openOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`text-[11px] font-medium px-2 py-0.5 rounded transition ${
              tab === "history"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Historique
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`text-xs px-3 py-1.5 border-b ${
            feedback.ok
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-slate-400">
          {tab === "open" ? "Aucun ordre ouvert." : "Aucun ordre exécuté ou annulé."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-[10px] uppercase text-slate-500">
                <th className="text-left font-semibold px-3 py-2">Quand</th>
                <th className="text-left font-semibold px-3 py-2">Titre</th>
                <th className="text-left font-semibold px-3 py-2">Sens</th>
                <th className="text-left font-semibold px-3 py-2">Type</th>
                <th className="text-right font-semibold px-3 py-2">Unités</th>
                <th className="text-right font-semibold px-3 py-2">Prix</th>
                <th className="text-left font-semibold px-3 py-2">Validité</th>
                <th className="text-center font-semibold px-3 py-2">Statut</th>
                {tab === "open" && (
                  <th className="text-right font-semibold px-3 py-2">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-700 tabular-nums whitespace-nowrap">
                    {new Date(o.placed_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                    {o.code}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        o.side === "BUY"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {o.side === "BUY" ? "Achat" : "Vente"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{o.order_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                    {fmtNum(o.units_filled)} / {fmtNum(o.units)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                    {o.limit_price !== null
                      ? fmtFCFAExact(o.limit_price)
                      : o.order_type === "MARKET"
                      ? "MKT"
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-500">
                    {o.validity}
                    {o.validity !== "GTC" && o.expires_at && (
                      <div className="text-[9px]">
                        {new Date(o.expires_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={o.status} />
                  </td>
                  {tab === "open" && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => cancel(o.id)}
                        disabled={isPending}
                        className="text-[11px] text-rose-700 hover:underline disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: OrderRow["status"] }) {
  const styles: Record<OrderRow["status"], string> = {
    open: "bg-blue-100 text-blue-800",
    partial: "bg-amber-100 text-amber-800",
    filled: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-slate-100 text-slate-600",
    expired: "bg-slate-100 text-slate-500",
    reserved: "bg-violet-100 text-violet-800",
  };
  const labels: Record<OrderRow["status"], string> = {
    open: "Ouvert",
    partial: "Partiel",
    filled: "Exécuté",
    cancelled: "Annulé",
    expired: "Expiré",
    reserved: "Réservé",
  };
  return (
    <span
      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
