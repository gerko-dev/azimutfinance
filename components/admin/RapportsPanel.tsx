"use client";

import { useState } from "react";

type Job = "pdf" | "xlsx" | null;

function filenameFromDisposition(h: string | null, fallback: string): string {
  if (!h) return fallback;
  const m = /filename="?([^"]+)"?/.exec(h);
  return m ? m[1] : fallback;
}

export default function RapportsPanel() {
  const [busy, setBusy] = useState<Job>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: "pdf" | "xlsx", fallbackName: string) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/admin/rapports/cotation/${kind}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const name = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la génération.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded p-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl">
                📈
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Récapitulatif de cotation
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                Daily Market Report
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1.5">
              Synthèse de la dernière séance BRVM : indices, volumes, top/flop du
              jour et top 15 par capitalisation. Les données sont rafraîchies au
              moment de la génération (cours live BRVM, repli dernière clôture).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mt-4">
          <button
            onClick={() => download("pdf", "Daily_Market_Report.pdf")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "pdf" ? "Génération du PDF…" : "Générer le PDF"}
          </button>
          <button
            onClick={() => download("xlsx", "cotation-brvm.xlsx")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "xlsx" ? "Génération de l'Excel…" : "Télécharger l'Excel"}
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          La génération du PDF peut prendre quelques secondes (rendu via Chromium).
        </p>
      </div>

      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-5 text-sm text-slate-400">
        D&apos;autres types de rapports seront ajoutés ici.
      </div>
    </div>
  );
}
