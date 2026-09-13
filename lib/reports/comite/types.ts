// === Rapport du comité d'investissement — types ===
//
// La structure suit le template PowerPoint « Rapport du comité
// d'investissement — Analyse.pptx ». Les numéros de slide sont reportés en
// commentaire de chaque bloc : ils sont la référence de relecture du comité,
// et sans eux plus personne ne sait à quoi une section correspond.

/** Les trois bornes du rapport.
 *
 *  Le comité raisonne sur une période encadrée, pas sur un instantané :
 *  `debut` et `fin` bornent les variations, `intermediaire` donne le point de
 *  passage qui montre si le mouvement s'est fait en début ou en fin de période.
 *  Les mêmes trois bornes que les slots d'inventaire du module
 *  (cf. PortfolioSlot dans app/gestion-portefeuille/portfolio-types.ts).
 */
export type PeriodeRapport = {
  debut: string;
  intermediaire: string;
  fin: string;
};

/** Série d'un indice sur les trois bornes. Slides 42 et 43. */
export type LigneIndice = {
  code: string;
  libelle: string;
  niveauDebut: number | null;
  niveauIntermediaire: number | null;
  niveauFin: number | null;
  /** Variation début → fin, en %. */
  varPeriode: number | null;
  /** Variation depuis le 31/12 de l'exercice précédent, en %. */
  varYtd: number | null;
  /** Nombre de sociétés composant l'indice (colonne « Sociétés » du template). */
  nbSocietes: number | null;
};

/** Une valeur dans un classement de performance. Slides 44 et 45. */
export type LigneAction = {
  code: string;
  nom: string;
  secteur: string;
  pays: string;
  coursDebut: number | null;
  coursFin: number | null;
  varPeriode: number | null;
  varYtd: number | null;
};

/** Publications tombées dans la période. Slides 23 à 40. */
export type BlocPublications = {
  total: number;
  /** Regroupées par nature, chaque groupe trié par date. */
  parType: {
    type: string;
    libelle: string;
    lignes: { ticker: string; nom: string; date: string; exercice: string }[];
  }[];
};

/** Récapitulatif du compartiment obligataire coté. */
export type RecapObligations = {
  nbLignes: number;
  encoursTotal: number;
  couponMoyenPondere: number | null;
  maturiteMoyennePonderee: number | null;
  /** Nouveauté demandée : les dix plus fortes évolutions de cours. */
  topPeriode: LigneObligation[];
  topYtd: LigneObligation[];
};

export type LigneObligation = {
  isin: string;
  code: string;
  nom: string;
  emetteur: string;
  couponRate: number;
  coursDebut: number | null;
  coursFin: number | null;
  varPeriode: number | null;
  varYtd: number | null;
};

/** Marché des titres publics UMOA-Titres. Slides 49 à 54. */
export type RecapTitresPublics = {
  /** Millions de FCFA retenus sur la période, tous instruments. */
  montantRetenuTotal: number;
  nbOperations: number;
  parPays: {
    code: string;
    nom: string;
    montantRetenu: number;
    poids: number;
    tauxMoyenPondere: number | null;
    prixMarginalMoyen: number | null;
    tauxAbsorption: number | null;
  }[];
  parMaturite: {
    mois: number;
    montantRetenu: number;
    tauxMoyenPondere: number | null;
    tauxAbsorption: number | null;
  }[];
  /** Les BAT sont suivis à part : zéro-coupon, maturités courtes. Slides 53-54. */
  bat: {
    montantRetenu: number;
    tauxAbsorptionMoyen: number | null;
    parMaturite: { mois: number; tauxMoyenPondere: number | null }[];
    parPays: { code: string; nom: string; tauxMoyenPondere: number | null; tauxAbsorption: number | null }[];
  };
  tauxAbsorptionGlobal: number | null;
  prixMarginalMoyenGeneral: number | null;
};

/** Performances du marché des OPCVM par catégorie. Slides 56 à 58. */
export type LigneOpcvm = {
  categorie: string;
  nbFonds: number;
  /** Niveau de risque publié le plus fréquent de la catégorie, null si aucune
   *  société de gestion ne le publie pour ces fonds. */
  niveauRisque: number | null;
  performanceMoyenne: number | null;
  top3: { nom: string; gestionnaire: string; performance: number }[];
};

/** Anticipation du marché des actions. Section nouvelle, hors template. */
export type AnticipationActions = {
  /** Médianes de marché qui servent de référence aux écarts. */
  perMedianMarche: number | null;
  rendementMedianMarche: number | null;
  lignes: LigneAnticipationAction[];
  methode: string;
};

export type LigneAnticipationAction = {
  code: string;
  nom: string;
  secteur: string;
  cours: number;
  per: number | null;
  rendement: number | null;
  /** Écart du PER à la médiane du secteur, en %. Négatif = moins cher. */
  ecartPerSecteur: number | null;
  /** Cours rapporté à sa moyenne mobile 50 séances, en %. */
  momentum: number | null;
  /** Somme des signaux élémentaires, bornée à [-3, +3]. */
  score: number;
  signal: "sous-évalué" | "neutre" | "sur-évalué";
  /** Ce qui a fait le score, en clair. Un score sans justification n'est pas
   *  défendable devant un comité. */
  motifs: string[];
};

/** Anticipation des rendements obligataires. Section nouvelle, hors template. */
export type AnticipationObligations = {
  methode: string;
  /** Fenêtre d'observation réellement utilisée. */
  fenetre: { debut: string; fin: string; nbAdjudications: number };
  bandes: BandeAnticipation[];
  /** Lecture d'ensemble : pente moyenne pondérée par les montants retenus. */
  tendanceGlobaleBpsParMois: number | null;
  commentaire: string;
};

export type BandeAnticipation = {
  libelle: string;
  /** Bornes de maturité en mois, incluses. */
  bornes: [number, number];
  nbObservations: number;
  tauxMoyenDebut: number | null;
  tauxMoyenFin: number | null;
  /** Pente de la régression linéaire, en points de base par mois. */
  penteBpsParMois: number | null;
  /** Coefficient de détermination de la régression, 0 à 1. Sous 0,3 la pente
   *  ne décrit pas grand-chose et la projection ne doit pas être lue. */
  r2: number | null;
  /** Projection à 3 mois, en décimal. Null si la régression est trop faible. */
  projection3Mois: number | null;
  /** Taux d'absorption moyen : signal de pression de la demande. */
  tauxAbsorption: number | null;
};

/** Le rapport complet. */
export type RapportComite = {
  periode: PeriodeRapport;
  genereLe: string;
  indicesPrincipaux: LigneIndice[];
  indicesSectoriels: LigneIndice[];
  top10: LigneAction[];
  flop10: LigneAction[];
  publications: BlocPublications;
  obligationsCotees: RecapObligations;
  titresPublics: RecapTitresPublics;
  opcvm: LigneOpcvm[];
  anticipationActions: AnticipationActions;
  anticipationObligations: AnticipationObligations;
  /** Sections dont les données manquent sur la période demandée. Affichées
   *  telles quelles dans le PDF : un comité doit voir ce qui manque, pas
   *  recevoir un tableau vide sans explication. */
  avertissements: string[];
};
