"use client";

import { useState } from "react";

type ReportDef = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  endpoint: string;
  status: "live" | "soon";
  pageCount: number;
  features: string[];
};

const REPORTS: ReportDef[] = [
  {
    id: "actions-market",
    title: "Marché des actions BRVM",
    description:
      "Synthèse complète de la séance : indices, top movers, capi totale, répartition sectorielle. PDF A4 portrait, 5 pages.",
    emoji: "📈",
    endpoint: "/api/admin/reports/actions-market",
    status: "live",
    pageCount: 5,
    features: [
      "Page de garde marine + logo blanc",
      "4 indices principaux (BRVMC, BRVM30, BRVMPA, BRVMPR)",
      "Top 8 hausses / Top 8 baisses du jour",
      "Top 10 capitalisations",
      "Heatmap sectorielle",
      "CTA + mentions légales",
    ],
  },
  {
    id: "bonds-market",
    title: "Marché obligataire UMOA",
    description:
      "À venir : adjudications UMOA-Titres récentes, courbe des taux souverains, encours par maturité.",
    emoji: "💵",
    endpoint: "",
    status: "soon",
    pageCount: 0,
    features: [],
  },
  {
    id: "dividends-calendar",
    title: "Calendrier des dividendes",
    description:
      "À venir : dividendes annoncés sur les 90 prochains jours, yields actuels, dates ex-coupon.",
    emoji: "💰",
    endpoint: "",
    status: "soon",
    pageCount: 0,
    features: [],
  },
  {
    id: "sector-performance",
    title: "Performance sectorielle",
    description:
      "À venir : performance YTD par secteur, leaders et laggards, contribution à l'indice composite.",
    emoji: "🏭",
    endpoint: "",
    status: "soon",
    pageCount: 0,
    features: [],
  },
];

export default function ReportingClient() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(report: ReportDef) {
    if (report.status !== "live") return;
    setGenerating(report.id);
    setError(null);
    try {
      const res = await fetch(report.endpoint, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} — ${text.slice(0, 200) || res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `azimutfinance-${report.id}-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md p-3">
          <strong>Erreur de génération :</strong> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <article
            key={r.id}
            className={`bg-white rounded-lg border p-5 ${
              r.status === "live"
                ? "border-slate-200"
                : "border-slate-200 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{r.emoji}</div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {r.title}
                  </h3>
                  {r.status === "live" ? (
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      Disponible · {r.pageCount} pages
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      Prochainement
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              {r.description}
            </p>

            {r.features.length > 0 && (
              <ul className="text-[11px] text-slate-500 space-y-0.5 mb-4 pl-4 list-disc">
                {r.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              {r.status === "live" ? (
                <button
                  type="button"
                  onClick={() => generate(r)}
                  disabled={generating !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating === r.id ? (
                    <>
                      <Spinner /> Génération…
                    </>
                  ) : (
                    <>📥 Télécharger PDF</>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                >
                  À venir
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
        <strong className="text-slate-900">Usage réseaux sociaux :</strong>{" "}
        Le PDF A4 portrait s&apos;upload tel quel sur LinkedIn (document
        carousel). Pour Instagram, capturer chaque page en image
        individuelle (1080×1350). Pour X / Facebook, joindre le PDF en
        pièce ou la couverture en image.
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden
    />
  );
}
