// === TYPES OBLIGATIONS UEMOA ===

export type Bond = {
  isin: string;
  nameShort: string;
  issuer: string;
  country: BondCountry;
  type: "OAT" | "OTAR" | "BAT" | "Corporate";
  nominalValue: number;
  couponRate: number;           // En decimal (0.065 pour 6.5%)
  issueDate: string;            // YYYY-MM-DD
  maturityDate: string;         // YYYY-MM-DD
  frequency: 1 | 2 | 4;
  isin_registered: boolean;
};

export type BondCountry =
  | "CI"
  | "SN"
  | "BF"
  | "ML"
  | "BJ"
  | "TG"
  | "NE"
  | "GW";

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

export type IssuanceResult = {
  date: string;
  country: BondCountry;
  isin: string;
  type: "OAT" | "OTAR" | "BAT";
  maturity: number;
  amount: number;
  weightedAvgYield: number;     // En decimal
};

// === HELPERS (fonctionnent sur tableau Bond[] passe en parametre) ===

export function getBondsByCountry(bonds: Bond[], country: BondCountry): Bond[] {
  return bonds.filter((b) => b.country === country);
}

export function getBondByIsin(bonds: Bond[], isin: string): Bond | undefined {
  return bonds.find((b) => b.isin === isin);
}

export function getAvailableCountries(bonds: Bond[]): BondCountry[] {
  const countries = new Set(bonds.map((b) => b.country));
  return Array.from(countries).sort() as BondCountry[];
}