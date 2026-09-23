"use client";

// === Opérations spot ===
//
// UN SPOT N'EST PAS UN FLUX, C'EST UNE OPÉRATION QUI EN PRODUIT DEUX : la mise
// en place aujourd'hui, le dénouement à l'échéance, intérêts compris. Le
// saisir comme deux flux isolés aurait obligé à ne jamais se tromper sur leur
// cohérence, et à les corriger tous les deux quand l'échéance bouge.
//
// LE SENS EST CELUI DU FONDS, et c'est lui qui décide du poste — on ne le
// choisit donc pas deux fois :
//
//   PLACEMENT : le fonds sort du cash et le récupérera majoré → « SPOT »,
//               parmi le cash à recevoir.
//   EMPRUNT   : le fonds encaisse et devra rembourser → « REMBOURSEMENT
//               SPOT », parmi les engagements.
//
// LA DATE DE DÉNOUEMENT NE SE SAISIT PAS au formulaire : elle n'y serait
// qu'une promesse. Elle se pose d'un bouton sur la ligne, le jour où le
// dénouement a lieu — même règle que la reprise d'un prêt de titres.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  denouerSpotAction,
  enregistrerSpotAction,
  supprimerSpotAction,
} from "@/app/gestion-portefeuille/tresorerie-flux-actions";
import {
  interetSpot,
  LIBELLES_SENS_SPOT,
  montantDenouementSpot,
  type SensSpot,
  type Spot,
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
  sens: "placement" as SensSpot,
  contrepartie: "",
  compte: "",
  montant: "",
  taux: "",
  dateValeur: aujourdhui(),
  dateEcheance: aujourdhui(),
  note: "",
};

