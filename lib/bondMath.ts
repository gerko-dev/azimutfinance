// === CALCULS OBLIGATAIRES AVEC DATES REELLES (Convention Act/365) ===
// Toutes les fonctions utilisent des objets Date et la convention Actual/365

import type { Bond, BondCountry, IssuanceResult } from "./bondsUEMOA";

// === UTILITAIRES DE DATE ===

/** Parse une date ISO YYYY-MM-DD en objet Date (a minuit UTC) */
export function parseDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

/** Formate une Date en ISO YYYY-MM-DD */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Nombre de jours calendaires entre deux dates */
export function daysBetween(d1: Date, d2: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((d2.getTime() - d1.getTime()) / msPerDay);
}

/** Fraction d'annee selon Act/365 */
export function yearFractionAct365(d1: Date, d2: Date): number {
  return daysBetween(d1, d2) / 365;
}

/** Ajoute N mois a une date (gere fin de mois) */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // Gestion fin de mois (31 mars + 1 mois = 30 avril, pas 1er mai)
  if (result.getUTCDate() !== day) {
    result.setUTCDate(0);
  }
  return result;
}

// === CALENDRIER DES COUPONS ===

/**
 * Genere toutes les dates de coupon en reculant depuis l'echeance
 * (methode standard, robuste aux stub periods)
 */
export function generateCouponDates(
  issueDate: Date,
  maturityDate: Date,
  frequency: 1 | 2 | 4
): Date[] {
  const monthsBetweenCoupons = 12 / frequency;
  const dates: Date[] = [];

  let current = new Date(maturityDate);
  while (current.getTime() > issueDate.getTime()) {
    dates.unshift(new Date(current));
    current = addMonths(current, -monthsBetweenCoupons);
  }

  return dates;
}

/** Trouve le dernier coupon paye avant la date d'operation */
export function findPreviousCouponDate(
  couponDates: Date[],
  issueDate: Date,
  operationDate: Date
): Date {
  for (let i = couponDates.length - 1; i >= 0; i--) {
    if (couponDates[i].getTime() <= operationDate.getTime()) {
      return couponDates[i];
    }
  }
  return issueDate;
}

/** Trouve le prochain coupon a payer apres la date d'operation */
export function findNextCouponDate(
  couponDates: Date[],
  operationDate: Date
): Date | null {
  for (let i = 0; i < couponDates.length; i++) {
    if (couponDates[i].getTime() > operationDate.getTime()) {
      return couponDates[i];
    }
  }
  return null;
}

/** Flux futurs restants apres la date d'operation */
export function getFutureCashFlows(
  bond: Bond,
  operationDate: Date
): { date: Date; amount: number; isFinal: boolean }[] {
  const issueDate = parseDate(bond.issueDate);
  const maturityDate = parseDate(bond.maturityDate);
  const couponDates = generateCouponDates(issueDate, maturityDate, bond.frequency);
  const couponAmount = (bond.nominalValue * bond.couponRate) / bond.frequency;

  const futureFlows: { date: Date; amount: number; isFinal: boolean }[] = [];

  for (let i = 0; i < couponDates.length; i++) {
    const couponDate = couponDates[i];
    if (couponDate.getTime() > operationDate.getTime()) {
      const isFinal = i === couponDates.length - 1;
      const amount = isFinal ? couponAmount + bond.nominalValue : couponAmount;
      futureFlows.push({ date: couponDate, amount, isFinal });
    }
  }

  return futureFlows;
}

// === INTERETS COURUS (Act/365) ===

/**
 * Calcule les interets courus a la date d'operation (Act/365)
 * CC = Coupon_periode * (jours_depuis_dernier_coupon / 365)
 */
export function calculateAccruedInterest(
  bond: Bond,
  operationDate: Date
): { accruedInterest: number; daysSinceLastCoupon: number; previousCouponDate: Date } {
  const issueDate = parseDate(bond.issueDate);
  const maturityDate = parseDate(bond.maturityDate);
  const couponDates = generateCouponDates(issueDate, maturityDate, bond.frequency);
  const previousCouponDate = findPreviousCouponDate(couponDates, issueDate, operationDate);
  const couponPerPeriod = (bond.nominalValue * bond.couponRate) / bond.frequency;

  const daysSinceLastCoupon = daysBetween(previousCouponDate, operationDate);
  // Act/365 : on annualise le coupon de periode puis on proratise en jours
  const annualCoupon = bond.nominalValue * bond.couponRate;
  const accruedInterest = (annualCoupon * daysSinceLastCoupon) / 365;

  // Note: pour une frequence > 1, on plafonne a un coupon de periode
  const cappedAccrued = Math.min(accruedInterest, couponPerPeriod);

  return {
    accruedInterest: cappedAccrued,
    daysSinceLastCoupon,
    previousCouponDate,
  };
}

