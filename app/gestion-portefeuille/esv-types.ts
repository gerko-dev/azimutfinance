// === ESV — Événements sur valeurs : types et règles ===
//
// Ce que le portefeuille va RAPPORTER, et quand : coupons, amortissements,
// remboursements, dividendes. Un module de suivi, pas un module de saisie —
// l'essentiel se calcule à partir des titres détenus et des échéanciers du
// référentiel.
//
// CE FICHIER NE LIT RIEN : il est importé par des composants clients, et les
// lectures vivent dans `esv-data.ts`.
//
// TROIS ÉTATS, ET UN SEUL QUI COMPTE VRAIMENT.
//
//   à venir   — la tombée est devant, il n'y a rien à faire.
//   REÇU      — le gérant l'a pointé, avec sa date et son montant réel.
//   EN RETARD — la date est passée et rien n'est pointé.
//
// Le troisième est la raison d'être du module. Un coupon qui ne tombe pas se
// remarque rarement : il n'y a pas d'avis d'opéré pour un encaissement qui
// n'arrive pas. C'est lui qu'il faut mettre en évidence.

export type NatureEsv = "coupon" | "amortissement" | "remboursement" | "dividende";

export const LIBELLES_NATURE: Record<NatureEsv, string> = {
  coupon: "Coupon",
  amortissement: "Amortissement",
  remboursement: "Remboursement",
  dividende: "Dividende",
};

/**
 * Poste du point de trésorerie alimenté par les flux ESV.
 *
 * UNE SEULE LIGNE POUR LES QUATRE NATURES. Elles avaient été séparées —
 * revenus d'un côté, tombées de capital de l'autre — au motif qu'un
 * remboursement n'est pas un revenu. C'est vrai au compte de résultat ; ça ne
 * l'est pas au point de trésorerie, qui ne pose qu'une question : combien
 * rentre, et quand. Deux lignes pour un même encaissement obligeaient le
 * trésorier à les additionner de tête à chaque lecture.
 *
 * LE DÉTAIL N'EST PAS PERDU : le module ESV le porte, nature par nature, avec
 * son échéancier et son pointage. C'est là qu'on distingue un coupon d'un
 * amortissement, pas dans une colonne de trésorerie.
 */
export const POSTE_ESV = "DIVIDENDES/COUPONS";

export const POSTE_DE_NATURE: Record<NatureEsv, string> = {
  coupon: POSTE_ESV,
  dividende: POSTE_ESV,
  amortissement: POSTE_ESV,
  remboursement: POSTE_ESV,
};

/**
 * D'où sort le montant attendu.
 *
 * AUCUNE ESTIMATION. Le module ne porte que des montants PUBLIÉS — échéancier
 * contractuel ou avis officiel de la Bourse. Un dividende déduit d'un
 * rendement et d'un cours donnait un ordre de grandeur utile à la prévision,
 * mais il se mêlait aux autres lignes du calendrier et finissait par être lu
 * comme une créance. Mieux vaut une ligne absente qu'une ligne approximative :
 * l'absence se voit, l'approximation non.
 */
export type SourceMontant =
  /** Échéancier du référentiel obligataire, ou calcul actuariel sur le titre
   *  public. Le montant est celui du contrat. */
  | "echeancier"
  /** Avis de la BRVM publié au BOC : montant net par action, ex-dividende et
   *  date de mise en paiement, tous trois officiels. */
  | "avis_boc";

export type Reception = {
  dateReception: string;
  /** Le montant RÉELLEMENT encaissé. Il diffère souvent de l'attendu :
   *  retenue à la source, arrondi du dépositaire, quantité détenue à la date
   *  de détachement différente de celle de l'inventaire. */
  montantRecu: number;
  compte: string;
  note: string;
};

export type EvenementEsv = {
  /** Identité STABLE — cf. `cleEvenement`. */
  cle: string;
  nature: NatureEsv;
  /** Date de tombée attendue. */
  date: string;
  /** Mnémonique, ou ISIN pour un titre public qui n'en a pas. */
  code: string;
  libelle: string;
  isin: string;
  instrument: "actions" | "obligations" | "mtp";
  /** Quantité détenue à l'inventaire de référence. */
  quantite: number;
  montantParTitre: number;
  montantAttendu: number;
  source: SourceMontant;
  /** Ce qui rend le chiffre fragile, ou null. Affiché tel quel : un montant
   *  dont on tait les réserves se prend pour une certitude. */
  reserve: string | null;
  reception: Reception | null;
};

