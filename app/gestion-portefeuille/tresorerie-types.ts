// === Point de trésorerie — types ===
//
// Reprend la feuille « Point de trésorerie » du classeur Gestion de la
// trésorerie : un BLOC par fonds, les banques en COLONNES, les postes de flux
// en LIGNES, et une colonne Total à droite.
//
// Le classeur a servi de MODÈLE, pas de source : le tableau se construit
// désormais depuis les données du site, sans qu'aucun fichier n'ait à être
// déposé. L'ordre des postes est celui de la feuille, parce que c'est dans cet
// ordre que le trésorier le lit — un solde de départ, les engagements qui le
// grèvent, les encaissements attendus, puis les deux soldes d'arrivée.
//
// Les formules de bas de tableau sont reprises TELLES QUELLES du classeur, y
// compris leurs bizarreries (cf. SOLDEREEL dans tresorerie-data).

/** D'où vient la valeur d'une ligne. */
export type SourceLigne =
  /** Lue dans l'inventaire du fonds. */
  | "inventaire"
  /** Calculée à partir des autres lignes, selon les formules du classeur. */
  | "calcul"
  /** Saisi par le gérant dans l'écran « Opérations de marché ». */
  | "operations"
  /** Poste qui attend encore sa source : affiché à zéro, pas deviné. */
  | "a_alimenter";

/** Nature d'une ligne, qui commande sa mise en forme. */
export type NatureLigne =
  /** Poste saisi ou importé, sommé dans un total plus bas. */
  | "poste"
  /** Sous-total calculé par le classeur. */
  | "total"
  /** Solde d'arrivée : le chiffre que le trésorier regarde en premier. */
  | "solde"
  /** Ratio exprimé en pourcentage de l'actif net. */
  | "pourcentage";

export type DefinitionLigne = {
  /** Libellé exact du classeur. Sert de clef dans tout le module. */
  libelle: string;
  /** Intitulé affiché, quand le libellé du classeur est une clef technique. */
  affichage?: string;
  nature: NatureLigne;
  source: SourceLigne;
};

/**
 * Gabarit du tableau, dans l'ordre de la feuille.
 *
 * Les libellés techniques du classeur (REMERES_CASH_IN, SOLDEREEL…) sont
 * conservés tels quels comme clef, et doublés d'un intitulé lisible pour
 * l'affichage. Garder la clef du classeur permet de confronter ligne à ligne le
 * tableau du site et celui du trésorier tant que les deux coexistent.
 *
 * `source` dit ce que le site sait déjà produire. Les postes « a_alimenter »
 * sortent à zéro et sont signalés comme tels : un tableau qui affiche zéro sans
 * prévenir qu'il ne sait pas encore compter est pire qu'un tableau vide.
 */
export const LIGNES_POINT_TRESORERIE: DefinitionLigne[] = [
  { libelle: "SOLDE", nature: "poste" , source: "inventaire" },

  { libelle: "ACHATS MFR VALIDES", nature: "poste" , source: "operations" },
  { libelle: "ACHATS MTP VALIDES", nature: "poste" , source: "operations" },
  { libelle: "ACHATS A RÉMÉRÉ VALIDES", nature: "poste" , source: "operations" },
  { libelle: "ACHATS VALIDES", nature: "total" , source: "calcul" },

  { libelle: "ACHATS MFR REALISES", nature: "poste" , source: "operations" },
  { libelle: "ACHATS MTP REALISES", nature: "poste" , source: "operations" },
  { libelle: "ACHATS REALISES", nature: "total" , source: "calcul" },

  { libelle: "VENTES MFR REALISEES", nature: "poste" , source: "operations" },
  { libelle: "VENTES MTP REALISEES", nature: "poste" , source: "operations" },
  { libelle: "VENTES REALISEES", nature: "total" , source: "calcul" },

  { libelle: "OPERATIONS MARCHÉ PRIMAIRE", nature: "poste" , source: "a_alimenter" },
  { libelle: "RACHAT", nature: "poste" , source: "a_alimenter" },
  { libelle: "FRAIS DE GESTION", nature: "poste" , source: "a_alimenter" },
  { libelle: "REMERES_CASH_IN", affichage: "Rémérés — encaissements", nature: "poste" , source: "a_alimenter" },
  { libelle: "REMBOURSEMENT_SPOT", affichage: "Remboursement spot", nature: "poste" , source: "a_alimenter" },
  { libelle: "AUTRES", nature: "poste" , source: "a_alimenter" },
  { libelle: "AUTRES ENGAGEMENTS", nature: "total" , source: "calcul" },

  { libelle: "SOUSCRIPTION BUREAU CI", nature: "poste" , source: "a_alimenter" },
  { libelle: "SOUSCRIPTION BUREAU SN", nature: "poste" , source: "a_alimenter" },
  { libelle: "SOUSCRIPTION BUREAU BJ", nature: "poste" , source: "a_alimenter" },
  { libelle: "REMERES_CASH_OUT", affichage: "Rémérés — décaissements", nature: "poste" , source: "a_alimenter" },
  { libelle: "SPOT", nature: "poste" , source: "a_alimenter" },
  { libelle: "AUTRES_CASH_A_RECEVOIR", affichage: "Autres encaissements", nature: "poste" , source: "a_alimenter" },
  { libelle: "CASH A RECEVOIR", nature: "total" , source: "calcul" },

  { libelle: "SOUSCRIPTION PRIMAIRE PROB.", nature: "poste" , source: "a_alimenter" },
  { libelle: "RACHAT PROB.", nature: "poste" , source: "a_alimenter" },
  { libelle: "AUTRES_FLUX_SORTANT", affichage: "Autres flux sortants", nature: "poste" , source: "a_alimenter" },
  { libelle: "SOUSCRIPTION PROB. BUREAU CI", nature: "poste" , source: "a_alimenter" },
  { libelle: "SOUSCRIPTION PROB. BUREAU SN", nature: "poste" , source: "a_alimenter" },
  { libelle: "SOUSCRIPTION PROB. BUREAU BJ", nature: "poste" , source: "a_alimenter" },
  { libelle: "AUTRES_FLUX_ENTRANT", affichage: "Autres flux entrants", nature: "poste" , source: "a_alimenter" },
  { libelle: "DIVIDENDES/COUPONS", nature: "poste" , source: "a_alimenter" },
  { libelle: "FLUX THEORIQUES", affichage: "Flux théoriques", nature: "total" , source: "calcul" },
  { libelle: "ENGAGEMENTS PROBABLES", nature: "total" , source: "a_alimenter" },

  { libelle: "SOLDEREEL", affichage: "Solde réel", nature: "solde" , source: "calcul" },
  { libelle: "Solde réél en % de l'actif net", affichage: "Solde réel en % de l'actif net", nature: "pourcentage" , source: "calcul" },
  { libelle: "SOLDETHEORIQUE", affichage: "Solde théorique", nature: "solde" , source: "calcul" },
  { libelle: "Solde théorique en % de l'actif net", nature: "pourcentage" , source: "calcul" },
];

