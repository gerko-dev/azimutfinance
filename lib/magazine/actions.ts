"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type {
  ActionResult,
  NewsletterStatus,
} from "./types";
import type { ArticleCategory, ContentBlock } from "@/lib/magazine";

const SLUG_RE = /^[a-z0-9-]+$/;
const CATEGORIES: ArticleCategory[] = [
  "macro", "marches", "obligations", "valeurs", "interview", "outils", "edito",
];

// Garde des actions magazine : Editeur (N3+) — page placee dans groupe
// Editeur de la sidebar. Nom de la fonction conserve pour eviter de toucher
// tous les call sites locaux.
async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 3) return { ok: false, error: "Niveau d'administration insuffisant (L3+ requis)." };
  return { ok: true };
}

// =============================================================================
// IMAGES
// =============================================================================

const MAGAZINE_IMAGES_BUCKET = "magazine-images";
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo

export async function uploadMagazineImage(
  formData: FormData,
): Promise<ActionResult<{ url: string; path: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Aucun fichier reçu." };
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Format non supporté (JPG, PNG, WebP, GIF, SVG).",
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image trop volumineuse (max 5 Mo)." };
  }

  const articleSlug = String(formData.get("article_slug") || "divers")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "divers";

  const ext = (() => {
    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/gif") return "gif";
    if (file.type === "image/svg+xml") return "svg";
    return "bin";
  })();
  const random = Math.random().toString(36).slice(2, 10);
  const path = `articles/${articleSlug}/${Date.now()}-${random}.${ext}`;

  const supabase = await createSupabaseServerClient();
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from(MAGAZINE_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = supabase.storage
    .from(MAGAZINE_IMAGES_BUCKET)
    .getPublicUrl(path);
  return { ok: true, data: { url: pub.publicUrl, path } };
}

// =============================================================================
// AUTHORS
// =============================================================================