/**
 * IDENTITÉ D'UN ÉVÉNEMENT. Elle ne doit JAMAIS changer de recette.
 *
 * Le calendrier se recalcule à chaque affichage ; seuls les pointages sont
 * stockés, et ils s'y rattachent par cette clef. En changer la composition
 * orphelinerait tous les pointages déjà posés — les flux reçus
 * réapparaîtraient en retard, tous le même jour.
 *
 * Le titre est désigné par son ISIN quand il en a un, par son mnémonique
 * sinon : c'est la désignation la plus stable des deux, un mnémonique pouvant
 * être réattribué.
 */
export function cleEvenement(
  titre: string,
  date: string,
  nature: NatureEsv,
): string {
  return `${(titre ?? "").trim().toUpperCase()}|${date}|${nature}`;
}

/**
 * DATE À PARTIR DE LAQUELLE ON REGARDE EN ARRIÈRE.
 *
 * Les échéanciers du référentiel couvrent toute la vie des titres — une OAT
 * dix ans porte vingt coupons, et un portefeuille de cinquante lignes en
 * aligne des centaines, tous « en retard » puisque jamais pointés. Le module
 * aurait ouvert sur un mur rouge de flux que personne n'a jamais eu à
 * encaisser, et le vrai retard s'y serait perdu.
 *
 * Juin 2026 est le début du suivi : avant cela, les flux ont été reçus et
 * comptabilisés hors de ce module, et les repointer un à un n'apprendrait
 * rien. Ce qui est antérieur reste calculé — il apparaît dans l'échéancier
 * complet — mais ne compte plus comme retard.
 */
export const DEBUT_SUIVI = "2026-06-01";

export type StatutEsv = "recu" | "en_retard" | "a_venir" | "anterieur";

export const LIBELLES_STATUT: Record<StatutEsv, string> = {
  recu: "Reçu",
  en_retard: "En retard",
  a_venir: "À venir",
  anterieur: "Avant le suivi",
};

/**
 * État d'un flux à une date donnée.
 *
 * Un flux daté d'AUJOURD'HUI n'est pas en retard : les règlements tombent dans
 * la journée, et l'afficher en rouge dès le matin aurait crié au loup tous les
 * jours de détachement.
 *
 * Un flux ANTÉRIEUR au début du suivi n'est pas en retard non plus : il a été
 * encaissé et comptabilisé ailleurs, avant que ce module n'existe. Il reste
 * visible dans l'échéancier complet — c'est l'histoire du titre — mais il
 * n'appelle aucune action.
 */
export function statutEsv(
  e: { date: string; reception: Reception | null },
  aujourdhui: string,
): StatutEsv {
  if (e.reception) return "recu";
  if (e.date < DEBUT_SUIVI) return "anterieur";
  return e.date < aujourdhui ? "en_retard" : "a_venir";
}

/** Écart entre ce qui était attendu et ce qui est tombé. Null tant que rien
 *  n'est pointé. Le signe compte : un encaissement inférieur à l'attendu est
 *  presque toujours une retenue à la source, un supérieur une erreur de
 *  quantité. */
export function ecartReception(e: EvenementEsv): number | null {
  return e.reception ? e.reception.montantRecu - e.montantAttendu : null;
}

/** Ce que le portefeuille doit encore encaisser sur une période. */
export function totalAttendu(evenements: EvenementEsv[]): number {
  return evenements.reduce(
    (s, e) => s + (e.reception ? 0 : e.montantAttendu),
    0,
  );
}

/** Bornes usuelles du calendrier, en jours à partir d'aujourd'hui. */
export const HORIZONS: { cle: string; libelle: string; jours: number }[] = [
  { cle: "30", libelle: "30 jours", jours: 30 },
  { cle: "90", libelle: "3 mois", jours: 90 },
  { cle: "180", libelle: "6 mois", jours: 180 },
  { cle: "365", libelle: "12 mois", jours: 365 },
  { cle: "tout", libelle: "Tout l'échéancier", jours: 3650 },
];

/** Décale une date ISO de N jours. */
export function decalerJours(dateISO: string, jours: number): string {
  const t = new Date(`${dateISO}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return dateISO;
  return new Date(t + jours * 86_400_000).toISOString().slice(0, 10);
}

/** Mois d'une date ISO, en toutes lettres — « août 2026 ». */
export function libelleMoisEsv(dateISO: string): string {
  const d = new Date(`${dateISO.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateISO.slice(0, 7);
  return d.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
