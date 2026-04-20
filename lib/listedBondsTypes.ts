// Types et fonctions pures pour les obligations cotees
// Ce fichier ne contient AUCUN import Node.js (fs, path, etc.)

export type ListedBond = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  currency: string;
  nominalValue: number;
  totalIssued: number;
  outstanding: number;
  couponRate: number;
  couponFrequency: 1 | 2 | 4;
  issueDate: string;
  maturityDate: string;
  firstCouponDate: string;
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
  eventType: "coupon" | "remboursement" | "call" | "adjudication";
  amount: number;
  description: string;
};

export type MarketStats = {
  totalBonds: number;
  totalOutstanding: number;
  weightedYield: number;
  averageDuration: number;
  byCountry: Record<string, number>;
  byType: Record<string, number>;
};

// ==========================================
// CALCUL ACTUARIEL DU YTM — CONVENTION ACT/365
// ==========================================

/**
 * Parse une date ISO YYYY-MM-DD en objet Date UTC (evite les problemes de timezone).
 */
function parseISODate(s: string): Date {
  if (!s) return new Date(NaN);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Calcule le nombre exact de jours entre deux dates (convention Act).
 */
function daysBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * Genere la liste des dates de coupon d'une obligation en remontant
 * depuis la date d'echeance (methode rigoureuse evitant les stub periods).
 */
function generateCouponDates(
  issueDate: Date,
  maturityDate: Date,
  frequency: 1 | 2 | 4
): Date[] {
  const dates: Date[] = [];
  const monthsPerPeriod = 12 / frequency;

  // On part de l'echeance et on recule
  const current = new Date(maturityDate);
  while (current.getTime() > issueDate.getTime()) {
    dates.unshift(new Date(current));
    current.setUTCMonth(current.getUTCMonth() - monthsPerPeriod);
  }
  return dates;
}

/**
 * Calcule le prix propre theorique d'une obligation pour un YTM donne.
 * Convention Act/365. Tous les flux sont actualises depuis la date d'operation.
 */
function priceFromYTM(
  bond: {
    nominalValue: number;
    couponRate: number;
    couponFrequency: 1 | 2 | 4;
    issueDate: string;
    maturityDate: string;
  },
  operationDate: Date,
  ytm: number
): { cleanPrice: number; accruedInterest: number } {
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  const couponDates = generateCouponDates(issueDate, maturityDate, bond.couponFrequency);

  const couponAmount = bond.nominalValue * bond.couponRate / bond.couponFrequency;

  // Coupon annuel (pour les interets courus)
  const annualCoupon = bond.nominalValue * bond.couponRate;

  // Trouve le dernier coupon paye et le prochain
  const futureDates = couponDates.filter((d) => d.getTime() > operationDate.getTime());
  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate = pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;

  // Interets courus (convention Act/365)
  const daysSinceLastCoupon = daysBetween(previousCouponDate, operationDate);
  const accruedInterest = (annualCoupon * daysSinceLastCoupon) / 365;

  // Calcul du prix sale par actualisation des flux futurs
  let dirtyPrice = 0;
  for (let i = 0; i < futureDates.length; i++) {
    const date = futureDates[i];
    const daysFromNow = daysBetween(operationDate, date);
    const yearsFromNow = daysFromNow / 365;
    const discountFactor = Math.pow(1 + ytm, -yearsFromNow);

    // Coupon + remboursement si c'est la derniere date
    const cashflow =
      i === futureDates.length - 1 ? couponAmount + bond.nominalValue : couponAmount;
    dirtyPrice += cashflow * discountFactor;
  }

  // Prix propre = prix sale - interets courus
  const cleanPrice = dirtyPrice - accruedInterest;
  return { cleanPrice, accruedInterest };
}

/**
 * Calcule le vrai YTM actuariel a partir du prix propre.
 * Utilise la methode de bissection pour une precision de 0.0001%.
 */
export function calculateActuarialYTM(
  bond: {
    nominalValue: number;
    couponRate: number;
    couponFrequency: 1 | 2 | 4;
    issueDate: string;
    maturityDate: string;
  },
  operationDate: Date,
  targetCleanPrice: number
): number {
  if (targetCleanPrice <= 0) return 0;

  const maturityDate = parseISODate(bond.maturityDate);
  if (operationDate.getTime() >= maturityDate.getTime()) return 0;

  // Bornes de recherche : 0.01% a 50%
  let low = 0.0001;
  let high = 0.5;

  // Bissection : max 50 iterations pour une precision de 0.0001%
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const { cleanPrice } = priceFromYTM(bond, operationDate, mid);

    if (Math.abs(cleanPrice - targetCleanPrice) < 0.01) {
      return mid;
    }

    // Prix calcule trop haut => ytm trop bas => augmenter low
    if (cleanPrice > targetCleanPrice) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * YTM simplifie (formule de Bond Equivalent Yield approximative).
 * Gardee comme fallback si pas de prix disponible.
 */
export function calculateSimpleYTM(bond: ListedBond, cleanPrice: number): number {
  if (bond.yearsToMaturity <= 0 || cleanPrice <= 0) return 0;
  const coupon = bond.couponRate * bond.nominalValue;
  const priceDeviation = (bond.nominalValue - cleanPrice) / bond.yearsToMaturity;
  const avgCapital = (bond.nominalValue + cleanPrice) / 2;
  return (coupon + priceDeviation) / avgCapital;
}

/**
 * Retourne le dernier prix d'une obligation.
 */
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

/**
 * Calcule le YTM actuariel d'une obligation cotee en utilisant
 * son dernier prix. Fallback vers YTM simplifie ou taux de coupon.
 */
export function getBondYTM(bond: ListedBond, prices: ListedBondPrice[]): number {
  const latestPrice = getLatestPrice(bond.isin, prices);
  if (!latestPrice || latestPrice.cleanPrice <= 0) {
    return bond.couponRate; // Fallback : taux facial
  }

  try {
    return calculateActuarialYTM(
      bond,
      new Date(latestPrice.date),
      latestPrice.cleanPrice
    );
  } catch {
    // Fallback YTM simplifie en cas d'erreur
    return calculateSimpleYTM(bond, latestPrice.cleanPrice);
  }
}