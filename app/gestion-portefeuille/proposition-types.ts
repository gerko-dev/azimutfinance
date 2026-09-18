import type { MethodeCible } from "./anticipation-types";

// === Proposition d'allocation — types ===
//
// Optimisation moyenne-variance de la poche ACTIONS : maximiser la rentabilité
// espérée par unité de risque, sous contrainte de concentration.
//
// Ce n'est pas l'allocation validée. L'allocation validée est une DÉCISION du
// comité ; celle-ci est une PROPOSITION du modèle. Les deux se lisent côte à
// côte, et l'écart entre elles est précisément ce qui se discute.

/**
 * Provenance d'une hypothèse : ce qui la fixe, et à quelle valeur.
 *
 * Affichée à côté de chaque champ non saisissable. Sans elle, un montant qui
 * tombe du ciel invite à le corriger à la main — c'est précisément ce qu'on
 * cherche à empêcher.
 */
export type Origine = {
  /** Texte court : « allocation validée par classe d'actif », « BCEAO »… */
  source: string;
  /** Précision facultative : plafond réglementaire, années retenues… */
  detail?: string;
  /** L'hypothèse n'a pas pu être déduite ; la valeur affichée est un défaut. */
  manquante?: boolean;
};

/**
 * Trois façons d'estimer le rendement attendu de chaque valeur — et rien
 * d'autre ne change : la matrice de covariance, les plafonds réglementaires et
 * l'optimisateur sont les mêmes dans les trois cas. Ce qui se choisit ici,
 * c'est la source du rendement espéré, pas la mécanique.
 *
 *  medaf   Rf + β(Rm − Rf). Ne sait rien de chaque société, seulement de son
 *          exposition au marché. Robuste et sans opinion.
 *  cibles  Le potentiel des cours cibles de la méthode de valorisation
 *          retenue, dans « Analyse et anticipations de cours ». Porte une
 *          opinion sur chaque dossier, et hérite de ses erreurs.
 *  mixte   La moyenne des deux. Le MEDAF sert d'ancre quand une cible s'égare.
 */
export type MethodeOptimisation = "medaf" | "cibles" | "mixte";

export const METHODES_OPTIMISATION: MethodeOptimisation[] = ["medaf", "cibles", "mixte"];

export const LIBELLE_OPTIMISATION: Record<MethodeOptimisation, string> = {
  medaf: "MEDAF",
  cibles: "Cours cibles",
  mixte: "MEDAF + cours cibles",
};

export const EXPLICATION_OPTIMISATION: Record<MethodeOptimisation, string> = {
  medaf:
    "Rendement attendu = taux sans risque + bêta × prime de marché. Le modèle ne connaît de chaque valeur que sa sensibilité au marché : il ne peut ni se tromper sur un dossier, ni en tirer parti.",
  cibles:
    "Rendement attendu = potentiel du cours cible retenu, ramené à un an. Le modèle suit l'analyse fondamentale ligne à ligne — et se trompe exactement là où elle se trompe. Une valeur sans cible exploitable retombe sur son rendement MEDAF.",
  mixte:
    "Moyenne des deux rendements attendus. Une cible aberrante ne déplace plus l'allocation à elle seule, mais une conviction forte reste visible : c'est le compromis entre une estimation sans opinion et une opinion sans garde-fou.",
};

/** Paramètres du modèle. Seule la rentabilité minimale se saisit encore. */
export type ParametresProposition = {
  /** Montant à investir sur la poche actions, en FCFA. */
  montant: number;
  /** Taux sans risque de la PÉRIODE d'observation (hebdomadaire par défaut). */
  tauxSansRisque: number;
  /** Rendement espéré du marché sur la même période. */
  rendementMarche: number;
  /** Poids maximal d'une seule ligne. Sans plafond, l'optimisateur concentre
   *  tout sur deux ou trois valeurs et le portefeuille devient intenable. */
  partMax: number;
  /** Rentabilité annuelle visée par le fonds. Affichée en repère : le modèle
   *  ne la force pas, il dit si l'optimum la rejoint. */
  rentabiliteMinimale: number;
  /** Source des rendements attendus. */
  methode: MethodeOptimisation;
  /** Méthode de valorisation dont proviennent les cours cibles. */
  methodeValorisation: MethodeCible;
  /** Horizon de la VaR, en jours de bourse. */
  horizonVaR: number;
  /** Niveau de confiance de la VaR. */
  confianceVaR: number;
};

export const PARAMETRES_DEFAUT: ParametresProposition = {
  montant: 0,
  // Un taux sans risque ANNUEL de 7 % ramené à la semaine. Le comparer tel
  // quel à un rendement hebdomadaire de marché donnerait une prime négative
  // et inverserait tout le classement.
  tauxSansRisque: 0.07 / 52,
  rendementMarche: 0,
  partMax: 0.1,
  rentabiliteMinimale: 0.1,
  methode: "medaf",
  // Le mix des méthodes plutôt qu'une seule : c'est le défaut le moins
  // engageant, et celui que l'écran des anticipations met déjà en avant.
  methodeValorisation: "mix",
  horizonVaR: 20,
  confianceVaR: 0.95,
};

/** Origines des quatre hypothèses déduites, pour l'affichage. */
export type OriginesProposition = {
  montant: Origine;
  tauxSansRisque: Origine;
  rendementMarche: Origine;
  partMax: Origine;
};

export type LigneProposition = {
  code: string;
  libelle: string;
  secteur: string;
  /** Sensibilité au marché, estimée sur les rendements hebdomadaires. */
  beta: number;
  /** Rendement attendu par le MEDAF, sur la période d'observation. */
  rendementAttendu: number;
  /** Écart-type des rendements hebdomadaires. */
  volatilite: number;
  /** Nombre de rendements ayant servi à l'estimation. Une bêta sur 20 points
   *  ne vaut pas une bêta sur 150 : l'effectif doit rester sous les yeux. */
  observations: number;
  /** Poids proposé par l'optimisateur. */
  part: number;
  cours: number;
  /** Montant proposé = part × montant à investir. */
  montant: number;
  /** Nombre de titres correspondant, arrondi au titre entier. */
  nombre: number;
  /** Ce que le fonds détient déjà, d'après le dernier inventaire. */
  nombreDetenu: number;
  valorisationDetenue: number;
  /** Recommandation : positif = achat, négatif = vente. */
  ecartNombre: number;
  ecartMontant: number;
};

export type TableauProposition = {
  parametres: ParametresProposition;
  /** D'où vient chaque hypothèse déduite. */
  origines: OriginesProposition;
  lignes: LigneProposition[];
  /** Agrégats du portefeuille proposé. */
  rentabiliteEsperee: number;
  betaPortefeuille: number;
  volatilitePortefeuille: number;
  varPortefeuille: number;
  montantAlloue: number;
  /** Rentabilité espérée ANNUALISÉE, seule comparable à l'objectif du fonds. */
  rentabiliteAnnualisee: number;
  /** Valorisation actuelle de la poche actions, base de la comparaison. */
  valorisationActuelle: number;
  dateReference: string | null;
  /** Nombre de semaines d'historique commun retenues. */
  periodes: number;
  avertissements: string[];
};

/** Nombre de semaines de bourse dans une année — sert à annualiser. */
export const SEMAINES_PAR_AN = 52;

/** Quantile de la loi normale, pour la VaR. Deux niveaux suffisent : ce sont
 *  les seuls que la réglementation et l'usage retiennent. */
export function quantileNormal(p: number): number {
  if (p >= 0.99) return 2.326_347_9;
  return 1.644_853_6;
}
