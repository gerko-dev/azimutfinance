// === BASE DES OBLIGATIONS UEMOA ===
// Structure conforme aux specs BRVM/UEMOA
// Convention : Act/365 pour tous les calculs

export type Bond = {
  isin: string;
  nameShort: string;           // Ex: "TPCI 6.50% 2030"
  issuer: string;              // Ex: "Etat de Cote d'Ivoire"
  country: BondCountry;
  type: "OAT" | "OTAR" | "BAT" | "Corporate";
  nominalValue: number;        // VN en FCFA (souvent 10 000)
  couponRate: number;          // Taux annuel en decimal (ex: 0.065 pour 6,5%)
  issueDate: string;           // Format ISO YYYY-MM-DD
  maturityDate: string;        // Format ISO YYYY-MM-DD
  frequency: 1 | 2 | 4;        // 1=annuel, 2=semestriel, 4=trimestriel
  isin_registered: boolean;    // Cote sur la BRVM
};

export type BondCountry =
  | "CI"   // Cote d'Ivoire
  | "SN"   // Senegal
  | "BF"   // Burkina Faso
  | "ML"   // Mali
  | "BJ"   // Benin
  | "TG"   // Togo
  | "NE"   // Niger
  | "GW";  // Guinee-Bissau

export const countryNames: Record<BondCountry, string> = {
  CI: "Cote d'Ivoire",
  SN: "Senegal",
  BF: "Burkina Faso",
  ML: "Mali",
  BJ: "Benin",
  TG: "Togo",
  NE: "Niger",
  GW: "Guinee-Bissau",
};

// Base d'exemple - a remplacer par l'import Excel
export const bondsDatabase: Bond[] = [
  // === COTE D'IVOIRE ===
  {
    isin: "CI0000001234",
    nameShort: "TPCI 6.50% 2030",
    issuer: "Etat de Cote d'Ivoire",
    country: "CI",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.065,
    issueDate: "2023-03-15",
    maturityDate: "2030-03-15",
    frequency: 1,
    isin_registered: true,
  },
  {
    isin: "CI0000001235",
    nameShort: "TPCI 5.85% 2028",
    issuer: "Etat de Cote d'Ivoire",
    country: "CI",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.0585,
    issueDate: "2023-06-20",
    maturityDate: "2028-06-20",
    frequency: 1,
    isin_registered: true,
  },
  {
    isin: "CI0000001236",
    nameShort: "TPCI 7.20% 2033",
    issuer: "Etat de Cote d'Ivoire",
    country: "CI",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.072,
    issueDate: "2024-01-10",
    maturityDate: "2033-01-10",
    frequency: 1,
    isin_registered: true,
  },
  {
    isin: "CI0000001237",
    nameShort: "TPCI 5.45% 2027",
    issuer: "Etat de Cote d'Ivoire",
    country: "CI",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.0545,
    issueDate: "2024-03-25",
    maturityDate: "2027-03-25",
    frequency: 1,
    isin_registered: true,
  },

  // === SENEGAL ===
  {
    isin: "SN0000002001",
    nameShort: "TPSN 6.75% 2029",
    issuer: "Etat du Senegal",
    country: "SN",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.0675,
    issueDate: "2024-02-14",
    maturityDate: "2029-02-14",
    frequency: 1,
    isin_registered: true,
  },
  {
    isin: "SN0000002002",
    nameShort: "TPSN 7.00% 2031",
    issuer: "Etat du Senegal",
    country: "SN",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.07,
    issueDate: "2024-05-10",
    maturityDate: "2031-05-10",
    frequency: 1,
    isin_registered: true,
  },

  // === BURKINA FASO ===
  {
    isin: "BF0000003001",
    nameShort: "TPBF 7.50% 2031",
    issuer: "Etat du Burkina Faso",
    country: "BF",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.075,
    issueDate: "2023-11-05",
    maturityDate: "2031-11-05",
    frequency: 1,
    isin_registered: true,
  },
  {
    isin: "BF0000003002",
    nameShort: "TPBF 7.20% 2030",
    issuer: "Etat du Burkina Faso",
    country: "BF",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.072,
    issueDate: "2024-04-02",
    maturityDate: "2030-04-02",
    frequency: 1,
    isin_registered: true,
  },

  // === MALI ===
  {
    isin: "ML0000004001",
    nameShort: "TPML 8.00% 2029",
    issuer: "Etat du Mali",
    country: "ML",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.08,
    issueDate: "2023-09-18",
    maturityDate: "2029-09-18",
    frequency: 1,
    isin_registered: true,
  },

  // === BENIN ===
  {
    isin: "BJ0000005001",
    nameShort: "TPBJ 6.80% 2030",
    issuer: "Etat du Benin",
    country: "BJ",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.068,
    issueDate: "2024-02-28",
    maturityDate: "2030-02-28",
    frequency: 1,
    isin_registered: true,
  },

  // === TOGO ===
  {
    isin: "TG0000006001",
    nameShort: "TPTG 6.75% 2031",
    issuer: "Etat du Togo",
    country: "TG",
    type: "OAT",
    nominalValue: 10000,
    couponRate: 0.0675,
    issueDate: "2024-03-11",
    maturityDate: "2031-03-11",
    frequency: 1,
    isin_registered: true,
  },
];

