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
 * LE REPLI DOIT POUVOIR SE RELEVER.
 *
 * Premier jet : un simple `let presente = false` une fois l'absence
 * constatée. C'était un verrou à sens unique — le processus ayant vu la
 * colonne manquer continuait de l'omettre POUR TOUJOURS. Le SQL passé, le
 * serveur en cours d'exécution n'en savait rien : le gérant choisissait son
 * compte de prélèvement, la fiche s'enregistrait sans lui, et il n'y avait
 * qu'un redémarrage pour en sortir. On corrige un défaut en en créant un
 * autre, plus difficile à voir que le premier.
 *
 * On retient donc QUAND l'absence a été vue, et l'on réessaie passé un délai.
 * Le coût est d'une requête perdue par minute tant que la migration manque
 * vraiment ; le gain est qu'elle prend effet d'elle-même, sans redémarrage.
 */
let absenteDepuis: number | null = null;

/** Délai avant de retenter la colonne. Court : une migration se passe et l'on
 *  veut la voir agir dans la minute, pas au prochain déploiement. */
const REESSAI_MS = 60_000;

function presente(): boolean {
  if (absenteDepuis === null) return true;
  if (Date.now() - absenteDepuis < REESSAI_MS) return false;
  // Le délai est écoulé : on redevient optimiste. Si la colonne manque
  // toujours, la prochaine erreur remettra le compteur à zéro.
  absenteDepuis = null;
  return true;
}

/** Colonnes à demander, selon ce qu'on sait de la base. */
export function colonnesFonds(): string {
  return presente() ? `${BASE}, ${COLONNE_COMPTE_FRAIS}, ${FIN}` : `${BASE}, ${FIN}`;
}

export const compteFraisDisponible = (): boolean => presente();

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
  if (absenteDepuis === null) {
    console.warn(
      `[gestion-portefeuille] ${COLONNE_COMPTE_FRAIS} absente : ` +
        "exécute supabase/fund-frais-compte.sql. Le compte de prélèvement des " +
        "frais de gestion reste vide en attendant ; nouvelle tentative dans " +
        `${REESSAI_MS / 1000} s.`,
    );
  }
  absenteDepuis = Date.now();
  return true;
}

/** Retire de la ligne ce que la base ne sait pas encore stocker. */
export function sansColonnesAbsentes<T extends Record<string, unknown>>(row: T): T {
  if (presente()) return row;
  const reste = { ...row };
  delete reste[COLONNE_COMPTE_FRAIS];
  return reste;
}
