"use client";

// Date de PRISE EN COMPTE DES ENGAGEMENTS.
//
// Elle ne se confond pas avec la date des soldes. Les soldes disent ce qu'il y
// a en banque à un instant ; celle-ci dit jusqu'où l'on regarde les flux à
// venir. Le classeur les distingue déjà — sa cellule « DATE FIN » est au
// 30 septembre quand les soldes sont d'un autre jour.
//
// C'est la question du trésorier : « de quoi vais-je disposer à telle date,
// une fois passé tout ce qui est engagé ? »

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function DateEngagements({ valeur }: { valeur: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();
  const [texte, setTexte] = useState(valeur);

  /**
   * LE CHANGEMENT SE CONFIRME, IL NE S'APPLIQUE PAS À LA FRAPPE.
   *
   * Un champ de date se remplit par morceaux, et chaque état intermédiaire est
   * une date valide : taper 2026-09-30 passe par le 30 septembre 2026 mais
   * aussi, selon la saisie, par des dates d'années entières. Recalculer à
   * chaque frappe relançait donc plusieurs fois un calcul qui traverse tous les
   * fonds, et faisait clignoter le tableau sur des dates que personne n'avait
   * voulues.
   *
   * Le bouton dit aussi une chose utile : tant qu'il est actif, ce qu'on lit à
   * l'écran ne correspond PAS à la date affichée dans le champ.
   */
  const appliquer = () => {
    if (!EST_DATE.test(texte) || texte === valeur) return;
    const suivants = new URLSearchParams(params.toString());
    suivants.set("engagements", texte);
    demarrer(() => router.push(`?${suivants.toString()}`));
  };

  const modifie = EST_DATE.test(texte) && texte !== valeur;

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-600">
      <label className="flex items-center gap-2">
        <span className="uppercase tracking-wider text-[10px] text-slate-500">
          Engagements jusqu&apos;au
        </span>
        <input
          type="date"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            // Entrée vaut confirmation : c'est le geste attendu quand on vient
            // de taper une date, et l'exiger à la souris agacerait.
            if (e.key === "Enter") {
              e.preventDefault();
              appliquer();
            }
          }}
          disabled={enCours}
          title="Les flux dénoués jusqu'à cette date sont comptés ; les suivants ne le sont pas."
          className={`text-xs border rounded px-2 py-1.5 bg-white focus:outline-none disabled:opacity-60 ${
            modifie ? "border-amber-400" : "border-slate-300 focus:border-blue-400"
          }`}
        />
      </label>

      <button
        type="button"
        onClick={appliquer}
        disabled={!modifie || enCours}
        className="px-3 py-1.5 text-xs font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent transition"
      >
        {enCours ? "Recalcul…" : "Appliquer"}
      </button>

      {modifie && !enCours && (
        <span className="text-amber-700">
          le tableau montre encore le {valeur || "—"}
        </span>
      )}
    </div>
  );
}
