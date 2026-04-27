// Types pour le module Taux BCEAO & UEMOA (data/bddtaux.csv)

export type TauxSection =
  | "1_Taux_directeurs_BCEAO"
  | "2_Marche_monetaire"
  | "3_Credits_Depots_UEMOA"
  | "4_Inflation_pays_UEMOA"
  | "5_Reserves_Agregats"
  | "6_Taux_directeurs_partenaires"
  | "7_Change_EUR"
  | "8_Interbancaire_UMOA"
  | "9_Reserves_const_vs_req"
  | "10a_Conditions_banque_categorie"
  | "10b_Conditions_banque_objet";

export type TauxUnit = "pct" | "Mds_FCFA" | "M_FCFA" | "rate" | "x";

export type PeriodKind = "monthly" | "yearly" | "snapshot" | "window" | "yoy";

/** Période normalisée : iso = clé triable, label = affichage humain */
export type NormalizedPeriod = {
  raw: string;
  iso: string; // ex: "2025-09" pour mensuel, "2025" pour annuel, "2026-01-15" pour snapshot
  label: string; // ex: "Sept. 2025"
  sortKey: number; // timestamp ms pour tri rapide
  kind: PeriodKind;
};

export type TauxRow = {
  section: TauxSection;
  indicator: string;
  country: string;
  period: NormalizedPeriod;
  value: number;
  unit: TauxUnit;
  source: string;
};

export type SeriesPoint = {
  iso: string;
  label: string;
  sortKey: number;
  value: number;
};

export type TauxSeries = {
  id: string; // section|indicator|country
  section: TauxSection;
  indicator: string;
  country: string;
  unit: TauxUnit;
  points: SeriesPoint[];
};

/** Liste compacte des pays UEMOA pour l'UI */
export const UEMOA_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cote d'Ivoire",
  "Guinee-Bissau",
  "Mali",
  "Niger",
  "Senegal",
  "Togo",
] as const;

export type UEMOACountry = (typeof UEMOA_COUNTRIES)[number];

/** Mapping pays → code drapeau (réutilise les codes existants de CountryFlag) */
export const COUNTRY_TO_FLAG: Record<string, string> = {
  Benin: "BJ",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  "Guinee-Bissau": "GW",
  Mali: "ML",
  Niger: "NE",
  Senegal: "SN",
  Togo: "TG",
  UEMOA: "UEMOA",
  UMOA: "UEMOA",
  Union: "UEMOA",
};

/** Libellé court pays pour heatmaps */
export const COUNTRY_SHORT: Record<string, string> = {
  Benin: "BJ",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  "Guinee-Bissau": "GW",
  Mali: "ML",
  Niger: "NE",
  Senegal: "SN",
  Togo: "TG",
  UEMOA: "UEMOA",
  UMOA: "UMOA",
  Union: "Union",
  "Mediane UEMOA": "Médiane",
};
