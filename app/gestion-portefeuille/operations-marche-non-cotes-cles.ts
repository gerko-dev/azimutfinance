// === Le code d'émetteur des titres non cotés ===============================
//
// IL VIT A PART DU MODULE QUI LES LIT, et ce n'est pas du zèle : celui-ci
// porte « server-only » — il interroge la base et les fiches — alors que
// l'écran de saisie, lui, est un composant client. Lui faire importer le
// module entier aurait fait échouer la compilation sur une constante de deux
// mots.

/**
 * Le code qui désigne le référentiel du gérant là où l'on attend un État.
 *
 * Il voisine avec « CI », « SN », « BF »… : deux caractères n'auraient pas
 * suffi à le distinguer sans risque d'un code pays futur, et un mot se lit.
 */
export const EMETTEUR_NON_COTES = "NONCOTES";
export const LIBELLE_NON_COTES = "Autres instruments non cotés";
