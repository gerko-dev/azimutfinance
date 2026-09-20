// === Opérations de marché : types et calculs ===
//
// Un ORDRE, et ses EXÉCUTIONS.
//
// L'ordre porte une intention : acheter ou vendre tant de titres, à tel prix,
// sur tel marché. Il pèse sur la trésorerie tant qu'il peut être servi. Chaque
// exécution en sert une part, à sa date, et c'est elle qui se dénoue — un
// ordre non servi n'a rien à régler.
//
// Les formules du classeur sont reproduites TELLES QUELLES, y compris leurs
// particularités : c'est la référence du gérant, et un écart silencieux entre
// le site et le classeur serait pire qu'un écart assumé.

/** Nature d'un ordre : un sens, un marché. */
export type DescriptionOperation =
  | "ACHAT_MFR"
  | "ACHAT_MTP"
  | "VENTE_MFR"
  | "VENTE_MTP";

/** Nature du titre. Gouverne le délai de dénouement. */
export type Instrument = "actions" | "obligations" | "mtp";

/** Marché sur lequel l'ordre se traite. Décide de la façon dont le titre se
 *  choisit, et des instruments admis. */
export type Marche = "mfr" | "mtp";

/** Instruments admis selon le marché. Un ordre MFR porte sur une action ou une
 *  obligation cotée, jamais sur un titre public — et réciproquement. */
export const INSTRUMENTS_ADMIS: Record<Marche, Instrument[]> = {
  mfr: ["actions", "obligations"],
  mtp: ["mtp"],
};

/** Durée de vie d'un ordre au carnet. Marché financier uniquement : une
 *  adjudication de titres publics est servie ou ne l'est pas. */
export type Validite = "jour" | "revocation90";

export const LIBELLES_VALIDITE: Record<Validite, string> = {
  jour: "Jour — sort le jour même",
  revocation90: "Révocation 90 jours",
};

/** Nombre de jours calendaires pendant lesquels l'ordre reste au carnet.
 *
 *  Zéro pour un ordre « jour » : il vaut pour la séance et sort du point le
 *  jour même — passé ce jour, il ne sera plus servi et n'engage plus rien. */
export const JOURS_VALIDITE: Record<Validite, number> = {
  jour: 0,
  revocation90: 90,
};

/** État d'un ordre. DÉDUIT des quantités servies, jamais saisi. */
export type EtatOrdre = "en_cours" | "partiel" | "realise" | "perime" | "cloture";

export const LIBELLES_ETAT: Record<EtatOrdre, string> = {
  en_cours: "En cours",
  partiel: "Partiellement servi",
  realise: "Réalisé",
  perime: "Périmé",
  cloture: "Clôturé",
};

/** Une part servie d'un ordre, à sa date. */
export type Execution = {
  id: string;
  dateExecution: string;
  dateDenouement: string;
  quantite: number;
  /** Date à laquelle le règlement a été constaté SUR LE RELEVÉ bancaire.
   *
   *  Une fois rapprochée, l'exécution sort des postes de flux : le solde
   *  bancaire saisi la contient déjà, et l'y laisser la compterait deux fois.
   *  C'est un lettrage, pas une annulation. */
  rapprocheLe: string | null;
  /** Prix RÉELLEMENT servi. Un ordre à cours limité est rarement exécuté au
   *  centime près à sa limite, et un ordre servi en plusieurs fois l'est
   *  souvent à plusieurs prix.
   *
   *  Zéro signifie « prix de l'ordre » : c'est ce que valent les exécutions
   *  enregistrées avant que ce champ n'existe. */
  prix: number;
  note: string;
};

export type SaisieExecution = Omit<Execution, "id">;

