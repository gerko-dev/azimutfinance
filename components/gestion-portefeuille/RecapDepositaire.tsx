"use client";

// === Rapprochement dépositaire : un bilan par date, pas par titre ===
//
// LE DÉPOSITAIRE ARRÊTE UN BILAN GLOBAL. Pour une date de dénouement donnée, il
// additionne tout ce que le fonds a acheté et vendu en bourse, et il vire le
// solde : UNE écriture au relevé, quel que soit le nombre de titres traités.
//
// L'écran suit cette logique plutôt que celle du carnet d'ordres. Chaque ligne
// est une date — un virement — avec le net qu'on doit retrouver au relevé ;
// le détail des titres est là si on veut le voir, mais il ne sert pas au
// pointage.
//
// MFR UNIQUEMENT. Le gré à gré se règle avec sa contrepartie, opération par
// opération, et une souscription au primaire se règle avant même d'être
// servie : ni l'un ni l'autre ne passe par ce virement.

import { Fragment, useMemo, useState } from "react";

import {
  regrouperDenouements,
  type DenouementDepositaire,
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

type Filtre = "attente" | "rapproches" | "tous";

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "attente", libelle: "À rapprocher" },
  { cle: "rapproches", libelle: "Rapprochés" },
  { cle: "tous", libelle: "Tous" },
];

/** Où en est le pointage d'une date. */
function etat(d: DenouementDepositaire): { libelle: string; ton: string } {
  if (d.rapprochees === 0)
    return { libelle: "À rapprocher", ton: "bg-amber-100 text-amber-800" };
  if (d.rapprochees < d.total)
    return {
      libelle: `Partiel ${d.rapprochees}/${d.total}`,
      ton: "bg-orange-100 text-orange-800",
    };
  return { libelle: "Rapproché", ton: "bg-emerald-100 text-emerald-800" };
}

