// === Agrégats purs, communs aux onglets d'analyse de marché ===
//
// CE MODULE N'EST NI CLIENT NI SERVEUR, et c'est tout l'intérêt. Les règles
// d'agrégation de chaque compartiment sont appelées par le panneau (client)
// mais décrites dans des modules que le chargeur (serveur) importe aussi. Les
// loger dans le module d'interface, marqué « use client », ferait d'eux des
// RÉFÉRENCES côté serveur — des proxies que l'on ne peut pas appeler — et la
// panne ne se verrait qu'à l'exécution.
export const somme = <T,>(l: T[], f: (x: T) => number | null): number => {
  let t = 0;
  for (const x of l) {
    const v = f(x);
    if (v !== null && Number.isFinite(v)) t += v;
  }
  return t;
};

/**
 * Moyenne pondérée, `null` quand aucun poids ne porte la donnée.
 *
 * Une ligne sans valeur ou sans poids ne compte pas — ni au numérateur, ni au
 * dénominateur. Renvoyer 0 dans ce cas ferait passer une absence pour une
 * mesure.
 */
export function moyennePonderee<T>(
  lignes: T[],
  valeur: (x: T) => number | null,
  poids: (x: T) => number,
): number | null {
  let num = 0;
  let den = 0;
  for (const l of lignes) {
    const v = valeur(l);
    const p = poids(l);
    if (v === null || !Number.isFinite(v) || !(p > 0)) continue;
    num += v * p;
    den += p;
  }
  return den > 0 ? num / den : null;
}

/** Part du poids total qui porte réellement la donnée, de 0 à 1. */
export function assise<T>(
  lignes: T[],
  valeur: (x: T) => number | null,
  poids: (x: T) => number,
): number | null {
  let porteur = 0;
  let total = 0;
  for (const l of lignes) {
    const p = poids(l);
    if (!(p > 0)) continue;
    total += p;
    const v = valeur(l);
    if (v !== null && Number.isFinite(v)) porteur += p;
  }
  return total > 0 ? porteur / total : null;
}
