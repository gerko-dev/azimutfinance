"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type { ActionResult } from "@/lib/admin/types";
import type { EmailBlock, EmailTemplate } from "@/lib/email/blocks";
import { EMAIL_BLOCK_TYPES } from "@/lib/email/blocks";
import { renderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/resend";
import { EMAIL_VARIABLE_HINTS } from "@/lib/email/blocks";

const EMAIL_IMAGES_BUCKET = "email-images";
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo

async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 2) return { ok: false, error: "Niveau d'administration insuffisant (L2+ requis)." };
  return { ok: true };
}

function isValidColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function validateBody(raw: unknown): EmailBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EmailBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    const type = obj.type;
    if (typeof type !== "string" || !(EMAIL_BLOCK_TYPES as string[]).includes(type)) {
      return null;
    }
    out.push(obj as EmailBlock);
  }
  return out;
}

// ============================================================
// Save template
// ============================================================

export async function saveEmailTemplateAction(
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const slug = String(formData.get("slug") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const headerBrandName = String(formData.get("header_brand_name") ?? "").trim();
  const headerBrandTagline = String(formData.get("header_brand_tagline") ?? "").trim();
  const headerLogoUrl = String(formData.get("header_logo_url") ?? "").trim();
  const footerText = String(formData.get("footer_text") ?? "").trim();
  const accentColor = String(formData.get("accent_color") ?? "").trim();
  const bodyJson = String(formData.get("body") ?? "");

  if (!slug) return { ok: false, error: "Slug manquant." };
  if (!subject) return { ok: false, error: "Le sujet est obligatoire." };
  if (!headerBrandName) return { ok: false, error: "Le nom de marque est obligatoire." };
  if (!footerText) return { ok: false, error: "Le texte du footer est obligatoire." };
  if (!isValidColor(accentColor)) {
    return { ok: false, error: "Couleur d'accent invalide (format attendu : #RRGGBB)." };
  }

  let body: EmailBlock[];
  try {
    const parsed = JSON.parse(bodyJson);
    const validated = validateBody(parsed);
    if (!validated) return { ok: false, error: "Format du corps invalide." };
    body = validated;
  } catch {
    return { ok: false, error: "JSON du corps invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("email_templates")
    .update({
      subject,
      header_brand_name: headerBrandName,
      header_brand_tagline: headerBrandTagline,
      header_logo_url: headerLogoUrl || null,
      footer_text: footerText,
      accent_color: accentColor,
      body,
    })
    .eq("slug", slug);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/email-templates");
  revalidatePath(`/admin/email-templates/${slug}`);
  return { ok: true, data: { slug } };
}

// ============================================================
// Upload image
// ============================================================

export async function uploadEmailImageAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const slug = String(formData.get("slug") ?? "").trim() || "divers";
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return { ok: false, error: "Format non supporté (JPG, PNG, WebP, GIF, SVG)." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image trop volumineuse (max 5 Mo)." };
  }

  const ext = (() => {
    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/gif") return "gif";
    if (file.type === "image/svg+xml") return "svg";
    return "bin";
  })();
  const random = Math.random().toString(36).slice(2, 10);
  const path = `templates/${slug}/${Date.now()}-${random}.${ext}`;

  const supabase = await createSupabaseServerClient();
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from(EMAIL_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = supabase.storage.from(EMAIL_IMAGES_BUCKET).getPublicUrl(path);
  return { ok: true, data: { url: pub.publicUrl } };
}

// ============================================================
// Send test email (utilise le template en cours d'edition, pas la DB)
// ============================================================

export async function sendTestEmailAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const to = String(formData.get("to") ?? "").trim();
  const templateJson = String(formData.get("template") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: "Email destinataire invalide." };
  }

  let template: EmailTemplate;
  try {
    template = JSON.parse(templateJson) as EmailTemplate;
  } catch {
    return { ok: false, error: "Template invalide." };
  }

  // Variables d'exemple selon le slug
  const hints = EMAIL_VARIABLE_HINTS[template.slug] ?? [];
  const vars: Record<string, string> = {};
  for (const h of hints) vars[h.label] = h.sample;

  const rendered = renderEmail(template, vars);

  const res = await sendEmail({
    to,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    replyTo: "contact@azimutfinance.com",
  });

  if (!res.ok) {
    if (res.skipped) {
      return { ok: false, error: "RESEND_API_KEY non configuré sur le serveur." };
    }
    return { ok: false, error: res.error };
  }
  return { ok: true, data: { id: res.id } };
}
