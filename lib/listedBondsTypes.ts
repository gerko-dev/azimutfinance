// Types et fonctions pures pour les obligations cotees UEMOA
// Codes d'amortissement : IF (In Fine), AC (Amortissement Constant), ACD (AC avec Différé)

export type AmortizationType = "IF" | "AC" | "ACD";

/**
 * Mode d'amortissement par titre, lu de la colonne "Titre/Nominal" du CSV :
 *  - "T" (sur titre)   : la VN par titre reste a la valeur d'origine. A chaque
 *                        amort, 1/N des titres sont rembourses au pair. Du point
 *                        de vue d'un porteur d'1 titre : coupon constant tant
 *                        qu'il n'est pas tire au sort, puis 0.
 *  - "N" (sur nominal) : la VN par titre decroit lineairement (tranche = VN/N).
 *                        Le coupon est calcule sur l'outstanding pre-amort, donc
 *                        decroit aussi.
 */
export type AmortizationMode = "T" | "N";

/**
 * Une obligation est echue quand sa date de maturite est passee. On le derive
 * de `maturityDate` plutot que d'ajouter une colonne au CSV : la donnee est
 * deja la, toujours juste, et aucune maintenance n'est requise le jour du
 * remboursement.
 *
 * Le referentiel conserve volontairement les lignes echues — historique des
 * prix, evenements passes, portefeuilles anterieurs y renvoient. Elles doivent
 * donc rester accessibles, mais clairement signalees : au 05/09/2026, 11 des
 * 216 lignes sont remboursees, dont TPCI.O29 depuis 139 jours.
 */
export function isBondMatured(
  bond: { maturityDate?: string | null },
  asOf: Date = new Date(),
): boolean {
  if (!bond.maturityDate) return false;
  const t = Date.parse(bond.maturityDate);
  return Number.isFinite(t) && t < asOf.getTime();
}

/**
 * URL canonique de la fiche d'une obligation cotee.
 *
 * On route par MNEMONIQUE et non par ISIN. L'ISIN n'est pas une cle fiable
 * dans obligations-cotees.csv : quatre lignes portent la sentinelle "NC"
 * (FDFINBF.O3, FEPTC.O4, FEPTC.O5, FEPTC.O6), faute d'ISIN publie. Router par
 * ISIN les faisait toutes pointer vers /obligation/NC, donc afficher la meme
 * fiche, et le sitemap declarait quatre fois la meme adresse.
 *
 * Le mnemonique, lui, est unique sur les 216 lignes du referentiel et sert
 * deja de cle dans le BOC. La route /obligation/[isin] accepte les deux
 * formes, l'ancien lien par ISIN reste donc valide.
 *
 * Repli sur l'ISIN si le mnemonique manque, pour ne jamais produire une URL
 * vide.
 */
export function bondHref(bond: {
  code?: string | null;
  isin?: string | null;
}): string {
  const key = (bond.code || "").trim() || (bond.isin || "").trim();
  return `/obligation/${encodeURIComponent(key)}`;
}

export type ListedBond = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  currency: string;
  /** Valeur nominale d'origine par titre (a l'emission). */
  nominalValue: number;
  totalIssued: number;
  outstanding: number;
  couponRate: number;
  couponFrequency: 1 | 2 | 4;
  issueDate: string;
  maturityDate: string;
  firstAmortizationDate: string;
  amortizationType: AmortizationType;
  amortizationMode: AmortizationMode;
  rating: string;
  ratingAgency: string;
  callable: boolean;
  callDate: string;
  greenBond: boolean;
  description: string;
  yearsToMaturity: number;
};

export type ListedBondPrice = {
  isin: string;
  date: string;
  cleanPrice: number;
  dirtyPrice: number;
  volume: number;
  transactions: number;
};

export type ListedBondEvent = {
  isin: string;
  date: string;
  /** "amortissement" = tranche intermediaire ; "remboursement" = paiement final */
  eventType:
    | "coupon"
    | "amortissement"
    | "remboursement"
    | "call"
    | "adjudication";
  amount: number;
  description: string;
  /** Capital restant par titre apres ce flux. Source unique partagee avec
   *  l'echeancier de la fiche obligation. 0 par defaut pour les flux sans
   *  effet capital (call/adjudication non utilises pour l'instant). */
  outstandingAfter: number;
};

export type MarketStats = {
  /** Nombre d'obligations ACTIVES (echues exclues). */
  totalBonds: number;
  /** Nombre de lignes echues, conservees au referentiel mais hors agregats. */
  maturedBonds: number;
  totalOutstanding: number;
  weightedYield: number;
  averageDuration: number;
  byCountry: Record<string, number>;
  byType: Record<string, number>;
  /** Synthese journaliere du marche obligataire scrapee du BOC BRVM (page 1).
   *  null si le JSON n'a pas pu etre lu / le scraper n'a pas extrait la section. */
  boc: BocSynthese | null;
};

export type BocSynthese = {
  /** Date du BOC source (YYYY-MM-DD). */
  bocDate: string;
  /** Capitalisation boursiere des obligations en FCFA. */
  capitalisationBoursiere: number;
  /** Volume echange du jour (nombre de titres). */
  volumeEchange: number;
  /** Valeur transigee du jour en FCFA. */
  valeurTransigee: number;
  /** Nombre d'obligations cotees = lignes du CSV d'audit obligations-cotees-vn-boc.csv.
   *  null si le CSV est absent ou illisible. */
  bondsCount: number | null;
};

// ==========================================
// HELPERS DATE
// ==========================================

/**
 * Parse une date en acceptant les formats :
 * - YYYY-MM-DD (ISO, format standard)
 * - DD/MM/YYYY (format francais Excel)
 * - DD-MM-YYYY (format alternatif)
 */
function parseISODate(s: string): Date {
  if (!s || s.trim() === "") return new Date(NaN);
  const clean = s.trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split(/[/-]/).map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? new Date(NaN) : fallback;
}

function daysBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * Genere toutes les dates de coupon d'une obligation, depuis l'issueDate
 * jusqu'a la maturityDate, selon la frequence.
 */
function generateCouponDates(
  issueDate: Date,
  maturityDate: Date,
  frequency: 1 | 2 | 4
): Date[] {
  const dates: Date[] = [];
  const monthsPerPeriod = 12 / frequency;
  const current = new Date(maturityDate);
  while (current.getTime() > issueDate.getTime()) {
    dates.unshift(new Date(current));
    current.setUTCMonth(current.getUTCMonth() - monthsPerPeriod);
  }
  return dates;
}

/**
 * Calcule la VN courante par titre a date, sans lire la colonne `nominalValue`
 * du CSV (auto-derivee depuis les dates + mode + convention BRVM 10 000).
 *
 *  - IF ou mode T  → reste a 10 000 (face inchangee par titre survivant)
 *  - mode N        → 10 000 × (N − past_amorts) / N
 *  - dates invalides ou pas d'amorts → 10 000
 */
export function computeCurrentNominalPerTitre(args: {
  amortizationType: AmortizationType;
  amortizationMode: AmortizationMode;
  issueDate: string;
  maturityDate: string;
  firstAmortizationDate: string;
  couponFrequency: 1 | 2 | 4;
  today?: Date;
}): number {
  const today = args.today ?? new Date();
  const issueDate = parseISODate(args.issueDate);
  const maturityDate = parseISODate(args.maturityDate);
  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) {
    return 10_000;
  }
  if (args.amortizationType === "IF") return 10_000;
  if (args.amortizationMode === "T") return 10_000;

  const allCouponDates = generateCouponDates(
    issueDate,
    maturityDate,
    args.couponFrequency,
  );
  if (allCouponDates.length === 0) return 10_000;

  let firstAmortDate: Date;
  if (args.firstAmortizationDate && args.firstAmortizationDate !== "") {
    const parsed = parseISODate(args.firstAmortizationDate);
    firstAmortDate = isNaN(parsed.getTime()) ? allCouponDates[0] : parsed;
  } else {
    firstAmortDate = allCouponDates[0];
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay,
  );
  const totalNbAmortPeriods = allAmortDates.length;
  if (totalNbAmortPeriods === 0) return 10_000;

  const nbPastAmorts = allAmortDates.filter(
    (d) => d.getTime() <= today.getTime(),
  ).length;
  const remaining = Math.max(0, totalNbAmortPeriods - nbPastAmorts);

  return (10_000 * remaining) / totalNbAmortPeriods;
}

// ==========================================
// CALCUL ACTUARIEL DU YTM — CONVENTION ACT/365
// Toutes les fonctions utilisent l'echeancier reel via
// buildBondCashflowSchedule, qui prend en charge IF / AC / ACD avec differe
// et reconstruit le nominal initial a partir des amorts deja passes.
// ==========================================

export type BondCashflowEntry = {
  date: Date;
  daysFromNow: number;
  outstandingBefore: number;
  outstandingAfter: number;
  coupon: number;
  amort: number;
  totalFlow: number;
};

export type BondCashflowSchedule = {
  futureCashflows: BondCashflowEntry[];
  /** Capital restant du au debut de la periode courante (= apres le dernier
   * coupon paye). Le coupon couru est calcule sur cette base. */
  outstandingAtPeriodStart: number;
  /** Coupon de la periode courante = outstandingAtPeriodStart × rate / freq */
  periodicCoupon: number;
  /** Compte de jours pour le coupon couru (Act/Act ICMA). */
  daysSinceLastCoupon: number;
  daysInPeriod: number;
  /** Reconstruction du nominal initial via les amorts passes. */
  initialNominal: number;
  amortPerPeriod: number;
};

