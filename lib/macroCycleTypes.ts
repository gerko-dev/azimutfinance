// Types et constantes du déducteur de cycle — utilisables côté client.
// L'implémentation server-only vit dans `lib/macroCycle.ts`.

import type { MacroCountryCode } from "./macroTypes";

export type CyclePhase =
  | "expansion"
  | "surchauffe"
  | "ralentissement"
  | "stagflation"
  | "recession"
  | "reprise"
  | "indetermine";

export const PHASE_META: Record<
  CyclePhase,
  {
    label: string;
    description: string;
    color: string;
    bg: string;
    border: string;
    tone: "positive" | "neutral" | "warn" | "alert";
  }
> = {
  expansion: {
    label: "Expansion",
    description:
      "Croissance au-dessus de la tendance avec inflation maîtrisée. Conjoncture favorable au crédit et à l'investissement.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    tone: "positive",
  },
  surchauffe: {
    label: "Surchauffe",
    description:
      "Croissance au-dessus de la tendance mais inflation au-dessus du critère de convergence (≤ 3 %). Risque de pression sur les prix et la balance extérieure.",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    tone: "warn",
  },
  ralentissement: {
    label: "Ralentissement",
    description:
      "Croissance positive mais inférieure à la tendance long terme. Inflation contenue. Phase de modération avant éventuelle accélération ou contraction.",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    tone: "neutral",
  },
  stagflation: {
    label: "Stagflation",
    description:
      "Croissance faible et inflation au-dessus du critère. Configuration la plus difficile : aucune réponse de politique économique n'est sans contrepartie.",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    tone: "alert",
  },
  recession: {
    label: "Récession",
    description:
      "Croissance négative. Contraction de l'activité ; nécessite typiquement un soutien budgétaire et/ou monétaire.",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    tone: "alert",
  },
  reprise: {
    label: "Reprise",
    description:
      "Sortie de contraction : croissance redevenue positive après une période négative. Phase précoce de l'expansion.",
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    tone: "positive",
  },
  indetermine: {
    label: "Indéterminé",
    description: "Données insuffisantes pour conclure.",
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    tone: "neutral",
  },
};

export type StanceTone = "expansive" | "neutre" | "restrictive" | "indispo";

export type CycleQualifier = {
  key: string;
  label: string;
  value: string;
  caption: string;
  tone: StanceTone;
};

export type CycleSnapshot = {
  countryCode: MacroCountryCode;
  phase: CyclePhase;
  /** Score 0..1 : combien d'indicateurs convergent vers la phase identifiée. */
  confidence: number;
  /** Période de la donnée croissance/inflation. */
  period: string | null;
  growth: number | null;
  growthTrend: number | null;
  growthGap: number | null;
  inflation: number | null;
  inflationGap: number | null;
  qualifiers: CycleQualifier[];
  reading: string;
};

export type CyclePeerPoint = {
  countryCode: MacroCountryCode;
  growth: number;
  inflation: number;
  period: string;
};
