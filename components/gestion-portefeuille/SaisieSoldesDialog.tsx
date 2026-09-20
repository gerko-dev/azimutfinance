"use client";

// === Saisie des soldes bancaires : banques en colonnes, fonds en lignes ===
//
// C'est la forme du geste réel. Un relevé se lit PAR BANQUE : on ouvre celui
// de la BOA et on y trouve les comptes de tous les fonds. Saisir fonds par
// fonds obligeait à rouvrir le même relevé autant de fois qu'il y a de
// portefeuilles.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enregistrerSoldesMultiFondsAction } from "@/app/gestion-portefeuille/tresorerie-actions";
import type { GrilleSoldes } from "@/app/gestion-portefeuille/tresorerie-grille";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Les soldes se comptent en centaines de millions : sans séparateurs,
 *  « 220180967 » ne se relit pas et une erreur d'un facteur dix passe
 *  inaperçue. Même traitement que l'ancienne saisie en ligne. */
function formaterSaisie(brut: string): string {
  const negatif = brut.trimStart().startsWith("-");
  const chiffres = brut.split(/[.,]/)[0].replace(/\D/g, "");
  if (!chiffres) return negatif ? "-" : "";
  return (negatif ? "-" : "") + fmt0.format(Number(chiffres));
}

const lire = (v: string): number => {
  const n = Number((v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Clef d'une cellule. Le séparateur ne peut pas apparaître dans un UUID. */
const cellule = (fondsId: string, banque: string) => `${fondsId}|${banque}`;

export default function SaisieSoldesDialog({
  grille,
  onFermer,
}: {
  grille: GrilleSoldes;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [date, setDate] = useState(
    grille.derniereDate ?? new Date().toISOString().slice(0, 10),
  );

  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const l of grille.lignes) {
      for (const b of l.comptes) {
        v[cellule(l.fondsId, b)] = formaterSaisie(String(Math.round(l.soldes[b] ?? 0)));
      }
    }
    return v;
  });

  const total = (banque: string) =>
    grille.lignes.reduce(
      (s, l) => s + (l.comptes.includes(banque) ? lire(valeurs[cellule(l.fondsId, banque)] ?? "") : 0),
      0,
    );

  const totalFonds = (l: GrilleSoldes["lignes"][number]) =>
    l.comptes.reduce((s, b) => s + lire(valeurs[cellule(l.fondsId, b)] ?? ""), 0);

  const enregistrer = () => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      // On n'envoie que les comptes RÉELLEMENT détenus par chaque fonds :
      // envoyer les autres à zéro créerait des soldes nuls là où il n'y a pas
      // de compte, et le point afficherait des colonnes vides pour ce fonds.
      const parFonds: Record<string, Record<string, number>> = {};
      for (const l of grille.lignes) {
        const soldes: Record<string, number> = {};
        for (const b of l.comptes) soldes[b] = lire(valeurs[cellule(l.fondsId, b)] ?? "");
        parFonds[l.fondsId] = soldes;
      }

      const res = await enregistrerSoldesMultiFondsAction(date, parFonds);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      if (res.data.echecs.length > 0) {
        setErreur(
          `${res.data.enregistres} fonds enregistré(s), ${res.data.echecs.length} en échec : ` +
            res.data.echecs.join(" · "),
        );
        return;
      }
      setMessage(`Soldes enregistrés au ${res.data.as_of_date} pour ${res.data.enregistres} fonds.`);
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Saisir les soldes bancaires"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[min(1400px,95vw)] my-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Saisir les soldes</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Une colonne par banque, une ligne par fonds. Les cases barrées
              signalent qu&apos;un fonds n&apos;a pas de compte dans cette banque.
            </p>
          </div>
          <label className="text-[11px] text-slate-600">
            Date des soldes
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-1.5 px-2 py-1 rounded border border-slate-300 text-[11px]"
            />
          </label>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          <table className="text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 text-left px-3 py-2 font-medium border-r border-slate-200 min-w-[14rem]">
                  Fonds
                </th>
                {grille.banques.map((b) => (
                  <th
                    key={b.cle}
                    className="px-2 py-2 font-medium text-right align-bottom leading-tight break-words w-[7.5rem] min-w-[7.5rem]"
                    title={b.cle}
                  >
                    {b.nom}
                    <span className="block text-[9px] font-normal text-slate-400">
                      {b.pays || "—"}
                      {b.sens ? ` · ${b.sens}` : ""}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-right border-l border-slate-300 bg-slate-200/70 w-[8rem] min-w-[8rem]">
                  Total fonds
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grille.lignes.map((l) => (
                <tr key={l.fondsId}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-slate-200 font-medium text-slate-800">
                    {l.fondsNom}
                  </td>
                  {grille.banques.map((b) => {
                    const detenu = l.comptes.includes(b.cle);
                    if (!detenu) {
                      return (
                        <td
                          key={b.cle}
                          className="px-2 py-1.5 text-center text-slate-300 bg-slate-50"
                          title="Ce fonds n'a pas de compte dans cet établissement"
                        >
                          —
                        </td>
                      );
                    }
                    const k = cellule(l.fondsId, b.cle);
                    return (
                      <td key={b.cle} className="px-1 py-1">
                        <input
                          value={valeurs[k] ?? ""}
                          onChange={(e) =>
                            setValeurs((v) => ({ ...v, [k]: formaterSaisie(e.target.value) }))
                          }
                          inputMode="numeric"
                          className="w-full text-right px-1.5 py-1 rounded border border-slate-300 tabular-nums focus:border-blue-400 focus:outline-none"
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium border-l border-slate-300 bg-slate-50/80">
                    {fmt0.format(Math.round(totalFonds(l)))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-300">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold border-r border-slate-200">
                  Total banque
                </td>
                {grille.banques.map((b) => (
                  <td key={b.cle} className="px-2 py-2 text-right tabular-nums font-semibold">
                    {fmt0.format(Math.round(total(b.cle)))}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums font-bold border-l border-slate-300 bg-slate-200/70">
                  {fmt0.format(
                    Math.round(grille.lignes.reduce((s, l) => s + totalFonds(l), 0)),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 space-y-2">
          {erreur && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {erreur}
            </p>
          )}
          {message && !erreur && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              {message}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={enregistrer}
              disabled={enCours}
              className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer les soldes"}
            </button>
            <button
              type="button"
              onClick={onFermer}
              className="px-4 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
