import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailBlock, EmailTemplate } from "./blocks";
import { DEFAULT_TEMPLATES } from "./defaults";

type EmailTemplateRow = {
  slug: string;
  subject: string;
  header_brand_name: string;
  header_brand_tagline: string;
  header_logo_url: string | null;
  footer_text: string;
  accent_color: string;
  body: EmailBlock[] | null;
};

/**
 * Charge un template depuis la DB par son slug.
 * Fallback sur DEFAULT_TEMPLATES en cas d'absence ou d'erreur :
 *   - DB non encore migree
 *   - Ligne supprimee par accident
 *   - Erreur reseau Supabase
 */
export async function loadEmailTemplate(slug: string): Promise<EmailTemplate> {
  const fallback = DEFAULT_TEMPLATES[slug];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("email_templates")
      .select(
        "slug, subject, header_brand_name, header_brand_tagline, header_logo_url, footer_text, accent_color, body",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) {
      if (!fallback) {
        throw new Error(`Template email inconnu : ${slug}`);
      }
      return fallback;
    }

    const row = data as EmailTemplateRow;
    return {
      slug: row.slug,
      subject: row.subject,
      header_brand_name: row.header_brand_name,
      header_brand_tagline: row.header_brand_tagline,
      header_logo_url: row.header_logo_url,
      footer_text: row.footer_text,
      accent_color: row.accent_color,
      body: Array.isArray(row.body) ? row.body : (fallback?.body ?? []),
    };
  } catch {
    if (!fallback) {
      throw new Error(`Template email inconnu : ${slug}`);
    }
    return fallback;
  }
}
