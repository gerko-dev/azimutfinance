// === Opérations ENTRE FONDS — types ===
//
// DEUX PORTEFEUILLES QUI SE CROISENT N'ONT PAS BESOIN DU MARCHÉ. Quand un
// fonds doit alléger SONATEL et qu'un autre doit le renforcer, les faire
// passer tous les deux par le carnet revient à payer deux fois le courtage,
// deux fois la fourchette, et à porter deux fois le risque d'exécution — pour
// un titre qui n'a jamais quitté la maison.
//
// CE MODULE NE FAIT QUE DÉSIGNER CES RENCONTRES. Il lit les allocations
// validées de tous les fonds gérés, repère les postes où l'un est au-dessus de
// sa cible pendant que l'autre est en dessous, et dit ce qui peut se céder de
// gré à gré. Rien n'est exécuté, rien n'est enregistré : l'ordre se saisit
// ensuite, fonds par fonds, dans le carnet — un transfert interne reste DEUX
// opérations de marché, une vente et un achat, et la conformité exige qu'elles
// se tracent comme telles.
//
// DEUX AXES, ET DEUX SEULEMENT, parce qu'eux seuls nomment un titre cessible :
//
//   action_titre          le poste EST le titre. Les deux fonds parlent de la
//                         même valeur, le prix est celui du marché.
//   obligation_emetteur   le poste est une signature. Toute ligne de cet
//                         émetteur détenue par le vendeur sert la cible de
//                         l'acheteur — mais pas forcément sa tranche de
//                         maturité, d'où la réserve portée sur la ligne.
//
// Les classes, les secteurs et les maturités ne désignent aucun titre : on n'y
// cède rien.

export type AxeInterfonds = "action_titre" | "obligation_emetteur";

export const LIBELLE_AXE_INTERFONDS: Record<AxeInterfonds, string> = {
  action_titre: "Actions",
  obligation_emetteur: "Obligations",
};

/** Un fonds, du côté où il se trouve sur ce poste. */
export type PartieInterfonds = {
  fondsId: string;
  fondsNom: string;
  /** Ce que son allocation lui demande sur ce poste, en valeur absolue :
   *  l'excédent à céder pour le vendeur, le besoin à couvrir pour l'acheteur. */
  montantVise: number;
  /** Ce que le poste pèse chez lui aujourd'hui. */
  valeurActuelle: number;
  /** Son allocation actuelle et sa cible, pour que la ligne s'explique seule. */
  allocationActuelle: number;
  allocationValidee: number | null;
};

/** Une cession de gré à gré proposée entre deux fonds gérés. */
export type AppariementInterfonds = {
  axe: AxeInterfonds;
  /** Ticker pour une action, émetteur pour une obligation. */
  poste: string;
  libelle: string;
  vendeur: PartieInterfonds;
  acheteur: PartieInterfonds;
  /** Montant apparié : le plus petit des deux besoins, borné par ce que le
   *  vendeur détient réellement. */
  montant: number;
  /** Cours retenu, et quantité correspondante. Null sur l'axe obligataire, où
   *  le poste ne désigne pas une ligne unique : la quantité se fixe sur la
   *  ligne choisie, à son prix. */
  cours: number | null;
  quantite: number | null;
  /** La ou les lignes du vendeur qui portent ce poste, la plus grosse d'abord.
   *  C'est ce qui rend l'ordre saisissable : un montant sans ISIN ne se passe
   *  pas. */
  lignes: { code: string; libelle: string; valorisation: number }[];
  /** Ce qui limite la proposition, en clair. Jamais une raison de ne pas
   *  l'afficher : c'est au gérant d'arbitrer. */
  reserves: string[];
};

export type PlanInterfonds = {
  appariements: AppariementInterfonds[];
  /** Fonds pris en compte, avec la date de l'inventaire qui les porte. Un
   *  fonds dont l'inventaire date d'un mois ne se compare pas aux autres sans
   *  qu'on le sache. */
  fonds: { id: string; nom: string; dateInventaire: string | null }[];
  /** Montant total appariable, tous postes confondus. */
  montantTotal: number;
  avertissements: string[];
};

/** En deçà, l'écart relève de l'arrondi de saisie, pas d'une décision. */
export const MONTANT_MINIMUM_INTERFONDS = 1_000_000;