export function buildBondCashflowSchedule(
  bond: ListedBond,
  operationDate: Date
): BondCashflowSchedule {
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  const empty: BondCashflowSchedule = {
    futureCashflows: [],
    outstandingAtPeriodStart: bond.nominalValue,
    periodicCoupon: 0,
    daysSinceLastCoupon: 0,
    daysInPeriod: 1,
    initialNominal: bond.nominalValue,
    amortPerPeriod: 0,
  };
  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) return empty;
  if (operationDate.getTime() >= maturityDate.getTime()) return empty;

  const allCouponDates = generateCouponDates(
    issueDate,
    maturityDate,
    bond.couponFrequency
  );
  if (allCouponDates.length === 0) return empty;

  const isIF = bond.amortizationType === "IF" || !bond.amortizationType;
  let firstAmortDate: Date;
  if (isIF) {
    firstAmortDate = maturityDate;
  } else if (bond.firstAmortizationDate && bond.firstAmortizationDate !== "") {
    const parsed = parseISODate(bond.firstAmortizationDate);
    firstAmortDate = isNaN(parsed.getTime()) ? allCouponDates[0] : parsed;
  } else {
    firstAmortDate = allCouponDates[0];
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay
  );
  const totalNbAmortPeriods = allAmortDates.length;

  const pastAmortDates = allAmortDates.filter(
    (d) => d.getTime() <= operationDate.getTime()
  );
  const nbPastAmorts = pastAmortDates.length;

  // Cascade per-surviving-titre : la valorisation part TOUJOURS de
  // bond.nominalValue (= capital actuel par titre vivant) avec un
  // amortPerPeriod calibre pour epuiser ce capital sur les remainingAmorts
  // periodes futures. La formule initialNominal = nominalValue × N/R est une
  // grandeur algebrique (sans interpretation physique en mode T) qui rend
  // amortPerPeriod = nominalValue / R, soit exactement ce qu'il faut pour :
  //   Σ amorts futurs = R × (nominalValue / R) = nominalValue
  //   coupons cascadant depuis nominalValue jusqu'a 0
  //
  //  - Mode N : nominalValue = INITIAL × R/N (deja cascade par les amorts
  //    passes). La formule donne amortPerPeriod = INITIAL/N (constant).
  //  - Mode T : nominalValue = INITIAL constant (per-surviving-titre, conv
  //    BOC). La formule donne amortPerPeriod = INITIAL/R (capital total
  //    divise par periodes restantes), coupons sur 10 000 cascadant — vue
  //    attendue par le marche (le BOC publie un titre survivant a la pair).
  let initialNominal = bond.nominalValue;
  let amortPerPeriod = 0;
  if (!isIF && totalNbAmortPeriods > nbPastAmorts) {
    const remainingAmorts = totalNbAmortPeriods - nbPastAmorts;
    initialNominal =
      (bond.nominalValue * totalNbAmortPeriods) / remainingAmorts;
    amortPerPeriod = initialNominal / totalNbAmortPeriods;
  }

  const pastCouponDates = allCouponDates.filter(
    (d) => d.getTime() <= operationDate.getTime()
  );
  const previousCouponDate =
    pastCouponDates.length > 0
      ? pastCouponDates[pastCouponDates.length - 1]
      : issueDate;
  const futureCouponDatesArr = allCouponDates.filter(
    (d) => d.getTime() > operationDate.getTime()
  );
  const nextCouponDate =
    futureCouponDatesArr.length > 0 ? futureCouponDatesArr[0] : maturityDate;

  const daysSinceLastCoupon = Math.floor(
    (operationDate.getTime() - previousCouponDate.getTime()) / oneDay
  );
  const daysInPeriod = Math.max(
    1,
    Math.round((nextCouponDate.getTime() - previousCouponDate.getTime()) / oneDay)
  );

  // bond.nominalValue dans le CSV = capital restant a la date courante
  // (i.e. apres les amorts deja passes, avant le prochain). C'est donc la
  // base du coupon couru affiche et le point de depart de la cascade.
  const outstandingAtPeriodStart = bond.nominalValue;
  const periodicCoupon =
    (outstandingAtPeriodStart * bond.couponRate) / bond.couponFrequency;

  let outstanding = bond.nominalValue;
  const futureCashflows: BondCashflowEntry[] = [];
  for (let i = 0; i < futureCouponDatesArr.length; i++) {
    const d = futureCouponDatesArr[i];
    const daysFromNow = (d.getTime() - operationDate.getTime()) / oneDay;
    const outstandingBefore = outstanding;
    const coupon = (outstandingBefore * bond.couponRate) / bond.couponFrequency;

    const allAmortIndex = allAmortDates.findIndex(
      (ad) => ad.getTime() === d.getTime()
    );
    const isAmortPeriod = allAmortIndex >= 0;
    const isLastAmort = allAmortIndex === totalNbAmortPeriods - 1;

    let amort = 0;
    if (isAmortPeriod) {
      if (isIF) {
        if (i === futureCouponDatesArr.length - 1) amort = outstandingBefore;
      } else {
        amort = isLastAmort ? outstandingBefore : amortPerPeriod;
      }
    }

    const outstandingAfter = Math.max(0, outstandingBefore - amort);
    futureCashflows.push({
      date: d,
      daysFromNow,
      outstandingBefore,
      outstandingAfter,
      coupon,
      amort,
      totalFlow: coupon + amort,
    });
    outstanding = outstandingAfter;
  }

  return {
    futureCashflows,
    outstandingAtPeriodStart,
    periodicCoupon,
    daysSinceLastCoupon,
    daysInPeriod,
    initialNominal,
    amortPerPeriod,
  };
}

export function priceFromBondSchedule(
  schedule: BondCashflowSchedule,
  ytm: number
): { cleanPrice: number; dirtyPrice: number; accruedInterest: number } {
  let dirtyPrice = 0;
  for (const cf of schedule.futureCashflows) {
    const years = cf.daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);
    dirtyPrice += cf.totalFlow * df;
  }
  const accruedInterest =
    schedule.daysInPeriod > 0
      ? (schedule.periodicCoupon * schedule.daysSinceLastCoupon) /
        schedule.daysInPeriod
      : 0;
  return {
    cleanPrice: dirtyPrice - accruedInterest,
    dirtyPrice,
    accruedInterest,
  };
}

export function priceFromYtm(
  bond: ListedBond,
  operationDate: Date,
  ytm: number
): { cleanPrice: number; dirtyPrice: number; accruedInterest: number } {
  return priceFromBondSchedule(
    buildBondCashflowSchedule(bond, operationDate),
    ytm
  );
}