export default function SpotsDialog({
  fondsId,
  fondsNom,
  comptes,
  spots,
  contreparties,
  onFermer,
}: {
  fondsId: string;
  fondsNom: string;
  comptes: Compte[];
  spots: Spot[];
  /** Banques du fonds, prises dans ses comptes : un spot se traite avec un
   *  établissement, et le retaper à la main aurait fait diverger les
   *  orthographes d'une ligne à l'autre. */
  contreparties: string[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [editionId, setEditionId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState({ ...VIDE, compte: comptes[0]?.cle ?? "" });
  const [cleChamps, setCleChamps] = useState(0);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const nombre = (v: string) => Number(v.replace(",", ".")) || 0;

  const reinitialiser = () => {
    setEditionId(null);
    setSaisie({ ...VIDE, compte: comptes[0]?.cle ?? "" });
    setCleChamps((k) => k + 1);
  };

  const modifier = (s: Spot) => {
    setEditionId(s.id);
    setSaisie({
      sens: s.sens,
      contrepartie: s.contrepartie,
      compte: s.compte,
      montant: String(s.montant),
      taux: String(s.taux),
      dateValeur: s.dateValeur,
      dateEcheance: s.dateEcheance,
      note: s.note,
    });
    setCleChamps((k) => k + 1);
    setErreur(null);
  };

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      const res = await enregistrerSpotAction(fondsId, editionId, {
        ...saisie,
        montant: valeurMontant(saisie.montant),
        taux: nombre(saisie.taux),
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      reinitialiser();
      router.refresh();
    });
  };

  const denouer = (s: Spot) => {
    setErreur(null);
    demarrer(async () => {
      const res = await denouerSpotAction(
        fondsId,
        s.id,
        s.dateDenouement ? null : aujourdhui(),
      );
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const supprimer = (id: string) => {
    setErreur(null);
    demarrer(async () => {
      const res = await supprimerSpotAction(fondsId, id);
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

  // L'APERÇU DU CALCUL, sous le formulaire. Un intérêt base 360 ne se vérifie
  // pas de tête sur un montant à neuf chiffres : on montre les jours et le
  // résultat avant d'enregistrer.
  const apercu = {
    montant: valeurMontant(saisie.montant),
    taux: nombre(saisie.taux),
    dateValeur: saisie.dateValeur,
    dateEcheance: saisie.dateEcheance,
    dateDenouement: null,
  };
  const interet = interetSpot(apercu);
  const jours = Math.max(
    0,
    Math.round(
      (new Date(`${saisie.dateEcheance}T00:00:00Z`).getTime() -
        new Date(`${saisie.dateValeur}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-8">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Opérations spot — {fondsNom}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Placements et emprunts de trésorerie à court terme. Intérêts en{" "}
              <strong>base 360</strong>, convention du marché monétaire UEMOA.
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={etiquette}>Sens</span>
              <select
                className={champ}
                value={saisie.sens}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, sens: e.target.value as SensSpot }))
                }
              >
                {(Object.keys(LIBELLES_SENS_SPOT) as SensSpot[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_SENS_SPOT[k]}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-slate-400">
                Il décide du poste alimenté : cash à recevoir, ou engagement.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Contrepartie</span>
              <input
                className={champ}
                list="spot-contreparties"
                value={saisie.contrepartie}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, contrepartie: e.target.value }))
                }
                placeholder="Établissement"
              />
              <datalist id="spot-contreparties">
                {contreparties.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Compte</span>
              <select
                className={champ}
                value={saisie.compte}
                onChange={(e) => setSaisie((s) => ({ ...s, compte: e.target.value }))}
              >
                <option value="">— choisir —</option>
                {comptes.map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom} · {c.pays}
                  </option>
                ))}
                {saisie.compte && !comptes.some((c) => c.cle === saisie.compte) && (
                  <option value={saisie.compte}>{saisie.compte} (hors inventaire)</option>
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Montant</span>
              <ChampMontant
                key={`m-${cleChamps}`}
                valeur={saisie.montant}
                onChange={(v) => setSaisie((s) => ({ ...s, montant: v }))}
                className={champ}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Taux annuel</span>
              <input
                className={champ}
                inputMode="decimal"
                value={saisie.taux}
                onChange={(e) => setSaisie((s) => ({ ...s, taux: e.target.value }))}
                placeholder="0,045"
              />
              <span className="text-[9px] text-slate-400">
                En décimal — {(nombre(saisie.taux) * 100).toFixed(3)} %
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Date de valeur</span>
              <input
                type="date"
                className={champ}
                value={saisie.dateValeur}
                onChange={(e) => setSaisie((s) => ({ ...s, dateValeur: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Échéance</span>
              <input
                type="date"
                className={champ}
                value={saisie.dateEcheance}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, dateEcheance: e.target.value }))
                }
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className={etiquette}>Note</span>
              <input
                className={champ}
                value={saisie.note}
                onChange={(e) => setSaisie((s) => ({ ...s, note: e.target.value }))}
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
          </div>

          {apercu.montant > 0 && (
            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 tabular-nums">
              {jours} jour{jours > 1 ? "s" : ""} · intérêt{" "}
              <strong>{montantFr(interet)} F</strong> ({montantFr(apercu.montant)} ×{" "}
              {(apercu.taux * 100).toFixed(3)} % × {jours} / 360) ·{" "}
              {saisie.sens === "placement" ? "à recevoir" : "à rembourser"} à
              l&apos;échéance : <strong>{montantFr(apercu.montant + interet)} F</strong>
            </p>
          )}

          {erreur && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {erreur}
            </p>
          )}

          <div className="border border-slate-200 rounded overflow-hidden overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Sens</th>
                  <th className="text-left px-2 py-1.5 font-medium">Contrepartie</th>
                  <th className="text-left px-2 py-1.5 font-medium">Compte</th>
                  <th className="text-right px-2 py-1.5 font-medium">Montant</th>
                  <th className="text-right px-2 py-1.5 font-medium">Taux</th>
                  <th className="text-left px-2 py-1.5 font-medium">Valeur</th>
                  <th className="text-left px-2 py-1.5 font-medium">Échéance</th>
                  <th className="text-right px-2 py-1.5 font-medium">Intérêt</th>
                  <th className="text-right px-2 py-1.5 font-medium">Au dénouement</th>
                  <th className="text-left px-2 py-1.5 font-medium">Statut</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spots.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-2 py-6 text-center text-slate-400">
                      Aucune opération spot pour ce fonds.
                    </td>
                  </tr>
                )}
                {spots.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      editionId === s.id
                        ? "bg-blue-50"
                        : s.dateDenouement
                          ? "text-slate-400"
                          : "hover:bg-slate-50"
                    }
                  >
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          s.dateDenouement
                            ? ""
                            : s.sens === "placement"
                              ? "text-emerald-700"
                              : "text-rose-700"
                        }
                      >
                        {s.sens === "placement" ? "Placement" : "Emprunt"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{s.contrepartie || "—"}</td>
                    <td className="px-2 py-1.5">{nomCompte(s.compte)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {montantFr(s.montant)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {(s.taux * 100).toFixed(2)} %
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{s.dateValeur}</td>
                    <td className="px-2 py-1.5 tabular-nums">{s.dateEcheance}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {montantFr(interetSpot(s))}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {montantFr(montantDenouementSpot(s))}
                    </td>
                    <td className="px-2 py-1.5">
                      {s.dateDenouement ? `dénoué le ${s.dateDenouement}` : "en cours"}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => denouer(s)}
                        disabled={enCours}
                        className="text-[10px] text-emerald-700 hover:text-emerald-900 disabled:opacity-50 mr-2"
                        title={
                          s.dateDenouement
                            ? "Annuler le dénouement"
                            : "Le cash a bougé aujourd'hui"
                        }
                      >
                        {s.dateDenouement ? "Rouvrir" : "Dénouer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => modifier(s)}
                        disabled={enCours}
                        className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-2"
                      >
                        Modifier
                      </button>
                      {aSupprimer === s.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => supprimer(s.id)}
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
                          onClick={() => setASupprimer(s.id)}
                          disabled={enCours}
                          className="text-[10px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
