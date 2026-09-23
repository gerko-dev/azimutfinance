"use client";

// === Saisie des flux « autres » du point de trésorerie ===
//
// QUATRE LIGNES QUI NE SE DÉDUIRONT JAMAIS. Un appel de marge, une
// régularisation, une commission exceptionnelle, un virement annoncé par la
// banque : ce sont précisément les flux qu'aucune autre source du site ne
// connaît. Leur formulaire n'est donc pas un pis-aller en attendant mieux,
// c'est leur place définitive.
//
// LE MONTANT RESTE POSITIF : c'est la ligne choisie qui dit le sens, puisqu'elle
// décide déjà de quel côté du solde le montant tombe. Demander en plus un signe
// aurait permis d'écrire un encaissement dans la ligne des décaissements — le
// tableau aurait alors eu raison contre le bon sens, en silence.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  enregistrerFluxManuelAction,
  supprimerFluxManuelAction,
} from "@/app/gestion-portefeuille/tresorerie-flux-actions";
import {
  POSTES_FLUX,
  libellePoste,
  type FluxManuel,
  type PosteFlux,
} from "@/app/gestion-portefeuille/tresorerie-flux-types";
import ChampMontant, { valeurMontant } from "./ChampMontant";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

type Compte = { cle: string; nom: string; pays: string };

const VIDE = {
  poste: "AUTRES" as PosteFlux,
  compte: "",
  dateFlux: new Date().toISOString().slice(0, 10),
  // EN TEXTE, pas en nombre : `ChampMontant` rend une chaine nettoyee, et
  // reconvertir a chaque frappe interdisait de taper une virgule.
  montant: "",
  libelle: "",
};

export default function FluxSaisisDialog({
  fondsId,
  fondsNom,
  comptes,
  flux,
  onFermer,
}: {
  fondsId: string;
  fondsNom: string;
  /** Les COLONNES du point : un flux qui n'en désigne aucune n'a nulle part
   *  où s'inscrire. */
  comptes: Compte[];
  flux: FluxManuel[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [editionId, setEditionId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState({ ...VIDE, compte: comptes[0]?.cle ?? "" });
  /** `ChampMontant` garde son propre texte : on le remonte en changeant sa
   *  clef quand on charge une autre ligne, sinon il afficherait la précédente. */
  const [cleMontant, setCleMontant] = useState(0);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const reinitialiser = () => {
    setEditionId(null);
    setSaisie({ ...VIDE, compte: comptes[0]?.cle ?? "" });
    setCleMontant((k) => k + 1);
  };

  const modifier = (f: FluxManuel) => {
    setEditionId(f.id);
    setSaisie({
      poste: f.poste,
      compte: f.compte,
      dateFlux: f.dateFlux,
      montant: String(f.montant),
      libelle: f.libelle,
    });
    setCleMontant((k) => k + 1);
    setErreur(null);
  };

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      const res = await enregistrerFluxManuelAction(fondsId, editionId, {
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

  const supprimer = (id: string) => {
    setErreur(null);
    demarrer(async () => {
      const res = await supprimerFluxManuelAction(fondsId, id);
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

  const posteChoisi = POSTES_FLUX.find((p) => p.cle === saisie.poste);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Flux saisis — {fondsNom}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Les quatre lignes « autres » du point. Le montant reste positif :
              c&apos;est la ligne qui dit le sens.
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
          {/* ── Le formulaire ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={etiquette}>Ligne</span>
              <select
                className={champ}
                value={saisie.poste}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, poste: e.target.value as PosteFlux }))
                }
              >
                {POSTES_FLUX.map((p) => (
                  <option key={p.cle} value={p.cle}>
                    {p.libelle}
                  </option>
                ))}
              </select>
              {posteChoisi && (
                <span
                  className={`text-[9px] ${
                    posteChoisi.sens === "entrant" ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {posteChoisi.aide}
                </span>
              )}
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
                {/* Un compte enregistré mais absent du dernier inventaire ne
                    doit pas disparaître du menu : il serait effacé au premier
                    enregistrement. */}
                {saisie.compte && !comptes.some((c) => c.cle === saisie.compte) && (
                  <option value={saisie.compte}>{saisie.compte} (hors inventaire)</option>
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={etiquette}>Date</span>
              <input
                type="date"
                className={champ}
                value={saisie.dateFlux}
                onChange={(e) => setSaisie((s) => ({ ...s, dateFlux: e.target.value }))}
              />
              <span className="text-[9px] text-slate-400">
                Compte si elle tombe au plus tard à l&apos;arrêté
              </span>
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

            <label className="flex flex-col gap-1 sm:col-span-4">
              <span className={etiquette}>Libellé</span>
              <input
                className={champ}
                value={saisie.libelle}
                onChange={(e) => setSaisie((s) => ({ ...s, libelle: e.target.value }))}
                placeholder="Appel de marge, régularisation de commission…"
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

          {erreur && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {erreur}
            </p>
          )}

          {/* ── Ce qui est déjà saisi ─────────────────────────────────── */}
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Date</th>
                  <th className="text-left px-2 py-1.5 font-medium">Ligne</th>
                  <th className="text-left px-2 py-1.5 font-medium">Compte</th>
                  <th className="text-left px-2 py-1.5 font-medium">Libellé</th>
                  <th className="text-right px-2 py-1.5 font-medium">Montant</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flux.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-slate-400">
                      Aucun flux saisi pour ce fonds.
                    </td>
                  </tr>
                )}
                {flux.map((f) => {
                  const sortant = f.poste === "AUTRES" || f.poste === "AUTRES_FLUX_SORTANT";
                  return (
                    <tr
                      key={f.id}
                      className={editionId === f.id ? "bg-blue-50" : "hover:bg-slate-50"}
                    >
                      <td className="px-2 py-1.5 tabular-nums">{f.dateFlux}</td>
                      <td className="px-2 py-1.5">{libellePoste(f.poste)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{nomCompte(f.compte)}</td>
                      <td className="px-2 py-1.5 text-slate-500">{f.libelle || "—"}</td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-medium ${
                          sortant ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {sortant ? "−" : "+"}
                        {montantFr(f.montant)}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => modifier(f)}
                          disabled={enCours}
                          className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-2"
                        >
                          Modifier
                        </button>
                        {aSupprimer === f.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => supprimer(f.id)}
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
                            onClick={() => setASupprimer(f.id)}
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