/** Intitulé à afficher pour une ligne. */
export const intitule = (l: DefinitionLigne): string => l.affichage ?? l.libelle;

/** Une ligne du tableau, avec une valeur par banque. */
export type LigneTresorerie = {
  libelle: string;
  nature: NatureLigne;
  source: SourceLigne;
  /** Valeurs indexées par nom de banque. Une banque absente n'a PAS de valeur —
   *  le classeur laisse la cellule vide, et un zéro n'aurait pas le même sens. */
  parBanque: Record<string, number | null>;
  /** Colonne Total du classeur. Reprise telle quelle, jamais recalculée : si
   *  elle diverge de la somme, c'est une information, pas une erreur à masquer. */
  total: number | null;
};

/** Le point de trésorerie d'un fonds, à une date. */
export type PointTresorerie = {
  /** Identifiant du fonds, pour l'enregistrement des soldes saisis. */
  fondsId: string;
  /** Nom du fonds. */
  fonds: string;
  /** Date de fin de période (cellule « DATE FIN » en tête de feuille). */
  dateFin: string | null;
  /** Banques, dans l'ordre des colonnes du classeur. */
  banques: string[];
  /** Actif net du fonds, dénominateur des deux ratios de bas de tableau. */
  actifNet: number | null;
  /** Date de l'inventaire d'où sortent les soldes bancaires. */
  dateInventaire: string | null;
  lignes: LigneTresorerie[];
  /** Postes encore sans source, comptés pour le bandeau d'avertissement. */
  postesAAlimenter: number;
  /** Établissements en colonnes, dans l'ordre d'affichage, avec leur groupe
   *  (« Comptes dépositaires », « Comptes espèce », « Mobile Money »). */
  etablissements: {
    cle: string;
    nom: string;
    pays: string;
    /** « encaissement » / « décaissement » pour le mobile money, vide sinon. */
    sens: string;
    groupe: string;
  }[];
  /** Solde COMPTABLE de chaque établissement à l'inventaire. Affiché en regard
   *  du solde saisi : l'écart entre les deux est l'information utile. */
  soldesInventaire: Record<string, number>;
  /** Comptes de l'inventaire qu'aucun alias ne rattache à un établissement.
   *  Jamais répartis au hasard : listés pour arbitrage. */
  comptesNonRattaches: { libelle: string; montant: number }[];
  /** Date du dernier jeu de soldes saisi, ou null si rien n'a été saisi. */
  soldesSaisisLe: string | null;
  /** Opérations de marché dont le compte de règlement ne correspond à AUCUNE
   *  colonne du tableau. Leur montant n'entre nulle part : sans cette liste il
   *  disparaîtrait en silence, et le gérant chercherait longtemps pourquoi un
   *  poste ne bouge pas. */
  operationsSansColonne: { libelle: string; compte: string; montant: number }[];
  /** Opérations négociées mais PAS ENCORE DÉNOUÉES à la date d'arrêté. Elles
   *  ne comptent pas — la trésorerie n'a pas bougé — mais elle bougera, et le
   *  trésorier doit les voir venir. */
  operationsNonDenouees: { libelle: string; dateDenouement: string; montant: number }[];
  /** Ordres dont la part non servie a EXPIRÉ avant la date d'arrêté. Ils ne
   *  pèsent plus — ils ne seront plus servis — mais leur disparition doit se
   *  voir : un engagement qui s'évapore en silence se cherche longtemps. */
  ordresPerimes: { libelle: string; dateLimite: string; montant: number }[];
};
