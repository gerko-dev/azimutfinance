"use client";

// === Nivellements entre comptes ===
//
// UN NIVELLEMENT N'EST PAS UN FLUX, C'EST UN DÉPLACEMENT. L'argent ne quitte
// pas le fonds : il change de compte. Le solde consolidé ne doit donc pas
// bouger d'un franc — et c'est ce que le bandeau du bas vérifie à l'écran.
//
// Il produit pourtant DEUX écritures : le compte qui envoie est grevé dans
// « Autres décaissements », celui qui reçoit est crédité dans « Autres
// encaissements ». L'un est retranché du solde réel, l'autre y est ajouté :
// ils se compensent exactement, tout en montrant où l'argent se trouve.
//
// DEUX RAPPROCHEMENTS, ET NON UN SEUL, parce que le débit et le crédit ne
// tombent pas le même jour. Chaque jambe sort du point dès que le relevé de SA
// banque la contient ; entre les deux, le point affiche l'argent en transit,
// ce qui est la situation réelle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  enregistrerNivellementAction,
  rapprocherNivellementAction,
  supprimerNivellementAction,
} from "@/app/gestion-portefeuille/tresorerie-flux-actions";
import {
  etatNivellement,
  LIBELLES_ETAT_NIVELLEMENT,
  type JambeNivellement,
  type Nivellement,
} from "@/app/gestion-portefeuille/tresorerie-flux-types";
import ChampMontant, { valeurMontant } from "./ChampMontant";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

