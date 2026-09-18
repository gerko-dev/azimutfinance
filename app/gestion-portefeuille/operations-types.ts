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
  /** D'où vient le prix retenu. « theorique » est désormais la source
   *  NORMALE : la cote ne sert plus que de repli, faute de prix théorique
   *  calculable. */
  sourcePrix: "theorique" | "cote" | "inventaire" | "nominal";
  /** Rendement de la courbe souveraine ayant servi au prix théorique. */
  ytmTheorique: number | null;
  /** Effet de CETTE cession sur le rendement naturel de la poche obligataire,
   *  en points de base. Négatif quand on cède une ligne mieux rémunérée que la
   *  moyenne de la poche : on sacrifie du portage. */
  impactRendementBp: number | null;
  reserve: string | null;
};

/** Emploi du produit des cessions : souscription à une adjudication. */
export type SouscriptionAdjudication = {
  etat: string;
  /** Tenor annoncé par l'État, en mois : l'étiquette de la souche, figée à sa
   *  création et inchangée par les réabondements. */
  maturiteMois: number;
  /** Durée RÉSIDUELLE réellement achetée, en mois. Elle s'écarte du tenor dès
   *  que la souche visée a déjà été réabondée. C'est elle qui porte le prix. */
  residuelMois: number;
  /** Prix de référence pour 10 000 F de nominal (cf. `sourcePrixReference`). */
  prixMarginalObserve: number | null;
  /** « observe » : prix marginal réellement sorti à la dernière adjudication du
   *  même tenor, si elle date de moins de 45 jours — le cas normal, et le
   *  meilleur estimateur au backtest (erreur absolue médiane 28 F).
   *  « courbe » : repli quand l'État n'a rien adjugé récemment sur ce tenor —
   *  rendement interpolé sur sa courbe, corrigé de son écart marginal/moyen
   *  pondéré (65 F). Sans lui, le code retombait sur le prix plafond. */
  sourcePrixReference: "observe" | "courbe";
  /** Rendement porté par la référence : rendement moyen pondéré de la séance
   *  observée, ou rendement interpolé sur la courbe. */
  ytmCourbe: number | null;
  /** Date de l'adjudication servant de référence, et son ancienneté en jours.
   *  Null en repli sur la courbe. */
  dateObservation: string | null;
  ageObservation: number | null;
  /** Séance à venir visée, quand le calendrier UMOA-Titres en annonce une. */
  dateSeance: string | null;
  instrument: string | null;
  /** Prix proposé à la soumission. */
  prixPropose: number;
  /** Décote d'achat = 1 − prix proposé / nominal. Elle DOIT excéder la décote
   *  de cession, sinon l'arbitrage détruit de la valeur. */
  decoteAchat: number;
  /** Rendement attendu à ce prix, en décimal. */
  rendementAttendu: number | null;
  /** Coupon facial de la souche visée, en décimal. Repris de la dernière
   *  adjudication du ténor : une soumission se transmet au courtier avec son
   *  coupon, pas seulement avec son prix. */
  coupon: number | null;
  /** Montant mobilisable, issu des cessions. */
  montantDisponible: number;
  /** Nombre de titres souscrits à ce prix. */
  quantite: number;
  montant: number;
  /** Effet de CETTE souscription sur le rendement naturel de la poche
   *  obligataire, en points de base. Positif quand on achète au-dessus du
   *  rendement moyen de la poche. */
  impactRendementBp: number | null;
  /** Justification du prix proposé. */
  methode: string;
  reserve: string | null;
};

/**
 * Une cession et son emploi, mis FACE A FACE.
 *
 * L'appariement global — total des produits contre total des souscriptions —
 * laissait passer une cession dont la decote propre depassait celle de
 * l'achat, du moment que la moyenne s'en accommodait. Autrement dit : on
 * pouvait vendre a perte pourvu qu'une autre ligne compense. Le couple rend la
 * regle verifiable ligne a ligne, ce qui est la seule facon de tenir « je ne
 * vends que si je rachete avec une plus grosse decote ».
 */
export type PaireArbitrage = {
  cession: CessionObligation;
  /** Null quand aucune contrepartie n'atteint la marge exigee. */
  souscription: SouscriptionAdjudication | null;
  /** Decote d'achat moins decote de cession, en points de decote. */
  margeDecote: number | null;
  /** Effet NET de l'aller-retour sur le rendement naturel de la poche, en
   *  points de base : ce que la souscription apporte moins ce que la cession
   *  retire. Null quand la paire n'a pas de contrepartie. */
  impactNetBp: number | null;
  /** Pourquoi le couple n'a pas pu se former. */
  motifSansContrepartie: string | null;
};

