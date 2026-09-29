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

import type { FraisGestion } from "./frais-gestion";
import type { CalendrierEsv } from "./esv-data";
import type { DetailMontant } from "./tresorerie-apports";
import type {
  FluxManuel,
  Nivellement,
  SensSpot,
  Spot,
} from "./tresorerie-flux-types";

/**
 * Identifiant de la vue CONSOLIDÉE, tous fonds confondus.
 *
 * Il vit ici et non dans `tresorerie-global`, qui lit la base : un composant
 * client qui l'y aurait pris aurait tiré tout le chargeur serveur dans son
 * bundle, et la page serait tombée en 500 sans rien dire de plus qu'une
 * erreur de module.
 */
export const FONDS_GLOBAL = "global";

/** D'où vient la valeur d'une ligne. */
export type SourceLigne =
  /** Lue dans l'inventaire du fonds. */
  | "inventaire"
  /** Calculée à partir des autres lignes, selon les formules du classeur. */
  | "calcul"
  /** Saisi par le gérant dans l'écran « Opérations de marché ». */
  | "operations"
  /** Saisi dans l'écran « Souscriptions / rachats ». */
  | "souscriptions"
  /** Saisi directement au point de trésorerie : les quatre lignes « autres »
   *  et les opérations spot. Rien ne les déduit, et rien ne les déduira —
   *  c'est leur définition, pas une lacune. */
  | "saisie"
  /** Calculé par le module ESV : coupons, dividendes et tombées de capital,
   *  déduits des titres détenus et des échéanciers du référentiel. */
  | "esv"
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
  /**
   * Ce que la ligne porte, en clair — le texte de l'infobulle du tableau.
   *
   * OBLIGATOIRE. Un point de trésorerie est une suite de montants à sept
   * chiffres dont le libellé ne dit ni d'où ils viennent, ni sur quel solde
   * ils pèsent ; le trésorier le savait pour avoir construit le classeur, le
   * gérant qui arrive ne le sait pas. L'explication vit ICI, contre la
   * définition, et non dans le composant : c'est le même endroit qui décide
   * de la ligne et de ce qu'on en dit.
   */
  explication: string;
  /**
   * Pour une ligne CALCULÉE, les lignes dont elle est faite.
   *
   * SOURCE UNIQUE. Ces listes commandent le calcul dans `tresorerie-data` ET
   * la décomposition affichée par l'infobulle. Les tenir en double aurait
   * garanti qu'un jour l'infobulle explique une formule qui n'est plus celle
   * qu'on applique.
   *
   * L'ordre de `LIGNES_POINT_TRESORERIE` est celui du calcul : toute
   * composante précède la ligne qui l'utilise.
   */
  composantes?: { plus: string[]; moins?: string[] };
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
  {
    libelle: "SOLDE",
    nature: "poste",
    source: "inventaire",
    explication:
      "Solde bancaire du compte à la date d'arrêté, tel qu'il a été saisi dans la grille « Saisir les soldes ». Le petit montant en dessous est le solde COMPTABLE du même compte à l'inventaire : l'écart entre les deux est ce qui reste à expliquer.",
  },

  {
    libelle: "ACHATS MFR VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Achats de titres cotés (marché financier régional) passés et pas encore servis à l'arrêté : la part de l'ordre qui reste à exécuter. L'argent n'est pas sorti, mais il est engagé — d'où sa retenue dans les deux soldes.",
  },
  {
    libelle: "ACHATS MTP VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Achats de titres publics (marché des titres publics, UMOA-Titres) passés et pas encore servis à l'arrêté. Engagés, donc retenus dans les deux soldes.",
  },
  {
    libelle: "ACHATS A RÉMÉRÉ VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Achats à réméré noués et pas encore réglés : le fonds décaissera à la mise en place. Le rachat par le vendeur au terme se lit plus bas, en encaissement à recevoir.",
  },
  {
    libelle: "ACHATS VALIDES",
    nature: "total",
    source: "calcul",
    composantes: {
      plus: ["ACHATS MFR VALIDES", "ACHATS MTP VALIDES", "ACHATS A RÉMÉRÉ VALIDES"],
    },
    explication: "Tout ce qui est engagé à l'achat et pas encore servi.",
  },

  {
    libelle: "ACHATS MFR REALISES",
    nature: "poste",
    source: "operations",
    explication:
      "Exécutions d'achat sur titres cotés dont le dénouement tombe au plus tard à l'arrêté. Montant tous frais compris : courtage, TPS, commissions BRVM et DC/BR.",
  },
  {
    libelle: "ACHATS MTP REALISES",
    nature: "poste",
    source: "operations",
    explication:
      "Exécutions d'achat sur titres publics dénouées au plus tard à l'arrêté, frais compris.",
  },
  {
    libelle: "ACHATS REALISES",
    nature: "total",
    source: "calcul",
    composantes: { plus: ["ACHATS MFR REALISES", "ACHATS MTP REALISES"] },
    explication: "Les achats déjà dénoués sur la période.",
  },

  // LES VENTES VALIDÉES, que le classeur n'avait pas. Une vente passée et non
  // encore servie est un encaissement annoncé : ne pas la montrer laissait le
  // trésorier aveugle sur la moitié de ses ordres en cours.
  //
  // Elles N'ENTRENT PAS dans les soldes — ni réel ni théorique. Les achats
  // validés, eux, s'y retranchent : le point compte les sorties engagées et
  // ignore les entrées encore incertaines, ce qui est la prudence d'usage.
  // Les y ajouter changerait des soldes vérifiés ligne à ligne contre le
  // classeur, ce qui demande l'arbitrage du gérant.
  {
    libelle: "VENTES MFR VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Ventes de titres cotés passées et pas encore servies. Par prudence, elles n'entrent dans AUCUN des deux soldes : le point retient les sorties engagées et ignore les entrées encore incertaines.",
  },
  {
    libelle: "VENTES MTP VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Ventes de titres publics passées et pas encore servies. Comme les précédentes, elles n'entrent dans aucun des deux soldes.",
  },
  {
    libelle: "VENTES A RÉMÉRÉ VALIDES",
    nature: "poste",
    source: "operations",
    explication:
      "Ventes à réméré nouées et pas encore réglées : le fonds encaissera à la mise en place, et devra rendre ce cash au terme.",
  },
  {
    libelle: "VENTES VALIDES",
    nature: "total",
    source: "calcul",
    composantes: {
      plus: ["VENTES MFR VALIDES", "VENTES MTP VALIDES", "VENTES A RÉMÉRÉ VALIDES"],
    },
    explication:
      "Tout ce qui est engagé à la vente et pas encore servi. N'entre dans aucun des deux soldes.",
  },

  {
    libelle: "VENTES MFR REALISEES",
    nature: "poste",
    source: "operations",
    explication:
      "Exécutions de vente sur titres cotés dénouées au plus tard à l'arrêté, nettes de frais. Elles entrent dans le solde THÉORIQUE seulement : la formule du classeur ne les reprend pas au solde réel.",
  },
  {
    libelle: "VENTES MTP REALISEES",
    nature: "poste",
    source: "operations",
    explication:
      "Exécutions de vente sur titres publics dénouées au plus tard à l'arrêté, nettes de frais. C'est la seule ligne de vente que le solde réel reprend.",
  },
  {
    libelle: "VENTES REALISEES",
    nature: "total",
    source: "calcul",
    composantes: { plus: ["VENTES MFR REALISEES", "VENTES MTP REALISEES"] },
    explication: "Les ventes déjà dénouées sur la période. Reprises par le solde théorique.",
  },

  // Alimentée par les SOUSCRIPTIONS au marché primaire — adjudications et
  // syndications — tant qu'elles ne sont pas servies. Le classeur prévoyait la
  // ligne ; rien ne la remplissait.
  {
    libelle: "OPERATIONS MARCHÉ PRIMAIRE",
    nature: "poste",
    source: "operations",
    explication:
      "Soumissions au marché primaire — adjudications UMOA-Titres et syndications — retenues mais pas encore réglées. Le montant est celui qu'il faudra verser au règlement.",
  },
  {
    libelle: "RACHAT",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Rachats de parts demandés par les porteurs et restant à régler, saisis dans l'écran Souscriptions / rachats.",
  },
  // Calculés, jamais saisis : moyenne mensuelle de l'actif net × taux annuel
  // ÷ 12, le taux venant de la fiche du fonds et l'actif net de l'historique
  // de VL importé. Cf. `frais-gestion.ts`.
  {
    libelle: "FRAIS DE GESTION",
    nature: "poste",
    source: "calcul",
    explication:
      "Jamais saisis : moyenne mensuelle de l'actif net × taux annuel de la fiche du fonds ÷ 12. La moyenne porte sur les valorisations du mois présentes dans l'historique de VL. Le montant se pose sur le compte de prélèvement choisi sur la fiche du fonds.",
  },
  // LA CLEF DU CLASSEUR NOMME LE FLUX D'ENTRÉE, LA LIGNE PORTE CELUI DE
  // SORTIE. « REMERES_CASH_IN » désigne les rémérés qui ont fait ENTRER du
  // cash — les ventes à réméré — et c'est précisément pour cela qu'ils
  // figurent parmi les ENGAGEMENTS : ce cash encaissé devra être rendu en
  // rachetant les titres au terme.
  //
  // L'affichage disait l'inverse de l'effet, et cette ligne se lisait donc à
  // rebours. On garde la clef du classeur — elle sert à confronter les deux
  // tableaux — et l'intitulé dit désormais ce qui va se passer.
  {
    libelle: "REMERES_CASH_IN",
    affichage: "Rémérés — décaissements au dénouement",
    nature: "poste",
    source: "operations",
    explication:
      "Rémérés dont le terme tombe au plus tard à l'arrêté et qui avaient fait ENTRER du cash (ventes à réméré) : il faut le rendre en rachetant les titres, donc c'est une sortie. Ceux dont le terme est postérieur sont listés au-dessus du tableau et ne comptent pas encore.",
  },
  {
    libelle: "REMBOURSEMENT_SPOT",
    affichage: "Remboursement spot",
    nature: "poste",
    source: "saisie",
    explication:
      "Échéance d'un emprunt spot saisi dans « Opérations spot » : capital et intérêts à rembourser au plus tard à l'arrêté.",
  },
  // « AUTRES » tout court ne disait pas de quel côté du solde il tombe. Il est
  // dans le bloc des engagements : c'est une SORTIE.
  {
    libelle: "AUTRES",
    affichage: "Autres décaissements",
    nature: "poste",
    source: "saisie",
    explication:
      "Sorties saisies à la main dans « Flux saisis » — appel de marge, régularisation, commission exceptionnelle — et jambe débitée des nivellements. Rien ne les déduit, et rien ne les déduira : c'est leur définition, pas une lacune.",
  },
  {
    libelle: "AUTRES ENGAGEMENTS",
    nature: "total",
    source: "calcul",
    composantes: {
      plus: [
        "OPERATIONS MARCHÉ PRIMAIRE",
        "RACHAT",
        "FRAIS DE GESTION",
        "REMERES_CASH_IN",
        "REMBOURSEMENT_SPOT",
        "AUTRES",
      ],
    },
    explication:
      "Les sorties certaines qui ne sont pas des achats. Retranchée des deux soldes.",
  },

  {
    libelle: "SOUSCRIPTION BUREAU CI",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions de parts collectées par le bureau de Côte d'Ivoire et encore à encaisser.",
  },
  {
    libelle: "SOUSCRIPTION BUREAU SN",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions de parts collectées par le bureau du Sénégal et encore à encaisser.",
  },
  {
    libelle: "SOUSCRIPTION BUREAU BJ",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions de parts collectées par le bureau du Bénin et encore à encaisser.",
  },
  // Symétrique : les rémérés qui ont fait SORTIR du cash — les achats à
  // réméré — sont un cash À RECEVOIR, puisque le fonds revendra les titres au
  // terme. Même remarque sur la clef et l'intitulé.
  {
    libelle: "REMERES_CASH_OUT",
    affichage: "Rémérés — encaissements au dénouement",
    nature: "poste",
    source: "operations",
    explication:
      "Rémérés dont le terme tombe au plus tard à l'arrêté et qui avaient fait SORTIR du cash (achats à réméré) : la contrepartie rachète ses titres, le fonds encaisse.",
  },
  {
    libelle: "SPOT",
    nature: "poste",
    source: "saisie",
    explication:
      "Échéance d'un placement spot saisi dans « Opérations spot » : capital et intérêts à encaisser au plus tard à l'arrêté.",
  },
  {
    libelle: "AUTRES_CASH_A_RECEVOIR",
    affichage: "Autres encaissements",
    nature: "poste",
    source: "saisie",
    explication:
      "Entrées certaines saisies à la main dans « Flux saisis », et jambe créditée des nivellements.",
  },
  {
    libelle: "CASH A RECEVOIR",
    nature: "total",
    source: "calcul",
    composantes: {
      plus: [
        "SOUSCRIPTION BUREAU CI",
        "SOUSCRIPTION BUREAU SN",
        "SOUSCRIPTION BUREAU BJ",
        "REMERES_CASH_OUT",
        "SPOT",
        "AUTRES_CASH_A_RECEVOIR",
      ],
    },
    explication: "Les entrées certaines. Ajoutée au solde réel.",
  },

  // DEUX LIGNES RETIRÉES ICI ET PLUS BAS : « SOUSCRIPTION PRIMAIRE PROB. » et
  // « ENGAGEMENTS PROBABLES ». Le classeur les prévoyait, rien ne les a jamais
  // alimentées, et rien ne le fera — on soumissionne à une adjudication ou on
  // n'y soumissionne pas, il n'y a pas de souscription primaire probable ; et
  // le sous-total des engagements probables faisait doublon avec les flux
  // théoriques, qui retranchent déjà les sorties probables.
  {
    libelle: "RACHAT PROB.",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Rachats annoncés mais pas encore confirmés. Probables : ils ne pèsent que sur le solde théorique.",
  },
  {
    libelle: "AUTRES_FLUX_SORTANT",
    affichage: "Autres flux sortants",
    nature: "poste",
    source: "saisie",
    explication:
      "Sorties PROBABLES saisies à la main. Elles ne pèsent que sur le solde théorique.",
  },
  {
    libelle: "SOUSCRIPTION PROB. BUREAU CI",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions annoncées par le bureau de Côte d'Ivoire, pas encore confirmées. Solde théorique seulement.",
  },
  {
    libelle: "SOUSCRIPTION PROB. BUREAU SN",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions annoncées par le bureau du Sénégal, pas encore confirmées. Solde théorique seulement.",
  },
  {
    libelle: "SOUSCRIPTION PROB. BUREAU BJ",
    nature: "poste",
    source: "souscriptions",
    explication:
      "Souscriptions annoncées par le bureau du Bénin, pas encore confirmées. Solde théorique seulement.",
  },
  {
    libelle: "AUTRES_FLUX_ENTRANT",
    affichage: "Autres flux entrants",
    nature: "poste",
    source: "saisie",
    explication:
      "Entrées PROBABLES saisies à la main. Elles ne pèsent que sur le solde théorique.",
  },
  // TOUT CE QUE LES TITRES RAPPORTENT, SUR UNE SEULE LIGNE : coupons,
  // dividendes, amortissements et remboursements. Le compte de résultat
  // distingue le revenu du capital rendu ; le point de trésorerie, lui, ne
  // pose qu'une question — combien rentre, et quand. Deux lignes obligeaient
  // à les additionner de tête. Le détail vit dans le module ESV, nature par
  // nature, avec son échéancier et son pointage.
  //
  // ELLE RESTE DANS LES FLUX THÉORIQUES, à la place que le classeur lui
  // donne : ces encaissements sont certains dans leur principe, mais ils ne
  // sont ni engagés ni rapprochés, et le trésorier les lit comme une
  // prévision. Elle ne pèse donc que sur le solde théorique.
  {
    libelle: "DIVIDENDES/COUPONS",
    affichage: "Dividendes, coupons et tombées",
    nature: "poste",
    source: "esv",
    explication:
      "Coupons, dividendes, amortissements et remboursements échus au plus tard à l'arrêté, calculés par le module ESV depuis les titres détenus et les échéanciers du référentiel. Ils se posent tous sur le COMPTE DÉPOSITAIRE, qui est celui qui les encaisse. Le détail, titre par titre, est dans l'onglet ESV.",
  },
  {
    libelle: "FLUX THEORIQUES",
    affichage: "Flux théoriques",
    nature: "total",
    source: "calcul",
    composantes: {
      plus: [
        "SOUSCRIPTION PROB. BUREAU CI",
        "SOUSCRIPTION PROB. BUREAU SN",
        "SOUSCRIPTION PROB. BUREAU BJ",
        "AUTRES_FLUX_ENTRANT",
        "DIVIDENDES/COUPONS",
      ],
      moins: ["RACHAT PROB.", "AUTRES_FLUX_SORTANT"],
    },
    explication:
      "Le net des flux probables et des revenus de titres. N'entre que dans le solde théorique.",
  },

  {
    libelle: "SOLDEREEL",
    affichage: "Solde réel",
    nature: "solde",
    source: "calcul",
    composantes: {
      plus: ["SOLDE", "CASH A RECEVOIR", "VENTES MTP REALISEES"],
      moins: ["ACHATS VALIDES", "ACHATS REALISES", "AUTRES ENGAGEMENTS"],
    },
    explication:
      "Ce dont le fonds dispose vraiment une fois ses engagements honorés. Formule du classeur reprise telle quelle, y compris sa bizarrerie : elle n'ajoute que les ventes MTP réalisées, pas le sous-total des ventes réalisées. Les ventes MFR réalisées n'y entrent donc pas, alors que le solde théorique, lui, les prend.",
  },
  {
    libelle: "Solde réél en % de l'actif net",
    affichage: "Solde réel en % de l'actif net",
    nature: "pourcentage",
    source: "calcul",
    explication:
      "Solde réel cumulé sur TOUS les comptes ÷ actif net du fonds. Le ratio ne se ventile pas par banque — l'actif net n'est attribuable à aucun compte — donc seule la colonne Total est servie.",
  },
  {
    libelle: "SOLDETHEORIQUE",
    affichage: "Solde théorique",
    nature: "solde",
    source: "calcul",
    composantes: {
      plus: ["SOLDE", "VENTES REALISEES", "FLUX THEORIQUES"],
      moins: ["ACHATS VALIDES", "ACHATS REALISES", "AUTRES ENGAGEMENTS"],
    },
    explication:
      "Ce dont le fonds disposerait si tout ce qui est probable se réalisait. Il prend le sous-total des ventes réalisées et y ajoute les flux théoriques, là où le solde réel s'en tient au certain.",
  },
  {
    libelle: "Solde théorique en % de l'actif net",
    nature: "pourcentage",
    source: "calcul",
    explication:
      "Solde théorique cumulé sur tous les comptes ÷ actif net du fonds. Comme l'autre ratio, seule la colonne Total a un sens.",
  },
];

