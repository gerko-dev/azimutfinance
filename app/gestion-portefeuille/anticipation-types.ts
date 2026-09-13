// === Anticipations de cours — types ===
//
// Cinq méthodes de valorisation, calculées en parallèle pour la MÊME valeur.
// Elles ne convergent pas, et c'est l'intérêt : l'écart entre elles dit ce que
// le marché price déjà et ce qu'il ignore. Le gérant retient celle qui
// convient au dossier, le tableau garde les autres sous les yeux.

export type MethodeCible =
  | "per"
  | "rendement"
  | "projection"
  | "technique"
  | "mix"
  | "annuelle";

export const METHODES: MethodeCible[] = [
  "annuelle",
  "per",
  "rendement",
  "projection",
  "technique",
  "mix",
];

export const LIBELLE_METHODE: Record<MethodeCible, string> = {
  annuelle: "Cible 31/12",
  per: "PER sectoriel",
  rendement: "Rendement du dividende",
  projection: "Projection de résultat",
  technique: "Analyse technique",
  mix: "Mix des méthodes",
};

export const EXPLICATION_METHODE: Record<MethodeCible, string> = {
  annuelle:
    "Cours au 31 décembre de l'année en cours. Trois composantes dont le poids dépend du TEMPS RESTANT : la saisonnalité résiduelle du titre (sa performance historique médiane entre cette date et le 31/12, calculée sur tout son historique), son momentum récent, et sa valeur fondamentale. En janvier la valeur fondamentale pèse le plus — un multiple a le temps de converger ; en décembre c'est la saisonnalité et le momentum qui décident, car rien ne converge en trois semaines. Les dividendes détachés d'ici la fin d'année sont retranchés : ils sortent mécaniquement du cours.",
  per: "Cours cible = BPA publié × PER médian du secteur. Ce que vaudrait le titre s'il traitait au multiple de ses comparables. Le PER médian du marché reste affiché en repère : un secteur très au-dessus ou au-dessous de la place déplace toutes ses cibles dans le même sens. Muette sur la croissance à venir.",
  rendement:
    "Cours cible = dividende par action ÷ rendement médian du marché. Ce que vaudrait le titre si son rendement s'alignait sur la place. Sans objet pour une valeur qui ne distribue pas.",
  projection:
    "Cours cible = BPA 2026 estimé × PER médian du secteur. Le BPA estimé reporte sur l'exercice le glissement annuel observé sur la dernière publication intermédiaire. Suppose que la tendance se prolonge.",
  technique:
    "Cours cible = moyenne mobile 200 séances ajustée de la tendance MM50/MM200. Ne dit rien de la valeur, seulement du mouvement : à utiliser sur un horizon court.",
  mix: "Moyenne des méthodes disponibles pour la valeur. Amortit l'erreur d'une méthode isolée, au prix d'un mélange d'horizons — un multiple de bénéfice et une moyenne mobile ne parlent pas du même temps.",
};

/** Une méthode appliquée à une valeur. */
export type CibleMethode = {
  /** Cours cible, ou null si la méthode n'est pas applicable à cette valeur. */
  cible: number | null;
  /** Potentiel par rapport au cours actuel, en décimal. */
  potentiel: number | null;
  /** Pourquoi la méthode ne s'applique pas, le cas échéant. */
  reserve: string | null;
};

export type AnticipationTitre = {
  code: string;
  libelle: string;
  secteur: string;
  /** Le fonds détient-il cette valeur ? */
  detenu: boolean;
  quantiteDetenue: number;
  valorisation: number;
  cours: number;
  // Données d'entrée, affichées pour que le calcul soit vérifiable
  bpa: number | null;
  per: number | null;
  /** Conservé en repère : un secteur très au-dessus ou au-dessous de la place
   *  déplace toutes ses cibles dans le même sens. N'entre pas dans le calcul. */
  perMedianMarche: number | null;
  /** Multiple de valorisation retenu par les méthodes PER et Projection. */
  perMedianSecteur: number | null;
  dpa: number | null;
  rendement: number | null;
  rendementMedianMarche: number | null;
  bpaProjete: number | null;
  periodeProjection: string | null;
  croissanceProjetee: number | null;
  mm50: number | null;
  mm200: number | null;
  // ── Entrées de la cible 31/12 ────────────────────────────────────────────
  /** Performance médiane du titre entre cette date et le 31/12, sur son
   *  historique. C'est la saisonnalité résiduelle, recalculée à chaque date. */
  saisonnaliteResiduelle: number | null;
  /** Nombre d'années observées. Une médiane sur 3 ans ne vaut pas une médiane
   *  sur 18 : l'effectif doit rester sous les yeux. */
  anneesObservees: number;
  /** Tendance récente annualisée sur la fraction d'année restante. */
  momentumResiduel: number | null;
  /** Dividendes détachés d'ici le 31/12, retranchés de la cible. */
  dividendeADetacher: number;
  cibles: Record<MethodeCible, CibleMethode>;
};

/** Projection du portefeuille au 31/12, confrontée à l'objectif du fonds. */
export type ProjectionFonds = {
  /** Fraction d'année restante, de 1 au 1er janvier à 0 au 31 décembre. */
  fractionRestante: number;
  joursRestants: number;
  /** Valorisation actions à l'inventaire. */
  valorisationActuelle: number;
  /** Valorisation actions projetée au 31/12, cibles appliquées. */
  valorisationProjetee: number;
  /** Performance de la poche actions d'ici la fin d'année. */
  performanceResiduelle: number | null;
  /** Poids de la poche actions dans l'actif net. La performance résiduelle ne
   *  contribue à la performance du fonds qu'à hauteur de ce poids : sans lui,
   *  un fonds diversifié serait projeté comme un fonds actions pur. */
  poidsActions: number | null;
  /** Part des lignes effectivement projetées : sans elle, une couverture
   *  partielle se lirait comme une projection complète. */
  couverture: number;
  /** Objectif annuel déclaré du fonds, en décimal. Null si non renseigné ou
   *  illisible. */
  objectifAnnuel: number | null;
  /** Performance déjà acquise depuis le 31/12 précédent, si la VL le permet. */
  performanceAcquise: number | null;
  /** Performance annuelle projetée = acquise + résiduelle. */
  performanceProjetee: number | null;
  /** Écart à l'objectif, en points. */
  ecartObjectif: number | null;
  avertissement: string | null;
};

export type TableauAnticipation = {
  titres: AnticipationTitre[];
  /** Médianes de marché servant de référence, affichées en tête. */
  perMedianMarche: number | null;
  rendementMedianMarche: number | null;
  /** Date des cours retenus — celle de l'inventaire, pour rester reproductible. */
  dateReference: string | null;
  /** Projection du portefeuille au 31/12 et écart à l'objectif. */
  projection: ProjectionFonds;
  avertissements: string[];
};

/**
 * Poids de la composante fondamentale dans la cible 31/12, selon le temps
 * restant.
 *
 * Un multiple de valorisation ne converge pas en trois semaines mais peut
 * parcourir une partie du chemin en dix mois. Le poids croît donc avec la
 * fraction d'année restante, plafonné : même sur une année pleine, supposer
 * une convergence totale serait présomptueux — le marché peut maintenir une
 * décote pendant des années.
 */
export const POIDS_FONDAMENTAL_MAX = 0.45;

/** Amortissement du momentum : on n'extrapole jamais linéairement une
 *  tendance, elle s'épuise. */
export const AMORTISSEMENT_MOMENTUM = 0.4;
