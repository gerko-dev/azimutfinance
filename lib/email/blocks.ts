/**
 * Blocs de contenu pour les emails AzimutFinance.
 * Pur — utilisable cote client et serveur (l'editeur admin et le renderer).
 *
 * Pourquoi un type distinct de magazine.ContentBlock ?
 * - L'email a besoin d'un bloc "button" (CTA) qui n'existe pas dans le magazine.
 * - Certains blocs magazine (stats grids) ne s'affichent pas correctement
 *   dans Gmail / Outlook (table layout obligatoire, pas de flex/grid).
 * - Les contraintes de largeur (max 600px), styles inline, etc. sont
 *   different.
 */

export type EmailImageWidth = "narrow" | "wide" | "full";

export type EmailCalloutTone = "info" | "warning" | "success" | "neutral";

export type EmailBlock =
  | { type: "paragraph"; text: string; lead?: boolean }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "image"; src: string; alt: string; width?: EmailImageWidth; caption?: string }
  | { type: "button"; text: string; url: string; color?: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "callout"; tone: EmailCalloutTone; title?: string; text: string }
  | { type: "divider" }
  | { type: "spacer"; size?: "sm" | "md" | "lg" };

export type EmailBlockType = EmailBlock["type"];

export const EMAIL_BLOCK_LABELS: Record<EmailBlockType, string> = {
  paragraph: "Paragraphe",
  heading: "Titre",
  image: "Image",
  button: "Bouton CTA",
  list: "Liste",
  callout: "Encadré",
  divider: "Séparateur",
  spacer: "Espacement",
};

export const EMAIL_BLOCK_TYPES: EmailBlockType[] = [
  "paragraph",
  "heading",
  "image",
  "button",
  "list",
  "callout",
  "divider",
  "spacer",
];

export function makeEmailBlock(type: EmailBlockType): EmailBlock {
  switch (type) {
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "heading":
      return { type: "heading", level: 2, text: "" };
    case "image":
      return { type: "image", src: "", alt: "", width: "wide" };
    case "button":
      return { type: "button", text: "En savoir plus", url: "{{account_url}}" };
    case "list":
      return { type: "list", items: [""] };
    case "callout":
      return { type: "callout", tone: "info", text: "" };
    case "divider":
      return { type: "divider" };
    case "spacer":
      return { type: "spacer", size: "md" };
  }
}

export type EmailTemplate = {
  slug: string;
  subject: string;
  header_brand_name: string;
  header_brand_tagline: string;
  header_logo_url: string | null;
  footer_text: string;
  accent_color: string;
  body: EmailBlock[];
};

/**
 * Variables disponibles dans subject + tous les textes des blocs.
 * Sous la forme {{slug}}. Toute variable non fournie est remplacée par "".
 */
export type EmailVariables = Record<string, string>;

/** Liste des variables possibles selon le template (pour l'aide à l'admin). */
export const EMAIL_VARIABLE_HINTS: Record<string, { label: string; sample: string }[]> = {
  "premium-validated": [
    { label: "full_name", sample: "Aïssata Koné" },
    { label: "plan_label", sample: "Annuel" },
    { label: "amount", sample: "99 999 FCFA" },
    { label: "premium_until", sample: "12 mai 2027" },
    { label: "account_url", sample: "https://azimutfinance.com/compte" },
    { label: "app_url", sample: "https://azimutfinance.com" },
  ],
  "premium-rejected": [
    { label: "full_name", sample: "Aïssata Koné" },
    { label: "plan_label", sample: "Mensuel" },
    { label: "amount", sample: "9 999 FCFA" },
    { label: "rejection_reason", sample: "Le montant reçu (5 000 FCFA) ne correspond pas au tarif." },
    { label: "premium_url", sample: "https://azimutfinance.com/premium" },
    { label: "app_url", sample: "https://azimutfinance.com" },
  ],
  "premium-expiring-soon": [
    { label: "full_name", sample: "Aïssata Koné" },
    { label: "plan_label", sample: "Annuel" },
    { label: "premium_until", sample: "15 mai 2026" },
    { label: "days_left", sample: "3" },
    { label: "premium_url", sample: "https://azimutfinance.com/premium" },
    { label: "app_url", sample: "https://azimutfinance.com" },
  ],
};
