/**
 * Types partages pour le Screener FCP. Extraits dans /lib pour decoupler
 * le composant de vue (FCPScreenerView) de l'emplacement de la page.
 */

export type ScreenerPeriodKey =
  | "lastPeriod"
  | "ytd"
  | "m3"
  | "m6"
  | "m9"
  | "y1"
  | "y3";

export type ScreenerCadence =
  | "quotidienne"
  | "hebdomadaire"
  | "trimestrielle"
  | "irrégulière";

export type ScreenerRow = {
  id: string;
  nom: string;
  gestionnaire: string;
  categorie: string;
  type: string;
  aumAtRef: number | null;
  latestVLDate: string;
  isStale: boolean;
  cadence: ScreenerCadence;
  ageYears: number | null;
  perf: Record<ScreenerPeriodKey, number | null>;
};
