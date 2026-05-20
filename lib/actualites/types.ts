// === Types actualités ===

import type { NewsType } from "@/lib/newsTypes";

export type Actualite = {
  id: string;
  ticker: string;
  category: NewsType;
  title: string;
  excerpt: string | null;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size_bytes: number | null;
  attachment2_path: string | null;
  attachment2_name: string | null;
  attachment2_size_bytes: number | null;
  source_url: string | null;
  published_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const STORAGE_BUCKET = "actualites-attachments";