export type OperationMarche = {
  id: string;
  dateOperation: string;
  description: DescriptionOperation;
  instrument: Instrument;
  validite: Validite;
  code: string;
  libelle: string;
  quantite: number;
  prix: number;
  sgi: string;
  tauxCourtage: number;
  tauxTps: number;
  tauxBrvm: number;
  tauxDcbr: number;
  interetsCourus: number;
  compteReglement: string;
  /** Date de CLÔTURE manuelle, ou null tant que l'ordre est ouvert.
   *
   *  Un ordre partiellement servi que le gérant renonce à faire exécuter cesse
   *  d'engager la trésorerie pour sa part restante. Ce qui a été servi reste :
   *  il a été réglé, ou le sera. La péremption fait cela automatiquement ; la
   *  clôture le fait à la main, avant terme. */
  clotureLe: string | null;
  note: string;
  /** Les parts servies, de la plus ancienne à la plus récente. */
  executions: Execution[];
  /** Calculé, jamais stocké — cf. la migration SQL. Porte la quantité
   *  ORDONNÉE : c'est le montant de l'ordre, pas de ce qui en a été servi. */
  montant: number;
};

/** Ce que le formulaire d'un ordre envoie. La CLÔTURE n'en fait pas partie :
 *  elle a son propre geste, sur la ligne, et la mêler à la correction aurait
 *  permis de clore un ordre par inadvertance en corrigeant son prix. */
export type SaisieOperation = Omit<
  OperationMarche,
  "id" | "montant" | "executions" | "clotureLe"
>;

/**
 * Libellés d'écran, et LIBELLÉS DES POSTES du point de trésorerie.
 *
 * Deux postes par nature : celui qui porte l'engagement tant que l'ordre n'est
 * pas servi, celui qui porte le règlement une fois qu'il l'est.
 *
 * Une VENTE n'a pas de poste d'engagement : le classeur n'en a pas. Une vente
 * non exécutée ne fait rien entrer en caisse, donc elle n'a rien à y annoncer.
 */
export const DESCRIPTIONS: {
  valeur: DescriptionOperation;
  libelle: string;
  marche: Marche;
  sens: "achat" | "vente";
  /** Poste portant la part NON servie. Null pour une vente. */
  posteEngage: string | null;
  /** Poste portant la part servie. */
  posteRealise: string;
  instrumentSuggere: Instrument;
}[] = [
  {
    valeur: "ACHAT_MFR",
    libelle: "Achat MFR",
    marche: "mfr",
    sens: "achat",
    posteEngage: "ACHATS MFR VALIDES",
    posteRealise: "ACHATS MFR REALISES",
    instrumentSuggere: "actions",
  },
  {
    valeur: "ACHAT_MTP",
    libelle: "Achat MTP",
    marche: "mtp",
    sens: "achat",
    posteEngage: "ACHATS MTP VALIDES",
    posteRealise: "ACHATS MTP REALISES",
    instrumentSuggere: "mtp",
  },
  {
    valeur: "VENTE_MFR",
    libelle: "Vente MFR",
    marche: "mfr",
    sens: "vente",
    posteEngage: null,
    posteRealise: "VENTES MFR REALISEES",
    instrumentSuggere: "actions",
  },
  {
    valeur: "VENTE_MTP",
    libelle: "Vente MTP",
    marche: "mtp",
    sens: "vente",
    posteEngage: null,
    posteRealise: "VENTES MTP REALISEES",
    instrumentSuggere: "mtp",
  },
];

export const LIBELLES_INSTRUMENT: Record<Instrument, string> = {
  actions: "Actions",
  obligations: "Obligations et autres titres de créance",
  mtp: "Instruments du marché monétaire",
};

const PAR_DESCRIPTION = new Map(DESCRIPTIONS.map((d) => [d.valeur, d]));

/** Marché de l'ordre : décide de la façon dont le titre se choisit. */
export function marcheDe(d: DescriptionOperation): Marche {
  return PAR_DESCRIPTION.get(d)?.marche ?? "mfr";
}