type Compte = { cle: string; nom: string; pays: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

const VIDE = {
  compteSource: "",
  compteDestination: "",
  montant: "",
  dateNivellement: aujourdhui(),
  libelle: "",
};

export default function NivellementsDialog({
  fondsId,
  fondsNom,
  comptes,
  nivellements,
  onFermer,
}: {
  fondsId: string;
  fondsNom: string;
  comptes: Compte[];
  nivellements: Nivellement[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [editionId, setEditionId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState({
    ...VIDE,
    compteSource: comptes[0]?.cle ?? "",
    compteDestination: comptes[1]?.cle ?? "",
  });
  const [cleMontant, setCleMontant] = useState(0);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const reinitialiser = () => {
    setEditionId(null);
    setSaisie({
      ...VIDE,
      compteSource: comptes[0]?.cle ?? "",
      compteDestination: comptes[1]?.cle ?? "",
    });
    setCleMontant((k) => k + 1);
  };

  const modifier = (n: Nivellement) => {
    setEditionId(n.id);
    setSaisie({
      compteSource: n.compteSource,
      compteDestination: n.compteDestination,
      montant: String(n.montant),
      dateNivellement: n.dateNivellement,
      libelle: n.libelle,
    });
    setCleMontant((k) => k + 1);
    setErreur(null);
  };

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      const res = await enregistrerNivellementAction(fondsId, editionId, {
        ...saisie,
        montant: valeurMontant(saisie.montant),
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      reinitialiser();
      router.refresh();
    });
  };

  const rapprocher = (n: Nivellement, jambe: JambeNivellement) => {
    setErreur(null);
    const deja = jambe === "debit" ? n.rapprocheDebit : n.rapprocheCredit;
    demarrer(async () => {
      const res = await rapprocherNivellementAction(
        fondsId,
        n.id,
        jambe,
        deja ? null : aujourdhui(),
      );
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const supprimer = (id: string) => {
    setErreur(null);
    demarrer(async () => {
      const res = await supprimerNivellementAction(fondsId, id);
      if (!res.ok) setErreur(res.error);
      else {
        setASupprimer(null);
        if (editionId === id) reinitialiser();
        router.refresh();
      }
    });
  };

  const nomCompte = (cle: string) =>
    comptes.find((c) => c.cle === cle)?.nom ?? `${cle} (hors inventaire)`;

  // CE QUE LE POINT PORTE ENCORE, par jambe. Un nivellement entièrement
  // rapproché n'y figure plus : le solde bancaire saisi le contient déjà.
  const enAttente = nivellements.filter((n) => !n.rapprocheDebit || !n.rapprocheCredit);
  const sorti = enAttente.reduce((s, n) => s + (n.rapprocheDebit ? 0 : n.montant), 0);
  const attendu = enAttente.reduce((s, n) => s + (n.rapprocheCredit ? 0 : n.montant), 0);
  const enTransit = attendu - sorti;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-8">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Nivellements — {fondsNom}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Déplacements entre comptes du fonds. L&apos;argent ne sort pas :
              l&apos;émetteur est grevé dans <strong>Autres décaissements</strong>, le
              destinataire crédité dans <strong>Autres encaissements</strong>, et les
              deux se compensent au total.
            </p>
          </div>
          <button
            type="button"
            onClick={onFermer}
            className="text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <label className="flex flex-col gap-1">
              <span className={etiquette}>Compte qui envoie</span>
              <select
                className={champ}
                value={saisie.compteSource}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, compteSource: e.target.value }))
                }
              >
                <option value="">— choisir —</option>
                {comptes.map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom} · {c.pays}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-rose-700">Autres décaissements</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Compte qui reçoit</span>
              <select
                className={champ}
                value={saisie.compteDestination}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, compteDestination: e.target.value }))
                }
              >
                <option value="">— choisir —</option>
                {comptes.map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom} · {c.pays}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-emerald-700">Autres encaissements</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Montant</span>
              <ChampMontant
                key={`m-${cleMontant}`}
                valeur={saisie.montant}
                onChange={(v) => setSaisie((s) => ({ ...s, montant: v }))}
                className={champ}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Date d&apos;ordre</span>
              <input
                type="date"
                className={champ}
                value={saisie.dateNivellement}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, dateNivellement: e.target.value }))
                }
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={enregistrer}
                disabled={enCours}
                className="text-xs font-medium px-3 py-1.5 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {enCours ? "…" : editionId ? "Corriger" : "Ajouter"}
              </button>
              {editionId && (
                <button
                  type="button"
                  onClick={reinitialiser}
                  disabled={enCours}
                  className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Annuler
                </button>
              )}
            </div>

            <label className="flex flex-col gap-1 sm:col-span-5">
              <span className={etiquette}>Libellé</span>
              <input
                className={champ}
                value={saisie.libelle}
                onChange={(e) => setSaisie((s) => ({ ...s, libelle: e.target.value }))}
                placeholder="Alimentation du compte de règlement, remontée de trésorerie…"
              />
            </label>
          </div>

          {erreur && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {erreur}
            </p>
          )}

          <div className="border border-slate-200 rounded overflow-hidden overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Date</th>
                  <th className="text-left px-2 py-1.5 font-medium">Envoie</th>
                  <th className="text-left px-2 py-1.5 font-medium">Reçoit</th>
                  <th className="text-right px-2 py-1.5 font-medium">Montant</th>
                  <th className="text-left px-2 py-1.5 font-medium">Libellé</th>
                  <th className="text-left px-2 py-1.5 font-medium">État</th>
                  <th className="text-left px-2 py-1.5 font-medium">Débit</th>
                  <th className="text-left px-2 py-1.5 font-medium">Crédit</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nivellements.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-slate-400">
                      Aucun nivellement pour ce fonds.
                    </td>
                  </tr>
                )}
                {nivellements.map((n) => {
                  const etat = etatNivellement(n);
                  return (
                    <tr
                      key={n.id}
                      className={
                        editionId === n.id
                          ? "bg-blue-50"
                          : etat === "boucle"
                            ? "text-slate-400"
                            : "hover:bg-slate-50"
                      }
                    >
                      <td className="px-2 py-1.5 tabular-nums">{n.dateNivellement}</td>
                      <td className="px-2 py-1.5">{nomCompte(n.compteSource)}</td>
                      <td className="px-2 py-1.5">{nomCompte(n.compteDestination)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                        {montantFr(n.montant)}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{n.libelle || "—"}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={
                            etat === "transit"
                              ? "text-amber-700"
                              : etat === "boucle"
                                ? ""
                                : "text-slate-700"
                          }
                        >
                          {LIBELLES_ETAT_NIVELLEMENT[etat]}
                        </span>
                      </td>
                      {/* DEUX BOUTONS, UN PAR RELEVÉ. Chacun fait sortir SA jambe
                          du point : le lettrage suit la banque, pas l'ordre. */}
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => rapprocher(n, "debit")}
                          disabled={enCours}
                          className={`text-[10px] disabled:opacity-50 ${
                            n.rapprocheDebit
                              ? "text-emerald-700 hover:text-emerald-900"
                              : "text-blue-700 hover:text-blue-900"
                          }`}
                          title={
                            n.rapprocheDebit
                              ? `Débité le ${n.rapprocheDebit} — défaire`
                              : "Constaté sur le relevé de la banque émettrice"
                          }
                        >
                          {n.rapprocheDebit ? `✓ ${n.rapprocheDebit}` : "Débité"}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => rapprocher(n, "credit")}
                          disabled={enCours}
                          className={`text-[10px] disabled:opacity-50 ${
                            n.rapprocheCredit
                              ? "text-emerald-700 hover:text-emerald-900"
                              : "text-blue-700 hover:text-blue-900"
                          }`}
                          title={
                            n.rapprocheCredit
                              ? `Crédité le ${n.rapprocheCredit} — défaire`
                              : "Constaté sur le relevé de la banque destinataire"
                          }
                        >
                          {n.rapprocheCredit ? `✓ ${n.rapprocheCredit}` : "Crédité"}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => modifier(n)}
                          disabled={enCours}
                          className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-2"
                        >
                          Modifier
                        </button>
                        {aSupprimer === n.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => supprimer(n.id)}
                              disabled={enCours}
                              className="text-[10px] text-rose-700 font-medium hover:text-rose-900 disabled:opacity-50 mr-1"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setASupprimer(null)}
                              className="text-[10px] text-slate-500 hover:text-slate-800"
                            >
                              Non
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setASupprimer(n.id)}
                            disabled={enCours}
                            className="text-[10px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* LA NEUTRALITÉ, VÉRIFIÉE À L'ÉCRAN. Tant que les deux jambes sont
              là, elles se compensent et le total ne bouge pas. Quand une seule
              reste, l'écart est exactement l'argent en transit — sorti d'un
              compte sans être arrivé dans l'autre — et c'est une information,
              pas une anomalie. */}
          {enAttente.length > 0 && (
            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 tabular-nums">
              {enAttente.length} nivellement{enAttente.length > 1 ? "s" : ""} encore au
              point · {montantFr(sorti)} F à débiter · {montantFr(attendu)} F à créditer ·{" "}
              {enTransit === 0 ? (
                <strong>effet nul sur le solde</strong>
              ) : (
                <span className="text-amber-800">
                  <strong>{montantFr(enTransit)} F</strong> en transit — partis d&apos;un
                  compte, pas encore arrivés dans l&apos;autre
                </span>
              )}
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onFermer}
            className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