export default function RecapDepositaire({
  operations,
  onRapprocher,
}: {
  operations: OperationAvecFonds[];
  /** Lettre — ou délettre — TOUTES les exécutions de la date. */
  onRapprocher: (d: DenouementDepositaire, dateRapprochement: string | null) => void;
}) {
  const [filtre, setFiltre] = useState<Filtre>("attente");
  const [ouvert, setOuvert] = useState<string | null>(null);
  /** Date de lettrage saisie à la main, par bilan. À défaut, c'est la date de
   *  dénouement qui fait foi : c'est elle qui porte le virement. */
  const [dates, setDates] = useState<Record<string, string>>({});

  const tous = useMemo(() => regrouperDenouements(operations), [operations]);

  const affiches = useMemo(
    () =>
      tous.filter((d) =>
        filtre === "tous"
          ? true
          : filtre === "attente"
            ? d.rapprochees < d.total
            : d.rapprochees > 0,
      ),
    [tous, filtre],
  );

  const enAttente = tous.filter((d) => d.rapprochees < d.total);
  const aRecevoir = enAttente.filter((d) => d.net > 0).reduce((t, d) => t + d.net, 0);
  const aPayer = enAttente.filter((d) => d.net < 0).reduce((t, d) => t - d.net, 0);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Le dépositaire ne règle pas titre par titre : il arrête un{" "}
        <strong>bilan global par date de dénouement</strong>{" "}
        et vire le solde. Chaque
        ligne ci-dessous est donc un virement, et le net est le montant à retrouver au
        relevé. Pointer la date lettre d&apos;un coup toutes ses exécutions, qui sortent
        alors du point de trésorerie — le solde bancaire les contient déjà.
      </p>

      {enAttente.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="px-3 py-2 border border-slate-200 rounded-lg bg-white">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Dates en attente
            </div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">
              {fmt0.format(enAttente.length)}
            </div>
          </div>
          <div className="px-3 py-2 border border-slate-200 rounded-lg bg-white">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              À recevoir du dépositaire
            </div>
            <div className="text-sm font-semibold text-emerald-700 tabular-nums">
              {montantFr(aRecevoir)} F
            </div>
          </div>
          <div className="px-3 py-2 border border-slate-200 rounded-lg bg-white">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              À payer au dépositaire
            </div>
            <div className="text-sm font-semibold text-rose-700 tabular-nums">
              {montantFr(aPayer)} F
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTRES.map((f) => (
          <button
            key={f.cle}
            type="button"
            onClick={() => setFiltre(f.cle)}
            className={`px-2.5 py-1 text-[11px] rounded border transition ${
              filtre === f.cle
                ? "bg-blue-700 border-blue-700 text-white font-medium"
                : "bg-white border-slate-300 text-slate-500 hover:border-slate-400"
            }`}
          >
            {f.libelle}
            <span className="ml-1.5 text-[10px] opacity-70">
              {f.cle === "tous"
                ? tous.length
                : f.cle === "attente"
                  ? enAttente.length
                  : tous.filter((d) => d.rapprochees > 0).length}
            </span>
          </button>
        ))}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={th}>Dénouement</th>
                <th className={th}>Fonds</th>
                <th className={thNum}>Exéc.</th>
                <th className={thNum}>Achats</th>
                <th className={thNum}>Ventes</th>
                <th className={thNum}>Net viré</th>
                <th className={th}>État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {affiches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    {tous.length === 0
                      ? "Aucune exécution de bourse. Le gré à gré et le marché primaire se rapprochent sur leur propre ligne."
                      : "Rien à afficher avec ce filtre."}
                  </td>
                </tr>
              ) : (
                affiches.map((d) => {
                  const e = etat(d);
                  const deplie = ouvert === d.cle;
                  const saisie = dates[d.cle] ?? d.dateRapprochement ?? d.date;
                  return (
                    <Fragment key={d.cle}>
                      <tr className="hover:bg-slate-50">
                        <td className={`${td} font-medium text-slate-800`}>
                          {dateFr(d.date)}
                        </td>
                        <td className={td}>{d.fondsNom}</td>
                        <td className={tdNum}>
                          {fmt0.format(d.total)}
                          <div className="text-[10px] text-slate-400">
                            {fmt0.format(d.lignes.filter((l) => l.sens === "achat").length)} A /{" "}
                            {fmt0.format(d.lignes.filter((l) => l.sens === "vente").length)} V
                          </div>
                        </td>
                        <td className={tdNum}>
                          {d.montantAchats > 0 ? montantFr(d.montantAchats) : "—"}
                        </td>
                        <td className={tdNum}>
                          {d.montantVentes > 0 ? montantFr(d.montantVentes) : "—"}
                        </td>
                        <td
                          className={`${tdNum} font-semibold ${
                            d.net >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                          title={
                            d.net >= 0
                              ? "Le dépositaire crédite le compte du fonds."
                              : "Le dépositaire débite le compte du fonds."
                          }
                        >
                          {d.net >= 0 ? "+" : "−"}
                          {montantFr(Math.abs(d.net))}
                        </td>
                        <td className={td}>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${e.ton}`}
                          >
                            {e.libelle}
                          </span>
                          {d.rapprochees === d.total && d.dateRapprochement && (
                            <div className="text-[10px] text-slate-400">
                              le {dateFr(d.dateRapprochement)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {d.rapprochees < d.total ? (
                            <>
                              {/* LA DATE PAR DÉFAUT EST CELLE DU DÉNOUEMENT, et
                                  non celle du jour : c'est ce jour-là que le
                                  dépositaire vire, et c'est à cette date que
                                  l'écriture figure au relevé. */}
                              <input
                                type="date"
                                value={saisie}
                                onChange={(ev) =>
                                  setDates({ ...dates, [d.cle]: ev.target.value })
                                }
                                className="text-[11px] border border-slate-300 rounded px-1.5 py-1 text-slate-700 mr-2"
                              />
                              <button
                                type="button"
                                onClick={() => onRapprocher(d, saisie)}
                                className="text-[11px] font-medium text-blue-700 hover:underline mr-3"
                              >
                                Rapprocher
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRapprocher(d, null)}
                              className="text-[11px] text-emerald-700 hover:underline mr-3"
                              title="Défaire le rapprochement de toute la date"
                            >
                              ✓ rapproché
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setOuvert(deplie ? null : d.cle)}
                            className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
                          >
                            {deplie ? "Masquer" : "Détail"}
                          </button>
                        </td>
                      </tr>
                      {deplie && (
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="px-3 py-2">
                            <table className="w-full text-[11px] border-collapse">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="text-left py-1 font-medium">Sens</th>
                                  <th className="text-left py-1 font-medium">Titre</th>
                                  <th className="text-right py-1 font-medium">Quantité</th>
                                  <th className="text-right py-1 font-medium">Prix</th>
                                  <th className="text-right py-1 font-medium">Montant</th>
                                  <th className="text-left py-1 font-medium pl-3">
                                    Lettrage
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.lignes.map((l) => (
                                  <tr key={l.executionId} className="border-t border-slate-200">
                                    <td className="py-1">
                                      <span
                                        className={
                                          l.sens === "achat"
                                            ? "text-rose-700"
                                            : "text-emerald-700"
                                        }
                                      >
                                        {l.sens === "achat" ? "Achat" : "Vente"}
                                      </span>
                                    </td>
                                    <td className="py-1">
                                      <span className="text-slate-800">{l.libelle}</span>
                                      {l.code && (
                                        <span className="text-slate-400 ml-1.5">{l.code}</span>
                                      )}
                                    </td>
                                    <td className="py-1 text-right tabular-nums">
                                      {fmt0.format(l.quantite)}
                                    </td>
                                    <td className="py-1 text-right tabular-nums">
                                      {montantFr(l.prix)}
                                    </td>
                                    <td className="py-1 text-right tabular-nums">
                                      {montantFr(l.montant)}
                                    </td>
                                    <td className="py-1 pl-3 text-slate-500">
                                      {l.rapprocheLe ? dateFr(l.rapprocheLe) : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                                  <td className="py-1" colSpan={4}>
                                    Net viré par le dépositaire
                                  </td>
                                  <td
                                    className={`py-1 text-right tabular-nums ${
                                      d.net >= 0 ? "text-emerald-700" : "text-rose-700"
                                    }`}
                                  >
                                    {d.net >= 0 ? "+" : "−"}
                                    {montantFr(Math.abs(d.net))}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-400">
        Montants frais compris — courtage, TPS sur courtage, commissions BRVM et DC/BR —
        et intérêts courus au prorata de la part servie. Un net positif est un
        encaissement, un net négatif un décaissement.
      </p>
    </div>
  );
}
