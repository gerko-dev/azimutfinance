import { getMyAdminLevel } from "@/lib/admin/auth";
import { getArticleById } from "@/lib/magazine/queries";
import { ARTICLE_CATEGORY_META } from "@/lib/magazine";
import { renderFlashCardHtml } from "@/lib/magazine/flashCard";
import { htmlToImage } from "@/lib/reports/pdf";
import { logoWhiteSvg } from "@/lib/reports/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Récupère la première image du corps de l'article et l'inline en data URI.
// Chromium (setContent) charge sans URL de base : on évite ainsi tout aléa réseau.
async function firstImageDataUri(
  body: { type: string; src?: string }[],
): Promise<string | null> {
  const img = body.find((b) => b.type === "image" && b.src);
  if (!img?.src) return null;
  try {
    const res = await fetch(img.src);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// GET /admin/magazine/articles/[id]/flash?format=png|jpeg
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  const { id } = await params;
  const fmt = new URL(req.url).searchParams.get("format") === "jpeg" ? "jpeg" : "png";

  try {
    const article = await getArticleById(id);
    if (!article) return new Response("Article introuvable.", { status: 404 });

    const cat = ARTICLE_CATEGORY_META[article.category];
    const bgDataUri = await firstImageDataUri(article.body);
    const html = renderFlashCardHtml({
      title: article.title,
      dek: article.dek,
      categoryLabel: cat.label,
      categoryColor: cat.color,
      bgDataUri,
      logoSvg: logoWhiteSvg(),
    });

    const img = await htmlToImage(html, {
      width: 1080,
      height: 1350,
      format: fmt,
      scale: 2,
    });

    return new Response(new Uint8Array(img), {
      headers: {
        "Content-Type": fmt === "jpeg" ? "image/jpeg" : "image/png",
        "Content-Disposition": `attachment; filename="${article.slug || "article"}-flash.${fmt === "jpeg" ? "jpg" : "png"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[magazine/flash]", err);
    return new Response(
      "Échec de la génération de l'image : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
