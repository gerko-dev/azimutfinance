// Types et fonctions pures pour les obligations cotees UEMOA
// Codes d'amortissement : IF (In Fine), AC (Amortissement Constant), ACD (AC avec Différé)

export type AmortizationType = "IF" | "AC" | "ACD";

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
  firstAmortizationDate: string;
  amortizationType: AmortizationType;
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

// ==========================================
// CALCUL ACTUARIEL DU YTM — CONVENTION ACT/365
// ==========================================

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

  const couponAmount = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;
  const annualCoupon = bond.nominalValue * bond.couponRate;

  const futureDates = couponDates.filter((d) => d.getTime() > operationDate.getTime());
  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate = pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;

  const daysSinceLastCoupon = daysBetween(previousCouponDate, operationDate);
  const accruedInterest = (annualCoupon * daysSinceLastCoupon) / 365;

  let dirtyPrice = 0;
  for (let i = 0; i < futureDates.length; i++) {
    const date = futureDates[i];
    const daysFromNow = daysBetween(operationDate, date);
    const yearsFromNow = daysFromNow / 365;
    const discountFactor = Math.pow(1 + ytm, -yearsFromNow);
    const cashflow =
      i === futureDates.length - 1 ? couponAmount + bond.nominalValue : couponAmount;
    dirtyPrice += cashflow * discountFactor;
  }

  const cleanPrice = dirtyPrice - accruedInterest;
  return { cleanPrice, accruedInterest };
}

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

  let low = 0.0001;
  let high = 0.5;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const { cleanPrice } = priceFromYTM(bond, operationDate, mid);

    if (Math.abs(cleanPrice - targetCleanPrice) < 0.01) {
      return mid;
    }

    if (cleanPrice > targetCleanPrice) {
      low = mid;
    } else {
      high = mid;
    }
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
  const latestPrice = getLatestPrice(bond.isin, prices);
  if (!latestPrice || latestPrice.cleanPrice <= 0) {
    return bond.couponRate;
  }

  try {
    return calculateActuarialYTM(
      bond,
      new Date(latestPrice.date),
      latestPrice.cleanPrice
    );
  } catch {
    return calculateSimpleYTM(bond, latestPrice.cleanPrice);
  }
}

// ==========================================
// METRIQUES AVANCEES (Duration, Convexite, BPV)
// ==========================================

export function calculateDuration(
  bond: {
    nominalValue: number;
    couponRate: number;
    couponFrequency: 1 | 2 | 4;
    issueDate: string;
    maturityDate: string;
  },
  operationDate: Date,
  ytm: number
): { macaulay: number; modified: number; convexity: number } {
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);
  const couponDates = generateCouponDates(issueDate, maturityDate, bond.couponFrequency);

  const futureDates = couponDates.filter((d) => d.getTime() > operationDate.getTime());
  if (futureDates.length === 0) {
    return { macaulay: 0, modified: 0, convexity: 0 };
  }

  const couponAmount = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;

  let sumPV = 0;
  let sumTimesPV = 0;
  let sumTimesSquaredPV = 0;

  for (let i = 0; i < futureDates.length; i++) {
    const daysFromNow = daysBetween(operationDate, futureDates[i]);
    const years = daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);

    const cashflow =
      i === futureDates.length - 1 ? couponAmount + bond.nominalValue : couponAmount;
    const pv = cashflow * df;

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

export function calculateBPV(
  bond: {
    nominalValue: number;
    couponRate: number;
    couponFrequency: 1 | 2 | 4;
    issueDate: string;
    maturityDate: string;
  },
  operationDate: Date,
  ytm: number,
  cleanPrice: number
): number {
  const { modified } = calculateDuration(bond, operationDate, ytm);
  return Math.abs(modified * cleanPrice * 0.0001);
}

// ==========================================
// ECHEANCIER DES FLUX — CONVENTION UEMOA
// ==========================================

