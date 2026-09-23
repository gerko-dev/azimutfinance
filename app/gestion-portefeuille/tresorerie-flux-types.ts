// === Flux saisis et opérations spot — types et calculs ===
//
// Ce fichier NE LIT RIEN : il est importé par des composants clients, et les
// lectures vivent dans `tresorerie-flux-data.ts`.
//
// DEUX NATURES, DEUX FORMULAIRES.
//
// Les « AUTRES » lignes sont des flux ISOLÉS : un appel de marge, une
// régularisation, une commission exceptionnelle. Rien ne les déduit, rien ne
// les déduira — c'est leur définition. Elles se saisissent une à une.
//
// Un SPOT, lui, n'est pas un flux : c'est une opération qui en produit deux —
// la mise en place, puis le dénouement à l'échéance, intérêts compris. Le
// saisir comme deux flux isolés aurait obligé à ne jamais se tromper sur leur
// cohérence, et à les corriger tous les deux quand l'échéance bouge.

/** Postes du point ouverts à la saisie directe. */
export type PosteFlux =
  | "AUTRES"
  | "AUTRES_CASH_A_RECEVOIR"
  | "AUTRES_FLUX_SORTANT"
  | "AUTRES_FLUX_ENTRANT";

/**
 * LE POSTE DIT LE SENS, et c'est pourquoi le montant reste positif.
 *
 * Chacune de ces quatre lignes tombe déjà d'un côté connu du solde : deux
 * s'ajoutent, deux se retranchent. Demander en plus un signe au gérant aurait
 * permis d'écrire un encaissement dans la ligne des décaissements — le tableau
 * aurait alors eu raison contre le bon sens, en silence.
 */
export const POSTES_FLUX: {
  cle: PosteFlux;
  libelle: string;
  sens: "entrant" | "sortant";
  aide: string;
}[] = [
  {
    cle: "AUTRES",
    libelle: "Autres décaissements",
    sens: "sortant",
    aide: "Sortie engagée, certaine — elle grève le solde réel.",
  },
  {
    cle: "AUTRES_CASH_A_RECEVOIR",
    libelle: "Autres encaissements",
    sens: "entrant",
    aide: "Entrée attendue, certaine — elle s'ajoute au solde réel.",
  },
  {
    cle: "AUTRES_FLUX_SORTANT",
    libelle: "Autres flux sortants",
    sens: "sortant",
    aide: "Sortie PROBABLE — elle ne joue que sur le solde théorique.",
  },
  {
    cle: "AUTRES_FLUX_ENTRANT",
    libelle: "Autres flux entrants",
    sens: "entrant",
    aide: "Entrée PROBABLE — elle ne joue que sur le solde théorique.",
  },
];

export const POSTES_FLUX_VALIDES = new Set<string>(POSTES_FLUX.map((p) => p.cle));

export const libellePoste = (cle: string): string =>
  POSTES_FLUX.find((p) => p.cle === cle)?.libelle ?? cle;

export type FluxManuel = {
  id: string;
  poste: PosteFlux;
  /** Clef d'établissement : la COLONNE du point. */
  compte: string;
  dateFlux: string;
  /** Toujours positif. Cf. `POSTES_FLUX`. */
  montant: number;
  libelle: string;
};

export type SaisieFluxManuel = Omit<FluxManuel, "id">;

// ── Opérations spot ────────────────────────────────────────────────────────

/** Sens du spot, du point de vue DU FONDS. */
export type SensSpot = "placement" | "emprunt";

export const LIBELLES_SENS_SPOT: Record<SensSpot, string> = {
  placement: "Placement — le fonds sort du cash et le récupérera majoré",
  emprunt: "Emprunt — le fonds encaisse et devra rembourser",
};

export type Spot = {
  id: string;
  sens: SensSpot;
  contrepartie: string;
  compte: string;
  montant: number;
  /** Taux ANNUEL en décimal. */
  taux: number;
  dateValeur: string;
  dateEcheance: string;
  /** Posée d'un bouton sur la ligne, le jour où le dénouement a lieu. Ne se
   *  saisit pas au formulaire : une date promise n'est pas une date. */
  dateDenouement: string | null;
  note: string;
};

export type SaisieSpot = Omit<Spot, "id" | "dateDenouement">;

