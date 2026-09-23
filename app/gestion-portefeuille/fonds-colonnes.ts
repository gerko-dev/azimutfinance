import "server-only";

// === Colonnes de `managed_funds`, et migration non encore passée ===
//
// UNE MIGRATION EN RETARD NE DOIT PAS ÉTEINDRE LE MODULE.
//
// PostgREST refuse la requête ENTIÈRE quand une seule colonne demandée
// n'existe pas. `loadMyFunds` renvoyait alors une liste vide, et tout le
// module — trésorerie comprise — se comportait comme si le gérant n'avait
// aucun fonds : « Aucun inventaire enregistré », sur un portefeuille qui en
// comptait trois. Le lien entre le message et la cause était invisible.
//
// On détecte donc l'absence UNE FOIS, et l'on retombe sur le jeu de colonnes
// d'avant. Le champ concerné est simplement vide tant que le SQL n'est pas
// passé : le reste fonctionne, et la trace dit quoi exécuter.

/** Colonnes communes à toutes les lectures de fonds. */
const BASE =
  "id, nom, abreviation, categorie, type, vl_initiale, devise, objectif_perf, " +
  "droit_entree, droit_sortie, frais_gestion";
const FIN = "benchmark, ratios";

/** Ce que la migration `fund-frais-compte.sql` ajoute. */
const COLONNE_COMPTE_FRAIS = "compte_frais_gestion";

/**
 * Optimiste au démarrage : dans une base à jour — c'est-à-dire partout, une
 * fois le SQL passé — on ne paie aucune requête de découverte.
 */
let presente = true;

/** Colonnes à demander, selon ce qu'on sait de la base. */
export function colonnesFonds(): string {
  return presente ? `${BASE}, ${COLONNE_COMPTE_FRAIS}, ${FIN}` : `${BASE}, ${FIN}`;
}

export const compteFraisDisponible = (): boolean => presente;

/**
 * L'erreur dit-elle que la colonne manque ? Si oui, on le retient et
 * l'appelant réessaie sans elle.
 *
 * On reconnaît le NOM DE LA COLONNE dans le message, pas un code d'erreur :
 * PostgREST rend `42703` pour toute colonne inconnue, et se fier au seul code
 * ferait retomber sur le jeu réduit à cause d'une faute de frappe ailleurs.
 */
export function signalerColonneManquante(message: string | null | undefined): boolean {
  if (!message || !message.includes(COLONNE_COMPTE_FRAIS)) return false;
  if (!/n'existe pas|does not exist|could not find|schema cache/i.test(message)) return false;
  if (presente) {
    console.warn(
      `[gestion-portefeuille] ${COLONNE_COMPTE_FRAIS} absente : ` +
        "exécute supabase/fund-frais-compte.sql. Le compte de prélèvement des " +
        "frais de gestion reste vide en attendant.",
    );
  }
  presente = false;
  return true;
}

/** Retire de la ligne ce que la base ne sait pas encore stocker. */
export function sansColonnesAbsentes<T extends Record<string, unknown>>(row: T): T {
  if (presente) return row;
  const reste = { ...row };
  delete reste[COLONNE_COMPTE_FRAIS];
  return reste;
}