export async function upsertAuthor(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const id = String(formData.get("id") || "").trim();
  const slug = String(formData.get("slug") || "").trim();
  const userId = String(formData.get("user_id") || "").trim();
  const displayName = String(formData.get("display_name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const initials = String(formData.get("initials") || "").trim().toUpperCase();

  if (!slug || !SLUG_RE.test(slug)) {
    return { ok: false, error: "Slug invalide (a-z, 0-9, -)." };
  }
  if (!displayName) return { ok: false, error: "Nom obligatoire." };
  if (!title) return { ok: false, error: "Titre/fonction obligatoire." };
  if (!initials || initials.length > 4) {
    return { ok: false, error: "Initiales : 1 à 4 caractères." };
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    slug,
    user_id: userId || null,
    display_name: displayName,
    title,
    bio,
    initials,
  };
  let resultId = id;
  if (id) {
    const { error } = await supabase
      .from("magazine_authors")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("magazine_authors")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    resultId = data.id as string;
  }
  revalidatePath("/admin/magazine/auteurs");
  revalidatePath("/admin/magazine/articles");
  return { ok: true, data: { id: resultId } };
}

export async function deleteAuthor(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("magazine_authors").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/magazine/auteurs");
  return { ok: true, data: undefined };
}

// =============================================================================
// ISSUES
// =============================================================================

type IssuePayload = {
  slug: string;
  number: number;
  monthLabel: string;
  theme: string;
  blurb: string;
  editorial: string;
  editorId: string | null;
  coverGradientFrom: string;
  coverGradientTo: string;
  coverText: "light" | "dark";
  publish: boolean;
};

function parseIssuePayload(formData: FormData): { ok: true; data: IssuePayload } | { ok: false; error: string } {
  const slug = String(formData.get("slug") || "").trim();
  const number = parseInt(String(formData.get("number") || "0"), 10);
  const monthLabel = String(formData.get("month_label") || "").trim();
  const theme = String(formData.get("theme") || "").trim();
  const blurb = String(formData.get("blurb") || "").trim();
  const editorial = String(formData.get("editorial") || "").trim();
  const editorId = String(formData.get("editor_id") || "").trim();
  const coverGradientFrom = String(formData.get("cover_gradient_from") || "").trim();
  const coverGradientTo = String(formData.get("cover_gradient_to") || "").trim();
  const coverText = String(formData.get("cover_text") || "light") as "light" | "dark";
  const publish = formData.get("publish") === "1";

  if (!slug || !SLUG_RE.test(slug)) return { ok: false, error: "Slug invalide." };
  if (!number || number < 1) return { ok: false, error: "Numéro invalide." };
  if (!monthLabel) return { ok: false, error: "Libellé du mois obligatoire." };
  if (!theme) return { ok: false, error: "Thème obligatoire." };
  if (!blurb) return { ok: false, error: "Accroche obligatoire." };
  if (!coverGradientFrom || !coverGradientTo) {
    return { ok: false, error: "Couleurs de couverture obligatoires." };
  }
  if (!["light", "dark"].includes(coverText)) {
    return { ok: false, error: "Couleur de texte couverture invalide." };
  }

  return {
    ok: true,
    data: {
      slug, number, monthLabel, theme, blurb, editorial,
      editorId: editorId || null,
      coverGradientFrom, coverGradientTo, coverText, publish,
    },
  };
}

export async function createIssue(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseIssuePayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("magazine_issues")
    .insert({
      slug: p.slug,
      number: p.number,
      month_label: p.monthLabel,
      theme: p.theme,
      blurb: p.blurb,
      editorial: p.editorial,
      editor_id: p.editorId,
      cover_gradient_from: p.coverGradientFrom,
      cover_gradient_to: p.coverGradientTo,
      cover_text: p.coverText,
      published_at: p.publish ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/numeros");
  revalidatePath("/academie/magazine");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateIssue(id: string, formData: FormData): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseIssuePayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("magazine_issues")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Numéro introuvable." };
  const currentPublishedAt = (existing as { published_at: string | null }).published_at;

  const { error } = await supabase
    .from("magazine_issues")
    .update({
      slug: p.slug,
      number: p.number,
      month_label: p.monthLabel,
      theme: p.theme,
      blurb: p.blurb,
      editorial: p.editorial,
      editor_id: p.editorId,
      cover_gradient_from: p.coverGradientFrom,
      cover_gradient_to: p.coverGradientTo,
      cover_text: p.coverText,
      published_at: p.publish
        ? currentPublishedAt ?? new Date().toISOString()
        : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/numeros");
  revalidatePath(`/admin/magazine/numeros/${id}`);
  revalidatePath("/academie/magazine");
  revalidatePath(`/academie/magazine/numero/${p.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteIssue(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("magazine_issues").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/numeros");
  revalidatePath("/academie/magazine");
  return { ok: true, data: undefined };
}

// =============================================================================
// ARTICLES
// =============================================================================

type ArticlePayload = {
  slug: string;
  issueId: string;
  category: ArticleCategory;
  title: string;
  dek: string;
  excerpt: string;
  tags: string[];
  authorId: string | null;
  readingTimeMinutes: number;
  accent: string;
  body: ContentBlock[];
  featured: boolean;
  publish: boolean;
};

function parseArticlePayload(formData: FormData): { ok: true; data: ArticlePayload } | { ok: false; error: string } {
  const slug = String(formData.get("slug") || "").trim();
  const issueId = String(formData.get("issue_id") || "").trim();
  const category = String(formData.get("category") || "") as ArticleCategory;
  const title = String(formData.get("title") || "").trim();
  const dek = String(formData.get("dek") || "").trim();
  const excerpt = String(formData.get("excerpt") || "").trim();
  const tagsRaw = String(formData.get("tags") || "");
  const authorId = String(formData.get("author_id") || "").trim();
  const readingTimeMinutes = parseInt(String(formData.get("reading_time_minutes") || "5"), 10) || 5;
  const accent = String(formData.get("accent") || "#475569").trim();
  const featured = formData.get("featured") === "1";
  const publish = formData.get("publish") === "1";
  const bodyJson = String(formData.get("body_json") || "[]");

  if (!slug || !SLUG_RE.test(slug)) return { ok: false, error: "Slug invalide." };
  if (!issueId) return { ok: false, error: "Numéro à associer obligatoire." };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Catégorie invalide." };
  if (!title) return { ok: false, error: "Titre obligatoire." };
  if (!excerpt) return { ok: false, error: "Extrait obligatoire." };
  if (readingTimeMinutes < 1 || readingTimeMinutes > 90) {
    return { ok: false, error: "Temps de lecture entre 1 et 90 min." };
  }

  let body: ContentBlock[];
  try {
    body = JSON.parse(bodyJson);
    if (!Array.isArray(body)) throw new Error("not array");
  } catch {
    return { ok: false, error: "Format du corps invalide." };
  }
  if (body.length === 0) {
    return { ok: false, error: "Le corps doit contenir au moins un bloc." };
  }

  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  return {
    ok: true,
    data: {
      slug, issueId, category, title, dek, excerpt, tags,
      authorId: authorId || null,
      readingTimeMinutes, accent, body, featured, publish,
    },
  };
}

export async function createArticle(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseArticlePayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("magazine_articles")
    .insert({
      slug: p.slug,
      issue_id: p.issueId,
      category: p.category,
      title: p.title,
      dek: p.dek,
      excerpt: p.excerpt,
      tags: p.tags,
      author_id: p.authorId,
      reading_time_minutes: p.readingTimeMinutes,
      accent: p.accent,
      body: p.body,
      featured: p.featured,
      published_at: p.publish ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/articles");
  revalidatePath("/academie/magazine");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateArticle(id: string, formData: FormData): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseArticlePayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("magazine_articles")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Article introuvable." };
  const currentPublishedAt = (existing as { published_at: string | null }).published_at;

  const { error } = await supabase
    .from("magazine_articles")
    .update({
      slug: p.slug,
      issue_id: p.issueId,
      category: p.category,
      title: p.title,
      dek: p.dek,
      excerpt: p.excerpt,
      tags: p.tags,
      author_id: p.authorId,
      reading_time_minutes: p.readingTimeMinutes,
      accent: p.accent,
      body: p.body,
      featured: p.featured,
      published_at: p.publish ? currentPublishedAt ?? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/articles");
  revalidatePath(`/admin/magazine/articles/${id}`);
  revalidatePath("/academie/magazine");
  revalidatePath(`/academie/magazine/article/${p.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("magazine_articles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/articles");
  revalidatePath("/academie/magazine");
  return { ok: true, data: undefined };
}

// =============================================================================
// NEWSLETTER
// =============================================================================

export async function subscribeNewsletter(
  formData: FormData,
): Promise<ActionResult<{ alreadySubscribed: boolean }>> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const source = String(formData.get("source") || "magazine").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Email invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verifier d'abord si l'email existe deja
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const e = existing as { id: string; status: NewsletterStatus };
    if (e.status === "active") {
      return { ok: true, data: { alreadySubscribed: true } };
    }
    // Reactiver un abonne unsubscribed
    const { error } = await supabase
      .from("newsletter_subscribers")
      .update({ status: "active", unsubscribed_at: null })
      .eq("id", e.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { alreadySubscribed: false } };
  }

  const { error } = await supabase.from("newsletter_subscribers").insert({
    email,
    full_name: fullName || null,
    country: country || null,
    source: source || "magazine",
    user_id: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/newsletter");
  return { ok: true, data: { alreadySubscribed: false } };
}

export async function setNewsletterStatus(
  id: string,
  status: NewsletterStatus,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_newsletter_status", {
    p_id: id,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/newsletter");
  return { ok: true, data: undefined };
}

export async function deleteNewsletterSubscriber(id: string): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/magazine/newsletter");
  return { ok: true, data: undefined };
}
