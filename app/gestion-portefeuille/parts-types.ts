// === Souscriptions et rachats de parts : types et postes ===
//
// LE PASSIF DU FONDS, quand les opérations de marché en sont l'actif. Un
// investisseur qui souscrit apporte du cash ; un investisseur qui demande son
// rachat en retire. Ce sont les deux seuls flux que le gérant ne décide pas —
// il les subit, et c'est bien pourquoi le trésorier veut les voir venir.
//
// Le classeur avait déjà les lignes, toutes vides : souscriptions par bureau
// dans le cash à recevoir, rachats dans les engagements, et leurs jumelles
// « probables » dans les flux théoriques. Ce module les remplit.

/** Sens du flux, du point de vue du FONDS. */
export type SensPart = "souscription" | "rachat";

export const LIBELLES_SENS_PART: Record<SensPart, string> = {
  souscription: "Souscription — le fonds encaisse",
  rachat: "Rachat — le fonds décaisse",
};

/**
 * Bureau qui a collecté la souscription.
 *
 * Le classeur ventile les souscriptions par bureau et pas les rachats : c'est
 * une lecture COMMERCIALE — on veut savoir qui a collecté — et un rachat ne se
 * collecte pas.
 */
export type Bureau = "CI" | "SN" | "BJ";

export const LIBELLES_BUREAU: Record<Bureau, string> = {
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  BJ: "Bénin",
};

/**
 * CERTAIN ou PROBABLE, et la distinction est le cœur du tableau.
 *
 * Un ordre reçu et signé est certain : il pèse dans les soldes. Une intention
 * annoncée par un commercial ne l'est pas : elle vit dans les FLUX THÉORIQUES,
 * qui ne servent qu'au solde théorique. Mélanger les deux, c'est donner au
 * trésorier une trésorerie qu'il n'a pas.
 */
export type Certitude = "certain" | "probable";

export const LIBELLES_CERTITUDE: Record<Certitude, string> = {
  certain: "Certain — ordre reçu",
  probable: "Probable — annoncé, pas encore reçu",
};

/**
 * D'OÙ VIENT LE NOM DE L'INVESTISSEUR.
 *
 * Un CLIENT SENSIBLE se nomme une fois, au référentiel des partenaires, et se
 * choisit ensuite dans une liste. Saisi à la main sur chaque bordereau, son
 * nom divergeait d'une ligne à l'autre — « NSIA Vie », « NSIA-VIE », « Nsia
 * vie » — et tout regroupement par client devenait faux.
 *
 * Les AUTRES se saisissent librement : les inscrire au référentiel pour une
 * souscription unique l'encombrerait sans rien apporter.
 */
export type TypeClient = "sensible" | "autre";

export const LIBELLES_TYPE_CLIENT: Record<TypeClient, string> = {
  sensible: "Client sensible — choisi au référentiel",
  autre: "Autre client — saisi librement",
};

export type FluxPart = {
  id: string;
  dateOperation: string;
  sens: SensPart;
  /** Null sur un rachat : le classeur ne les ventile pas par bureau. */
  bureau: Bureau | null;
  certitude: Certitude;
  typeClient: TypeClient;
  /** Nom de l'investisseur : repris du référentiel, ou saisi librement. */
  investisseur: string;
  montant: number;
  /** Droit d'entrée ou de sortie appliqué, en DÉCIMAL.
   *
   *  Repris du fonds à la saisie, et modifiable : un gros souscripteur négocie
   *  son droit d'entrée, et figer celui du fonds aurait obligé à le corriger
   *  ailleurs — donc jamais. */
  tauxFrais: number;
  /**
   * VL DE SOUSCRIPTION : la date de valeur liquidative retenue pour convertir
   * le montant en parts.
   *
   * Elle se choisit parmi les VL PUBLIÉES du fonds, jamais à la main : une
   * date sans VL ne donne aucune part, et une VL retapée finit par diverger de
   * celle de l'historique. Vide tant qu'aucune n'a été retenue — un ordre reçu
   * avant la prochaine valorisation n'en a pas encore.
   */
  dateVl: string | null;
  /** VL à cette date. DÉDUITE de l'historique, jamais saisie. */
  vl: number | null;
  /**
   * PERFORMANCE CIBLE promise au souscripteur, en DÉCIMAL et par an.
   *
   * Ne concerne que les SOUSCRIPTIONS de CLIENTS SENSIBLES, et elle y est
   * obligatoire : c'est l'engagement pris à l'entrée, celui contre lequel le
   * client jugera le fonds et décidera de rester ou de sortir. Le laisser dans
   * la tête du commercial, c'est ne plus savoir, six mois plus tard, ce qui
   * avait été promis à qui.
   *
   * Null partout ailleurs : un autre client n'a pas de cible négociée, et un
   * rachat n'en promet aucune.
   */
  performanceCible: number | null;
  /**
   * DATE DE FIN convenue — la sortie prévue du client, s'il y en a une.
   *
   * Facultative : beaucoup de souscriptions n'ont pas d'échéance, et exiger
   * une date aurait poussé à en inventer une. Quand elle est renseignée, elle
   * FAIT FOI sur la date de rachat déduite des flux : c'est ce qui a été
   * convenu, et le rachat effectif peut tomber à un autre jour.
   *
   * Ne concerne, comme la cible, que les souscriptions de clients sensibles.
   */
  dateFin: string | null;
  compteReglement: string;
  /**
   * Date à laquelle le cash a bougé, ou null tant qu'il n'a pas bougé.
   *
   * ELLE NE SE SAISIT PAS AU FORMULAIRE. Un ordre reçu n'a pas de date de
   * règlement : elle s'apprend quand le mouvement passe. La promettre à la
   * saisie, c'était inscrire une date que rien ne garantissait, et faire
   * sortir le flux du point à un jour choisi d'avance.
   *
   * Tant qu'elle est nulle, le flux pèse. Une fois posée, le solde bancaire
   * saisi contient le mouvement et le flux sort du point.
   */
  dateReglement: string | null;
  note: string;
};

