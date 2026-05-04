// === TYPES & HELPERS DU CATALOGUE FORMATIONS ===
//
// Le catalogue lui-meme est en base (table public.formations) :
// utiliser lib/formations/queries.ts pour le charger,
// lib/formations/actions.ts pour le muter.

export type FormationLevel = "debutant" | "intermediaire" | "avance";

export type FormationFormat = "cours" | "atelier" | "certifiant";

export type FormationCategory =
  | "bourse"
  | "obligations"
  | "analyse"
  | "macro"
  | "portefeuille"
  | "pratique";

export type FormationPricingType = "gratuit" | "premium" | "certifiant";

export type FormationPricing =
  | { type: "gratuit" }
  | { type: "premium"; priceFcfa: number }
  | { type: "certifiant"; priceFcfa: number };

export type FormationModule = {
  title: string;
  durationMinutes: number;
  /** Prévisualisable gratuitement avant achat */
  preview?: boolean;
};

export type Formation = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  level: FormationLevel;
  format: FormationFormat;
  category: FormationCategory;
  modules: FormationModule[];
  prerequisites: string[];
  outcomes: string[];
  pricing: FormationPricing;
  tags: string[];
  accentColor?: string;
  instructor?: { name: string; title: string };
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

// =============================================================================
// METADATA CATEGORIES
// =============================================================================

export const CATEGORY_META: Record<
  FormationCategory,
  { label: string; description: string; color: string }
> = {
  bourse: {
    label: "Bourse & BRVM",
    description: "Marché actions, fonctionnement de la BRVM, séances et carnet d'ordres",
    color: "#1d4ed8",
  },
  obligations: {
    label: "Obligations & Souverains",
    description: "Marché obligataire, OAT, BAT, UMOA-Titres, YTM et duration",
    color: "#b45309",
  },
  analyse: {
    label: "Analyse fondamentale & technique",
    description: "Lire un bilan, ratios financiers, chartisme et indicateurs",
    color: "#7c3aed",
  },
  macro: {
    label: "Macroéconomie UEMOA",
    description: "BCEAO, inflation, taux directeurs, matières premières, FCFA",
    color: "#059669",
  },
  portefeuille: {
    label: "Gestion de portefeuille",
    description: "Allocation, diversification, gestion du risque, FCP / OPCVM",
    color: "#be185d",
  },
  pratique: {
    label: "Pratique & premiers pas",
    description: "Ouvrir un compte, passer un ordre, fiscalité des plus-values",
    color: "#475569",
  },
};

export const LEVEL_META: Record<FormationLevel, { label: string; color: string }> = {
  debutant: { label: "Débutant", color: "#16a34a" },
  intermediaire: { label: "Intermédiaire", color: "#2563eb" },
  avance: { label: "Avancé", color: "#9333ea" },
};

export const FORMAT_META: Record<FormationFormat, { label: string }> = {
  cours: { label: "Cours en ligne" },
  atelier: { label: "Atelier live" },
  certifiant: { label: "Certifiant" },
};

export const PAYMENT_METHOD_LABEL: Record<
  "gratuit" | "orange_money" | "wave" | "virement" | "sur_place",
  string
> = {
  gratuit: "Gratuit",
  orange_money: "Orange Money",
  wave: "Wave",
  virement: "Virement bancaire",
  sur_place: "Sur place",
};

export const INSCRIPTION_STATUS_LABEL: Record<
  "en_attente" | "confirmee" | "payee" | "annulee",
  string
> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  payee: "Payée",
  annulee: "Annulée",
};

export const INSCRIPTION_STATUS_COLOR: Record<
  "en_attente" | "confirmee" | "payee" | "annulee",
  string
> = {
  en_attente: "#b45309",
  confirmee: "#1d4ed8",
  payee: "#059669",
  annulee: "#475569",
};

// =============================================================================
// HELPERS
// =============================================================================

export function totalDurationMinutes(formation: Formation): number {
  return formation.modules.reduce((s, m) => s + m.durationMinutes, 0);
}

export function totalDurationLabel(formation: Formation): string {
  const m = totalDurationMinutes(formation);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return `${h} h`;
  return `${h} h ${mm.toString().padStart(2, "0")}`;
}

export function pricingLabel(formation: Formation): string {
  if (formation.pricing.type === "gratuit") return "Gratuit";
  return `${formation.pricing.priceFcfa.toLocaleString("fr-FR")} FCFA`;
}

export function pricingShortLabel(formation: Formation): string {
  if (formation.pricing.type === "gratuit") return "Gratuit";
  if (formation.pricing.type === "certifiant") return "Certifiant";
  return "Premium";
}

export function getCatalogStats(formations: Formation[]): {
  total: number;
  totalHours: number;
  freeCount: number;
  premiumCount: number;
  certifyingCount: number;
  byCategory: Record<FormationCategory, number>;
  byLevel: Record<FormationLevel, number>;
} {
  const byCategory = {
    bourse: 0,
    obligations: 0,
    analyse: 0,
    macro: 0,
    portefeuille: 0,
    pratique: 0,
  } as Record<FormationCategory, number>;
  const byLevel = { debutant: 0, intermediaire: 0, avance: 0 } as Record<
    FormationLevel,
    number
  >;
  let free = 0;
  let premium = 0;
  let certifying = 0;
  let totalMinutes = 0;
  for (const f of formations) {
    byCategory[f.category]++;
    byLevel[f.level]++;
    if (f.pricing.type === "gratuit") free++;
    else if (f.pricing.type === "premium") premium++;
    else certifying++;
    totalMinutes += totalDurationMinutes(f);
  }
  return {
    total: formations.length,
    totalHours: Math.round(totalMinutes / 60),
    freeCount: free,
    premiumCount: premium,
    certifyingCount: certifying,
    byCategory,
    byLevel,
  };
}

// Liste des pays UEMOA pour le formulaire d'inscription.
export const UEMOA_COUNTRIES: { code: string; label: string }[] = [
  { code: "ci", label: "Côte d'Ivoire" },
  { code: "sn", label: "Sénégal" },
  { code: "bj", label: "Bénin" },
  { code: "tg", label: "Togo" },
  { code: "bf", label: "Burkina Faso" },
  { code: "ml", label: "Mali" },
  { code: "ne", label: "Niger" },
  { code: "gw", label: "Guinée-Bissau" },
];
