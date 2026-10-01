// === Plusieurs comptes de règlement pour une même opération ===
//
// Un rachat de parts à sept chiffres se paie sur ce qu'on a, et ce qu'on a est
// réparti entre plusieurs banques. Une soumission au marché primaire se verse
// de même. Jusqu'ici le site n'acceptait qu'un compte : le gérant posait donc
// tout le montant sur une seule colonne du point de trésorerie, et cette
// colonne annonçait un décaissement que le relevé ne portait pas.
//
// MODULE NEUTRE. Il est importé par les chargeurs serveur, par les actions et
// par les deux formulaires : il ne peut dépendre de rien.

/** Une ligne de ventilation : un compte, et ce qui s'y règle. */
export type VentilationCompte = {
  /** Clef d'établissement — la COLONNE du point de trésorerie. */
  compte: string;
  /** En francs. Vaut clef de répartition quand le montant total bouge. */
  montant: number;
};

/** Combien de comptes au plus. Au-delà, ce n'est plus une répartition, c'est
 *  un relevé : le flux se saisit alors en plusieurs opérations. */
export const MAX_COMPTES = 8;

/** Le compte PRINCIPAL d'une ventilation : celui de la première ligne.
 *
 *  C'est lui que porte la colonne `compte_reglement` de la table mère, et lui
 *  que lisent l'export et les écrans de liste. Tout ce qui n'a besoin que de
 *  nommer une banque continue donc de fonctionner sans rien savoir de la
 *  ventilation. */
export function comptePrincipal(v: VentilationCompte[]): string {
  return v.length > 0 ? v[0].compte : "";
}

/** La ventilation d'une opération qui n'a qu'un compte. */
export function ventilationSimple(compte: string, montant: number): VentilationCompte[] {
  return compte ? [{ compte, montant }] : [];
}

/**
 * Ce qui cloche dans une ventilation, ou null.
 *
 * `total` n'est à donner que lorsque le montant est CONNU D'AVANCE — un rachat
 * de parts, par exemple. La somme doit alors tomber juste : une ventilation
 * qui ne fait pas le compte est une faute de frappe, et l'accepter aurait
 * laissé disparaître la différence sans que rien ne la signale.
 *
 * Pour un ordre de marché, pas de total : la part non servie et chaque
 * exécution se règlent séparément, et leurs montants bougent à mesure que
 * l'ordre est servi. Les lignes y valent clef de répartition.
 */
export function validerVentilation(
  v: VentilationCompte[],
  total?: number,
): string | null {
  if (v.length === 0) {
    return "Choisis au moins un compte de règlement : sans lui, le montant n'entre dans aucune colonne du point de trésorerie.";
  }
  if (v.length > MAX_COMPTES) {
    return `Pas plus de ${MAX_COMPTES} comptes de règlement sur une même opération.`;
  }
  // AVEC UN SEUL COMPTE, LE MONTANT NE PORTE AUCUNE INFORMATION : ce compte
  // règle tout, par définition. L'exiger aurait obligé chaque formulaire à
  // recopier le total dans un champ qu'il ne montre même pas — et à le tenir
  // d'accord avec lui à chaque frappe.
  const seul = v.length === 1;

  const vus = new Set<string>();
  for (const l of v) {
    const compte = l.compte.trim();
    if (!compte) return "Un compte de règlement est resté vide.";
    if (vus.has(compte)) {
      return `Le compte « ${compte} » figure deux fois : une répartition ne répète pas une banque.`;
    }
    vus.add(compte);
    if (!seul && !(l.montant > 0)) {
      return `Le montant réglé sur « ${compte} » doit être strictement positif.`;
    }
  }
  if (total !== undefined && !seul) {
    const somme = v.reduce((s, l) => s + l.montant, 0);
    // UN FRANC DE TOLERANCE, pas plus : c'est l'arrondi d'une répartition en
    // trois parts, ce n'est pas la place d'une erreur de saisie.
    if (Math.abs(somme - total) > 1) {
      return `La répartition fait ${Math.round(somme).toLocaleString("fr-FR")} F pour un montant de ${Math.round(total).toLocaleString("fr-FR")} F : l'écart doit être corrigé.`;
    }
  }
  return null;
}

/**
 * Répartit un montant sur les comptes, au prorata des lignes saisies.
 *
 * LA SOMME DES PARTS EGALE TOUJOURS LE MONTANT. Le reste d'arrondi tombe sur
 * la dernière ligne : sans cela, trois comptes sur un montant impair faisaient
 * disparaître un franc à chaque opération, et le total du point de trésorerie
 * cessait d'être la somme de ses colonnes.
 *
 * Une ventilation vide rend un tableau vide — pas une ligne à zéro : un
 * montant qui ne désigne aucun compte doit ressortir dans le bandeau des
 * « montants sans colonne », et non se poser sur une banque au hasard.
 */
export function repartir(
  montant: number,
  v: VentilationCompte[],
): VentilationCompte[] {
  if (v.length === 0 || montant === 0) return [];
  if (v.length === 1) return [{ compte: v[0].compte, montant }];

  const base = v.reduce((s, l) => s + l.montant, 0);
  if (!(base > 0)) return [{ compte: v[0].compte, montant }];

  const parts: VentilationCompte[] = [];
  let pose = 0;
  for (let i = 0; i < v.length - 1; i++) {
    const part = Math.round((montant * v[i].montant) / base);
    parts.push({ compte: v[i].compte, montant: part });
    pose += part;
  }
  parts.push({ compte: v[v.length - 1].compte, montant: montant - pose });
  return parts;
}

/** Lignes nettoyées : comptes vides écartés, montants normalisés. */
export function nettoyerVentilation(v: VentilationCompte[]): VentilationCompte[] {
  return v
    .map((l) => ({ compte: l.compte.trim(), montant: Number(l.montant) || 0 }))
    .filter((l) => l.compte !== "");
}
