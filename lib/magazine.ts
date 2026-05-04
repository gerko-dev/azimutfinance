// === TYPES & HELPERS DU MAGAZINE ===
//
// Le contenu (issues, articles, auteurs) est en base.
// Utiliser lib/magazine/queries.ts pour le charger.

export type ArticleCategory =
  | "macro"
  | "marches"
  | "obligations"
  | "valeurs"
  | "interview"
  | "outils"
  | "edito";

export type ImageWidth = "narrow" | "wide" | "full";

export type ContentBlock =
  | { type: "paragraph"; text: string; lead?: boolean }
  | { type: "heading"; level: 2 | 3; text: string; id?: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "callout"; tone: "info" | "warning" | "success" | "neutral"; title?: string; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "stats"; items: { label: string; value: string; sub?: string; accent?: string }[] }
  | { type: "image"; src: string; alt: string; caption?: string; credit?: string; width?: ImageWidth }
  | { type: "divider" };

export type Author = {
  id: string;
  slug: string;
  userId: string | null;
  name: string;
  title: string;
  bio: string;
  initials: string;
};

export type Article = {
  id: string;
  slug: string;
  issueId: string;
  issueSlug: string;
  category: ArticleCategory;
  title: string;
  dek: string;
  excerpt: string;
  tags: string[];
  authorId: string | null;
  authorSlug: string | null;
  authorName: string | null;
  authorInitials: string | null;
  publishedAt: string | null;
  readingTimeMinutes: number;
  accent: string;
  body: ContentBlock[];
  featured: boolean;
  updatedAt: string;
};

export type Issue = {
  id: string;
  slug: string;
  number: number;
  monthLabel: string;
  publishedAt: string | null;
  theme: string;
  blurb: string;
  editorial: string;
  editorId: string | null;
  coverGradient: { from: string; to: string };
  coverText: "light" | "dark";
  updatedAt: string;
};

// =============================================================================
// METADATA
// =============================================================================

export const ARTICLE_CATEGORY_META: Record<
  ArticleCategory,
  { label: string; color: string }
> = {
  macro: { label: "Macro UEMOA", color: "#059669" },
  marches: { label: "Marchés BRVM", color: "#1d4ed8" },
  obligations: { label: "Obligations", color: "#b45309" },
  valeurs: { label: "Valeurs cotées", color: "#7c3aed" },
  interview: { label: "Entretien", color: "#be185d" },
  outils: { label: "Outils & méthode", color: "#0d9488" },
  edito: { label: "Éditorial", color: "#475569" },
};

export const CALLOUT_TONES: ("info" | "warning" | "success" | "neutral")[] = [
  "info",
  "warning",
  "success",
  "neutral",
];

// =============================================================================
// HELPERS
// =============================================================================

export function fmtArticleDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const months = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Extrait les blocs heading pour construire un sommaire (TOC). */
export function buildToc(article: Article): { id: string; text: string; level: 2 | 3 }[] {
  const toc: { id: string; text: string; level: 2 | 3 }[] = [];
  for (const block of article.body) {
    if (block.type === "heading") {
      const id =
        block.id ??
        block.text
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      toc.push({ id, text: block.text, level: block.level });
    }
  }
  return toc;
}

export function getMagazineStats(opts: {
  issuesCount: number;
  articlesCount: number;
  authorsCount: number;
  totalReadingMinutes: number;
}) {
  return opts;
}
