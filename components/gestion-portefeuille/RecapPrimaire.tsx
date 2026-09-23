"use client";

// === Récapitulatif des souscriptions au marché primaire ===
//
// UNE VUE, PAS UNE SAISIE. Une souscription est une opération comme les
// autres — elle se saisit dans « Saisir un ordre » et s'exécute sur sa ligne
// de l'onglet Opérations. Cet onglet ne fait que les rassembler, parce qu'on
// veut voir d'un coup ce qui est engagé au guichet.
//
// Deux colonnes n'existent que pour lui, et elles disent le cycle propre au
// primaire : la MODALITÉ, qui dit comment le titre a été désigné, et le
// RÈGLEMENT, qui arrive AVANT l'attribution — on verse sa soumission, puis
// l'adjudication dit ce qu'on obtient.

import {
  LIBELLES_MODALITE,
  quantiteExecutee,
  type OperationMarche,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

const th = "text-left px-3 py-2 font-medium";
const thNum = "text-right px-3 py-2 font-medium";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-right tabular-nums";

/**
 * Où en est la souscription, dans l'ordre où les choses arrivent.
 *
 * Le règlement précède l'attribution : « Réglé » n'est donc pas un état final
 * mais une étape, et il peut coexister avec une attribution encore attendue.
 */
function etape(o: OperationMarche): { libelle: string; ton: string } {
  const servie = quantiteExecutee(o);
  if (o.clotureLe) return { libelle: "Clôturée", ton: "bg-slate-100 text-slate-500" };
  if (servie >= o.quantite) return { libelle: "Attribuée", ton: "bg-emerald-100 text-emerald-800" };
  if (servie > 0) return { libelle: "Servie en partie", ton: "bg-emerald-50 text-emerald-700" };
  if (o.rapprocheLe) return { libelle: "Réglée, en attente", ton: "bg-blue-100 text-blue-800" };
  return { libelle: "Engagée", ton: "bg-amber-100 text-amber-800" };
}

export default function RecapPrimaire({
  operations,
  onModifier,
  onRapprocher,
}: {
  operations: OperationAvecFonds[];
  onModifier: (o: OperationAvecFonds) => void;
  /** Le règlement de l'ORDRE, celui qui précède l'attribution. */
  onRapprocher: (o: OperationAvecFonds, date: string | null) => void;
}) {
  const lignes = operations.filter((o) => o.description === "SOUSCRIPTION_MP");

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Souscrire, c&apos;est acheter à l&apos;émission. Tant qu&apos;elle n&apos;est ni
        réglée ni clôturée, la souscription pèse dans{" "}
        <strong>Opérations marché primaire</strong> au point de trésorerie. Elle en sort
        dès que la soumission est constatée sur le relevé — le solde bancaire la contient
        alors déjà.
      </p>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Fonds</th>
                <th className={th}>Modalité</th>
                <th className={th}>Émission</th>
                <th className={th}>Intermédiaire</th>
                <th className={thNum}>Souscrite</th>
                <th className={thNum}>Attribuée</th>
                <th className={thNum}>Montant</th>
                <th className={th}>Règlement</th>
                <th className={th}>État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
                    Aucune souscription au primaire. Choisis «&nbsp;Souscription marché
                    primaire&nbsp;» dans l&apos;onglet «&nbsp;Saisir un ordre&nbsp;».
                  </td>
                </tr>
              ) : (
                lignes.map((o) => {
                  const servie = quantiteExecutee(o);
                  const e = etape(o);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className={td}>{dateFr(o.dateOperation)}</td>
                      <td className={td}>{o.fondsNom}</td>
                      <td className={td}>
                        {o.modalite ? LIBELLES_MODALITE[o.modalite].split(" — ")[0] : "—"}
                      </td>
                      <td className={td}>
                        <div className="font-medium text-slate-800">{o.libelle}</div>
                        {o.code && (
                          <div className="text-[10px] text-slate-400">{o.code}</div>
                        )}
                      </td>
                      <td className={td}>{o.sgi || "—"}</td>
                      <td className={tdNum}>{fmt0.format(o.quantite)}</td>
                      <td className={tdNum}>
                        {servie > 0 ? fmt0.format(servie) : "—"}
                      </td>
                      <td className={`${tdNum} font-medium`}>{montantFr(o.montant)}</td>
                      <td className={td}>{o.compteReglement || "—"}</td>
                      <td className={td}>
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${e.ton}`}
                        >
                          {e.libelle}
                        </span>
                        {o.rapprocheLe && (
                          <div className="text-[10px] text-slate-400">
                            réglée le {dateFr(o.rapprocheLe)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {/* LE RÈGLEMENT PRÉCÈDE L'ATTRIBUTION : le bouton est
                            donc disponible dès la saisie, sans attendre la
                            moindre exécution. */}
                        {o.rapprocheLe ? (
                          <button
                            type="button"
                            onClick={() => onRapprocher(o, null)}
                            className="text-[11px] text-emerald-700 hover:underline mr-3"
                            title={`Réglée le ${o.rapprocheLe} — défaire`}
                          >
                            ✓ réglée
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onRapprocher(o, new Date().toISOString().slice(0, 10))
                            }
                            className="text-[11px] font-medium text-blue-700 hover:underline mr-3"
                          >
                            Rapprocher
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onModifier(o)}
                          className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
