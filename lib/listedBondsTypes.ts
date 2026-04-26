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

// Mapping pays nom complet (CSV) → code 2 lettres (utilise dans le reste du code)
export const UMOA_COUNTRY_CODE: Record<string, string> = {
  "Côte d'Ivoire": "CI",
  "Sénégal": "SN",
  "Burkina Faso": "BF",
  "Mali": "ML",
  "Bénin": "BJ",
  "Togo": "TG",
  "Niger": "NE",
  "Guinée Bissau": "GW",
  "Guinée-Bissau": "GW",
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
  const issueDate = parseISODate(bond.issueDate);
  const maturityDate = parseISODate(bond.maturityDate);

  if (isNaN(issueDate.getTime()) || isNaN(maturityDate.getTime())) return 0;
  if (operationDate.getTime() >= maturityDate.getTime()) return 0;

  // Toutes les dates de coupon
  const allCouponDates = generateCouponDates(issueDate, maturityDate, bond.couponFrequency);

  // Dates d'amortissement
  let firstAmortDate: Date;
  if (bond.amortizationType === "IF") {
    firstAmortDate = maturityDate;
  } else if (bond.firstAmortizationDate && bond.firstAmortizationDate !== "") {
    firstAmortDate = parseISODate(bond.firstAmortizationDate);
  } else {
    firstAmortDate = allCouponDates[0];
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const allAmortDates = allCouponDates.filter(
    (d) => d.getTime() >= firstAmortDate.getTime() - oneDay
  );
  const totalNbAmortPeriods = allAmortDates.length;

  // Nombre d'amortissements passes (pour reconstruire le nominal initial)
  const pastAmortDates = allAmortDates.filter((d) => d.getTime() <= operationDate.getTime());
  const nbPastAmorts = pastAmortDates.length;

  let amortPerPeriod = 0;
  if (bond.amortizationType !== "IF" && totalNbAmortPeriods > nbPastAmorts) {
    const remainingAmorts = totalNbAmortPeriods - nbPastAmorts;
    const initialNominal =
      bond.nominalValue + (nbPastAmorts / remainingAmorts) * bond.nominalValue;
    amortPerPeriod = initialNominal / totalNbAmortPeriods;
  }

  // Simulation des flux futurs
  const futureDates = allCouponDates.filter((d) => d.getTime() > operationDate.getTime());
  if (futureDates.length === 0) return 0;

  let outstanding = bond.nominalValue;
  let dirtyPrice = 0;

  for (let i = 0; i < futureDates.length; i++) {
    const d = futureDates[i];
    const daysFromNow = (d.getTime() - operationDate.getTime()) / (24 * 60 * 60 * 1000);
    const years = daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);

    const couponAmount = (outstanding * bond.couponRate) / bond.couponFrequency;

    const allAmortIndex = allAmortDates.findIndex((ad) => ad.getTime() === d.getTime());
    const isAmortPeriod = allAmortIndex >= 0;
    const isLastAmort = allAmortIndex === totalNbAmortPeriods - 1;

    let amortAmount = 0;
    if (isAmortPeriod) {
      if (bond.amortizationType === "IF") {
        if (i === futureDates.length - 1) amortAmount = outstanding;
      } else {
        amortAmount = isLastAmort ? outstanding : amortPerPeriod;
      }
    }

    const cashflow = couponAmount + amortAmount;
    dirtyPrice += cashflow * df;

    outstanding = Math.max(0, outstanding - amortAmount);
  }

  // Retirer le coupon couru pour obtenir le prix pied de coupon
  const pastDates = allCouponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate =
    pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;
  const daysSinceLastCoupon =
    (operationDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000);
  const annualCoupon = bond.nominalValue * bond.couponRate;
  const accruedInterest = (annualCoupon * daysSinceLastCoupon) / 365;

  return dirtyPrice - accruedInterest;
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
  firstIssueDate: string;        // date du 1er round
  lastIssueDate: string;         // date du dernier round
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
    coverage: number;                         // ratio soumis / retenu
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
  lastIssueDate: string;
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
        coverage: r.amount > 0 ? r.amountSubmitted / r.amount : 0,
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
 * Statistiques globales du marche souverain non cote.
 */
export function getSovereignMarketStats(bonds: SovereignBond[]): {
  totalBonds: number;
  totalBAT: number;
  totalOAT: number;
  totalVolume: number;
  avgYield: number;
  avgMaturity: number;
  byCountry: Record<string, number>;
  volumeByCountry: Record<string, number>;
} {
  const totalVolume = bonds.reduce((sum, b) => sum + b.totalAmount, 0);
  const avgYield =
    totalVolume > 0
      ? bonds.reduce((sum, b) => sum + b.lastYield * b.totalAmount, 0) / totalVolume
      : 0;
  const avgMaturity =
    totalVolume > 0
      ? bonds.reduce((sum, b) => sum + b.maturity * b.totalAmount, 0) / totalVolume
      : 0;

  const byCountry = bonds.reduce((acc, b) => {
    acc[b.country] = (acc[b.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const volumeByCountry = bonds.reduce((acc, b) => {
    acc[b.country] = (acc[b.country] || 0) + b.totalAmount;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalBonds: bonds.length,
    totalBAT: bonds.filter((b) => b.type === "BAT").length,
    totalOAT: bonds.filter((b) => b.type === "OAT").length,
    totalVolume,
    avgYield,
    avgMaturity,
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