/** Nombre de jours CALENDAIRES entre deux dates ISO. */
function joursEntre(debut: string, fin: string): number {
  const a = new Date(`${debut}T00:00:00Z`).getTime();
  const b = new Date(`${fin}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Intérêts d'un spot, BASE 360.
 *
 *     montant × taux × jours / 360
 *
 * Même convention que les prêts de titres, et pour la même raison : c'est
 * celle du marché monétaire UEMOA. Un calcul en base 365 donnerait ici un
 * écart de 1,4 % sur l'intérêt, systématiquement dans le même sens.
 */
export function interetSpot(s: {
  montant: number;
  taux: number;
  dateValeur: string;
  dateEcheance: string;
  dateDenouement: string | null;
}): number {
  // Le dénouement RÉEL prime sur l'échéance prévue : un spot repris deux jours
  // plus tôt n'a pas couru jusqu'au terme.
  const fin = s.dateDenouement ?? s.dateEcheance;
  const jours = joursEntre(s.dateValeur, fin);
  if (jours <= 0 || s.taux <= 0) return 0;
  return (s.montant * s.taux * jours) / 360;
}

/** Ce qui bougera au dénouement : le principal, majoré des intérêts. */
export const montantDenouementSpot = (s: Parameters<typeof interetSpot>[0]): number =>
  s.montant + interetSpot(s);

/**
 * Poste alimenté par le DÉNOUEMENT d'un spot.
 *
 * Inverse du sens de mise en place, comme pour un réméré : ce que le fonds a
 * placé lui revient (cash à recevoir), ce qu'il a emprunté sort (engagement).
 */
export const posteDenouementSpot = (sens: SensSpot): string =>
  sens === "placement" ? "SPOT" : "REMBOURSEMENT_SPOT";

/** Statut d'un spot, DÉDUIT : dénoué, ou pas. */
export const spotDenoue = (s: { dateDenouement: string | null }): boolean =>
  s.dateDenouement !== null;

// ── Nivellements entre comptes ─────────────────────────────────────────────
//
// UN NIVELLEMENT N'EST PAS UN FLUX, C'EST UN DÉPLACEMENT. L'argent ne quitte
// pas le fonds : il change de compte. Le solde consolidé ne bouge donc pas
// d'un franc — et c'est précisément ce qu'il faut vérifier.
//
// Il produit pourtant DEUX écritures, et c'est ce qui le rend juste : le
// compte qui envoie est grevé dans « Autres décaissements », celui qui reçoit
// est crédité dans « Autres encaissements ». L'un est retranché du solde réel,
// l'autre y est ajouté : ils se compensent exactement au total, tout en
// montrant où l'argent se trouve.
//
// DEUX RAPPROCHEMENTS, ET NON UN SEUL. Le débit et le crédit ne tombent pas le
// même jour : l'argent part aujourd'hui et arrive demain. Chaque jambe sort du
// point dès que le relevé de SA banque la contient. Entre les deux, le point
// affiche l'argent en transit — qui est la situation réelle.
//
// N'en tenir qu'un aurait forcé à choisir entre deux mensonges : faire
// disparaître les deux jambes quand l'argent n'est arrivé nulle part, ou les
// garder toutes deux quand il a déjà quitté le compte émetteur.

export type Nivellement = {
  id: string;
  compteSource: string;
  compteDestination: string;
  montant: number;
  dateNivellement: string;
  /** Constaté sur le relevé de la banque ÉMETTRICE. */
  rapprocheDebit: string | null;
  /** Constaté sur le relevé de la banque DESTINATAIRE. */
  rapprocheCredit: string | null;
  libelle: string;
};

export type SaisieNivellement = Omit<
  Nivellement,
  "id" | "rapprocheDebit" | "rapprocheCredit"
>;

/** Quelle jambe se rapproche. Le formulaire ne les confond pas : la date de
 *  débit et celle de crédit répondent à deux relevés différents. */
export type JambeNivellement = "debit" | "credit";

/** Postes alimentés par un nivellement. Ils ne se choisissent pas : le sens
 *  du déplacement les dicte. */
export const POSTE_NIVELLEMENT_DEBIT = "AUTRES";
export const POSTE_NIVELLEMENT_CREDIT = "AUTRES_CASH_A_RECEVOIR";

/**
 * État d'un nivellement, DÉDUIT de ses deux rapprochements.
 *
 *  - « annoncé »   : rien n'est encore passé en banque.
 *  - « en transit »: l'argent a quitté l'émetteur, il n'est pas arrivé. C'est
 *                    la seule phase où le nivellement n'est PAS neutre au
 *                    total, et c'est normal : le cash est effectivement dehors.
 *  - « bouclé »    : les deux relevés le portent, il sort du point.
 */
export function etatNivellement(n: {
  rapprocheDebit: string | null;
  rapprocheCredit: string | null;
}): "annonce" | "transit" | "boucle" {
  if (n.rapprocheDebit && n.rapprocheCredit) return "boucle";
  if (n.rapprocheDebit || n.rapprocheCredit) return "transit";
  return "annonce";
}

export const LIBELLES_ETAT_NIVELLEMENT: Record<
  ReturnType<typeof etatNivellement>,
  string
> = {
  annonce: "Annoncé",
  transit: "En transit",
  boucle: "Bouclé",
};