// === PRICING : Prix a partir d'un YTM (Act/365) ===

/**
 * Calcule le prix sale (dirty) d'une obligation pour un YTM donne, en Act/365
 * Prix sale = Somme( Flux_i / (1+YTM)^(jours_i/365) )
 */
export function priceBondFromYield(
  bond: Bond,
  operationDate: Date,
  ytm: number
): { dirtyPrice: number; cleanPrice: number; accruedInterest: number } {
  const futureFlows = getFutureCashFlows(bond, operationDate);

  let dirtyPrice = 0;
  for (const flow of futureFlows) {
    const t = yearFractionAct365(operationDate, flow.date);
    dirtyPrice += flow.amount / Math.pow(1 + ytm, t);
  }

  const { accruedInterest } = calculateAccruedInterest(bond, operationDate);
  const cleanPrice = dirtyPrice - accruedInterest;

  return { dirtyPrice, cleanPrice, accruedInterest };
}

// === CALCUL DU YTM A PARTIR D'UN PRIX (Act/365, par bissection) ===

/**
 * Calcule le YTM tel que le prix sale actualise = prix sale donne
 * IMPORTANT: le prix saisi par l'utilisateur est presume etre le prix propre (clean)
 * On convertit en prix sale = prix propre + interets courus
 */
export function calculateYTMFromCleanPrice(
  bond: Bond,
  operationDate: Date,
  cleanPrice: number
): { ytm: number; error?: string } {
  const { accruedInterest } = calculateAccruedInterest(bond, operationDate);
  const dirtyPriceTarget = cleanPrice + accruedInterest;

  // Bissection
  let low = 0.0001;
  let high = 0.5;
  let mid = 0;
  const tolerance = 0.01; // 1 centime de tolerance
  const maxIterations = 100;

  for (let i = 0; i < maxIterations; i++) {
    mid = (low + high) / 2;
    const { dirtyPrice } = priceBondFromYield(bond, operationDate, mid);

    if (Math.abs(dirtyPrice - dirtyPriceTarget) < tolerance) {
      return { ytm: mid };
    }

    if (dirtyPrice > dirtyPriceTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return { ytm: mid };
}

// === DURATION & SENSIBILITE (Act/365) ===

export type DurationResult = {
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
};

export function calculateDuration(
  bond: Bond,
  operationDate: Date,
  ytm: number
): DurationResult {
  const futureFlows = getFutureCashFlows(bond, operationDate);

  let sumWeightedPV = 0;
  let sumConvexity = 0;
  let totalPV = 0;

  for (const flow of futureFlows) {
    const t = yearFractionAct365(operationDate, flow.date);
    const pv = flow.amount / Math.pow(1 + ytm, t);
    sumWeightedPV += t * pv;
    sumConvexity += (t * (t + 1) * pv) / Math.pow(1 + ytm, 2);
    totalPV += pv;
  }

  const macaulayDuration = sumWeightedPV / totalPV;
  const modifiedDuration = macaulayDuration / (1 + ytm);
  const convexity = sumConvexity / totalPV;

  return { macaulayDuration, modifiedDuration, convexity };
}

// === RENDEMENT MOYEN DES 3 DERNIERS MOIS PAR ETAT ===

/**
 * Calcule le rendement moyen pondere par les montants emis
 * sur les 3 derniers mois pour un Etat donne
 */
export function calculateAverageYield3Months(
  country: BondCountry,
  issuances: IssuanceResult[],
  referenceDate: Date = new Date()
): { averageYield: number; count: number; totalAmount: number } {
  const threeMonthsAgo = addMonths(referenceDate, -3);

  const relevantIssuances = issuances.filter((iss) => {
    const issDate = parseDate(iss.date);
    return (
      iss.country === country &&
      issDate.getTime() >= threeMonthsAgo.getTime() &&
      issDate.getTime() <= referenceDate.getTime()
    );
  });

  if (relevantIssuances.length === 0) {
    return { averageYield: 0, count: 0, totalAmount: 0 };
  }

  const totalAmount = relevantIssuances.reduce((sum, iss) => sum + iss.amount, 0);
  const weightedSum = relevantIssuances.reduce(
    (sum, iss) => sum + iss.weightedAvgYield * iss.amount,
    0
  );

  return {
    averageYield: weightedSum / totalAmount,
    count: relevantIssuances.length,
    totalAmount,
  };
}

// === FONCTION DE CALCUL COMPLETE POUR L'UI ===

export type BondPricingResult = {
  // Inputs reconnus
  bond: Bond;
  operationDate: Date;
  numberOfBonds: number;
  userCleanPrice: number;

  // Calcules au prix utilisateur
  ytm: number;                     // YTM implicite du prix utilisateur
  userDirtyPrice: number;          // Prix sale utilisateur

  // Interets courus
  accruedInterest: number;         // Par titre
  daysSinceLastCoupon: number;
  previousCouponDate: Date;
  nextCouponDate: Date | null;

  // Duration
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;

  // Montants transaction
  nominalAmount: number;           // Nb × VN
  grossAmount: number;             // Nb × Prix propre
  netAmount: number;               // Nb × Prix sale (= Nb × (Propre + CC))
  totalAccruedInterest: number;    // Nb × CC

  // Pricing theorique
  theoreticalYield: number;        // Rendement moyen 3 mois Etat
  theoreticalCleanPrice: number;   // Prix propre au rendement moyen
  theoreticalDirtyPrice: number;
  priceDelta: number;              // User clean - theo clean (par titre)
  priceDeltaPercent: number;       // Pourcentage

  issuancesUsed: number;           // Nb emissions utilisees pour calcul rendement moyen
};

export function calculateFullBondPricing(
  bond: Bond,
  operationDate: Date,
  numberOfBonds: number,
  userCleanPrice: number,
  issuances: IssuanceResult[]
): BondPricingResult {
  // 1. YTM implicite au prix utilisateur
  const { ytm } = calculateYTMFromCleanPrice(bond, operationDate, userCleanPrice);

  // 2. Interets courus et dates
  const { accruedInterest, daysSinceLastCoupon, previousCouponDate } =
    calculateAccruedInterest(bond, operationDate);

  const maturityDate = parseDate(bond.maturityDate);
  const issueDate = parseDate(bond.issueDate);
  const couponDates = generateCouponDates(issueDate, maturityDate, bond.frequency);
  const nextCouponDate = findNextCouponDate(couponDates, operationDate);

  // 3. Duration & Convexite
  const { macaulayDuration, modifiedDuration, convexity } = calculateDuration(
    bond,
    operationDate,
    ytm
  );

  // 4. Montants transaction
  const nominalAmount = numberOfBonds * bond.nominalValue;
  const grossAmount = numberOfBonds * userCleanPrice;
  const totalAccruedInterest = numberOfBonds * accruedInterest;
  const netAmount = grossAmount + totalAccruedInterest;
  const userDirtyPrice = userCleanPrice + accruedInterest;

  // 5. Pricing theorique au rendement moyen 3 mois
  const { averageYield, count } = calculateAverageYield3Months(
    bond.country,
    issuances,
    operationDate
  );

  let theoreticalCleanPrice = 0;
  let theoreticalDirtyPrice = 0;
  if (averageYield > 0) {
    const theoPricing = priceBondFromYield(bond, operationDate, averageYield);
    theoreticalCleanPrice = theoPricing.cleanPrice;
    theoreticalDirtyPrice = theoPricing.dirtyPrice;
  }

  const priceDelta = userCleanPrice - theoreticalCleanPrice;
  const priceDeltaPercent =
    theoreticalCleanPrice > 0 ? (priceDelta / theoreticalCleanPrice) * 100 : 0;

  return {
    bond,
    operationDate,
    numberOfBonds,
    userCleanPrice,
    ytm,
    userDirtyPrice,
    accruedInterest,
    daysSinceLastCoupon,
    previousCouponDate,
    nextCouponDate,
    macaulayDuration,
    modifiedDuration,
    convexity,
    nominalAmount,
    grossAmount,
    netAmount,
    totalAccruedInterest,
    theoreticalYield: averageYield,
    theoreticalCleanPrice,
    theoreticalDirtyPrice,
    priceDelta,
    priceDeltaPercent,
    issuancesUsed: count,
  };
}