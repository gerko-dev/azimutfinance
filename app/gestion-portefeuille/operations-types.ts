// === Opérations à réaliser — types ===
//
// Les allocations validées disent OÙ aller ; ce module dit COMMENT y aller :
// quels titres vendre, lesquels acheter, en quelle quantité et à quel prix.
//
// Deux logiques distinctes, parce que les deux marchés ne se traitent pas de
// la même façon :
//
//   ACTIONS      l'axe « par titre » porte déjà une cible par valeur. Le
//                montant à réaliser se convertit directement en quantité au
//                cours de marché.
//
//   OBLIGATIONS  l'allocation est arrêtée par émetteur et par maturité, pas
//                par ligne. Le choix des titres à céder relève donc d'un
//                arbitrage : on sort d'abord les rendements les plus faibles,
//                et le produit finance une adjudication de l'État à renforcer.

export type SensOperation = "achat" | "vente";

/** Proposition sur une action cotée. */
export type OperationAction = {
  sens: SensOperation;
  code: string;
  libelle: string;
  secteur: string;
  /** Quantité détenue avant opération. */
  quantiteDetenue: number;
  /** Dernier cours coté, base du chiffrage. */
  cours: number;
  /** Prix limite conseillé pour passer l'ordre. */
  prixOptimal: number;
  /** Nombre de titres, toujours positif — le sens porte la direction. */
  quantite: number;
  /** Montant brut : quantité × prix optimal. */
  montant: number;
  /** Écart de poids qui motive l'opération, en points d'allocation. */
  ecart: number;
  /** Ce qui limite ou nuance la proposition. */
  reserve: string | null;
};

/** Ligne obligataire proposée à la cession. */
export type CessionObligation = {
  isin: string;
  code: string;
  libelle: string;
  emetteur: string;
  /** Poste d'allocation d'où sort la ligne. */
  poste: string;
  quantiteDetenue: number;
  /** Rendement actuariel courant, en décimal. C'est le critère de tri : on
   *  cède d'abord ce qui rapporte le moins. */
  rendement: number | null;
  couponRate: number;
  maturiteResiduelle: number | null;
  /** Cours retenu pour la cession, en FCFA par titre. */
  prixCession: number;
  /** Décote de cession = 1 − prix / nominal. Plus elle est faible, moins la
   *  sortie coûte. */
  decoteCession: number;
  nominalCourant: number;
  quantite: number;
  produitNet: number;
  /** D'où vient le prix : cote observée ou valorisation théorique. */
  sourcePrix: "cote" | "theorique" | "inventaire";
  reserve: string | null;
};

/** Emploi du produit des cessions : souscription à une adjudication. */
export type SouscriptionAdjudication = {
  etat: string;
  /** Maturité visée, en mois. */
  maturiteMois: number;
  /** Prix marginal moyen observé sur les dernières adjudications de cet État. */
  prixMarginalObserve: number | null;
  /** Prix proposé à la soumission. */
  prixPropose: number;
  /** Décote d'achat = 1 − prix proposé / nominal. Elle DOIT excéder la décote
   *  de cession, sinon l'arbitrage détruit de la valeur. */
  decoteAchat: number;
  /** Rendement attendu à ce prix, en décimal. */
  rendementAttendu: number | null;
  /** Montant mobilisable, issu des cessions. */
  montantDisponible: number;
  /** Nombre de titres souscrits à ce prix. */
  quantite: number;
  montant: number;
  /** Justification du prix proposé. */
  methode: string;
  reserve: string | null;
};

export type PlanOperations = {
  /** Achats d'actions, du plus gros montant au plus petit. */
  achatsActions: OperationAction[];
  ventesActions: OperationAction[];
  /** Cessions obligataires, des plus faibles rendements aux plus élevés. */
  cessionsObligations: CessionObligation[];
  souscriptions: SouscriptionAdjudication[];
  /** Produit total des cessions obligataires. */
  produitCessions: number;
  /** Montant total réemployé en souscriptions. */
  montantSouscrit: number;
  /** Décote moyenne pondérée des cessions et des achats : la comparaison qui
   *  valide ou invalide l'arbitrage d'ensemble. */
  decoteCessionMoyenne: number | null;
  decoteAchatMoyenne: number | null;
  arbitrageValide: boolean;
  dateInventaire: string | null;
  avertissements: string[];
};

/** Marge de négociation appliquée au dernier cours pour proposer un prix
 *  limite d'ordre sur actions. Le carnet BRVM est peu profond : passer au
 *  cours exact fait souvent manquer l'exécution. */
export const MARGE_PRIX_ACTION = 0.01;

/** Écart minimal exigé entre décote d'achat et décote de cession, en points de
 *  décote. En deçà, l'arbitrage ne couvre pas ses frais. */
export const ECART_DECOTE_MIN = 0.005;