/** Achat ou vente — c'est ce qui décide du SENS des frais. */
export function sensDe(d: DescriptionOperation): "achat" | "vente" {
  return PAR_DESCRIPTION.get(d)?.sens ?? "achat";
}

/** Poste portant la part non servie, ou null pour une vente. */
export function posteEngage(d: DescriptionOperation): string | null {
  return PAR_DESCRIPTION.get(d)?.posteEngage ?? null;
}

/** Poste portant la part servie. */
export function posteRealise(d: DescriptionOperation): string {
  return PAR_DESCRIPTION.get(d)?.posteRealise ?? "";
}

/**
 * Montant de l'opération, formule du classeur à l'identique.
 *
 *   achat : Q × P × (1 + tc + tc × tps + tbrvm + tdcbr) + courus
 *   vente : Q × P × (1 − tc − tc × tps − tbrvm − tdcbr) + courus
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
  // du classeur : les séparer ne change aucun montant, seulement la façon de
  // les réviser.
  const frais =
    o.tauxCourtage + o.tauxCourtage * o.tauxTps + o.tauxBrvm + (o.tauxDcbr ?? 0);
  const signe = sensDe(o.description) === "achat" ? 1 : -1;
  return brut * (1 + signe * frais) + o.interetsCourus;
}

/**
 * Montant d'une EXÉCUTION, au prix réellement servi.
 *
 * Les taux sont ceux de l'ordre — ils se négocient avec la SGI, pas séance par
 * séance. Les intérêts courus, eux, sont portés par l'ordre pour sa totalité :
 * on en prend la part correspondant à la quantité servie, sans quoi un ordre
 * servi en trois fois compterait trois fois ses courus.
 */
export function montantExecution(
  o: Pick<
    OperationMarche,
    | "description"
    | "quantite"
    | "prix"
    | "tauxCourtage"
    | "tauxTps"
    | "tauxBrvm"
    | "tauxDcbr"
    | "interetsCourus"
  >,
  e: { quantite: number; prix: number },
): number {
  return montantOperation({
    description: o.description,
    quantite: e.quantite,
    prix: e.prix > 0 ? e.prix : o.prix,
    tauxCourtage: o.tauxCourtage,
    tauxTps: o.tauxTps,
    tauxBrvm: o.tauxBrvm,
    tauxDcbr: o.tauxDcbr,
    interetsCourus:
      o.quantite > 0 ? (o.interetsCourus * e.quantite) / o.quantite : 0,
  });
}

/**
 * Montant de la part NON SERVIE, au prix de l'ordre.
 *
 * C'est le bon prix pour un engagement : tant que rien n'est servi, c'est au
 * cours ordonné que le gérant s'attend à payer.
 */
export function montantRestant(o: OperationMarche): number {
  const reste = quantiteRestante(o);
  if (reste <= 0) return 0;
  return montantOperation({
    description: o.description,
    quantite: reste,
    prix: o.prix,
    tauxCourtage: o.tauxCourtage,
    tauxTps: o.tauxTps,
    tauxBrvm: o.tauxBrvm,
    tauxDcbr: o.tauxDcbr,
    interetsCourus: o.quantite > 0 ? (o.interetsCourus * reste) / o.quantite : 0,
  });
}

/** Quantité servie, toutes exécutions confondues. */
export function quantiteExecutee(o: { executions: Execution[] }): number {
  return o.executions.reduce((s, e) => s + e.quantite, 0);
}

/** Part de l'ordre qui n'a pas encore été servie. */
export function quantiteRestante(o: {
  quantite: number;
  executions: Execution[];
}): number {
  return Math.max(0, o.quantite - quantiteExecutee(o));
}

/**
 * Date au-delà de laquelle un ordre ne pèse plus sur la trésorerie.
 *
 * Un ordre « jour » sort le jour même — passé cette date, il ne sera plus
 * servi et n'engage plus rien. Un ordre à révocation tient quatre-vingt-dix
 * jours.
 */
