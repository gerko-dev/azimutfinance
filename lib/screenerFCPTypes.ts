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
  | "bimensuelle"
  | "mensuelle"
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
  /** "declaree" quand la societe de gestion publie sa periodicite de calcul,
   *  "observee" quand on la deduit de l'espacement reel des VL. */
  cadenceSource: "declaree" | "observee" | null;
  ageYears: number | null;
  perf: Record<ScreenerPeriodKey, number | null>;
};