/** Intitulé à afficher pour une ligne. */
export const intitule = (l: DefinitionLigne): string => l.affichage ?? l.libelle;

/** Frais de gestion tels que le point les porte : le calcul, plus l'endroit
 *  où il se pose. */
export type FraisGestionPoint = FraisGestion & {
  /** Clef de l'établissement de prélèvement, choisi sur la fiche du fonds. */
  compte: string;
  /** Le montant est-il réellement entré dans une colonne ? Faux quand aucun
   *  compte n'est choisi — le calcul reste affiché, mais il ne grève rien. */
  applique: boolean;
};

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
  /** Le DÉTAIL des frais de gestion du poste homonyme : le mois retenu, la
   *  moyenne d'actif net et le nombre de valorisations qui la composent.
   *
   *  Un montant à huit chiffres qui tombe du ciel ne se vérifie pas. Celui-ci
   *  se recoupe : moyenne × taux ÷ 12, et l'on voit sur quoi la moyenne porte. */
  fraisGestion: FraisGestionPoint;
  /**
   * CE QUI COMPOSE CHAQUE MONTANT : poste, puis compte, puis les opérations.
   *
   * Le tableau est un tableau de sommes. « Deux milliards en achats MTP » ne
   * dit ni quel titre, ni quand, ni en combien de fois, et le gérant devait
   * ouvrir l'écran des opérations pour refaire l'addition. L'infobulle d'une
   * cellule montre désormais ses pièces.
   *
   * Une cellule absente de cette table n'a rien à montrer : un poste qui vaut
   * zéro, un solde bancaire — qui vient d'un relevé, pas d'opérations —, ou un
   * ratio. Les listes sont RÉSUMÉES au-delà de vingt-cinq lignes, le reste
   * regroupé sur une ligne de solde pour que le total reste juste.
   */
  details: Record<string, Record<string, DetailMontant[]>>;
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
  /** Flux SAISIS du fonds — les quatre lignes « autres ». Ils voyagent avec le
   *  point pour que le formulaire les montre sans les relire. */
  fluxSaisis: FluxManuel[];
  /** Opérations spot du fonds, dénouées comprises. */
  spots: Spot[];
  /** Nivellements entre comptes du fonds, rapprochés compris. */
  nivellements: Nivellement[];
  /** Calendrier ESV du fonds — coupons, dividendes et tombées. Il voyage avec
   *  le point pour que le bandeau des flux en retard s'affiche sans relire. */
  calendrierEsv: CalendrierEsv;
  /** Spots dont l'échéance tombe APRÈS l'arrêté : certains, mais pas encore
   *  comptés. Même traitement que les rémérés à venir. */
  spotsAVenir: {
    libelle: string;
    dateEcheance: string;
    montant: number;
    sens: SensSpot;
  }[];
  /** Rémérés noués, pas encore dénoués, dont le TERME tombe APRÈS la date
   *  d'arrêté. Leur flux ne compte pas encore — il n'aura pas eu lieu — mais
   *  il viendra, et un engagement qu'on ne voit pas venir se découvre trop
   *  tard. `sens` dit ce que le dénouement fera : encaisser ou décaisser. */
  remeresAVenir: {
    libelle: string;
    dateFin: string;
    montant: number;
    sens: "encaissement" | "décaissement";
  }[];
  /** Ordres dont la part non servie a EXPIRÉ avant la date d'arrêté. Ils ne
   *  pèsent plus — ils ne seront plus servis — mais leur disparition doit se
   *  voir : un engagement qui s'évapore en silence se cherche longtemps. */
  ordresPerimes: { libelle: string; dateLimite: string; montant: number }[];
};
