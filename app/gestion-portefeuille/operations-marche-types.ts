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
  | "VENTE_MTP"
  | "SOUSCRIPTION_MP";

/** Nature du titre. Gouverne le délai de dénouement. */
export type Instrument = "actions" | "obligations" | "mtp";

/** Marché sur lequel l'ordre se traite. Décide de la façon dont le titre se
 *  choisit, et des instruments admis. */
export type Marche = "mfr" | "mtp" | "primaire";

/** Instruments admis selon le marché. Un ordre MFR porte sur une action ou une
 *  obligation cotée, jamais sur un titre public — et réciproquement. */
export const INSTRUMENTS_ADMIS: Record<Marche, Instrument[]> = {
  mfr: ["actions", "obligations"],
  mtp: ["mtp"],
  // Le marché primaire émet les deux : une adjudication porte sur des titres
  // publics, une syndication souvent sur une obligation.
  primaire: ["mtp", "obligations"],
};

/**
 * Modalité d'une souscription au marché PRIMAIRE. Elle décide de la façon
 * dont le titre se désigne, et de rien d'autre.
 *
 *  - ADJUDICATION : le titre existe déjà au calendrier UMOA-Titres. On choisit
 *    l'émission, et ses caractéristiques suivent.
 *  - SYNDICATION : l'émission ne figure à aucun calendrier — elle se place de
 *    gré à gré. Le gérant décrit donc le titre lui-même.
 */
export type ModaliteSouscription = "adjudication" | "syndication";

