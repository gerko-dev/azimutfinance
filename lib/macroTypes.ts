// Types et constantes pures (utilisables côté client + serveur).
// Aucun import Node ici — `lib/macroLoader.ts` reste réservé au serveur.

export type MacroCountryCode =
  | "BJ"
  | "BF"
  | "CI"
  | "GW"
  | "ML"
  | "NE"
  | "SN"
  | "TG"
  | "UMOA";

export type MacroCountry = {
  code: MacroCountryCode;
  csvName: string;
  shortName: string;
  longName: string;
  capital?: string;
};

export const MACRO_COUNTRIES: MacroCountry[] = [
  { code: "BJ", csvName: "BENIN", shortName: "Bénin", longName: "République du Bénin", capital: "Porto-Novo" },
  { code: "BF", csvName: "BURKINA FASO", shortName: "Burkina Faso", longName: "Burkina Faso", capital: "Ouagadougou" },
  { code: "CI", csvName: "COTE D'IVOIRE", shortName: "Côte d'Ivoire", longName: "République de Côte d'Ivoire", capital: "Yamoussoukro" },
  { code: "GW", csvName: "GUINEE BISSAU", shortName: "Guinée-Bissau", longName: "République de Guinée-Bissau", capital: "Bissau" },
  { code: "ML", csvName: "MALI", shortName: "Mali", longName: "République du Mali", capital: "Bamako" },
  { code: "NE", csvName: "NIGER", shortName: "Niger", longName: "République du Niger", capital: "Niamey" },
  { code: "SN", csvName: "SENEGAL", shortName: "Sénégal", longName: "République du Sénégal", capital: "Dakar" },
  { code: "TG", csvName: "TOGO", shortName: "Togo", longName: "République togolaise", capital: "Lomé" },
  { code: "UMOA", csvName: "ENSEMBLE UMOA", shortName: "UMOA", longName: "Ensemble UMOA (8 pays)" },
];

export const COUNTRY_BY_CODE: Record<string, MacroCountry> = Object.fromEntries(
  MACRO_COUNTRIES.map((c) => [c.code, c]),
);

export type Periodicity = "yearly" | "monthly";

export type MacroRow = {
  country: MacroCountryCode;
  feuille: string;
  code: string;
  indicator: string;
  iso: string;
  sortKey: number;
  label: string;
  value: number;
  periodicity: Periodicity;
};

export type KPIUnit =
  | "pct" // décimal multiplié par 100 à l'affichage
  | "raw_pct" // déjà en %, affichage tel quel
  | "Mds_FCFA" // milliards de FCFA
  | "raw"; // brut

export type MacroKPI = {
  key: string;
  label: string;
  unit: KPIUnit;
  value: number | null;
  periodLabel: string | null;
  delta: number | null;
  deltaLabel: string | null;
  prevPeriodLabel: string | null;
  group: "croissance" | "prix" | "epargne" | "budget" | "exterieur" | "monnaie";
  /** Rang du pays sur les 8 pays UEMOA (UMOA exclu). Position = 1 = meilleur. */
  rank?: { position: number; total: number } | null;
  /** Indicateur de convergence UEMOA (inflation/solde/dette). */
  convergence?: {
    threshold: number;
    direction: "max" | "min"; // "max" = critère "≤ threshold" ; "min" = "≥ threshold"
    satisfied: boolean;
    label: string; // ex: "≤ 3 %"
  } | null;
};

// ---- Explorer (catalogue léger pour le studio) ----

export type ExplorerIndicator = {
  indicator: string;
  count: number;
  lastIso: string;
};

export type ExplorerFeuille = {
  feuille: string;
  periodicity: Periodicity;
  indicators: ExplorerIndicator[];
};
