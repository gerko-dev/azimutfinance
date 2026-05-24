"use client";

import { useEffect, useRef, useState } from "react";

type Job = "pdf" | "xlsx" | "weekly" | "mtp" | null;

function filenameFromDisposition(h: string | null, fallback: string): string {
  if (!h) return fallback;
  const m = /filename="?([^"]+)"?/.exec(h);
  return m ? m[1] : fallback;
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Message d'étape calé sur le déroulé réel du pipeline (estimation par temps). */
function stageMessage(job: Job, elapsed: number): string {
  if (job === "weekly") {
    if (elapsed < 6) return "Chargement des cours des matières premières…";
    if (elapsed < 70)
      return "🔍 Recherche web en cours — Claude analyse l'actualité des 7 matières premières…";
    return "Mise en page et rendu du PDF (Chromium)…";
  }
  if (job === "mtp") {
    if (elapsed < 6) return "Chargement des adjudications UMOA-Titres…";
    if (elapsed < 70)
      return "🔍 Recherche web en cours — Claude analyse le marché des titres publics des 8 États…";
    return "Mise en page et rendu du PDF (Chromium)…";
  }
  if (job === "pdf") return "Rendu du PDF en cours (Chromium)…";
  if (job === "xlsx") return "Génération du classeur Excel…";
  return "Génération en cours…";
}

export default function RapportsPanel() {
  const [busy, setBusy] = useState<Job>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  // Chronomètre : un tick par seconde tant qu'une génération est en cours.
  // L'init (startRef + remise à zéro) se fait dans le handler download.
  useEffect(() => {
    if (busy === null) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function download(
    job: Job,
    endpoint: string,
    fallbackName: string,
  ) {
    if (!job) return;
    startRef.current = Date.now();
    setElapsed(0);
    setBusy(job);
    setError(null);
    try {
      const res = await fetch(endpoint, {
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

      {busy !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <svg
            className="animate-spin h-5 w-5 text-blue-600 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-blue-900">
              {stageMessage(busy, elapsed)}
            </div>
            <div className="text-xs text-blue-600/80 mt-0.5 tabular-nums">
              Temps écoulé&nbsp;: {mmss(elapsed)}
              {(busy === "weekly" || busy === "mtp") &&
                " · cette opération prend généralement 1 à 2 minutes"}
            </div>
          </div>
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
            onClick={() =>
              download(
                "pdf",
                "/admin/rapports/cotation/pdf",
                "Daily_Market_Report.pdf",
              )
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "pdf" ? "Génération du PDF…" : "Générer le PDF"}
          </button>
          <button
            onClick={() =>
              download(
                "xlsx",
                "/admin/rapports/cotation/xlsx",
                "cotation-brvm.xlsx",
              )
            }
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

      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl">
                🛢️
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Hebdo matières premières
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                Weekly · A4 portrait
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1.5">
              Cacao, or, Brent, café, huile de palme, caoutchouc et sucre : page
              de garde, récap, une page par matière première et synthèse. Les
              commentaires de la semaine sont générés par Claude à partir de
              recherches web.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mt-4">
          <button
            onClick={() =>
              download(
                "weekly",
                "/admin/rapports/commodities/pdf",
                "Hebdo_Matieres_Premieres.pdf",
              )
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "weekly" ? "Génération du PDF…" : "Générer le PDF"}
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          La génération peut prendre 1 à 2 minutes (recherches web Claude + rendu
          Chromium). Nécessite la clé <code>ANTHROPIC_API_KEY</code> ; sans elle,
          le rapport est produit sans commentaires.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl">
                🏛️
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Hebdo marché des titres publics
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                Weekly · A4 portrait
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1.5">
              Adjudications UMOA-Titres (BAT &amp; OAT) des 8 États de l&apos;UEMOA :
              page de garde, synthèse régionale, une page par pays (taux, couverture,
              maturités, calendrier) et dernière page. Les commentaires de la semaine
              sont générés par Claude à partir de recherches web.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mt-4">
          <button
            onClick={() =>
              download(
                "mtp",
                "/admin/rapports/mtp/pdf",
                "Hebdo_Marche_Titres_Publics.pdf",
              )
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "mtp" ? "Génération du PDF…" : "Générer le PDF"}
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          La génération peut prendre 1 à 2 minutes (recherches web Claude + rendu
          Chromium). Nécessite la clé <code>ANTHROPIC_API_KEY</code> ; sans elle,
          le rapport est produit sans commentaires.
        </p>
      </div>
    </div>
  );
}
