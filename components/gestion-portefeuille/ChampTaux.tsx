"use client";

// === Saisie d'un taux, en pourcentage ===
//
// Les taux se STOCKENT en décimal (0,003) et se SAISISSENT en pourcentage
// (0,3) : personne ne pense en décimales. La conversion vit au bord de
// l'écran, pour que le reste du module n'ait qu'une seule convention.

import { useState } from "react";

/**
 * POURQUOI CE COMPOSANT GARDE SON PROPRE TEXTE.
 *
 * Un champ contrôlé dont la valeur est reconvertie depuis un nombre à chaque
 * frappe interdit de taper une décimale : « 0, » se convertit en 0, le rendu
 * réécrit « 0 », et la virgule disparaît sous les doigts. Même chose pour
 * « 0,0 », qui vaut toujours 0. Le gérant ne pouvait donc saisir que des
 * entiers, ce qui, sur des commissions de l'ordre de 0,3 %, rend le champ
 * inutilisable.
 *
 * On conserve donc le TEXTE tel qu'il est tapé, et on ne remonte au parent que
 * sa valeur numérique. Les deux ne se resynchronisent pas d'eux-mêmes : pour
 * réimposer une valeur de l'extérieur — un « rétablir les défauts », par
 * exemple — on change la `key` du composant, ce qui le remonte proprement.
 */
export default function ChampTaux({
  valeur,
  onChange,
  className = "",
}: {
  /** Taux en DÉCIMAL. Affiché en pourcentage. */
  valeur: number;
  /** Reçoit le taux en DÉCIMAL. */
  onChange: (v: number) => void;
  className?: string;
}) {
  const [texte, setTexte] = useState(() => String(Number((valeur * 100).toFixed(4))));

  return (
    <input
      value={texte}
      onChange={(e) => {
        // Chiffres et UN SEUL séparateur décimal. Sans ce filtre, un
        // caractère parasite rendrait la valeur NaN sans que le champ change
        // d'aspect.
        //
        // Le séparateur conservé est le PREMIER. Garder le dernier — ce que
        // fait le filtre naïf — transformait « 1,2,3 » en « 12,3 », soit dix
        // fois la valeur voulue, sans rien signaler. Avec le premier,
        // « 1,2,3 » devient « 1,23 » : les frappes en trop se rangent après
        // la virgule, là où on les attend.
        const brut = (() => {
          const chiffresEtSeparateurs = e.target.value.replace(/[^\d.,]/g, "");
          const morceaux = chiffresEtSeparateurs.split(/[.,]/);
          if (morceaux.length <= 1) return chiffresEtSeparateurs;
          return `${morceaux[0]},${morceaux.slice(1).join("")}`;
        })();
        setTexte(brut);
        const n = Number(brut.replace(",", "."));
        onChange(Number.isFinite(n) ? n / 100 : 0);
      }}
      onBlur={() => {
        // À la sortie du champ, on remet la forme canonique : « 0, » devient
        // « 0 », « ,3 » devient « 0.3 ». Pendant la saisie on ne touche à
        // rien, sinon on déplace le curseur.
        const n = Number(texte.replace(",", "."));
        setTexte(Number.isFinite(n) ? String(Number(n.toFixed(4))) : "0");
      }}
      inputMode="decimal"
      className={className}
    />
  );
}