// === HISTORIQUE DES EMISSIONS (pour calcul rendement moyen 3 mois) ===
export type IssuanceResult = {
  date: string;              // Date de l'adjudication
  country: BondCountry;
  isin: string;              // Lie l'emission a un bond si existant
  type: "OAT" | "OTAR" | "BAT";
  maturity: number;          // Maturite en annees
  amount: number;            // Mds FCFA
  weightedAvgYield: number;  // Rendement moyen pondere (decimal)
};

// Historique des 3 derniers mois (exemple)
export const issuancesHistory: IssuanceResult[] = [
  // COTE D'IVOIRE - 3 mois recents
  { date: "2026-04-15", country: "CI", isin: "CI0000001234", type: "OAT", maturity: 7, amount: 120, weightedAvgYield: 0.0625 },
  { date: "2026-03-25", country: "CI", isin: "CI0000001237", type: "OAT", maturity: 3, amount: 80, weightedAvgYield: 0.0545 },
  { date: "2026-03-10", country: "CI", isin: "", type: "BAT", maturity: 1, amount: 40, weightedAvgYield: 0.0415 },
  { date: "2026-02-18", country: "CI", isin: "CI0000001236", type: "OAT", maturity: 9, amount: 95, weightedAvgYield: 0.069 },
  { date: "2026-02-05", country: "CI", isin: "CI0000001235", type: "OAT", maturity: 5, amount: 60, weightedAvgYield: 0.0595 },

  // SENEGAL - 3 mois recents
  { date: "2026-04-08", country: "SN", isin: "", type: "BAT", maturity: 1, amount: 40, weightedAvgYield: 0.0485 },
  { date: "2026-03-22", country: "SN", isin: "SN0000002002", type: "OAT", maturity: 5, amount: 50, weightedAvgYield: 0.068 },
  { date: "2026-02-28", country: "SN", isin: "SN0000002001", type: "OAT", maturity: 3, amount: 45, weightedAvgYield: 0.065 },

  // BURKINA FASO
  { date: "2026-04-02", country: "BF", isin: "BF0000003001", type: "OAT", maturity: 10, amount: 35, weightedAvgYield: 0.072 },
  { date: "2026-03-05", country: "BF", isin: "BF0000003002", type: "OAT", maturity: 6, amount: 28, weightedAvgYield: 0.07 },
  { date: "2026-02-10", country: "BF", isin: "", type: "BAT", maturity: 2, amount: 20, weightedAvgYield: 0.0545 },

  // MALI
  { date: "2026-03-30", country: "ML", isin: "ML0000004001", type: "OAT", maturity: 5, amount: 30, weightedAvgYield: 0.078 },
  { date: "2026-02-15", country: "ML", isin: "", type: "BAT", maturity: 1, amount: 15, weightedAvgYield: 0.055 },

  // BENIN
  { date: "2026-04-12", country: "BJ", isin: "BJ0000005001", type: "OAT", maturity: 6, amount: 32, weightedAvgYield: 0.066 },
  { date: "2026-03-18", country: "BJ", isin: "", type: "BAT", maturity: 2, amount: 18, weightedAvgYield: 0.052 },

  // TOGO
  { date: "2026-03-11", country: "TG", isin: "TG0000006001", type: "OAT", maturity: 7, amount: 30, weightedAvgYield: 0.0675 },
  { date: "2026-02-22", country: "TG", isin: "", type: "BAT", maturity: 1, amount: 12, weightedAvgYield: 0.048 },
];

// Helper - recuperer les obligations d'un pays
export function getBondsByCountry(country: BondCountry): Bond[] {
  return bondsDatabase.filter((b) => b.country === country);
}

// Helper - recuperer une obligation par ISIN
export function getBondByIsin(isin: string): Bond | undefined {
  return bondsDatabase.find((b) => b.isin === isin);
}

// Helper - liste des pays ayant des obligations
export function getAvailableCountries(): BondCountry[] {
  const countries = new Set(bondsDatabase.map((b) => b.country));
  return Array.from(countries).sort() as BondCountry[];
}