/** Ce que le formulaire envoie. Le RÈGLEMENT n'en fait pas partie : il a son
 *  propre geste, sur la ligne. */
export type SaisieFluxPart = Omit<FluxPart, "id" | "dateReglement">;

export type FluxPartAvecFonds = FluxPart & {
  fondsId: string;
  fondsNom: string;
};

/**
 * Poste du point de trésorerie alimenté par un flux.
 *
 * Quatre cas, et ce sont exactement les quatre lignes que le classeur avait
 * laissées vides :
 *
 *   souscription certaine  → SOUSCRIPTION BUREAU <XX>, dans « Cash à recevoir »
 *   souscription probable  → SOUSCRIPTION PROB. BUREAU <XX>, flux théoriques
 *   rachat certain         → RACHAT, dans « Autres engagements »
 *   rachat probable        → RACHAT PROB., retranché des flux théoriques
 *
 * Un bureau manquant sur une souscription la rendrait inclassable : on retient
 * alors la Côte d'Ivoire, siège de la société de gestion, plutôt que de laisser
 * le montant se perdre en silence.
 */
export function postePart(f: {
  sens: SensPart;
  bureau: Bureau | null;
  certitude: Certitude;
}): string {
  if (f.sens === "rachat") return f.certitude === "certain" ? "RACHAT" : "RACHAT PROB.";
  const b = f.bureau ?? "CI";
  return f.certitude === "certain"
    ? `SOUSCRIPTION BUREAU ${b}`
    : `SOUSCRIPTION PROB. BUREAU ${b}`;
}

/** Le flux pèse-t-il encore, à la date d'arrêté ? */
export function fluxPese(f: FluxPart, dateArrete: string | null): boolean {
  // RÉGLÉ à cette date-là, ou avant : le solde bancaire saisi contient déjà le
  // mouvement. L'y laisser le compterait deux fois.
  if (f.dateReglement && (!dateArrete || f.dateReglement <= dateArrete)) return false;
  // Ordre passé APRÈS l'arrêté : il n'existe pas encore pour lui.
  if (dateArrete && f.dateOperation > dateArrete) return false;
  return true;
}

/** Une performance cible se négocie-t-elle sur ce flux ? */
export function cibleAttendue(f: {
  sens: SensPart;
  typeClient: TypeClient;
}): boolean {
  return f.sens === "souscription" && f.typeClient === "sensible";
}

/** Montant des frais — droit d'entrée ou de sortie — sur ce flux. */
export function fraisPart(f: { montant: number; tauxFrais: number }): number {
  return f.montant * f.tauxFrais;
}

/**
 * Nombre de parts qu'un flux représente, à la VL retenue.
 *
 * Le montant qui achète des parts est celui qui reste UNE FOIS LES FRAIS
 * PRÉLEVÉS : un souscripteur qui verse 10 000 000 avec 2 % de droit d'entrée
 * n'investit que 9 800 000. Calculer les parts sur le montant brut les aurait
 * surestimées de tout le droit d'entrée.
 */
export function partsDuFlux(f: {
  montant: number;
  tauxFrais: number;
  vl: number | null;
}): number | null {
  if (!f.vl || f.vl <= 0) return null;
  return (f.montant - fraisPart(f)) / f.vl;
}
