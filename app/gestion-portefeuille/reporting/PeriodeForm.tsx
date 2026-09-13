"use client";

import { useState } from "react";

// === Choix de la période du rapport ===
//
// Formulaire GET NATIF vers la route PDF : le navigateur télécharge le fichier
// lui-même, sans fetch ni blob à gérer. Le composant n'est client que pour
// vérifier l'ordre des trois bornes avant l'envoi — la même règle est
// re-vérifiée côté serveur, qui reste l'autorité.

const INPUT =
  "w-full px-2.5 py-2 rounded border border-slate-600 bg-slate-800 text-slate-100 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400/60";
const LABEL = "block text-xs font-medium text-slate-400 mb-1.5";

export default function PeriodeForm({
  defauts,
}: {
  /** Bornes proposées, calculées au serveur : `new Date()` dans le corps d'un
   *  composant tombe sous la règle react-hooks/purity et casserait
   *  l'hydratation. */
  defauts: { debut: string; intermediaire: string; fin: string };
}) {
  const [debut, setDebut] = useState(defauts.debut);
  const [intermediaire, setIntermediaire] = useState(defauts.intermediaire);
  const [fin, setFin] = useState(defauts.fin);

  const erreur =
    !debut || !intermediaire || !fin
      ? "Les trois dates sont requises."
      : debut >= fin
        ? "La date de début doit précéder la date de fin."
        : intermediaire < debut || intermediaire > fin
          ? "La date intermédiaire doit tomber entre le début et la fin."
          : null;

  return (
    <form
      method="get"
      action="/gestion-portefeuille/reporting/pdf"
      target="_blank"
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL} htmlFor="p-debut">
            Date de début
          </label>
          <input
            id="p-debut"
            name="debut"
            type="date"
            required
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
            className={INPUT}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Base des variations de période.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="p-inter">
            Date intermédiaire
          </label>
          <input
            id="p-inter"
            name="intermediaire"
            type="date"
            required
            value={intermediaire}
            onChange={(e) => setIntermediaire(e.target.value)}
            className={INPUT}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Point de passage : montre où le mouvement s&apos;est fait.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="p-fin">
            Date de fin
          </label>
          <input
            id="p-fin"
            name="fin"
            type="date"
            required
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className={INPUT}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Arrêté des cours, encours et VL.
          </p>
        </div>
      </div>

      {erreur && (
        <p
          aria-live="polite"
          className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded px-3 py-2"
        >
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={erreur !== null}
          className="px-4 py-2 rounded-md bg-amber-500 text-slate-950 text-sm font-semibold hover:bg-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Générer le rapport PDF
        </button>
        <span className="text-xs text-slate-500">
          Le PDF s&apos;ouvre dans un nouvel onglet. La génération lance
          Chromium côté serveur : compter quelques secondes.
        </span>
      </div>
    </form>
  );
}