export const LIBELLES_MODALITE: Record<ModaliteSouscription, string> = {
  adjudication: "Adjudication — émission au calendrier UMOA-Titres",
  syndication: "Syndication — placement de gré à gré",
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

// ── Rémérés et prêts de titres ────────────────────────────────────────────
//
// Un réméré et un prêt sont des ordres MTP AUGMENTÉS, pas des objets à part :
// ils portent déjà un fonds, un ISIN, une quantité, un prix et un compte de
// règlement. Seul ce qui leur est propre vit ici.

/** Sens du PREMIER flux d'un réméré. */
export type SensRemere = "cash_in" | "cash_out";

export const LIBELLES_SENS_REMERE: Record<SensRemere, string> = {
  cash_in: "Cash-in — le fonds encaisse et devra rembourser",
  cash_out: "Cash-out — le fonds décaisse et sera remboursé",
};

/**
 * Le sens d'un réméré DÉCOULE du sens de l'ordre : il ne se choisit pas.
 *
 * Acheter à réméré, c'est décaisser aujourd'hui contre un titre qu'on rendra :
 * le fonds sera remboursé, donc cash-out. Vendre à réméré, c'est encaisser
 * aujourd'hui contre un titre qu'on rachètera : le fonds devra rembourser,
 * donc cash-in.
 *
 * Le demander au gérant, c'était lui demander de répéter une information déjà
 * donnée deux champs plus haut — et lui offrir la possibilité de se
 * contredire.
 *
 * Le sens ne décide plus d'aucun poste : un ordre à réméré pèse dans
 * « ACHATS / VENTES A RÉMÉRÉ VALIDES » selon son SENS D'ORDRE, puis dans les
 * réalisés. Il reste une indication de lecture, utile au gérant.
 */
export function sensRemereDe(d: DescriptionOperation): SensRemere {
  return sensDe(d) === "achat" ? "cash_out" : "cash_in";
}

/** Description de l'opération qui DÉNOUE un réméré : le sens inverse, sur le
 *  même marché. On rachète ce qu'on a vendu à réméré, et réciproquement. */
export function descriptionDenouement(d: DescriptionOperation): DescriptionOperation {
  return sensDe(d) === "achat" ? "VENTE_MTP" : "ACHAT_MTP";
}

export type StatutRemere = "en_cours" | "denoue";
export const LIBELLES_STATUT_REMERE: Record<StatutRemere, string> = {
  en_cours: "En cours",
  denoue: "Dénoué",
};

export type StatutPret = "en_cours" | "repris";
export const LIBELLES_STATUT_PRET: Record<StatutPret, string> = {
  en_cours: "En cours",
  repris: "Repris",
};

/** Ce qui se SAISIT d'un réméré. Trois champs, et un lien.
 *
 *  Le sens n'y est pas : il découle du sens de l'ordre. Le statut et la date
 *  de dénouement non plus : ils découlent de l'opération de dénouement et de
 *  son exécution. Un statut qu'on saisit à la main est un statut qui ment. */
export type SaisieRemere = {
  dateFin: string;
  contrepartie: string;
  /** Prix de rachat, par titre. Le prix d'entrée est celui de l'ordre. */
  prixSortie: number;
  /** Opération MTP de sens inverse qui dénoue ce réméré, ou null tant qu'elle
   *  n'a pas été saisie. */
  denouePar: string | null;
};

/** Un réméré tel qu'il se LIT : sa saisie, plus ce qui s'en déduit. */
export type Remere = SaisieRemere & {
  /** Déduit du sens de l'ordre — cf. `sensRemereDe`. */
  sens: SensRemere;
  /** Déduit : dénoué dès que l'opération de dénouement a été EXÉCUTÉE. */
  statut: StatutRemere;
  /** Déduit : la date de dénouement de l'exécution qui a soldé le réméré. */
  dateDenouement: string | null;
  /** L'opération de dénouement est saisie mais pas encore exécutée. Le réméré
   *  pèse toujours : rien n'a été réglé. */
  denouementEnAttente: boolean;
};

/** Ce qui se SAISIT d'un prêt de titres. Trois champs.
 *
 *  Ni statut ni intérêt : le premier découle de la reprise, le second du taux
 *  et de la durée. Même règle que pour le réméré — ce qui se déduit ne se
 *  saisit pas, sinon la colonne finit par contredire les faits. */
export type SaisiePret = {
  dateFin: string | null;
  /** Établissement emprunteur, choisi parmi les banques agréées de l'UMOA. */
  contrepartie: string;
  /** Taux du prêt, en DÉCIMAL. Rémunère le prêteur sur la durée. */
  tauxCommission: number;
  /** Date à laquelle les titres sont revenus, ou null tant qu'ils sont dehors. */
  dateReprise: string | null;
};

/** Un prêt tel qu'il se LIT : sa saisie, plus ce qui s'en déduit. */
export type Pret = SaisiePret & {
  /** Déduit : repris dès que la date de reprise est renseignée. */
  statut: StatutPret;
  /** Déduit du taux et de la durée, base 360 — cf. `interetPret`. */
  interetARecevoir: number;
};

/** Nombre de jours CALENDAIRES entre deux dates ISO. */
function joursEntre(debut: string, fin: string): number {
  const a = new Date(`${debut}T00:00:00Z`).getTime();
  const b = new Date(`${fin}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Intérêt à recevoir sur un prêt de titres. BASE 360.
 *
 *   valeur des titres prêtés × taux × jours / 360
 *
 * La valeur retenue est celle de l'ordre — quantité × prix — et non son
 * montant tous frais compris : on rémunère le prêt des titres, pas les
 * commissions payées pour les acquérir.
 *
 * La durée court de la date du prêt à sa FIN PRÉVUE, ou à la date de REPRISE
 * quand les titres sont déjà revenus : rendus plus tôt, ils n'ont pas à être
 * payés jusqu'au terme.
 *
 * Le saisir à la main, c'était accepter qu'il diverge du taux affiché juste
 * au-dessus.
 */
export function interetPret(
  o: { dateOperation: string; quantite: number; prix: number },
  p: { dateFin: string | null; tauxCommission: number; dateReprise: string | null },
): number {
  const fin = p.dateReprise ?? p.dateFin;
  if (!fin) return 0;
  const jours = joursEntre(o.dateOperation, fin);
  if (jours <= 0) return 0;
  return (o.quantite * o.prix * p.tauxCommission * jours) / 360;
}

/** Statut d'un prêt, DÉDUIT : les titres sont revenus, ou ils ne le sont pas. */
export function statutPretDe(p: { dateReprise: string | null }): StatutPret {
  return p.dateReprise ? "repris" : "en_cours";
}

/**
 * UN RÉMÉRÉ N'EXISTE QU'UNE FOIS SON ORDRE EXÉCUTÉ.
 *
 * Tant que l'ordre d'entrée n'est pas servi, la cession temporaire n'a pas eu
 * lieu : les titres n'ont pas bougé, aucun cash n'a changé de mains, et il n'y
 * a donc rien à rembourser au terme. Ce n'est encore qu'un ordre MTP au
 * carnet, et il pèse comme tel.
 *
 * C'est aussi ce qui interdit de le dénouer trop tôt : on ne solde pas ce qui
 * ne s'est pas noué.
 */
export function remereNoue(o: {
  remere: Remere | null;
  executions: Execution[];
}): boolean {
  return o.remere !== null && o.executions.length > 0;
}

/** Montant d'un réméré : ce qui sera remboursé ou encaissé au terme. */
export function montantRemere(
  o: { quantite: number; interetsCourus: number },
  r: { prixSortie: number },
): number {
  return o.quantite * r.prixSortie + o.interetsCourus;
}

/**
 * Poste portant le flux ATTENDU AU DÉNOUEMENT d'un réméré.
 *
 * Il est l'INVERSE du sens de l'ordre d'entrée, parce qu'un réméré se dénoue
 * par l'opération contraire :
 *
 *   ACHAT à réméré  → le fonds a décaissé, et il REVENDRA au terme : le
 *                     dénouement lui rapporte du cash. Poste d'ENCAISSEMENT,
 *                     dans « CASH A RECEVOIR ».
 *   VENTE à réméré  → le fonds a encaissé, et il RACHÈTERA au terme : le
 *                     dénouement lui coûte du cash. Poste de DÉCAISSEMENT,
 *                     dans « AUTRES ENGAGEMENTS ».
 *
 * Les clefs du classeur nomment le flux D'ENTRÉE — un achat à réméré y est un
 * « cash out » — alors que la ligne porte le flux DE SORTIE. Les deux se lisent
 * à l'envers l'une de l'autre, et c'est la source de toutes les confusions sur
 * ces deux lignes : on garde la clef du classeur, l'affichage dit l'effet.
 */
export function posteRemereDenouement(d: DescriptionOperation): string {
  return sensDe(d) === "achat" ? "REMERES_CASH_OUT" : "REMERES_CASH_IN";
}

/**
 * Ce que le dénouement d'un réméré fera bouger, à la date d'arrêté.
 *
 * Valorisé sur la quantité RÉELLEMENT SERVIE et dénouée au plus tard à
 * l'arrêté — un ordre à réméré partiellement servi n'engage que sa part
 * servie —, au PRIX DE SORTIE convenu, qui est précisément ce que le réméré
 * ajoute à un ordre ordinaire.
 */
export function montantDenouementRemere(
  o: {
    description: DescriptionOperation;
    prix: number;
    quantite: number;
    interetsCourus: number;
    remere: Remere | null;
    executions: Execution[];
  },
  dateArrete: string | null,
): number {
  if (!o.remere) return 0;
  const servie = o.executions
    .filter((e) => !dateArrete || e.dateDenouement <= dateArrete)
    .reduce((s, e) => s + e.quantite, 0);
  if (servie <= 0) return 0;
  // Les courus suivent la part servie : les porter en entier sur une exécution
  // partielle aurait gonflé le flux attendu.
  const partCourus = o.quantite > 0 ? (o.interetsCourus * servie) / o.quantite : 0;
  return servie * o.remere.prixSortie + partCourus;
}

/**
 * Le réméré est-il encore DENOUE À FAIRE à la date d'arrêté ?
 *
 * Un réméré soldé avant l'arrêté n'attend plus rien : son dénouement est une
 * opération MTP ordinaire, déjà comptée comme telle. L'y laisser compterait le
 * même flux deux fois.
 */
export function remereOuvertA(
  o: { remere: Remere | null; executions: Execution[] },
  dateArrete: string | null,
): boolean {
  if (!remereNoue(o) || !o.remere) return false;
  const d = o.remere.dateDenouement;
  if (!d) return true;
  return dateArrete !== null && d > dateArrete;
}

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
  /** Volet réméré, si l'ordre en est un. MTP uniquement. */
  remere: Remere | null;
  /** Date à laquelle le RÈGLEMENT DE L'ORDRE a été constaté sur le relevé.
   *
   *  PROPRE AU MARCHÉ PRIMAIRE, où l'on règle AVANT d'être servi : on verse
   *  sa soumission, et l'attribution ne vient qu'après. Le rapprochement
   *  arrive donc avant toute exécution, et il ne peut pas se poser sur elle.
   *
   *  Partout ailleurs, c'est chaque exécution qui se rapproche — il n'y a rien
   *  à régler tant que rien n'est servi. */
  rapprocheLe: string | null;
  /** Modalité d'une SOUSCRIPTION au marché primaire, null pour toute autre
   *  opération. Elle décide de la façon dont le titre se désigne : choisi au
   *  calendrier pour une adjudication, décrit à la main pour une syndication. */
  modalite: ModaliteSouscription | null;
  /** Volet prêt de titres, si l'ordre en est un. MTP uniquement. */
  pret: Pret | null;
  /** Identifiant du réméré que cette opération dénoue, ou null.
   *
   *  DÉDUIT à la lecture : c'est le réméré dont le `denouePar` désigne cette
   *  opération. Un seul lien stocké, donc pas de risque que les deux bouts se
   *  contredisent. */
  denoueRemereDe: string | null;
  /** Calculé, jamais stocké — cf. la migration SQL. Porte la quantité
   *  ORDONNÉE : c'est le montant de l'ordre, pas de ce qui en a été servi. */
  montant: number;
};

/** Ce que le formulaire d'un ordre envoie. La CLÔTURE n'en fait pas partie :
 *  elle a son propre geste, sur la ligne, et la mêler à la correction aurait
 *  permis de clore un ordre par inadvertance en corrigeant son prix. */
export type SaisieOperation = Omit<
  OperationMarche,
  | "id"
  | "montant"
  | "executions"
  | "clotureLe"
  | "rapprocheLe"
  | "remere"
  | "pret"
  | "denoueRemereDe"
> & {
  /** Le volet prêt tel qu'il se saisit : sans le statut ni l'intérêt, qui se
   *  déduisent. */
  pret: SaisiePret | null;
  /** Le volet réméré tel qu'il se saisit : sans le sens ni le statut, qui se
   *  déduisent. */
  remere: SaisieRemere | null;
  /** Réméré que cette opération vient dénouer. Ne se choisit pas dans le
   *  formulaire : il vient du bouton « Dénouer » de l'onglet Rémérés. */
  denoueRemereDe: string | null;
};

/**
 * Seul le PRÊT DE TITRES n'alimente aucun poste du point.
 *
 * Il ne déplace pas de cash au moment où il se noue : c'est un registre, pas
 * un flux, et le classeur n'a pas de ligne pour lui.
 *
 * Un ordre à réméré, lui, alimente bien le point — simplement sur sa ligne
 * propre tant qu'il est validé (cf. `posteEngageDe`), puis sur les achats et
 * ventes réalisés une fois servi. Et une opération de dénouement se comporte
 * exactement comme un achat ou une vente MTP ordinaire.
 */
export function alimenteAchatsVentes(o: { pret: Pret | null }): boolean {
  return !o.pret;
}

/**
 * Libellés d'écran, et LIBELLÉS DES POSTES du point de trésorerie.
 *
 * Deux postes par nature : celui qui porte l'engagement tant que l'ordre n'est
 * pas servi, celui qui porte le règlement une fois qu'il l'est.
 *
 * UNE VENTE A DÉSORMAIS SON POSTE D'ENGAGEMENT, elle aussi. Le classeur n'en
 * avait pas, mais une vente passée et non encore servie est un encaissement
 * annoncé : ne pas la montrer laissait le trésorier aveugle sur la moitié de
 * ses ordres en cours.
 */
export const DESCRIPTIONS: {
  valeur: DescriptionOperation;
  libelle: string;
  marche: Marche;
  sens: "achat" | "vente";
  /** Poste portant la part NON servie. */
  posteEngage: string;
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
    posteEngage: "VENTES MFR VALIDES",
    posteRealise: "VENTES MFR REALISEES",
    instrumentSuggere: "actions",
  },
  {
    valeur: "VENTE_MTP",
    libelle: "Vente MTP",
    marche: "mtp",
    sens: "vente",
    posteEngage: "VENTES MTP VALIDES",
    posteRealise: "VENTES MTP REALISEES",
    instrumentSuggere: "mtp",
  },
  {
    // SOUSCRIRE, C'EST ACHETER — au primaire, donc à l'émission plutôt qu'à
    // un vendeur. Le sens décide du signe des frais : une souscription les
    // ajoute au montant, comme un achat.
    //
    // Son engagement a sa propre ligne au point, « OPERATIONS MARCHÉ
    // PRIMAIRE », que le classeur prévoyait et que rien n'alimentait. Une fois
    // servie, elle se règle comme un achat de titres publics.
    valeur: "SOUSCRIPTION_MP",
    libelle: "Souscription marché primaire",
    marche: "primaire",
    sens: "achat",
    posteEngage: "OPERATIONS MARCHÉ PRIMAIRE",
    posteRealise: "ACHATS MTP REALISES",
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
export function posteEngage(d: DescriptionOperation): string {
  return PAR_DESCRIPTION.get(d)?.posteEngage ?? "";
}

/**
 * Poste d'engagement d'un ordre À RÉMÉRÉ, non encore exécuté.
 *
 * Une cession temporaire a sa propre ligne au point : le classeur distingue
 * « ACHATS A RÉMÉRÉ VALIDES » des achats ordinaires, et le trésorier veut
 * pouvoir les lire séparément — l'engagement est le même, mais la nature de
 * l'opération ne l'est pas.
 */
export function posteRemereValide(d: DescriptionOperation): string {
  return sensDe(d) === "achat" ? "ACHATS A RÉMÉRÉ VALIDES" : "VENTES A RÉMÉRÉ VALIDES";
}

/** Poste portant la part non servie d'un ordre, réméré compris. */
export function posteEngageDe(o: {
  description: DescriptionOperation;
  remere: unknown | null;
}): string {
  return o.remere ? posteRemereValide(o.description) : posteEngage(o.description);
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
  description: DescriptionOperation;
}): string | null {
  // SEUL UN ORDRE DE BOURSE PÉRIME. La validité est une notion de CARNET : un
  // ordre MFR y reste le temps qu'on lui donne, puis il sort. Rien de tel
  // ailleurs — une adjudication de titres publics est servie ou ne l'est pas,
  // un réméré se négocie de gré à gré, et une souscription au primaire attend
  // le dépouillement.
  //
  // Le formulaire masque d'ailleurs le champ hors MFR, mais l'état par défaut
  // reste « jour » : sans cette sortie, un ordre non coté héritait d'une
  // échéance qu'il n'a pas et sortait du point dès le lendemain — voire le
  // jour même — sans que rien ne l'explique.
  if (marcheDe(o.description) !== "mfr") return null;
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
    description: DescriptionOperation;
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
  const limite = dateLimiteOrdre(o);
  if (limite !== null && limite < jour) return "perime";
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
    description: DescriptionOperation;
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
  // Périmé. Hors bourse, il n'y a pas de limite : l'ordre attend d'être
  // servi ou clos.
  const limite = dateLimiteOrdre(o);
  if (limite !== null && limite < dateArrete) return false;
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

/**
 * AU PRIMAIRE, ON RÈGLE AVANT D'ÊTRE SERVI.
 *
 * On verse sa soumission, puis l'adjudication dit ce qu'on obtient. Le
 * rapprochement bancaire précède donc l'exécution, et il se pose sur l'ORDRE
 * — il n'y a encore aucune exécution sur laquelle l'accrocher.
 *
 * Partout ailleurs c'est l'inverse : rien n'est à régler tant que rien n'est
 * servi, et chaque exécution porte son propre rapprochement.
 */
export function rapprochementSurOrdre(d: DescriptionOperation): boolean {
  return d === "SOUSCRIPTION_MP";
}

/** L'ordre est-il déjà réglé, à la date d'arrêté ?
 *
 *  Réglé veut dire : le solde bancaire saisi le contient déjà. L'ordre sort
 *  alors des postes de flux — l'y laisser le compterait deux fois. */
export function ordreRapproche(
  o: { rapprocheLe: string | null },
  dateArrete: string | null,
): boolean {
  if (!o.rapprocheLe) return false;
  return !dateArrete || o.rapprocheLe <= dateArrete;
}
