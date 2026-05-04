// === Types DB pour magazine + newsletter ===

import type {
  ArticleCategory,
  ContentBlock,
} from "@/lib/magazine";

export type AuthorRow = {
  id: string;
  slug: string;
  user_id: string | null;
  display_name: string;
  title: string;
  bio: string;
  initials: string;
  created_at: string;
  updated_at: string;
};

export type IssueRow = {
  id: string;
  slug: string;
  number: number;
  month_label: string;
  theme: string;
  blurb: string;
  editorial: string;
  editor_id: string | null;
  cover_gradient_from: string;
  cover_gradient_to: string;
  cover_text: "light" | "dark";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ArticleRow = {
  id: string;
  slug: string;
  issue_id: string;
  category: ArticleCategory;
  title: string;
  dek: string;
  excerpt: string;
  tags: string[];
  author_id: string | null;
  reading_time_minutes: number;
  accent: string;
  body: ContentBlock[];
  featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsletterStatus = "active" | "unsubscribed";

export type NewsletterSubscriberRow = {
  id: string;
  email: string;
  full_name: string | null;
  country: string | null;
  status: NewsletterStatus;
  source: string;
  user_id: string | null;
  created_at: string;
  unsubscribed_at: string | null;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
