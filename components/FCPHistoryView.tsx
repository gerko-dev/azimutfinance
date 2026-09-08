"use client";

import { useMemo, useState } from "react";

/** Origine du relevé : trimestre publié par l'ASGOP, VL lue dans un BOC
 *  archivé, ou VL du dernier bulletin scrapé. */
type ObsKind = "quarter" | "boc" | "latest";

type VLPoint = { date: string; vl: number; kind: ObsKind };

type Props = {
  /** Nom du fonds, pour le nom du fichier téléchargé. */
  nom: string;
  /** Identifiant du fonds, pour le nom du fichier téléchargé. */
  slug: string;
  /** Historique complet, trié par date croissante. */
  vlSeries: VLPoint[];
};

const ORIGINE: Record<ObsKind, string> = {
  quarter: "Trimestre publié",
  boc: "BOC",
  latest: "Dernier bulletin",
};

function fmtVL(v: number): string {
  return v
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/ | /g, " ");
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const signe = v >= 0 ? "+" : "";
  return (signe + (v * 100).toFixed(2)).replace(".", ",") + "%";
}

/** Recule d'un nombre de jours à partir d'une date ISO. */
function reculer(iso: string, jours: number): string {
  const t = new Date(iso + "T00:00:00Z").getTime() - jours * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export default function FCPHistoryView({ nom, slug, vlSeries }: Props) {
  const premiere = vlSeries[0]?.date ?? "";
  const derniere = vlSeries[vlSeries.length - 1]?.date ?? "";

  const [du, setDu] = useState(derniere ? reculer(derniere, 365) : "");
  const [au, setAu] = useState(derniere);

  /** Variation par rapport au relevé PRÉCÉDENT dans la série complète, et non
   *  dans la plage affichée : sinon la première ligne visible n'aurait jamais
   *  de variation, alors que le relevé d'avant existe bel et bien. */
  const avecVariation = useMemo(() => {
    return vlSeries.map((p, i) => {
      const prec = i > 0 ? vlSeries[i - 1] : null;
      return {
        ...p,
        variation: prec && prec.vl > 0 ? p.vl / prec.vl - 1 : null,
        joursDepuisPrec: prec
          ? Math.round(
              (new Date(p.date + "T00:00:00Z").getTime() -
                new Date(prec.date + "T00:00:00Z").getTime()) /
                86400000
            )
          : null,
      };
    });
  }, [vlSeries]);

  const lignes = useMemo(() => {
    if (!du || !au) return [];
    return avecVariation
      .filter((p) => p.date >= du && p.date <= au)
      .sort((a, b) => b.date.localeCompare(a.date)); // le plus récent en haut
  }, [avecVariation, du, au]);

  function telecharger() {
    if (lignes.length === 0) return;
    const entete = "Date;VL;Variation;Jours depuis la VL precedente;Origine";
    const corps = lignes
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)) // chronologique dans le fichier
      .map((p) =>
        [
          p.date,
          // Point décimal : le CSV est une donnée, pas un affichage. Les
          // tableurs francophones le convertissent à l'import ; l'inverse
          // n'est pas vrai pour un outil d'analyse.
          String(p.vl),
          p.variation !== null ? p.variation.toFixed(6) : "",
          p.joursDepuisPrec !== null ? String(p.joursDepuisPrec) : "",
          ORIGINE[p.kind],
        ].join(";")
      );
    // BOM UTF-8 : sans lui, Excel affiche « Trimestre publiÃ© ».
    const csv = "﻿" + entete + "\n" + corps.join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}_vl_${du}_${au}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Raccourcis de plage : la saisie de deux dates pour « un an » est une
   *  corvée que tout le monde refait à chaque visite. */
  const raccourcis: Array<{ label: string; jours: number | null }> = [
    { label: "3 mois", jours: 90 },
    { label: "1 an", jours: 365 },
    { label: "3 ans", jours: 1096 },
    { label: "Tout", jours: null },
  ];

  if (vlSeries.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-sm text-slate-600">Aucune VL relevée pour ce fonds.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Historique des valeurs liquidatives
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sélectionnez une plage de dates puis téléchargez le fichier CSV.
            </p>
          </div>
          <span className="text-[11px] text-slate-500">
            Disponible du {fmtDate(premiere)} au {fmtDate(derniere)} ·{" "}
            {vlSeries.length} relevés
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="vl-du"
              className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
            >
              Du
            </label>
            <input
              id="vl-du"
              type="date"
              value={du}
              min={premiere || undefined}
              max={au || derniere || undefined}
              onChange={(e) => setDu(e.target.value)}
              className="text-sm px-2.5 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="vl-au"
              className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1"
            >
              Au
            </label>
            <input
              id="vl-au"
              type="date"
              value={au}
              min={du || premiere || undefined}
              max={derniere || undefined}
              onChange={(e) => setAu(e.target.value)}
              className="text-sm px-2.5 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-1.5 text-xs">
            {raccourcis.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  setDu(r.jours === null ? premiere : reculer(derniere, r.jours));
                  setAu(derniere);
                }}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={telecharger}
            disabled={lignes.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            {/* En une seule expression : coupée sur deux lignes, JSX glisse une
                espace entre « relevé » et « s ». */}
            {`📥 Télécharger CSV (${lignes.length} relevé${lignes.length > 1 ? "s" : ""})`}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-3 py-2 font-medium">VL (FCFA)</th>
                <th className="text-right px-3 py-2 font-medium">Variation</th>
                <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">
                  Écart
                </th>
                <th className="text-right px-4 py-2 font-medium hidden md:table-cell">
                  Origine
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 text-xs py-6">
                    Aucun relevé dans la plage sélectionnée.
                  </td>
                </tr>
              ) : (
                lignes.map((p) => (
                  <tr key={p.date} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-1.5 font-mono text-xs">{fmtDate(p.date)}</td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {fmtVL(p.vl)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        p.variation === null
                          ? "text-slate-300"
                          : p.variation > 0
                            ? "text-green-700"
                            : p.variation < 0
                              ? "text-red-700"
                              : "text-slate-500"
                      }`}
                    >
                      {fmtPct(p.variation)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500 text-xs tabular-nums hidden sm:table-cell">
                      {p.joursDepuisPrec === null ? "—" : `${p.joursDepuisPrec} j`}
                    </td>
                    <td className="px-4 py-1.5 text-right text-xs text-slate-500 hidden md:table-cell">
                      {ORIGINE[p.kind]}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {lignes.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2">
            <span>
              {lignes.length} relevé{lignes.length > 1 ? "s" : ""} pour {nom}
            </span>
            <span>
              Sources : Bulletin Officiel de la Cote (BRVM) et publications
              trimestrielles ASGOP
            </span>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        La colonne « Écart » donne le nombre de jours écoulés depuis le relevé
        précédent : une variation de +1,2 % ne se lit pas de la même façon
        après un jour ou après un trimestre. La colonne « Origine » dit d&apos;où
        vient chaque VL, les trois sources n&apos;ayant ni la même fréquence ni la
        même fraîcheur.
      </p>
    </div>
  );
}
