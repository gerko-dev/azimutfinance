// === Proposition d'allocation — types ===
//
// Optimisation moyenne-variance de la poche ACTIONS : maximiser la rentabilité
// espérée par unité de risque, sous contrainte de concentration.
//
// Ce n'est pas l'allocation validée. L'allocation validée est une DÉCISION du
// comité ; celle-ci est une PROPOSITION du modèle. Les deux se lisent côte à
// côte, et l'écart entre elles est précisément ce qui se discute.

/** Paramètres du modèle, tous modifiables par le gérant. */
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
  horizonVaR: 20,
  confianceVaR: 0.95,
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
