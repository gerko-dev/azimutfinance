import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEWS_TYPES, type NewsItem, type NewsType } from "./newsTypes";

/** Normalise la categorie DB en NewsType ; repli 'communique' si inconnue. */
function asNewsType(raw: unknown): NewsType {
  const v = String(raw ?? "").trim();
  return (NEWS_TYPES as string[]).includes(v) ? (v as NewsType) : "communique";
}

/**
 * Charge les actualites publiees depuis la base de donnees (table actualites)
 * et les convertit au format NewsItem pour s'afficher dans l'onglet actualites
 * de la fiche titre. Les liens pointent vers /actualites/[id] (page interne
 * avec download de la piece jointe).
 *
 * Si la requete echoue (table absente, RLS, etc.) on renvoie [] silencieusement
 * — l'objectif est de ne jamais casser la fiche titre.
 */
export async function loadDbNewsByTicker(ticker: string): Promise<NewsItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("actualites")
      .select("id, ticker, category, title, excerpt, body, attachment_name, source_url, published_at")
      .eq("ticker", ticker.toUpperCase())
      .not("published_at", "is", null)
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    return data.map((a) => {
      const title = String((a as { title: string }).title);
      const hasAttachment = !!(a as { attachment_name?: string }).attachment_name;
      return {
        ticker: String((a as { ticker: string }).ticker).toUpperCase(),
        date: ((a as { published_at: string }).published_at).slice(0, 10),
        type: asNewsType((a as { category?: string }).category),
        titre: hasAttachment ? `${title} 📎` : title,
        source: "AzimutFinance",
        // URL interne : la fiche titre ouvrira la page detail avec download.
        url: `/actualites/${(a as { id: string }).id}`,
        resume:
          (a as { excerpt: string | null }).excerpt ??
          String((a as { body: string }).body).slice(0, 240),
      };
    });
  } catch {
    return [];
  }
}
