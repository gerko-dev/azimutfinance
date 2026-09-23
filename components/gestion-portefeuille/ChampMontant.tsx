"use client";

// === Saisie d'un montant, avec séparateurs de milliers ===
//
// Un montant à neuf chiffres ne se relit pas sans séparateurs : 1250000000 et
// 125000000 se distinguent à l'œil beaucoup moins vite que 1 250 000 000 et
// 125 000 000. Sur des ordres de plusieurs centaines de millions, c'est un
// zéro de trop qui passe inaperçu.
//
// Le champ GARDE SON PROPRE TEXTE, comme `ChampTaux` et pour la même raison :
// un champ contrôlé dont la valeur est reconvertie depuis un nombre à chaque
// frappe interdit de taper une décimale — « 0, » se convertit en 0, le rendu
// réécrit « 0 », et la virgule disparaît sous les doigts.

import { useLayoutEffect, useRef, useState } from "react";

/** Espace FINE INSÉCABLE — la convention française, et insécable pour qu'un
 *  montant ne se coupe jamais en fin de ligne. */
const SEP = " ";

/** Ne garde que les chiffres et UN séparateur décimal, le PREMIER.
 *
 *  Le premier et non le dernier : garder le dernier transformait « 1,2,3 » en
 *  « 12,3 », soit dix fois la valeur voulue, sans rien signaler. Avec le
 *  premier, « 1,2,3 » devient « 1,23 » — les frappes en trop se rangent après
 *  la virgule, là où on les attend. */
function nettoyer(brut: string): string {
  const gardes = brut.replace(/[^\d.,]/g, "");
  const morceaux = gardes.split(/[.,]/);
  if (morceaux.length <= 1) return gardes;
  return `${morceaux[0]},${morceaux.slice(1).join("")}`;
}

/** Groupe la partie entière par milliers. La partie décimale ne se groupe
 *  pas : ce n'est pas la convention, et « 0,123 456 » se lirait mal. */
function grouper(propre: string): string {
  const [entier, ...reste] = propre.split(",");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
  return reste.length > 0 ? `${groupe},${reste.join("")}` : groupe;
}

export function formaterMontant(v: number): string {
  if (!Number.isFinite(v)) return "";
  return grouper(String(v).replace(".", ","));
}

/** Valeur numérique d'un texte formaté. */
export function valeurMontant(texte: string): number {
  const n = Number(nettoyer(texte).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function ChampMontant({
  valeur,
  onChange,
  className = "",
  placeholder,
  disabled = false,
}: {
  /** Texte affiché — le parent garde la maîtrise de ce qui est saisi. */
  valeur: string;
  /** Reçoit le texte NETTOYÉ, sans séparateurs : c'est lui que le parent
   *  stocke, pour que son `Number()` n'ait jamais à connaître nos espaces. */
  onChange: (texte: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [texte, setTexte] = useState(() => grouper(nettoyer(valeur)));
  const ref = useRef<HTMLInputElement>(null);
  /** Position du curseur à replacer après le rendu, ou null. */
  const curseur = useRef<number | null>(null);

  /**
   * LE CURSEUR NE DOIT PAS SAUTER À LA FIN.
   *
   * Insérer un séparateur décale tout ce qui suit : sans correction, corriger
   * un chiffre au milieu d'un montant renvoyait le curseur à la fin, et la
   * frappe suivante atterrissait au mauvais endroit.
   *
   * On compte donc les CHIFFRES avant le curseur — les séparateurs ne comptent
   * pas — et on le replace après le même nombre de chiffres dans le texte
   * reformaté. Un effet de mise en page, pas un état : rien n'est re-rendu.
   */
  useLayoutEffect(() => {
    if (curseur.current === null || !ref.current) return;
    const cible = curseur.current;
    curseur.current = null;
    ref.current.setSelectionRange(cible, cible);
  });

  // Le parent peut réimposer une valeur — une ligne chargée pour correction,
  // un « rétablir ». On ne resynchronise QUE dans ce cas.
  //
  // La comparaison porte sur les VALEURS, pas sur les textes. Un parent qui
  // stocke un nombre renvoie « 1000 » quand on vient de taper « 1000, » :
  // comparer les textes aurait jugé qu'il impose autre chose, réécrit le champ
  // et fait disparaître la virgule sous les doigts — exactement le défaut que
  // ce composant existe pour éviter.
  if (valeurMontant(valeur) !== valeurMontant(texte)) {
    setTexte(grouper(nettoyer(valeur)));
  }

  return (
    <input
      ref={ref}
      value={texte}
      disabled={disabled}
      placeholder={placeholder}
      inputMode="decimal"
      onChange={(e) => {
        const brut = e.target.value;
        const position = e.target.selectionStart ?? brut.length;
        // Combien de caractères SIGNIFIANTS avant le curseur ?
        const avant = (brut.slice(0, position).match(/[\d.,]/g) ?? []).length;

        const propre = nettoyer(brut);
        const formate = grouper(propre);

        // On avance dans le texte formaté jusqu'à avoir croisé autant de
        // caractères signifiants, et on s'arrête là.
        let vus = 0;
        let i = 0;
        while (i < formate.length && vus < avant) {
          if (/[\d,]/.test(formate[i])) vus += 1;
          i += 1;
        }

        setTexte(formate);
        curseur.current = i;
        onChange(propre);
      }}
      className={className}
    />
  );
}
