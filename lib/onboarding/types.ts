/**
 * Types et constantes du parcours d'onboarding et des nudges JIT.
 * Doit rester aligne avec les enums Postgres (cf. supabase/schema.sql).
 */

export const COUNTRIES = [
  { code: "ci", flag: "🇨🇮", label: "Côte d'Ivoire" },
  { code: "sn", flag: "🇸🇳", label: "Sénégal" },
  { code: "bj", flag: "🇧🇯", label: "Bénin" },
  { code: "tg", flag: "🇹🇬", label: "Togo" },
  { code: "bf", flag: "🇧🇫", label: "Burkina Faso" },
  { code: "ml", flag: "🇲🇱", label: "Mali" },
  { code: "ne", flag: "🇳🇪", label: "Niger" },
  { code: "gw", flag: "🇬🇼", label: "Guinée-Bissau" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as CountryCode[];

export const EXPERIENCE_LEVELS = [
  {
    code: "debutant",
    label: "Débutant",
    description: "Je découvre les marchés et veux apprendre les bases.",
  },
  {
    code: "initie",
    label: "Initié",
    description: "J'investis déjà ou je suis les marchés régulièrement.",
  },
  {
    code: "expert",
    label: "Expert",
    description: "Je travaille dans la finance ou j'investis activement.",
  },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["code"];
export const EXPERIENCE_CODES = EXPERIENCE_LEVELS.map(
  (e) => e.code
) as ExperienceLevel[];

/**
 * Secteurs proposes uniquement aux utilisateurs Expert.
 * Stocke en text libre cote DB (pas d'enum) pour evolutivite — la liste
 * peut s'enrichir sans migration.
 */
export const PROFESSIONAL_SECTORS = [
  "Banque",
  "Assurance",
  "Société de gestion (SGI / SGP)",
  "Asset Management / FCP",
  "Trésorerie d'entreprise",
  "Audit / Conseil",
  "Régulateur / Fonction publique",
  "Académique / Recherche",
  "Autre",
] as const;

export type ProfessionalSector = (typeof PROFESSIONAL_SECTORS)[number];

export const INTERESTS = [
  { code: "actions", label: "Actions BRVM", icon: "📈" },
  { code: "obligations", label: "Obligations", icon: "💵" },
  { code: "fcp", label: "FCP / OPCVM", icon: "🧺" },
  { code: "monetaire", label: "Marché monétaire", icon: "🏦" },
  { code: "autre", label: "Autre", icon: "✨" },
] as const;

export type Interest = (typeof INTERESTS)[number]["code"];
export const INTEREST_CODES = INTERESTS.map((i) => i.code) as Interest[];

export const HORIZONS = [
  { code: "court", label: "Court terme", description: "Moins d'1 an" },
  { code: "moyen", label: "Moyen terme", description: "1 à 5 ans" },
  { code: "long", label: "Long terme", description: "Plus de 5 ans" },
] as const;

export type Horizon = (typeof HORIZONS)[number]["code"];
export const HORIZON_CODES = HORIZONS.map((h) => h.code) as Horizon[];

/**
 * Forme normalisee du profil cote app (subset des colonnes profiles).
 * Utilisee par le wizard et les nudges.
 */
export type ProfileExtras = {
  country: CountryCode | null;
  experience_level: ExperienceLevel | null;
  professional_sector: string | null;
  interests: string[];
  investment_horizon: Horizon | null;
  onboarded_at: string | null;
  dismissed_nudges: string[];
};

/**
 * Champs adressables par un nudge JIT (1 nudge = 1 champ).
 */
export type NudgeField =
  | "country"
  | "experience_level"
  | "interests"
  | "investment_horizon";

export const NUDGE_FIELDS: NudgeField[] = [
  "country",
  "experience_level",
  "interests",
  "investment_horizon",
];

export function nudgeIdFor(field: NudgeField): string {
  return `nudge:${field}`;
}