export function dateLimiteOrdre(o: {
  dateOperation: string;
  validite: Validite;
}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dateOperation)) return o.dateOperation;
  const d = new Date(`${o.dateOperation}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return o.dateOperation;
  d.setUTCDate(d.getUTCDate() + JOURS_VALIDITE[o.validite]);
  return d.toISOString().slice(0, 10);
}

/**
 * État d'un ordre, DÉDUIT de ses exécutions.
 *
 * Le saisir à la main aurait créé un troisième état : celui où la colonne dit
 * une chose et les quantités une autre.
 *
 * `aLaDate` permet de juger la péremption au jour où l'on regarde — le point
 * de trésorerie se lit à une date d'arrêté, pas forcément aujourd'hui.
 */
export function etatOrdre(
  o: {
    quantite: number;
    dateOperation: string;
    validite: Validite;
    clotureLe: string | null;
    executions: Execution[];
  },
  aLaDate?: string | null,
): EtatOrdre {
  const servie = quantiteExecutee(o);
  if (servie >= o.quantite) return "realise";
  // La clôture prime sur la péremption : elle est un choix du gérant, et
  // l'afficher comme « périmé » effacerait ce choix.
  if (o.clotureLe) return "cloture";
  const jour = aLaDate ?? new Date().toISOString().slice(0, 10);
  if (dateLimiteOrdre(o) < jour) return "perime";
  return servie > 0 ? "partiel" : "en_cours";
}

/**
 * La part non servie de cet ordre pèse-t-elle encore, à la date d'arrêté ?
 *
 * Trois façons de ne plus peser, et une seule fonction pour les dire : sinon
 * l'écran et le calcul finissent par ne plus être d'accord sur ce qui compte.
 */
export function partRestantePese(
  o: {
    dateOperation: string;
    validite: Validite;
    clotureLe: string | null;
    quantite: number;
    executions: Execution[];
  },
  dateArrete: string | null,
): boolean {
  if (quantiteRestante(o) <= 0) return false;
  if (!dateArrete) return true;
  // Un ordre passé APRÈS la date d'arrêté n'existe pas encore pour elle.
  if (o.dateOperation > dateArrete) return false;
  // Clôturé à cette date-là, ou avant.
  if (o.clotureLe && o.clotureLe <= dateArrete) return false;
  // Périmé.
  if (dateLimiteOrdre(o) < dateArrete) return false;
  return true;
}

/**
 * Jours fériés de la place, repris de la feuille « Étiquettes de données ».
 *
 * Liste FIGÉE et datée : elle couvre 2026 et le 1er janvier 2027. Au-delà, le
 * calcul du dénouement ne les connaîtra plus et proposera une date d'un jour
 * trop tôt. C'est pour cela que la date de dénouement reste MODIFIABLE à la
 * saisie d'une exécution — le calcul assiste, il ne décide pas.
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
 * Date de dénouement d'une EXÉCUTION, selon la convention du marché.
 *
 * La règle n'est pas écrite ici : elle vient des paramètres du gérant, qui la
 * configure par marché (Paramètres › Opérations de marché). Les conventions de
 * place changent par décision de la BRVM ou du DC/BR, et le gérant l'apprend
 * avant nous.
 *
 * Deux bases de comptage. En jours OUVRÉS, on avance d'abord puis on compte :
 * le jour d'exécution ne compte pas, et les samedis, dimanches et jours fériés
 * sont sautés. En jours CALENDAIRES, on ajoute simplement les jours — y
 * compris zéro, qui rend alors la date d'exécution telle quelle.
 */
export function dateDenouement(
  dateExecution: string,
  convention: { jours: number; base: "ouvres" | "calendaires" },
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateExecution)) return dateExecution;
  const d = new Date(`${dateExecution}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateExecution;

  const jours = Number.isFinite(convention.jours) ? Math.max(0, convention.jours) : 0;
  if (jours === 0) return dateExecution;

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