/**
 * Genere l'echeancier complet des flux futurs d'une obligation UEMOA cotee.
 *
 * Logique UEMOA :
 * - nominalValue dans le CSV = nominal ACTUEL (apres amorts deja passes)
 * - On ne genere que les flux FUTURS (apres aujourd'hui)
 * - Les amortissements passes sont deja pris en compte dans nominalValue
 * - Le coupon est calcule sur le capital restant du
 * - Codes d'amortissement :
 *   - IF : In Fine (remboursement total a l'echeance)
 *   - AC : Amortissement Constant (tranches egales chaque periode)
 *   - ACD : Amortissement Constant Differé (AC avec periode de differé)
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

  // 1. Genere toutes les dates de coupon depuis l'emission jusqu'a l'echeance
  const allCouponDates = generateCouponDates(issueDate, maturityDate, bond.couponFrequency);

  // 2. Determine la premiere date d'amortissement
  let firstAmortDate: Date;
  if (bond.amortizationType === "IF") {
    firstAmortDate = maturityDate;
  } else if (bond.firstAmortizationDate && bond.firstAmortizationDate !== "") {
    firstAmortDate = parseISODate(bond.firstAmortizationDate);
  } else {
    firstAmortDate = allCouponDates[0];
  }

  // 3. Dates d'amortissement TOTALES (passees + futures) a partir de firstAmortDate
  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay
  );
  const totalNbAmortPeriods = allAmortDates.length;

  // 4. Nombre d'amortissements PASSES (avant aujourd'hui)
  const pastAmortDates = allAmortDates.filter((d) => d.getTime() <= today.getTime());
  const nbPastAmorts = pastAmortDates.length;

  // 5. Calcul de l'amortissement par periode
  // Reconstruction : nominal_initial = nominalValue_actuel + (nbPastAmorts * tranche)
  // Or tranche = nominal_initial / totalNbAmortPeriods
  // Donc : nominal_initial = nominalValue * totalNbAmortPeriods / (totalNbAmortPeriods - nbPastAmorts)
  let amortPerPeriod = 0;
  if (bond.amortizationType !== "IF" && totalNbAmortPeriods > nbPastAmorts) {
    const remainingAmorts = totalNbAmortPeriods - nbPastAmorts;
    const initialNominal =
      bond.nominalValue + (nbPastAmorts / remainingAmorts) * bond.nominalValue;
    amortPerPeriod = initialNominal / totalNbAmortPeriods;
  }

  // 6. On ne garde que les dates futures
  const futureDates = allCouponDates.filter((d) => d.getTime() > today.getTime());
  if (futureDates.length === 0) return [];

  const cashflows: {
    date: string;
    type: "coupon" | "amortissement" | "remboursement";
    amount: number;
    outstandingAfter: number;
  }[] = [];

  // 7. Capital restant du par titre (commence au nominal actuel)
  let outstanding = bond.nominalValue;

  // 8. Boucle sur les dates futures
  for (let i = 0; i < futureDates.length; i++) {
    const d = futureDates[i];
    const dateStr = d.toISOString().substring(0, 10);

    // Coupon calcule sur le capital restant AVANT amortissement
    const couponAmount = (outstanding * bond.couponRate) / bond.couponFrequency;

    // Cette date est-elle une date d'amortissement ?
    const allAmortIndex = allAmortDates.findIndex((ad) => ad.getTime() === d.getTime());
    const isAmortPeriod = allAmortIndex >= 0;
    const isLastAmort = allAmortIndex === totalNbAmortPeriods - 1;

    let amortAmount = 0;
    let isLastPayment = false;

    if (isAmortPeriod) {
      switch (bond.amortizationType) {
        case "IF":
          if (i === futureDates.length - 1) {
            amortAmount = outstanding;
            isLastPayment = true;
          }
          break;

        case "AC":
        case "ACD":
          if (isLastAmort) {
            amortAmount = outstanding;
            isLastPayment = true;
          } else {
            amortAmount = amortPerPeriod;
          }
          break;
      }
    }

    // Publication des flux
    if (couponAmount > 0.01) {
      cashflows.push({
        date: dateStr,
        type: "coupon",
        amount: couponAmount,
        outstandingAfter: outstanding,
      });
    }

    if (amortAmount > 0.01) {
      cashflows.push({
        date: dateStr,
        type: isLastPayment ? "remboursement" : "amortissement",
        amount: amortAmount,
        outstandingAfter: Math.max(0, outstanding - amortAmount),
      });
    }

    // Mise a jour du capital restant APRES cette periode
    outstanding = Math.max(0, outstanding - amortAmount);
  }

  return cashflows;
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