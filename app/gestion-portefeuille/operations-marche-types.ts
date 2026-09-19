// === Opérations de marché : types et calculs ===
//
// Reprend la feuille « Opérations de marché » du classeur de gestion. Une
// ligne = une opération ; le point de trésorerie les somme par poste, par
// compte de règlement et par date de dénouement.
//
// Les formules du classeur sont reproduites TELLES QUELLES, y compris leurs
// particularités : c'est la référence du gérant, et un écart silencieux entre
// le site et le classeur serait pire qu'un écart assumé.

/** Poste du point de trésorerie alimenté par l'opération. */
export type DescriptionOperation =
  | "ACHATS_MFR_VALIDES"
  | "ACHATS_MTP_VALIDES"
  | "ACHATS_A_REMERE_VALIDES"
  | "ACHATS_MFR_REALISES"
  | "ACHATS_MTP_REALISES"
  | "VENTES_MFR_REALISEES"
  | "VENTES_MTP_REALISEES";

/** Nature du titre. Gouverne le délai de dénouement. */
export type Instrument = "actions" | "obligations" | "mtp";

export type StatutOperation = "en_cours" | "ok" | "annule";

export type OperationMarche = {
  id: string;
  dateOperation: string;
  dateDenouement: string;
  description: DescriptionOperation;
  instrument: Instrument;
  code: string;
  libelle: string;
  quantite: number;
  prix: number;
  sgi: string;
  tauxCourtage: number;
  tauxTps: number;
  tauxBrvm: number;
  /** Commission du dépositaire central. Séparée de la commission BRVM depuis
   *  que les deux se configurent indépendamment ; leur SOMME entre dans le
   *  montant, donc une opération ancienne qui porte tout sur `tauxBrvm` garde
   *  exactement la même valeur. */
  tauxDcbr: number;
  interetsCourus: number;
  compteReglement: string;
  statut: StatutOperation;
  note: string;
  /** Calculé, jamais stocké — cf. la migration SQL. */
  montant: number;
};

export type SaisieOperation = Omit<OperationMarche, "id" | "montant">;

/**
 * Libellés d'écran, et LIBELLÉ DU POSTE correspondant dans le point de
 * trésorerie — qui est la clef de rapprochement, d'où l'orthographe exacte du
 * classeur, accent compris.
 */
/** Marché sur lequel l'opération se traite. Décide de la façon dont le titre
 *  se choisit : référentiel BRVM pour le MFR, titres publics par État pour le
 *  MTP, saisie libre pour le reste. */
export type Marche = "mfr" | "mtp" | "autre";

/** Instruments admis selon le marché. Un achat MFR porte sur une action ou une
 *  obligation cotée, jamais sur un titre public — et réciproquement. */
export const INSTRUMENTS_ADMIS: Record<Marche, Instrument[]> = {
  mfr: ["actions", "obligations"],
  mtp: ["mtp"],
  autre: ["actions", "obligations", "mtp"],
};

export const DESCRIPTIONS: {
  valeur: DescriptionOperation;
  libelle: string;
  poste: string;
  sens: "achat" | "vente";
  marche: Marche;
  instrumentSuggere: Instrument;
}[] = [
  {
    valeur: "ACHATS_MFR_VALIDES",
    libelle: "Achats MFR validés",
    poste: "ACHATS MFR VALIDES",
    sens: "achat",
    marche: "mfr",
    instrumentSuggere: "actions",
  },
  {
    valeur: "ACHATS_MTP_VALIDES",
    libelle: "Achats MTP validés",
    poste: "ACHATS MTP VALIDES",
    sens: "achat",
    marche: "mtp",
    instrumentSuggere: "mtp",
  },
  {
    valeur: "ACHATS_A_REMERE_VALIDES",
    libelle: "Achats à réméré validés",
    poste: "ACHATS A RÉMÉRÉ VALIDES",
    sens: "achat",
    marche: "autre",
    instrumentSuggere: "obligations",
  },
  {
    valeur: "ACHATS_MFR_REALISES",
    libelle: "Achats MFR réalisés",
    poste: "ACHATS MFR REALISES",
    sens: "achat",
    marche: "mfr",
    instrumentSuggere: "actions",
  },
  {
    valeur: "ACHATS_MTP_REALISES",
    libelle: "Achats MTP réalisés",
    poste: "ACHATS MTP REALISES",
    sens: "achat",
    marche: "mtp",
    instrumentSuggere: "mtp",
  },
  {
    valeur: "VENTES_MFR_REALISEES",
    libelle: "Ventes MFR réalisées",
    poste: "VENTES MFR REALISEES",
    sens: "vente",
    marche: "mfr",
    instrumentSuggere: "actions",
  },
  {
    valeur: "VENTES_MTP_REALISEES",
    libelle: "Ventes MTP réalisées",
    poste: "VENTES MTP REALISEES",
    sens: "vente",
    marche: "mtp",
    instrumentSuggere: "mtp",
  },
];