export type PlanOperations = {
  /** Achats d'actions, du plus gros montant au plus petit. */
  achatsActions: OperationAction[];
  ventesActions: OperationAction[];
  /** Cessions obligataires, des plus faibles rendements aux plus élevés. */
  cessionsObligations: CessionObligation[];
  souscriptions: SouscriptionAdjudication[];
  /** Les mêmes opérations, appariées. C'est la vue de référence : les deux
   *  tableaux ci-dessus n'en sont que les projections. */
  pairesObligations: PaireArbitrage[];
  /** Produit total des cessions obligataires. */
  produitCessions: number;
  /** Montant total réemployé en souscriptions. */
  montantSouscrit: number;
  /** Décote moyenne pondérée des cessions et des achats : la comparaison qui
   *  valide ou invalide l'arbitrage d'ensemble. */
  decoteCessionMoyenne: number | null;
  decoteAchatMoyenne: number | null;
  arbitrageValide: boolean;
  /** Portage de la poche obligataire, avant et après le plan. */
  rendementNaturel: RendementNaturelObligataire;
  /** Ce que le plan referme réellement de l'écart d'allocation. Sans lui, rien
   *  ne disait si les opérations proposées atteignent la cible : il fallait
   *  additionner les tableaux à la main. */
  convergence: BilanConvergence;
  dateInventaire: string | null;
  avertissements: string[];
};

/** Écart d'allocation d'un poste, avant et après les opérations proposées. */
export type EcartPoste = {
  /** Code du poste : ticker pour une action, émetteur pour une obligation. */
  poste: string;
  axe: "action" | "obligation";
  /** Montant à réaliser lu dans le tableau d'allocation (signé : + renforcer,
   *  − alléger). */
  vise: number;
  /** Montant effectivement couvert par les opérations proposées, même signe. */
  couvert: number;
  /** Ce qui reste ouvert après application du plan. Non nul dès qu'un arrondi,
   *  un plafond de détention ou un manque de contrepartie a mordu. */
  residuel: number;
  /** Pourquoi le poste n'est pas entièrement couvert. Null s'il l'est. */
  motif: string | null;
};

export type BilanConvergence = {
  postes: EcartPoste[];
  /** Somme des |vise| et des |couvert|, tous axes confondus. */
  besoinTotal: number;
  couvertTotal: number;
  /** Part de l'écart d'allocation refermée par le plan, en décimal. Null quand
   *  il n'y a rien à faire. */
  tauxCouverture: number | null;
  /** Postes dont le résiduel dépasse le seuil de matérialité. */
  postesNonResolus: number;
};

/** En deçà, un résiduel d'allocation relève de l'arrondi et non d'un écart de
 *  gestion : un titre non acheté faute d'atteindre son prix unitaire. */
export const RESIDUEL_NEGLIGEABLE = 250_000;

/**
 * Marge de négociation appliquée au dernier cours pour proposer un prix limite
 * d'ordre sur actions : on achète 2,5 % SOUS le cours, on vend 2,5 % AU-DESSUS.
 *
 * Le sens est celui de la négociation, pas celui de l'exécution. Une version
 * antérieure faisait l'inverse — 1 % au-dessus à l'achat, 1 % en dessous à la
 * vente — pour maximiser les chances de passer dans un carnet BRVM peu profond.
 * Le choix retenu est l'autre : on renonce à une exécution certaine pour ne pas
 * payer la prime de l'empressement, et c'est au gérant de relancer si l'ordre
 * ne trouve pas sa contrepartie.
 *
 * Conséquence à connaître : à montant à réaliser donné, un prix d'achat plus
 * bas fait mécaniquement monter la quantité proposée.
 */
export const MARGE_PRIX_ACTION = 0.025;

/** Écart minimal exigé entre décote d'achat et décote de cession, en points de
 *  décote. En deçà, l'arbitrage ne couvre pas ses frais. */
export const ECART_DECOTE_MIN = 0.005;

/**
 * Rendement naturel de la poche obligataire : le portage encaissé sans rien
 * faire, moyenne des rendements actuariels pondérée par la valeur de marché.
 *
 * C'est la référence contre laquelle chaque opération se juge. Un arbitrage
 * peut très bien améliorer la décote — le seul critère que le module vérifiait
 * jusqu'ici — tout en abaissant le portage : céder une ligne à 7,5 % pour
 * souscrire à 6,8 % gagne sur le prix et perd sur le revenu. Les deux mesures
 * sont nécessaires, et elles ne disent pas la même chose.
 */
export type RendementNaturelObligataire = {
  /** Rendement moyen pondéré avant opérations, en décimal. */
  avant: number | null;
  /** Le même, après application du plan. Recalculé exactement. */
  apres: number | null;
  /** Écart, en points de base. Négatif = le plan détruit du portage. */
  deltaBp: number | null;
  valeurAvant: number;
  valeurApres: number;
  /** Lignes dont le rendement est calculable, sur le total de la poche. */
  lignesValorisees: number;
  lignesTotal: number;
  /** Part de la valeur de la poche couverte par l'assiette de calcul. En deçà
   *  de 90 %, les impacts sont indicatifs et un avertissement est émis. */
  couverture: number | null;
  /** Somme des effets marginaux ligne à ligne. */
  sommeImpactsBp: number;
  /** `deltaBp` − `sommeImpactsBp` : le terme du second ordre, publié plutôt que
   *  masqué. Il grandit avec la part de la poche que le plan déplace. */
  residuSecondOrdreBp: number | null;
};
