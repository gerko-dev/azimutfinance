export type PlanCode = "m1" | "m6" | "y1";

export type Plan = {
  code: PlanCode;
  label: string;
  durationLabel: string;
  priceFcfa: number;
  pricePerMonthFcfa: number;
  discountPct: number;
  highlight?: boolean;
  tagline: string;
};

export const PLANS: Record<PlanCode, Plan> = {
  m1: {
    code: "m1",
    label: "Mensuel",
    durationLabel: "1 mois",
    priceFcfa: 9_999,
    pricePerMonthFcfa: 9_999,
    discountPct: 0,
    tagline: "Pour découvrir Premium",
  },
  m6: {
    code: "m6",
    label: "Semestriel",
    durationLabel: "6 mois",
    priceFcfa: 54_999,
    pricePerMonthFcfa: 9_166,
    discountPct: 8,
    tagline: "Économisez 4 995 FCFA",
  },
  y1: {
    code: "y1",
    label: "Annuel",
    durationLabel: "12 mois",
    priceFcfa: 99_999,
    pricePerMonthFcfa: 8_333,
    discountPct: 17,
    highlight: true,
    tagline: "Économisez 19 989 FCFA",
  },
};

export const PLAN_LIST: Plan[] = [PLANS.m1, PLANS.m6, PLANS.y1];

export const PREMIUM_FEATURES: string[] = [
  "Tout le plan Membre",
  "Analyses approfondies et recommandations",
  "Courbe des taux souverains UEMOA · analyse obligataire approfondie",
  "Pricing élaboré et simulateur avancé pour les obligations",
  "Fiches détaillées FCP / OPCVM (perf vs catégorie, quartiles, AUM)",
  "Fiches détaillées sociétés de gestion (league table, qualité)",
  "Graphiques avancés (chandeliers OHLC + indicateurs techniques)",
  "Magazine éditorial complet",
];

export function formatFcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

/**
 * Remise a annoncer publiquement : la plus forte parmi les plans actifs.
 *
 * C'est `discount_pct` qui fait foi — la « reduction affichee » pilotee depuis
 * Admin > Tarification > Plans, et la seule des deux sources de remise que la
 * RLS laisse lire a un visiteur anonyme (`pricing_plans` est en select public
 * sur `active = true`, `promo_codes` est reserve a l'admin niveau 1).
 *
 * Renvoie 0 quand aucun plan n'affiche de remise : les appelants s'en servent
 * pour ne rien afficher du tout plutot qu'une pastille « -0 % ».
 */
export function bestDiscountPct(plans: { discountPct: number }[]): number {
  if (plans.length === 0) return 0;
  return Math.max(0, ...plans.map((p) => Math.round(p.discountPct || 0)));
}

export function isValidPlanCode(code: string): code is PlanCode {
  return code === "m1" || code === "m6" || code === "y1";
}

/**
 * Convertit une ligne `pricing_plans` (Supabase) en Plan UI.
 * Pur — pas de dependance server-only.
 */
export function planFromRow(row: {
  code: string;
  label: string;
  duration_label: string;
  duration_months: number;
  price_fcfa: number;
  discount_pct: number;
  tagline: string | null;
  highlight: boolean;
}): Plan {
  const months = Math.max(1, row.duration_months);
  return {
    code: row.code as PlanCode,
    label: row.label,
    durationLabel: row.duration_label,
    priceFcfa: row.price_fcfa,
    pricePerMonthFcfa: Math.round(row.price_fcfa / months),
    discountPct: row.discount_pct,
    highlight: row.highlight,
    tagline: row.tagline ?? "",
  };
}
