"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteNewsletterSubscriber,
  setNewsletterStatus,
} from "@/lib/magazine/actions";
import { fmtDateTime } from "@/components/admin/format";
import type {
  NewsletterStatus,
  NewsletterSubscriberRow,
} from "@/lib/magazine/types";

export default function NewsletterTable({
  subscribers,
}: {
  subscribers: NewsletterSubscriberRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(id: string, status: NewsletterStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setNewsletterStatus(id, status);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function onDelete(id: string, email: string) {
    if (!confirm(`Supprimer l'abonné ${email} ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      const res = await deleteNewsletterSubscriber(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function exportCsv() {
    const lines = ["email,nom,pays,statut,source,date_inscription"];
    for (const s of subscribers) {
      const row = [
        s.email,
        (s.full_name ?? "").replaceAll(",", " "),
        s.country ?? "",
        s.status,
        s.source,
        s.created_at,
      ].join(",");
      lines.push(row);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `azimut-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {error && (
        <div className="m-3 text-xs px-3 py-2 rounded border bg-rose-50 border-rose-200 text-rose-800">
          {error}
        </div>
      )}
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">
          {subscribers.length} abonné{subscribers.length > 1 ? "s" : ""}
        </span>
        {subscribers.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="text-[11px] text-blue-700 hover:underline"
          >
            Exporter CSV
          </button>
        )}
      </div>
      {subscribers.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-8">
          Aucun abonné pour le moment.
        </div>
      ) : (
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Email</th>
              <th className="text-left font-medium py-2 px-2">Nom</th>
              <th className="text-left font-medium py-2 px-2">Pays</th>
              <th className="text-left font-medium py-2 px-2">Source</th>
              <th className="text-left font-medium py-2 px-2">Statut</th>
              <th className="text-left font-medium py-2 px-2">Inscrit le</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2 pl-4 pr-2 text-slate-900 font-mono text-[11px]">
                  {s.email}
                </td>
                <td className="py-2 px-2 text-slate-700">{s.full_name ?? "—"}</td>
                <td className="py-2 px-2 text-slate-700">{s.country ?? "—"}</td>
                <td className="py-2 px-2 text-slate-500">{s.source}</td>
                <td className="py-2 px-2">
                  {s.status === "active" ? (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Actif
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      Désabonné
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-slate-500 tabular-nums">
                  {fmtDateTime(s.created_at)}
                </td>
                <td className="py-2 pr-4 pl-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    {s.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => changeStatus(s.id, "unsubscribed")}
                        disabled={isPending}
                        className="text-[11px] text-amber-700 hover:underline"
                      >
                        Désabonner
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => changeStatus(s.id, "active")}
                        disabled={isPending}
                        className="text-[11px] text-emerald-700 hover:underline"
                      >
                        Réactiver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(s.id, s.email)}
                      disabled={isPending}
                      className="text-[11px] text-rose-700 hover:underline"
                    >
                      Suppr.
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