export const LIBELLES_INSTRUMENT: Record<Instrument, string> = {
  actions: "Actions",
  obligations: "Obligations et autres titres de créance",
  mtp: "Instruments du marché monétaire",
};

const PAR_DESCRIPTION = new Map(DESCRIPTIONS.map((d) => [d.valeur, d]));

/** Poste du point de trésorerie visé par cette description. */
export function posteDe(d: DescriptionOperation): string {
  return PAR_DESCRIPTION.get(d)?.poste ?? "";
}

/** Marché de l'opération : décide de la façon dont le titre se choisit. */
export function marcheDe(d: DescriptionOperation): Marche {
  return PAR_DESCRIPTION.get(d)?.marche ?? "autre";
}

/** Achat ou vente — c'est ce qui décide du SENS des frais. */
export function sensDe(d: DescriptionOperation): "achat" | "vente" {
  return PAR_DESCRIPTION.get(d)?.sens ?? "achat";
}

/**
 * Montant de l'opération, formule du classeur à l'identique.
 *
 *   achat : Q × P × (1 + tc + tc × tps + tbrvm) + courus
 *   vente : Q × P × (1 − tc − tc × tps − tbrvm) + courus
 *
 * DEUX POINTS QUI SURPRENNENT, ET QUI SONT VOULUS :
 *
 * 1. La TPS ne s'applique QU'AU COURTAGE (`tc × tps`), pas au montant brut :
 *    c'est une taxe sur la prestation de la SGI, pas sur la transaction.
 * 2. Les intérêts courus s'AJOUTENT dans les deux sens, y compris à la vente.
 *    Le vendeur d'une obligation encaisse le coupon couru en plus du prix ;
 *    les soustraire reviendrait à les lui faire payer.
 *
 * Les taux sont en décimal (0,004 = 0,4 %), comme dans le classeur.
 */
export function montantOperation(o: {
  description: DescriptionOperation;
  quantite: number;
  prix: number;
  tauxCourtage: number;
  tauxTps: number;
  tauxBrvm: number;
  tauxDcbr?: number;
  interetsCourus: number;
}): number {
  const brut = o.quantite * o.prix;
  // Les deux commissions de place s'AJOUTENT, comme le faisait le champ unique
  // du classeur : les separer ne change aucun montant, seulement la facon de
  // les reviser.
  const frais =
    o.tauxCourtage + o.tauxCourtage * o.tauxTps + o.tauxBrvm + (o.tauxDcbr ?? 0);
  const signe = sensDe(o.description) === "achat" ? 1 : -1;
  return brut * (1 + signe * frais) + o.interetsCourus;
}

/**
 * Jours fériés de la place, repris de la feuille « Étiquettes de données ».
 *
 * Liste FIGÉE et datée : elle couvre 2026 et le 1er janvier 2027. Au-delà, le
 * calcul du dénouement ne les connaîtra plus et proposera une date d'un jour
 * trop tôt. C'est pour cela que la date de dénouement reste MODIFIABLE dans le
 * formulaire — le calcul assiste la saisie, il n'en décide pas.
 */
export const JOURS_FERIES: readonly string[] = [
  "2026-01-01",
  "2026-03-21",
  "2026-03-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-08",
  "2026-05-10",
  "2026-05-31",
  "2026-07-12",
  "2026-07-24",
  "2026-08-13",
  "2026-09-28",
  "2026-11-01",
  "2026-12-02",
  "2027-01-01",
];

const FERIES = new Set(JOURS_FERIES);

function estOuvre(d: Date): boolean {
  const jour = d.getUTCDay();
  if (jour === 0 || jour === 6) return false;
  return !FERIES.has(d.toISOString().slice(0, 10));
}

/**
 * Date de dénouement, selon la convention du marché.
 *
 * La règle N'EST PLUS ÉCRITE ICI : elle vient des paramètres du gérant, qui
 * la configure par marché (Paramètres › Opérations de marché). Les conventions
 * de place changent par décision de la BRVM ou du DC/BR, et le gérant
 * l'apprend avant nous.
 *
 * Deux bases de comptage. En jours OUVRÉS, on avance d'abord puis on compte :
 * le jour de négociation ne compte pas, et les samedis, dimanches et jours
 * fériés sont sautés. En jours CALENDAIRES, on ajoute simplement les jours —
 * y compris zéro, qui rend alors la date de négociation telle quelle. C'est ce
 * que fait le classeur pour les titres publics, vérifié sur ses propres
 * lignes, y compris une opération du 30 avril 2026, qui est férié.
 */
export function dateDenouement(
  dateOperation: string,
  convention: { jours: number; base: "ouvres" | "calendaires" },
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOperation)) return dateOperation;
  const d = new Date(`${dateOperation}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateOperation;

  const jours = Number.isFinite(convention.jours) ? Math.max(0, convention.jours) : 0;
  if (jours === 0) return dateOperation;

  if (convention.base === "calendaires") {
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
  }

  let restant = jours;
  while (restant > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (estOuvre(d)) restant--;
  }
  return d.toISOString().slice(0, 10);
}