export function calculateActuarialYTM(
  bond: ListedBond,
  operationDate: Date,
  targetCleanPrice: number
): number {
  if (targetCleanPrice <= 0) return 0;
  const maturityDate = parseISODate(bond.maturityDate);
  if (operationDate.getTime() >= maturityDate.getTime()) return 0;

  const sched = buildBondCashflowSchedule(bond, operationDate);
  if (sched.futureCashflows.length === 0) return 0;

  // Bornes [-50 %, +200 %] : couvrent distressed extreme et premium pricing.
  // La fonction f(y) = priceFromBondSchedule(y).cleanPrice est strictement
  // decroissante en y → on verifie le bracket avant de bisecter. Si la cible
  // est hors bornes (cashflows trop faibles vs prix saisi → bug de schedule
  // ou input absurde), on retourne NaN pour signaler explicitement plutot que
  // de converger silencieusement vers une borne aberrante.
  const LOW_BOUND = -0.5;
  const HIGH_BOUND = 2.0;
  const pAtLow = priceFromBondSchedule(sched, LOW_BOUND).cleanPrice;
  const pAtHigh = priceFromBondSchedule(sched, HIGH_BOUND).cleanPrice;
  const fLow = pAtLow - targetCleanPrice;
  const fHigh = pAtHigh - targetCleanPrice;
  if (fLow * fHigh > 0) return Number.NaN;

  let low = LOW_BOUND;
  let high = HIGH_BOUND;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const { cleanPrice } = priceFromBondSchedule(sched, mid);
    const diff = cleanPrice - targetCleanPrice;
    if (Math.abs(diff) < 1e-4) return mid;
    if (diff > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function calculateSimpleYTM(bond: ListedBond, cleanPrice: number): number {
  if (bond.yearsToMaturity <= 0 || cleanPrice <= 0) return 0;
  const coupon = bond.couponRate * bond.nominalValue;
  const priceDeviation = (bond.nominalValue - cleanPrice) / bond.yearsToMaturity;
  const avgCapital = (bond.nominalValue + cleanPrice) / 2;
  return (coupon + priceDeviation) / avgCapital;
}

export function getLatestPrice(
  isin: string,
  prices: ListedBondPrice[]
): ListedBondPrice | undefined {
  const bondPrices = prices.filter((p) => p.isin === isin);
  if (bondPrices.length === 0) return undefined;
  return bondPrices.reduce((latest, current) =>
    new Date(current.date) > new Date(latest.date) ? current : latest
  );
}

export function getBondYTM(bond: ListedBond, prices: ListedBondPrice[]): number {
  return getBondYTMFromLatest(bond, getLatestPrice(bond.isin, prices));
}

/**
 * Variante optimisée : reçoit directement le dernier prix déjà calculé
 * (évite un prices.filter() supplémentaire quand l'appelant l'a déjà résolu).
 */
export function getBondYTMFromLatest(
  bond: ListedBond,
  latestPrice: ListedBondPrice | null | undefined
): number {
  if (!latestPrice || latestPrice.cleanPrice <= 0) {
    return bond.couponRate;
  }
  try {
    const ytm = calculateActuarialYTM(
      bond,
      new Date(latestPrice.date),
      latestPrice.cleanPrice
    );
    // calculateActuarialYTM peut retourner NaN si le prix saisi est hors
    // [low, high] (= cashflows incompatibles avec le prix). On retombe alors
    // sur la formule simple analytique pour ne pas casser l'UI en aval.
    if (!Number.isFinite(ytm)) {
      return calculateSimpleYTM(bond, latestPrice.cleanPrice);
    }
    return ytm;
  } catch {
    return calculateSimpleYTM(bond, latestPrice.cleanPrice);
  }
}

// ==========================================
// METRIQUES AVANCEES (Duration, Convexite, BPV)
// ==========================================

export function calculateDuration(
  bond: ListedBond,
  operationDate: Date,
  ytm: number
): { macaulay: number; modified: number; convexity: number } {
  const sched = buildBondCashflowSchedule(bond, operationDate);
  if (sched.futureCashflows.length === 0) {
    return { macaulay: 0, modified: 0, convexity: 0 };
  }

  let sumPV = 0;
  let sumTimesPV = 0;
  let sumTimesSquaredPV = 0;
  for (const cf of sched.futureCashflows) {
    const years = cf.daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);
    const pv = cf.totalFlow * df;
    sumPV += pv;
    sumTimesPV += years * pv;
    sumTimesSquaredPV += years * (years + 1) * pv;
  }
  if (sumPV === 0) return { macaulay: 0, modified: 0, convexity: 0 };

  const macaulay = sumTimesPV / sumPV;
  const modified = macaulay / (1 + ytm);
  const convexity = sumTimesSquaredPV / sumPV / Math.pow(1 + ytm, 2);
  return { macaulay, modified, convexity };
}

/**
 * BPV / PV01 : variation de prix pour 1 bp de YTM.
 * Convention UMOA-Titres : PV01 = modified × DIRTY price × 0,0001.
 * Le dirty price (= clean + accrued) est la base car la duration modifiee
 * mesure la sensibilite du PV total des cashflows futurs au taux.
 */
export function calculateBPV(
  bond: ListedBond,
  operationDate: Date,
  ytm: number,
  dirtyPrice: number
): number {
  const { modified } = calculateDuration(bond, operationDate, ytm);
  return Math.abs(modified * dirtyPrice * 0.0001);
}

// ==========================================
// ECHEANCIER DES FLUX — CONVENTION UEMOA / BRVM
// ==========================================

/** Convention BRVM : toutes les obligations cotees ont un nominal d'origine
 *  de 10 000 FCFA par titre. La colonne `nominalValue` du CSV donne la VN
 *  *courante* (post amorts deja passes), pas l'initiale. */
const INITIAL_NOMINAL_PER_TITRE = 10_000;

/** Nombre exact de jours entre deux dates (ACT/365 — convention "réel/réel"). */
function daysBetweenDates(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Genere l'echeancier complet des flux FUTURS d'une obligation UEMOA cotee.
 *
 * Conventions :
 *  - INITIAL = 10 000 (par titre, a l'emission, fixe par convention BRVM).
 *  - `bond.amortizationMode` ("T" / "N") :
 *      T = sur titre   : la VN par titre reste = INITIAL. A chaque echeance,
 *                        1/N des titres de chaque position sont rembourses au
 *                        pair (= INITIAL/N par titre detenu).
 *      N = sur nominal : la VN par titre decroit lineairement, tranche =
 *                        INITIAL/N par echeance. Le capital restant courant
 *                        d'un titre apres k amorts = INITIAL × (N−k)/N.
 *  - Tranche par echeance (per titre) = INITIAL/N (identique en T et N).
 *  - Coupon par titre, ACT/365 sur le capital restant du :
 *      coupon = rate × outstanding × (jours_periode / 365)
 *      en mode T, outstanding = INITIAL constant ; en N, outstanding cascade.
 *  - N = nb total de dates d'amort = dates de coupon de firstAmortizationDate
 *    a maturity inclus, ecartees de 12/freq mois.
 */
export function getBondCashflows(bond: ListedBond): {
  date: string;
  type: "coupon" | "amortissement" | "remboursement";
  amount: number;
  outstandingAfter: number;
}[] {
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  const today = new Date();
  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) return [];

  const allCouponDates = generateCouponDates(
    issueDate,
    maturityDate,
    bond.couponFrequency,
  );
  if (allCouponDates.length === 0) return [];

  const isIF = bond.amortizationType === "IF" || !bond.amortizationType;
  const isSurTitre = bond.amortizationMode === "T";

  let firstAmortDate: Date;
  if (isIF) {
    firstAmortDate = maturityDate;
  } else if (bond.firstAmortizationDate && bond.firstAmortizationDate !== "") {
    firstAmortDate = parseISODate(bond.firstAmortizationDate);
  } else {
    firstAmortDate = allCouponDates[0];
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay,
  );
  const totalNbAmortPeriods = allAmortDates.length;

  // Tranche par titre = INITIAL / N (constante, identique T et N).
  // ATTENTION : ce moteur d'AFFICHAGE matche les publications BOC pour mode T
  // (coupon constant 325 sur INITIAL). Le moteur de VALORISATION (Engine A
  // dans buildBondCashflowSchedule) calcule les YTM/Duration/BPV avec une
  // cascade per-original-titre (amort = INITIAL/R, coupons cascadants) — voir
  // commentaires dedans pour la justification.
  const amortPerPeriod =
    isIF || totalNbAmortPeriods === 0
      ? 0
      : INITIAL_NOMINAL_PER_TITRE / totalNbAmortPeriods;

  // Deux outstandings distincts :
  //  - mathOutstanding : base de calcul du coupon. Reste a INITIAL en mode T
  //    (le coupon est toujours assis sur 10 000 par titre survivant, conv BOC),
  //    cascade INITIAL → 0 en mode N.
  //  - displayOutstanding : capital restant affiche dans le tableau. Cascade
  //    TOUJOURS, peu importe T/N — l'investisseur veut voir son exposition
  //    cumulee diminuer au fil des amortissements (la VN du nominal initial
  //    ramenee au prorata des amorts deja verses).
  let mathOutstanding = INITIAL_NOMINAL_PER_TITRE;
  let displayOutstanding = INITIAL_NOMINAL_PER_TITRE;
  let prevDate = issueDate;
  const cashflows: {
    date: string;
    type: "coupon" | "amortissement" | "remboursement";
    amount: number;
    outstandingAfter: number;
  }[] = [];

  for (let i = 0; i < allCouponDates.length; i++) {
    const d = allCouponDates[i];
    const isFuture = d.getTime() > today.getTime();
    const days = daysBetweenDates(prevDate, d);

    const amortIndex = allAmortDates.findIndex(
      (ad) => ad.getTime() === d.getTime(),
    );
    const isAmortPeriod = amortIndex >= 0;
    const isLastAmort = amortIndex === totalNbAmortPeriods - 1;

    // ACT/365 sur le capital restant du. Mode T : capital reste 10 000 par
    // titre survivant (matche BOC). Mode N : mathOutstanding cascade.
    const couponBase = isSurTitre ? INITIAL_NOMINAL_PER_TITRE : mathOutstanding;
    const couponAmount = (couponBase * bond.couponRate * days) / 365;

    // Amort
    let amortAmount = 0;
    let isLastPayment = false;
    if (isAmortPeriod) {
      if (isIF) {
        if (i === allCouponDates.length - 1) {
          amortAmount = INITIAL_NOMINAL_PER_TITRE;
          isLastPayment = true;
        }
      } else if (isLastAmort) {
        // En mode N : dernier flux solde l'arrondi (= mathOutstanding restant).
        // En mode T : meme tranche que les autres.
        amortAmount = isSurTitre ? amortPerPeriod : mathOutstanding;
        isLastPayment = true;
      } else {
        amortAmount = amortPerPeriod;
      }
    }

    // Publication uniquement pour les dates futures.
    if (isFuture) {
      // displayOutstanding est inchange par un coupon (le coupon ne reduit pas
      // le capital), reduit par un amort.
      const outstandingAfterAmort = Math.max(0, displayOutstanding - amortAmount);

      if (couponAmount > 0.01) {
        cashflows.push({
          date: d.toISOString().substring(0, 10),
          type: "coupon",
          amount: couponAmount,
          outstandingAfter: displayOutstanding,
        });
      }
      if (amortAmount > 0.01) {
        cashflows.push({
          date: d.toISOString().substring(0, 10),
          type: isLastPayment ? "remboursement" : "amortissement",
          amount: amortAmount,
          outstandingAfter: outstandingAfterAmort,
        });
      }
    }

    // Cascade : displayOutstanding toujours, mathOutstanding seulement en N.
    displayOutstanding = Math.max(0, displayOutstanding - amortAmount);
    if (!isSurTitre) {
      mathOutstanding = Math.max(0, mathOutstanding - amortAmount);
    }
    prevDate = d;
  }

  return cashflows;
}

/**
 * Reconstruit l'echeancier des flux PASSES depuis l'emission jusqu'a aujourd'hui.
 * Meme conventions que `getBondCashflows` (INITIAL=10 000, ACT/365, T/N).
 */
export function getBondPastCashflows(bond: ListedBond): {
  date: string;
  type: "coupon" | "amortissement" | "remboursement";
  amount: number;
  outstandingAfter: number;
}[] {
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  const today = new Date();
  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) return [];

  const allCouponDates = generateCouponDates(
    issueDate,
    maturityDate,
    bond.couponFrequency,
  );
  if (allCouponDates.length === 0) return [];

  const isIF = bond.amortizationType === "IF" || !bond.amortizationType;
  const isSurTitre = bond.amortizationMode === "T";

  let firstAmortDate: Date;
  if (isIF) {
    firstAmortDate = maturityDate;
  } else if (bond.firstAmortizationDate && bond.firstAmortizationDate !== "") {
    firstAmortDate = parseISODate(bond.firstAmortizationDate);
  } else {
    firstAmortDate = allCouponDates[0];
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay,
  );
  const totalNbAmortPeriods = allAmortDates.length;

  const amortPerPeriod =
    isIF || totalNbAmortPeriods === 0
      ? 0
      : INITIAL_NOMINAL_PER_TITRE / totalNbAmortPeriods;

  // Cf. getBondCashflows pour la dualite math vs display.
  let mathOutstanding = INITIAL_NOMINAL_PER_TITRE;
  let displayOutstanding = INITIAL_NOMINAL_PER_TITRE;
  let prevDate = issueDate;
  const cashflows: {
    date: string;
    type: "coupon" | "amortissement" | "remboursement";
    amount: number;
    outstandingAfter: number;
  }[] = [];

  for (let i = 0; i < allCouponDates.length; i++) {
    const d = allCouponDates[i];
    if (d.getTime() > today.getTime()) break; // on s'arrete au present
    const dateStr = d.toISOString().substring(0, 10);
    const days = daysBetweenDates(prevDate, d);

    const amortIndex = allAmortDates.findIndex(
      (ad) => ad.getTime() === d.getTime(),
    );
    const isAmortPeriod = amortIndex >= 0;
    const isLastAmort = amortIndex === totalNbAmortPeriods - 1;

    const couponBase = isSurTitre ? INITIAL_NOMINAL_PER_TITRE : mathOutstanding;
    const couponAmount = (couponBase * bond.couponRate * days) / 365;

    let amortAmount = 0;
    let isLastPayment = false;
    if (isAmortPeriod) {
      if (isIF) {
        if (i === allCouponDates.length - 1) {
          amortAmount = INITIAL_NOMINAL_PER_TITRE;
          isLastPayment = true;
        }
      } else if (isLastAmort) {
        amortAmount = isSurTitre ? amortPerPeriod : mathOutstanding;
        isLastPayment = true;
      } else {
        amortAmount = amortPerPeriod;
      }
    }

    const outstandingAfterAmort = Math.max(0, displayOutstanding - amortAmount);

    if (couponAmount > 0.01) {
      cashflows.push({
        date: dateStr,
        type: "coupon",
        amount: couponAmount,
        outstandingAfter: displayOutstanding,
      });
    }
    if (amortAmount > 0.01) {
      cashflows.push({
        date: dateStr,
        type: isLastPayment ? "remboursement" : "amortissement",
        amount: amortAmount,
        outstandingAfter: outstandingAfterAmort,
      });
    }

    displayOutstanding = Math.max(0, displayOutstanding - amortAmount);
    if (!isSurTitre) {
      mathOutstanding = Math.max(0, mathOutstanding - amortAmount);
    }
    prevDate = d;
  }

  return cashflows;
}

/**
 * Genere TOUS les evenements (coupons + amortissements + remboursement final)
 * sur la duree de vie complete d'une obligation, derives uniquement de sa
 * fiche dans obligations-cotees.csv.
 *
 * Delegation a la methode OFFICIELLE utilisee dans l'onglet "Echeancier &
 * flux" de la fiche obligation : `getBondPastCashflows` + `getBondCashflows`.
 * Cela garantit la coherence des montants entre la page detail et le
 * calendrier (meme reconstruction de nominal initial via outstanding ratio,
 * meme cascade, meme arrondi du dernier flux).
 *
 * `bond.amortizationMode` (T/N) n'influence que la description affichee,
 * pas le calcul (le calcul officiel cascade dans les deux cas, en partant
 * du nominal courant `bond.nominalValue`).
 */
export function generateBondLifecycleEvents(bond: ListedBond): ListedBondEvent[] {
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const ratePctFr = (bond.couponRate * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const modeLabel = bond.amortizationMode === "T" ? "sur titre" : "sur nominal";
  const isIF = bond.amortizationType === "IF" || !bond.amortizationType;

  const past = getBondPastCashflows(bond);
  const future = getBondCashflows(bond);
  const allFlows = [...past, ...future];

  // Index k/N pour la description de chaque amort. On compte tous les flux
  // non-coupon (intermediates + remboursement final) — pour AC/ACD c'est
  // egal a totalNbAmortPeriods, pour IF c'est 1.
  const totalAmortCount = allFlows.filter((cf) => cf.type !== "coupon").length;

  const events: ListedBondEvent[] = [];
  let amortCounter = 0;

  for (const cf of allFlows) {
    let description: string;
    if (cf.type === "coupon") {
      description = `Coupon ${ratePctFr}% par titre`;
    } else {
      amortCounter++;
      if (isIF) {
        description = `Remboursement final (in fine)`;
      } else if (cf.type === "remboursement") {
        description = `Remboursement final (${amortCounter}/${totalAmortCount})`;
      } else {
        description = `Amortissement ${modeLabel} (${amortCounter}/${totalAmortCount})`;
      }
    }

    events.push({
      isin: bond.isin,
      date: cf.date,
      eventType: cf.type,
      amount: round2(cf.amount),
      description,
      outstandingAfter: cf.outstandingAfter,
    });
  }

  return events;
}

/**
 * Aggrege les evenements de toutes les obligations en un flux unique trie
 * par date. Source unique : la fiche de chaque obligation.
 */
export function generateAllListedBondEvents(
  bonds: ListedBond[],
): ListedBondEvent[] {
  const out: ListedBondEvent[] = [];
  for (const b of bonds) {
    for (const e of generateBondLifecycleEvents(b)) out.push(e);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Utilitaire : calcule le nombre d'annees de differé a partir des dates.
 */
export function getDifferedYears(bond: ListedBond): number {
  if (!bond.firstAmortizationDate || bond.firstAmortizationDate === "") return 0;
  const issueDate = parseISODate(bond.issueDate);
  const firstAmortDate = parseISODate(bond.firstAmortizationDate);
  const years = (firstAmortDate.getTime() - issueDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(years - 1 / bond.couponFrequency));
}
// ==========================================
// PRIX THEORIQUE UMOA-TITRES (methodologie institutionnelle)
// ==========================================

export type EmissionUMOA = {
  // === Champs historiques (preserves pour compat avec calibrateTheoreticalYTM, courbes, etc.) ===
  date: string;              // ISO YYYY-MM-DD, issu de "Date de valeur"
  country: string;           // code 2 lettres (CI, SN, BF, ML, BJ, TG, NE, GW)
  isin: string;
  type: "OAT" | "BAT";
  maturity: number;          // en annees (converti depuis "Maturite (mois)" / 12)
  amount: number;            // montant retenu en millions FCFA
  weightedAvgYield: number;  // en decimal (0.065 pour 6,5%) — "Rendement moyen pondere"

  // === Nouveaux champs UMOA-Titres ===
  tradeDate: string;                          // "Date de l'operation"
  maturityDate: string;                       // ISO depuis "Echeance"
  maturityMonths: number;                     // brut depuis "Maturite (mois)"
  graceYears: number;                         // "Differe (annee)" — 0 si vide
  couponRate: number | null;                  // "Taux d'interet" en decimal — null pour BAT (zero-coupon)
  amortizationType: "Linéaire" | "In Fine" | null;
  marginalPrice: number | null;               // "Prix marginal"
  marginalYield: number | null;               // "Taux marginal (%)" en decimal — surtout BAT
  weightedAvgPrice: number | null;            // "Prix moyen pondere"
  weightedAvgRate: number | null;             // "Taux moyen pondere (%)" en decimal — surtout BAT
  precisions: string;                         // "Rachat simultane", "Echange", "BAT et BSR", etc.
  countryName: string;                        // nom complet francais ("Cote d'Ivoire")
  amountSubmitted: number;                    // "Montant soumis" — utile pour ratio de couverture
  amountIssued: number;                       // "Montant" — taille du programme (cumul prevu)
  /** Lien vers la fiche UMOA-Titres de cette adjudication (umoatitres.org). */
  url: string;
};

// ==========================================
// TAUX DE COUVERTURE UMOA-TITRES (soumis / proposé)
// ==========================================
//
// Un État sollicite un montant GLOBAL (« montantM » → amountIssued) qu'il lève
// via plusieurs instruments le même jour (p. ex. 50 Mds à travers 3 lignes
// BAT/OAT). Dans le CSV, ce montant proposé est répété À L'IDENTIQUE sur chaque
// ligne, tandis que montants soumis et retenus diffèrent par ligne. Sommer
// naïvement amountIssued le surcompte donc (×3 pour 3 lignes) et écrase le taux
// de couverture.
//
// La mesure correcte regroupe les lignes par SESSION d'adjudication
// (pays, date, montant proposé), ne compte le montant proposé qu'UNE fois par
// session, et divise la somme de tous les montants soumis par ce total. Toutes
// les lignes d'une même session partagent ainsi le même taux de couverture.

type CoverageRow = Pick<
  EmissionUMOA,
  "country" | "date" | "amountSubmitted" | "amountIssued" | "amount" | "precisions"
>;

/** Clé de session d'adjudication cash : pays + date + montant proposé. */
export function umoaSessionKey(e: Pick<EmissionUMOA, "country" | "date" | "amountIssued">): string {
  return `${e.country}|${e.date}|${e.amountIssued}`;
}

/**
 * Taux de couverture agrégé sur un ensemble d'opérations.
 *
 * - Adjudication cash : référence = montant proposé, compté UNE seule fois par
 *   session (pays, date, montant proposé), cf. le commentaire ci-dessus.
 * - Échange / rachat : le « montant proposé » du CSV est une enveloppe cumulée
 *   non pertinente (elle écrase le taux). Ces opérations sont mécaniques (le
 *   montant soumis est servi) : la référence est le montant RETENU, soit une
 *   couverture = soumis / retenu — 100 % pour un échange où soumis = retenu,
 *   conformément aux documents officiels UMOA-Titres.
 *
 * Renvoie null si aucune référence exploitable.
 */
export function umoaCoverageRatio(items: CoverageRow[]): number | null {
  const proposedBySession = new Map<string, number>();
  let submitted = 0;
  let reference = 0;
  for (const e of items) {
    if (classifyOperation(e.precisions) === "cash_auction") {
      if (!(e.amountIssued > 0)) continue;
      submitted += e.amountSubmitted;
      proposedBySession.set(umoaSessionKey(e), e.amountIssued);
    } else {
      // Échange / rachat : référence = montant retenu (opération mécanique).
      if (!(e.amount > 0)) continue;
      submitted += e.amountSubmitted;
      reference += e.amount;
    }
  }
  for (const v of proposedBySession.values()) reference += v;
  return reference > 0 ? submitted / reference : null;
}

/**
 * Couverture des SESSIONS cash : Map clé de session → ratio soumis/proposé.
 * Les échanges/rachats n'y figurent pas (leur couverture se calcule par ligne
 * via umoaRowCoverage). Calculer sur l'historique complet d'un émetteur garantit
 * des sessions complètes (toutes les lignes d'une session partagent la même date).
 */
export function umoaCoverageBySession(items: CoverageRow[]): Map<string, number> {
  const submittedBySession = new Map<string, number>();
  const proposedBySession = new Map<string, number>();
  for (const e of items) {
    if (classifyOperation(e.precisions) !== "cash_auction") continue;
    if (!(e.amountIssued > 0)) continue;
    const key = umoaSessionKey(e);
    submittedBySession.set(key, (submittedBySession.get(key) ?? 0) + e.amountSubmitted);
    proposedBySession.set(key, e.amountIssued);
  }
  const out = new Map<string, number>();
  for (const [key, sub] of submittedBySession) {
    const proposed = proposedBySession.get(key) ?? 0;
    if (proposed > 0) out.set(key, sub / proposed);
  }
  return out;
}

/**
 * Taux de couverture d'une ligne pour l'affichage :
 * - adjudication cash → couverture de SA session (soumis/proposé), identique
 *   pour tous les instruments d'une même sollicitation ;
 * - échange / rachat → soumis/retenu (mécanique : 100 % pour un échange).
 * `cashSessionCoverage` est la Map renvoyée par umoaCoverageBySession.
 */
export function umoaRowCoverage(
  e: CoverageRow,
  cashSessionCoverage: Map<string, number>,
): number | null {
  if (classifyOperation(e.precisions) === "cash_auction") {
    return cashSessionCoverage.get(umoaSessionKey(e)) ?? null;
  }
  return e.amount > 0 ? e.amountSubmitted / e.amount : null;
}

/**
 * Emission a venir UMOA-Titres : prochaines adjudications avec details connus.
 * Source : data/umoa-emissions-a-venir.csv (scraper UMOA quotidien).
 */
export type EmissionUMOAFuture = {
  country: string;            // code 2 lettres
  countryName: string;        // nom complet "Côte d’Ivoire"
  titreES: string;            // ex "ES (Titre 1)" si applicable
  instrument: string;         // BAT / OAT / ES / ""
  precisions: string;
  dateOperation: string;      // ISO YYYY-MM-DD
  dateValeur: string;         // ISO ou "" si pas encore fixe
  echeance: string;           // ISO ou ""
  maturityMonths: number;     // 0 si non communique
  graceYears: number;
  amount: number;             // millions FCFA, montant prevu d'emission
  url: string;                // lien vers la fiche UMOA-Titres
};

/**
 * Emission planifiee UMOA-Titres : calendrier annuel agence, peu d'infos.
 * Source : data/umoa-emissions-planifiees.csv (scraper UMOA quotidien).
 */
export type EmissionUMOAPlanned = {
  country: string;
  countryName: string;
  titreES: string;
  instrument: string;         // souvent vide a ce stade
  precisions: string;
  dateOperation: string;      // ISO YYYY-MM-DD
  amount: number;             // millions FCFA, indicatif
  url: string;
};

/**
 * Classification des operations UMOA-Titres selon la nature economique :
 *
 * - cash_auction : adjudication compétitive avec entrée de cash neuf pour
 *   l'État. Inclut les vanilla (precisions vide), les programmes BSR / OdR /
 *   COVID-19 / BAT, et les "Adjudications ciblées" (placement pré-négocié
 *   mais qui amène quand même du cash).
 *
 * - swap : nouveau titre créé sans entrée de cash (echange contre un titre
 *   existant ou rachat simultané qui s'auto-compense). Le rendement publié
 *   est mécanique, pas un clearing de marché.
 *
 * - buyback : rachat pur, l'État rappelle de la dette en sortant du cash. Pas
 *   d'émission nouvelle.
 */
export type SovereignOperationKind = "cash_auction" | "swap" | "buyback";

export function classifyOperation(precisions: string): SovereignOperationKind {
  const p = (precisions || "").trim();
  if (p === "") return "cash_auction";
  if (p === "Echange" || p === "Rachat simultané") return "swap";
  if (/^(Rachat|Programme)/i.test(p)) return "buyback";
  return "cash_auction";
}

// Mapping pays nom complet (CSV) → code 2 lettres (utilise dans le reste du code).
// Comporte les ALIAS rencontres dans les CSV scrapes (umoa-emissions-realisees /
// -a-venir / -planifiees) :
//  - "Burkina" sans "Faso" (forme courte UMOA-Titres) → BF
//  - apostrophe courbe U+2019 dans "Côte d’Ivoire" → CI
//  - "Cote d'Ivoire" sans diacritique (defensif) → CI
export const UMOA_COUNTRY_CODE: Record<string, string> = {
  "Côte d'Ivoire": "CI",
  "Côte d’Ivoire": "CI",
  "Cote d'Ivoire": "CI",
  "Sénégal": "SN",
  "Senegal": "SN",
  "Burkina Faso": "BF",
  "Burkina": "BF",
  "Mali": "ML",
  "Bénin": "BJ",
  "Benin": "BJ",
  "Togo": "TG",
  "Niger": "NE",
  "Guinée Bissau": "GW",
  "Guinée-Bissau": "GW",
  "Guinee Bissau": "GW",
};

/**
 * Calibre le YTM theorique d'une obligation a une date donnee, base sur
 * les emissions UMOA-Titres des 3 derniers mois du meme pays (OAT uniquement).
 *
 * Methodologie :
 * 1. Filtrer : meme country, type OAT, date dans [T-90j, T]
 * 2. Moyenne ponderee par amount pour chaque maturite trouvee
 * 3. Interpolation lineaire pour la maturite residuelle de l'obligation cible
 */
// Liste des pays UEMOA (souverains emetteurs d'OAT)
const UEMOA_COUNTRIES = ["CI", "SN", "BF", "ML", "BJ", "TG", "NE", "GW"];

/**
 * Calibre le YTM theorique d'une obligation a une date donnee, base sur
 * les emissions UMOA-Titres des 3 derniers mois.
 *
 * Logique :
 * - Pour un emetteur souverain UEMOA (CI, SN, ...) : courbe du pays uniquement
 * - Pour un emetteur supranational (UEMOA, CEDEAO, ...) : courbe UEMOA agregee
 *   (moyenne ponderee par montant de TOUS les pays UEMOA)
 */
export function calibrateTheoreticalYTM(
  country: string,
  targetDate: Date,
  residualMaturity: number,
  emissions: EmissionUMOA[]
): {
  ytm: number;
  basePoints: Array<{ maturity: number; ytm: number; amount: number }>;
  issuancesUsed: number;
  curveType: "pays" | "UEMOA-agregee";
} | null {
  if (residualMaturity <= 0) return null;

  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const startDate = new Date(targetDate.getTime() - THREE_MONTHS_MS);

  // Determiner si c'est un pays UEMOA ou un supranational
  const isUemoaCountry = UEMOA_COUNTRIES.includes(country);
  const curveType = isUemoaCountry ? "pays" : "UEMOA-agregee";

  // Filtrer emissions eligibles
  const eligible = emissions.filter((e) => {
    // Filtre pays : soit meme pays (pour souverains), soit tous pays UEMOA (pour supra)
    if (isUemoaCountry) {
      if (e.country !== country) return false;
    } else {
      if (!UEMOA_COUNTRIES.includes(e.country)) return false;
    }
    if (e.type !== "OAT") return false;
    if (e.maturity <= 0 || e.maturity > 50) return false;
    if (e.amount <= 0) return false;
    if (e.weightedAvgYield <= 0 || e.weightedAvgYield > 0.3) return false;
    // On exclut les operations sans entree de cash (echange, rachat simultane,
    // pur rachat) : leurs rendements sont mecaniques, pas un clearing de marche,
    // et tirent la courbe vers le bas.
    if (classifyOperation(e.precisions) !== "cash_auction") return false;
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return false;
    return d >= startDate && d <= targetDate;
  });

  if (eligible.length === 0) return null;

  // Grouper par maturite et calculer moyenne ponderee
  const byMaturity = new Map<number, { sumYieldAmount: number; sumAmount: number }>();
  for (const e of eligible) {
    const entry = byMaturity.get(e.maturity) || { sumYieldAmount: 0, sumAmount: 0 };
    entry.sumYieldAmount += e.weightedAvgYield * e.amount;
    entry.sumAmount += e.amount;
    byMaturity.set(e.maturity, entry);
  }

  const basePoints = Array.from(byMaturity.entries())
    .map(([maturity, v]) => ({
      maturity,
      ytm: v.sumYieldAmount / v.sumAmount,
      amount: v.sumAmount,
    }))
    .sort((a, b) => a.maturity - b.maturity);

  if (basePoints.length === 0) return null;

  // Interpolation lineaire
  let ytm: number;
  if (residualMaturity <= basePoints[0].maturity) {
    ytm = basePoints[0].ytm;
  } else if (residualMaturity >= basePoints[basePoints.length - 1].maturity) {
    ytm = basePoints[basePoints.length - 1].ytm;
  } else {
    let lowPoint = basePoints[0];
    let highPoint = basePoints[basePoints.length - 1];
    for (let i = 0; i < basePoints.length - 1; i++) {
      if (
        basePoints[i].maturity <= residualMaturity &&
        basePoints[i + 1].maturity >= residualMaturity
      ) {
        lowPoint = basePoints[i];
        highPoint = basePoints[i + 1];
        break;
      }
    }
    const ratio =
      (residualMaturity - lowPoint.maturity) /
      (highPoint.maturity - lowPoint.maturity);
    ytm = lowPoint.ytm + ratio * (highPoint.ytm - lowPoint.ytm);
  }

  return {
    ytm,
    basePoints,
    issuancesUsed: eligible.length,
    curveType,
  };
}

/**
 * Calcule le prix pied de coupon theorique d'une obligation a un YTM donne.
 * Actualise tous les flux futurs (coupons + amortissements) au YTM.
 * Prend en compte l'amortissement.
 */
export function theoreticalCleanPrice(
  bond: ListedBond,
  operationDate: Date,
  ytm: number
): number {
  return priceFromYtm(bond, operationDate, ytm).cleanPrice;
}

/**
 * Genere la serie temporelle des prix theoriques d'une obligation,
 * hebdomadaire, sur les N derniers mois.
 */
export function buildTheoreticalPriceHistory(
  bond: ListedBond,
  emissions: EmissionUMOA[],
  monthsBack: number = 12
): Array<{ date: string; theoreticalPrice: number; ytm: number }> {
  const today = new Date();
  const issueDate = parseISODate(bond.issueDate);
  if (isNaN(issueDate.getTime())) return [];

  const startDate = new Date(today.getTime() - monthsBack * 30 * 24 * 60 * 60 * 1000);
  const effectiveStart = startDate.getTime() > issueDate.getTime() ? startDate : issueDate;

  const points: Array<{ date: string; theoreticalPrice: number; ytm: number }> = [];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (let t = effectiveStart.getTime(); t <= today.getTime(); t += WEEK_MS) {
    const date = new Date(t);
    const maturityDate = parseISODate(bond.maturityDate);
    const residual = (maturityDate.getTime() - t) / (365.25 * 24 * 60 * 60 * 1000);
    if (residual <= 0) continue;

    const calib = calibrateTheoreticalYTM(bond.country, date, residual, emissions);
    if (!calib) continue;

    const price = theoreticalCleanPrice(bond, date, calib.ytm);
    if (price > 0) {
      points.push({
        date: date.toISOString().substring(0, 10),
        theoreticalPrice: price,
        ytm: calib.ytm,
      });
    }
  }

  return points;
}

/**
 * Spread de signature / Prime de cotation BRVM.
 *
 * Compare le YTM coté BRVM observé (déduit du dernier prix pied de coupon) à
 * la courbe primaire UMOA-Titres du pays calibrée au jour J, interpolée à la
 * maturité résiduelle.
 *
 * - Pour un émetteur corporate / agence : prime de risque crédit vs souverain.
 * - Pour un émetteur souverain (Etat / Sukuk Etat) : prime de liquidité du
 *   marché secondaire coté vs primaire (un même État comparé à lui-même).
 *
 * Retourne null si :
 * - pas de cotation BRVM observée (sinon on calculerait le spread à partir du
 *   prix théorique, qui est lui-même dérivé de la courbe → spread ≈ 0 par
 *   construction, sans valeur informative),
 * - obligation arrivée à échéance,
 * - pas assez d'adjudications primaires comparables sur la fenêtre.
 */
export function calculateSignatureSpread(
  bond: ListedBond,
  observedYtm: number | null,
  emissions: EmissionUMOA[],
  asOfDate: Date = new Date()
): number | null {
  if (observedYtm == null || !isFinite(observedYtm)) return null;

  const maturityDate = parseISODate(bond.maturityDate);
  if (isNaN(maturityDate.getTime())) return null;

  const residualMaturity =
    (maturityDate.getTime() - asOfDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (residualMaturity <= 0) return null;

  const calib = calibrateTheoreticalYTM(bond.country, asOfDate, residualMaturity, emissions);
  if (!calib) return null;

  return observedYtm - calib.ytm;
}
// ==========================================
// SOUVERAINS NON COTES (UMOA-Titres : OAT + BAT)
// ==========================================

/**
 * Represente une "obligation souveraine" consolidee : toutes les adjudications
 * du meme ISIN agregees. Pour les BAT sans ISIN, chaque ligne est une emission
 * independante.
 */
export type SovereignBond = {
  // Identification
  id: string;                    // ISIN pour OAT, ou "BAT-{country}-{date}-{maturity}" pour BAT
  isin: string;                  // peut etre vide pour BAT
  country: string;
  countryName: string;           // nom complet ("Cote d'Ivoire")
  type: "OAT" | "BAT";

  // Caracteristiques (issues du 1er round)
  nominalValue: number;          // 1 000 000 pour BAT, 10 000 pour OAT
  maturity: number;              // en annees
  maturityDate: string;          // ISO date d'echeance
  firstIssueDate: string;        // date de valeur du 1er round
  lastIssueDate: string;         // date de valeur du dernier round
  /** Date de l'adjudication (date d'operation) du dernier round cash.
   *  C'est ce que UMOA-Titres appelle "date de l'operation" — la date a
   *  laquelle les enchères ont été tenues, distincte de la "date de valeur"
   *  (= date de jouissance, ~2 jours après l'adjudication). C'est la date
   *  d'adjudication que l'on affiche dans les vues "Dernières adjudications". */
  lastTradeDate: string;
  /** Lien UMOA-Titres (umoatitres.org) vers la fiche du dernier round cash.
   *  Permet d'ouvrir directement la page de detail de l'adjudication depuis
   *  les vues bonds. Chaine vide si pas de URL connue. */
  lastUrl: string;
  nbRounds: number;              // nb d'adjudications

  // Caracteristiques OAT (null pour BAT)
  couponRate: number | null;     // taux nominal du coupon (decimal)
  amortizationType: "Linéaire" | "In Fine" | null;
  graceYears: number;            // differe (0 pour BAT et la plupart des OAT)

  // Montants — modele en 3 strates :
  // - cashAmount        : cash leve via adjudications competitives (entree de
  //                       cash + nouveau notional cree). KPI principal.
  // - swapAmount        : nouveau notional cree par echange / rachat simultane
  //                       (pas de cash neuf, mais titre cree).
  // - buybackAmount     : titres rappeles par l'Etat (sortie de cash, notional
  //                       reduit). Equivaut a une dette retiree.
  // - outstandingEstimate = cashAmount + swapAmount - buybackAmount.
  //                       C'est l'encours circulant estime (notional cree net
  //                       des rachats). C'est ce que tient en portefeuille
  //                       l'ensemble des investisseurs aujourd'hui.
  // - totalAmount       : somme brute des |montants| de tous les rounds, sans
  //                       distinction de signe. Indicateur d'activite totale.
  totalAmount: number;
  totalSubmitted: number;
  cashAmount: number;
  cashSubmitted: number;
  swapAmount: number;
  buybackAmount: number;
  outstandingEstimate: number;
  cashRoundsCount: number;       // nb de cash auctions (sous-ensemble de nbRounds)
  swapRoundsCount: number;
  buybackRoundsCount: number;
  avgYield: number;              // YTM moyen pondere sur cash auctions uniquement
  avgBuybackYield: number;       // YTM moyen pondere des rachats (yield de sortie)
                                  // — 0 si aucun rachat
  lastYield: number;              // dernier round cash (sinon dernier round tout court)

  // Detail des adjudications (un objet par round)
  adjudications: Array<{
    tradeDate: string;                        // "Date de l'operation"
    valueDate: string;                        // "Date de valeur"
    amount: number;                           // montant retenu
    amountSubmitted: number;                  // montant soumis
    absorption: number;                       // taux d'absorption = retenu / soumis
    yield: number;                            // rendement moyen pondere
    marginalYield: number | null;             // taux marginal
    weightedAvgRate: number | null;           // taux moyen pondere (BAT)
    marginalPrice: number | null;
    weightedAvgPrice: number | null;
    precisions: string;                       // type de round
    kind: SovereignOperationKind;             // cash_auction / swap / buyback
  }>;
};
/**
 * Version legere du SovereignBond pour l'affichage liste (sans le detail
 * des adjudications qui alourdit le payload).
 */
export type SovereignBondLite = {
  id: string;
  isin: string;
  country: string;
  type: "OAT" | "BAT";
  maturity: number;
  lastIssueDate: string;       // date de valeur du dernier round
  lastTradeDate: string;       // date d'adjudication du dernier round cash
  lastUrl: string;             // lien UMOA-Titres du dernier round cash
  nbRounds: number;
  // Volume affiche dans la liste = encours circulant estime (net des rachats),
  // plus parlant que le brut. totalAmount conserve pour reference.
  totalAmount: number;
  outstandingEstimate: number;
  lastYield: number;
};

export function toLite(b: SovereignBond): SovereignBondLite {
  return {
    id: b.id,
    isin: b.isin,
    country: b.country,
    type: b.type,
    maturity: b.maturity,
    lastIssueDate: b.lastIssueDate,
    lastTradeDate: b.lastTradeDate,
    lastUrl: b.lastUrl,
    nbRounds: b.nbRounds,
    totalAmount: b.totalAmount,
    outstandingEstimate: b.outstandingEstimate,
    lastYield: b.lastYield,
  };
}
/**
 * Agrege les emissions UMOA-Titres par ISIN (pour les OAT) et par adjudication
 * individuelle (pour les BAT). Filtre les lignes aberrantes.
 */
export function aggregateSovereignBonds(emissions: EmissionUMOA[]): SovereignBond[] {
  // Filtre des aberrations
  const valid = emissions.filter((e) => {
    if (!e.date || !e.country) return false;
    if (e.maturity <= 0 || e.maturity > 50) return false;
    if (e.amount <= 0) return false;
    if (e.weightedAvgYield <= 0 || e.weightedAvgYield > 0.3) return false;
    // Pour OAT : ISIN obligatoire et non "--"
    if (e.type === "OAT") {
      if (!e.isin || e.isin === "--" || e.isin.trim() === "") return false;
    }
    return true;
  });

  // Groupage
  // OAT : cle = ISIN
  // BAT : cle = unique par adjudication (pas de consolidation car pas d'ISIN)
  const groups = new Map<string, EmissionUMOA[]>();
  for (const e of valid) {
    let key: string;
    if (e.type === "OAT") {
      key = e.isin;
    } else {
      // BAT : chaque ligne est une adjudication independante
      key = `BAT-${e.country}-${e.date}-${e.maturity}-${Math.round(e.amount)}`;
    }
    const existing = groups.get(key) || [];
    existing.push(e);
    groups.set(key, existing);
  }

  // Construction des objets SovereignBond
  const bonds: SovereignBond[] = [];
  for (const [key, rounds] of groups.entries()) {
    // Trier par date croissante
    rounds.sort((a, b) => a.date.localeCompare(b.date));

    const first = rounds[0];
    const last = rounds[rounds.length - 1];

    // Classification par round
    const enriched = rounds.map((r) => ({ ...r, kind: classifyOperation(r.precisions) }));
    const cashRounds = enriched.filter((r) => r.kind === "cash_auction");
    const swapRounds = enriched.filter((r) => r.kind === "swap");
    const buybackRounds = enriched.filter((r) => r.kind === "buyback");

    const totalAmount = rounds.reduce((sum, r) => sum + r.amount, 0);
    const cashAmount = cashRounds.reduce((sum, r) => sum + r.amount, 0);
    const swapAmount = swapRounds.reduce((sum, r) => sum + r.amount, 0);
    const buybackAmount = buybackRounds.reduce((sum, r) => sum + r.amount, 0);
    // Encours circulant estime : notional cree (cash + swaps) net des rachats.
    // Floor a 0 pour eviter de dramatiser les buybacks superieurs au cumul
    // (cas rare ou la donnee est partielle).
    const outstandingEstimate = Math.max(0, cashAmount + swapAmount - buybackAmount);

    // avgYield calcule uniquement sur les cash auctions (rendements de marche reels)
    const avgYield =
      cashAmount > 0
        ? cashRounds.reduce((sum, r) => sum + r.weightedAvgYield * r.amount, 0) / cashAmount
        : 0;
    // Yield moyen des rachats (yield de sortie : a quel niveau les detenteurs
    // ont accepte de ceder leur titre). Diffe´rent du clearing primaire.
    const avgBuybackYield =
      buybackAmount > 0
        ? buybackRounds.reduce((sum, r) => sum + r.weightedAvgYield * r.amount, 0) /
          buybackAmount
        : 0;
    // lastYield : dernier round cash si dispo, sinon dernier round tout court
    const lastCashRound = cashRounds[cashRounds.length - 1];
    const lastYield = lastCashRound ? lastCashRound.weightedAvgYield : last.weightedAvgYield;
    // lastIssueDate : on vise la date de la derniere VRAIE adjudication cash.
    // Sinon (cas rare ou il n'y a aucun round cash) on retombe sur le dernier
    // round absolu pour eviter une chaine vide.
    const lastIssueDate = lastCashRound ? lastCashRound.date : last.date;
    // lastTradeDate : date d'OPERATION (= date de l'adjudication) — distincte
    // de la date de valeur (= date de jouissance, ~2 jours plus tard).
    // C'est cette date qui doit etre affichee comme "date d'adjudication".
    const lastTradeDate = lastCashRound ? lastCashRound.tradeDate : last.tradeDate;
    const lastUrl = lastCashRound ? lastCashRound.url : last.url;

    const totalSubmitted = rounds.reduce((sum, r) => sum + (r.amountSubmitted || 0), 0);
    const cashSubmitted = cashRounds.reduce((sum, r) => sum + (r.amountSubmitted || 0), 0);

    bonds.push({
      id: first.type === "OAT" ? first.isin : key,
      isin: first.isin,
      country: first.country,
      countryName: first.countryName,
      type: first.type,
      nominalValue: nominalFor(first.type),
      maturity: first.maturity,
      maturityDate: first.maturityDate,
      firstIssueDate: first.date,
      lastIssueDate,
      lastTradeDate,
      lastUrl,
      nbRounds: rounds.length,
      couponRate: first.couponRate,
      amortizationType: first.amortizationType,
      graceYears: first.graceYears,
      totalAmount,
      totalSubmitted,
      cashAmount,
      cashSubmitted,
      swapAmount,
      buybackAmount,
      outstandingEstimate,
      cashRoundsCount: cashRounds.length,
      swapRoundsCount: swapRounds.length,
      buybackRoundsCount: buybackRounds.length,
      avgYield,
      avgBuybackYield,
      lastYield,
      adjudications: enriched.map((r) => ({
        tradeDate: r.tradeDate,
        valueDate: r.date,
        amount: r.amount,
        amountSubmitted: r.amountSubmitted,
        absorption: r.amountSubmitted > 0 ? r.amount / r.amountSubmitted : 0,
        yield: r.weightedAvgYield,
        marginalYield: r.marginalYield,
        weightedAvgRate: r.weightedAvgRate,
        marginalPrice: r.marginalPrice,
        weightedAvgPrice: r.weightedAvgPrice,
        precisions: r.precisions,
        kind: r.kind,
      })),
    });
  }

  return bonds;
}

/**
 * Statistiques du marche souverain non cote — RESTREINTES aux bonds ACTIFS
 * (maturityDate > asOfDate). Les bonds echus sont conservés dans le tableau
 * source `bonds` (pour le tableau historique paginé) mais retires des KPIs.
 *
 * Auparavant cette fonction agregait sur tous les bonds, ce qui :
 *  - gonflait "Titres actifs" (65% etaient en realite echus)
 *  - affichait un volume cumule historique au lieu de l'encours
 *  - pondrait le taux moyen avec des rendements obsoletes
 *  - utilisait la maturite ORIGINALE a l'emission (pas residuelle)
 */
export function getSovereignMarketStats(
  bonds: SovereignBond[],
  asOfDate: Date = new Date(),
): {
  // === Totaux marche (OAT + BAT) ===
  totalBonds: number;
  totalBAT: number;
  totalOAT: number;
  totalVolume: number;
  avgYield: number;
  avgMaturity: number;
  // === Split par type ===
  volumeOAT: number;
  volumeBAT: number;
  avgYieldOAT: number;
  avgYieldBAT: number;
  avgMaturityOAT: number;
  avgMaturityBAT: number;
  /** Conservé pour compat : count tous bonds (historique inclus). */
  totalBondsAll: number;
  byCountry: Record<string, number>;
  volumeByCountry: Record<string, number>;
} {
  const ms = asOfDate.getTime();
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;

  // Filtre bonds actifs : echeance strictement future.
  const actives = bonds.filter((b) => {
    if (!b.maturityDate) return false;
    const matMs = new Date(b.maturityDate).getTime();
    return Number.isFinite(matMs) && matMs > ms;
  });

  // Helper : statistiques pondérées par volume sur un subset.
  const statsFor = (subset: SovereignBond[]) => {
    const volume = subset.reduce((sum, b) => sum + b.totalAmount, 0);
    const yieldW =
      volume > 0
        ? subset.reduce((sum, b) => sum + b.lastYield * b.totalAmount, 0) /
          volume
        : 0;
    const maturityW =
      volume > 0
        ? subset.reduce((sum, b) => {
            const matMs = new Date(b.maturityDate).getTime();
            const residual = Math.max(0, (matMs - ms) / yearMs);
            return sum + residual * b.totalAmount;
          }, 0) / volume
        : 0;
    return { volume, yieldW, maturityW };
  };

  const all = statsFor(actives);
  const oats = statsFor(actives.filter((b) => b.type === "OAT"));
  const bats = statsFor(actives.filter((b) => b.type === "BAT"));

  const byCountry = actives.reduce(
    (acc, b) => {
      acc[b.country] = (acc[b.country] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const volumeByCountry = actives.reduce(
    (acc, b) => {
      acc[b.country] = (acc[b.country] || 0) + b.totalAmount;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    totalBonds: actives.length,
    totalBAT: actives.filter((b) => b.type === "BAT").length,
    totalOAT: actives.filter((b) => b.type === "OAT").length,
    totalVolume: all.volume,
    avgYield: all.yieldW,
    avgMaturity: all.maturityW,
    volumeOAT: oats.volume,
    volumeBAT: bats.volume,
    avgYieldOAT: oats.yieldW,
    avgYieldBAT: bats.yieldW,
    avgMaturityOAT: oats.maturityW,
    avgMaturityBAT: bats.maturityW,
    totalBondsAll: bonds.length,
    byCountry,
    volumeByCountry,
  };
}

/**
 * Spread du dernier round vs courbe primaire pays au jour J interpolee a la
 * maturite residuelle. Sememantique investisseur :
 * - Positif (vert) = ce round s'est negocie au-dessus de la courbe ; investisseurs
 *   ont capture une prime (round mieux remunere que la moyenne pays-maturite).
 * - Negatif (rouge) = ce round s'est negocie sous la courbe ; signal de demande
 *   forte ou pricing serre vs la moyenne.
 *
 * Retourne null si l'obligation est expiree ou s'il n'y a pas assez d'adjudications
 * primaires sur la fenetre de calibration.
 */
export function calculateSovereignSpread(
  bond: SovereignBond,
  emissions: EmissionUMOA[],
  asOfDate: Date = new Date()
): number | null {
  const matDate = parseISODate(bond.maturityDate);
  if (isNaN(matDate.getTime())) return null;

  const residualMaturity =
    (matDate.getTime() - asOfDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (residualMaturity <= 0) return null;

  const calib = calibrateTheoreticalYTM(bond.country, asOfDate, residualMaturity, emissions);
  if (!calib) return null;

  return bond.lastYield - calib.ytm;
}

/**
 * Recupere les autres titres souverains du meme pays, tries par maturite
 * residuelle proche de celle de la cible. Utilise pour le bloc "Autres titres"
 * de la fiche detail.
 */
export function getRelatedSovereignBonds(
  target: SovereignBond,
  all: SovereignBond[],
  limit: number = 6
): SovereignBond[] {
  return all
    .filter((b) => b.id !== target.id && b.country === target.country)
    .sort(
      (a, b) =>
        Math.abs(a.maturity - target.maturity) - Math.abs(b.maturity - target.maturity)
    )
    .slice(0, limit);
}

// ==========================================
// MOTEUR ACTUARIEL POUR LES SOUVERAINS NON COTES
// ==========================================

// Nominaux par convention UMOA-Titres :
// - OAT : 10 000 FCFA par titre
// - BAT : 1 000 000 FCFA par titre (titres pre´comptes du marche monetaire)
export const OAT_NOMINAL = 10_000;
export const BAT_NOMINAL = 1_000_000;
// Alias retro-compatible — utilise par les vues. Pointe sur OAT_NOMINAL pour
// preserver le comportement par defaut (les rares appelants externes parlaient
// d'OAT).
export const SOVEREIGN_NOMINAL = OAT_NOMINAL;

export function nominalFor(type: "OAT" | "BAT"): number {
  return type === "BAT" ? BAT_NOMINAL : OAT_NOMINAL;
}

export type SovereignCashflow = {
  date: string;            // ISO YYYY-MM-DD
  type: "coupon" | "amortissement" | "remboursement_final";
  amount: number;          // par titre, sur nominal SOVEREIGN_NOMINAL
  outstandingAfter: number;// capital restant du apres ce flux
};

/**
 * Genere l'echeancier des flux d'un OAT (frequence annuelle, coupon sur capital
 * restant du, amortissement Lineaire ou In Fine, gere le differe). Pour les
 * BAT zero-coupon : un unique remboursement au pair a l'echeance.
 *
 * Hypotheses :
 * - Coupons annuels (convention UMOA-Titres standard pour les OAT en XOF).
 * - Anniversaires sur la "Date de valeur" du 1er round.
 * - Linéaire : amortissement constant sur (totalYears − grace) annees, le
 *   coupon de chaque annee est calcule sur le capital restant du de l'annee.
 * - In Fine : remboursement bullet a l'echeance.
 */
export function getSovereignCashflows(bond: SovereignBond): SovereignCashflow[] {
  const nominal = bond.nominalValue;

  // BAT ou OAT sans coupon connu : on traite en zero-coupon.
  if (bond.type === "BAT" || bond.couponRate == null || bond.couponRate <= 0) {
    return [
      {
        date: bond.maturityDate,
        type: "remboursement_final",
        amount: nominal,
        outstandingAfter: 0,
      },
    ];
  }

  const issueDate = parseISODate(bond.firstIssueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) return [];

  const yearsBetween =
    (maturityDate.getTime() - issueDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const totalYears = Math.max(1, Math.round(yearsBetween));
  const grace = Math.max(0, Math.min(bond.graceYears, totalYears - 1));
  const amortYears = Math.max(1, totalYears - grace);
  const amortPerPeriod =
    bond.amortizationType === "Linéaire" ? nominal / amortYears : 0;

  const cashflows: SovereignCashflow[] = [];
  let outstanding = nominal;
  const coupon = bond.couponRate;

  for (let y = 1; y <= totalYears; y++) {
    const dt = new Date(issueDate);
    dt.setUTCFullYear(dt.getUTCFullYear() + y);
    const dateISO = dt.toISOString().slice(0, 10);

    // Coupon sur le capital restant du au debut de la periode
    const interest = outstanding * coupon;
    cashflows.push({
      date: dateISO,
      type: "coupon",
      amount: interest,
      outstandingAfter: outstanding,
    });

    // Amortissement apres la periode de differe
    if (y > grace) {
      if (bond.amortizationType === "Linéaire") {
        const principal = y === totalYears ? outstanding : amortPerPeriod;
        outstanding = Math.max(0, outstanding - principal);
        cashflows.push({
          date: dateISO,
          type: y === totalYears ? "remboursement_final" : "amortissement",
          amount: principal,
          outstandingAfter: outstanding,
        });
      } else if (y === totalYears) {
        cashflows.push({
          date: dateISO,
          type: "remboursement_final",
          amount: outstanding,
          outstandingAfter: 0,
        });
        outstanding = 0;
      }
    }
  }

  return cashflows;
}

/**
 * Metriques actuarielles d'un souverain non cote a une date donnee, pour un
 * YTM cible. Convention Act/365, capitalisation annuelle.
 *
 * Retourne null si l'obligation est expiree (aucun cashflow futur).
 */
export function calculateSovereignActuarialMetrics(
  bond: SovereignBond,
  asOfDate: Date,
  ytm: number
): {
  cleanPrice: number;
  dirtyPrice: number;
  accruedInterest: number;
  macaulay: number;
  modified: number;
  convexity: number;
  bpv: number;
} | null {
  const cashflows = getSovereignCashflows(bond);
  const future = cashflows.filter(
    (cf) => parseISODate(cf.date).getTime() > asOfDate.getTime()
  );
  if (future.length === 0) return null;

  let sumPV = 0;
  let sumTimesPV = 0;
  let sumTimesSquaredPV = 0;

  for (const cf of future) {
    const days =
      (parseISODate(cf.date).getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000);
    const years = days / 365;
    const df = Math.pow(1 + ytm, -years);
    const pv = cf.amount * df;
    sumPV += pv;
    sumTimesPV += years * pv;
    sumTimesSquaredPV += years * (years + 1) * pv;
  }

  const dirtyPrice = sumPV;
  const macaulay = sumPV > 0 ? sumTimesPV / sumPV : 0;
  const modified = ytm > -1 ? macaulay / (1 + ytm) : 0;
  const convexity =
    sumPV > 0 && ytm > -1 ? sumTimesSquaredPV / sumPV / Math.pow(1 + ytm, 2) : 0;

  // Coupon couru (OAT seulement) : interpolation lineaire entre les
  // anniversaires de la "Date de valeur" du 1er round.
  let accruedInterest = 0;
  if (bond.type === "OAT" && bond.couponRate != null && bond.couponRate > 0) {
    const issueDate = parseISODate(bond.firstIssueDate);
    const maturityDate = parseISODate(bond.maturityDate);
    if (!isNaN(issueDate.getTime()) && !isNaN(maturityDate.getTime())) {
      const couponDates: Date[] = [];
      const cur = new Date(issueDate);
      while (cur.getTime() < maturityDate.getTime()) {
        cur.setUTCFullYear(cur.getUTCFullYear() + 1);
        if (cur.getTime() <= maturityDate.getTime()) couponDates.push(new Date(cur));
      }

      const past = couponDates.filter((d) => d.getTime() <= asOfDate.getTime());
      const previousDate = past.length > 0 ? past[past.length - 1] : issueDate;
      const nextDate =
        couponDates.find((d) => d.getTime() > asOfDate.getTime()) || maturityDate;

      const daysSince = Math.floor(
        (asOfDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      const daysInPeriod = Math.round(
        (nextDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000)
      );

      // Capital restant du a la date de valuation = outstandingAfter du dernier
      // flux passe (sinon nominal initial).
      const cfsBefore = cashflows.filter(
        (cf) => parseISODate(cf.date).getTime() <= asOfDate.getTime()
      );
      const outstandingNow =
        cfsBefore.length > 0
          ? cfsBefore[cfsBefore.length - 1].outstandingAfter
          : bond.nominalValue;

      const periodicCoupon = outstandingNow * bond.couponRate;
      accruedInterest =
        daysInPeriod > 0 ? (periodicCoupon * daysSince) / daysInPeriod : 0;
    }
  }

  const cleanPrice = dirtyPrice - accruedInterest;
  const bpv = (cleanPrice * modified) / 10000;

  return { cleanPrice, dirtyPrice, accruedInterest, macaulay, modified, convexity, bpv };
}

/**
 * Calibre le taux precompte moyen pondere sur les BAT du pays sur 3 mois.
 *
 * Specifique aux BAT (Bons Assimilables du Tresor) qui se negocient en
 * "intere^t precompte" : l'investisseur paye `N × (1 − r × T)` au depart et
 * recoit le nominal N a l'echeance. Le taux pertinent est le "Taux moyen
 * pondere (%)" du CSV (champ `weightedAvgRate`), pas le rendement actuariel.
 */
export function calibrateBATPrecompte(
  country: string,
  targetDate: Date,
  residualMaturity: number,
  emissions: EmissionUMOA[]
): { rate: number; basePoints: Array<{ maturity: number; rate: number; amount: number }>; issuancesUsed: number } | null {
  if (residualMaturity <= 0 || residualMaturity > 2.5) return null;
  const isUemoa = UEMOA_COUNTRIES.includes(country);
  if (!isUemoa) return null;

  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const startDate = new Date(targetDate.getTime() - THREE_MONTHS_MS);

  const eligible = emissions.filter((e) => {
    if (e.country !== country) return false;
    if (e.type !== "BAT") return false;
    if (e.maturity <= 0 || e.maturity > 2) return false;
    if (e.amount <= 0) return false;
    if (classifyOperation(e.precisions) !== "cash_auction") return false;
    // Pour les BAT le taux precompte est dans weightedAvgRate. Si absent,
    // on retombe sur weightedAvgYield (rendement actuariel) — proche pour
    // les courtes maturites.
    const r = e.weightedAvgRate ?? e.weightedAvgYield;
    if (r <= 0 || r > 0.3) return false;
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return false;
    return d >= startDate && d <= targetDate;
  });

  if (eligible.length === 0) return null;

  // Bucket de maturite (en mois) pour stabiliser l'interpolation
  const byMaturity = new Map<number, { sumRateAmount: number; sumAmount: number }>();
  for (const e of eligible) {
    const months = Math.round(e.maturity * 12);
    const r = e.weightedAvgRate ?? e.weightedAvgYield;
    const entry = byMaturity.get(months) || { sumRateAmount: 0, sumAmount: 0 };
    entry.sumRateAmount += r * e.amount;
    entry.sumAmount += e.amount;
    byMaturity.set(months, entry);
  }

  const basePoints = Array.from(byMaturity.entries())
    .map(([months, v]) => ({
      maturity: months / 12,
      rate: v.sumRateAmount / v.sumAmount,
      amount: v.sumAmount,
    }))
    .sort((a, b) => a.maturity - b.maturity);

  if (basePoints.length === 0) return null;

  // Interpolation lineaire
  let rate: number;
  if (residualMaturity <= basePoints[0].maturity) {
    rate = basePoints[0].rate;
  } else if (residualMaturity >= basePoints[basePoints.length - 1].maturity) {
    rate = basePoints[basePoints.length - 1].rate;
  } else {
    let low = basePoints[0];
    let high = basePoints[basePoints.length - 1];
    for (let i = 0; i < basePoints.length - 1; i++) {
      if (
        basePoints[i].maturity <= residualMaturity &&
        basePoints[i + 1].maturity >= residualMaturity
      ) {
        low = basePoints[i];
        high = basePoints[i + 1];
        break;
      }
    }
    const ratio =
      (residualMaturity - low.maturity) / (high.maturity - low.maturity);
    rate = low.rate + ratio * (high.rate - low.rate);
  }

  return { rate, basePoints, issuancesUsed: eligible.length };
}

/**
 * Prix d'un BAT en convention precompte : `N × (1 − r × T)` ou T est en annees
 * (Act/365). C'est le prix que paye l'investisseur a l'emission ; il reste
 * theoriquement constant si le taux de marche ne bouge pas.
 *
 * Floor a 0 pour eviter les valeurs negatives quand T × r dépasse 1 (cas
 * pathologique sur des donnees aberrantes).
 */
export function priceBATPrecompte(
  nominal: number,
  precomptedRate: number,
  residualYears: number
): number {
  return Math.max(0, nominal * (1 - precomptedRate * residualYears));
}

/**
 * Construit un historique hebdomadaire du prix theorique sur les `weeks` dernieres
 * semaines.
 *
 * - OAT : recalibre la courbe pays sur les adjudications cash OAT puis applique
 *   l'actualisation actuarielle.
 * - BAT : recalibre une courbe pre´comptee sur les adjudications cash BAT du
 *   pays puis applique la formule precomptee `N × (1 − r × T)`.
 */
export function buildSovereignTheoreticalHistory(
  bond: SovereignBond,
  emissions: EmissionUMOA[],
  weeks: number = 24
): Array<{ date: string; theoreticalPrice: number; ytm: number }> {
  const history: Array<{ date: string; theoreticalPrice: number; ytm: number }> = [];
  const now = new Date();
  const matDate = parseISODate(bond.maturityDate);

  for (let w = weeks - 1; w >= 0; w--) {
    const asOf = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const residual =
      (matDate.getTime() - asOf.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (residual <= 0) continue;

    if (bond.type === "BAT") {
      const calib = calibrateBATPrecompte(bond.country, asOf, residual, emissions);
      if (!calib) continue;
      history.push({
        date: asOf.toISOString().slice(0, 10),
        theoreticalPrice: priceBATPrecompte(bond.nominalValue, calib.rate, residual),
        ytm: calib.rate,
      });
    } else {
      const calib = calibrateTheoreticalYTM(bond.country, asOf, residual, emissions);
      if (!calib) continue;
      const metrics = calculateSovereignActuarialMetrics(bond, asOf, calib.ytm);
      if (!metrics) continue;
      history.push({
        date: asOf.toISOString().slice(0, 10),
        theoreticalPrice: metrics.cleanPrice,
        ytm: calib.ytm,
      });
    }
  }

  return history;
}

/**
 * Compare le rendement de la courbe primaire de chaque pays UEMOA a la maturite
 * residuelle de la cible. Retourne un tableau trie par YTM croissant pour
 * visualiser la dispersion souveraine.
 */
export function calculateInterCountrySpreads(
  bond: SovereignBond,
  emissions: EmissionUMOA[],
  asOfDate: Date = new Date()
): Array<{ country: string; ytm: number; spread: number; isTarget: boolean }> {
  const matDate = parseISODate(bond.maturityDate);
  const residual =
    (matDate.getTime() - asOfDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (residual <= 0) return [];

  const targetCalib = calibrateTheoreticalYTM(bond.country, asOfDate, residual, emissions);
  if (!targetCalib) return [];

  const referenceYtm = targetCalib.ytm;

  const rows: Array<{ country: string; ytm: number; spread: number; isTarget: boolean }> = [];
  for (const country of UEMOA_COUNTRIES) {
    const calib = calibrateTheoreticalYTM(country, asOfDate, residual, emissions);
    if (!calib) continue;
    rows.push({
      country,
      ytm: calib.ytm,
      spread: calib.ytm - referenceYtm,
      isTarget: country === bond.country,
    });
  }

  return rows.sort((a, b) => a.ytm - b.ytm);
}