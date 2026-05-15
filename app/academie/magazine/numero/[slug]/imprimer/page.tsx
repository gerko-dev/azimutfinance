import { notFound, redirect } from "next/navigation";
import MagazineCover from "@/components/academie/MagazineCover";
import MagazinePrintToolbar from "@/components/academie/MagazinePrintToolbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ARTICLE_CATEGORY_META,
  fmtArticleDate,
  type Article,
  type ContentBlock,
} from "@/lib/magazine";
import {
  getArticlesByIssueId,
  getAuthorById,
  getPublishedIssueBySlug,
} from "@/lib/magazine/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const i = await getPublishedIssueBySlug(slug);
  if (!i) return { title: "Numéro — Azimut Magazine" };
  return {
    title: `Azimut Magazine N° ${String(i.number).padStart(2, "0")} — ${i.theme} (version imprimable)`,
    robots: { index: false, follow: false },
  };
}

export default async function IssuePrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/connexion?redirect=/academie/magazine/numero/${slug}/imprimer`);
  }
  const issue = await getPublishedIssueBySlug(slug);
  if (!issue) notFound();

  const [articles, editor] = await Promise.all([
    getArticlesByIssueId(issue.id),
    issue.editorId ? getAuthorById(issue.editorId) : Promise.resolve(null),
  ]);

  const issueLabel = String(issue.number).padStart(2, "0");
  const backHref = `/academie/magazine/numero/${issue.slug}`;
  const totalReading = articles.reduce((s, a) => s + a.readingTimeMinutes, 0);

  // Styles communs a chaque "feuille" : carte blanche a l'ecran, pleine page a
  // l'impression (une feuille = une page imprimee grace a break-before-page).
  const sheet =
    "bg-white rounded shadow-sm mb-6 px-10 py-12 " +
    "print:shadow-none print:m-0 print:p-0 print:rounded-none";

  return (
    <div className="bg-slate-100 min-h-screen pt-20 pb-12 print:bg-white print:p-0">
      <MagazinePrintToolbar backHref={backHref} />

      <div className="magazine-print-sheet max-w-[820px] mx-auto px-4 print:px-0 print:max-w-none">
        {/* ===== Page 1 — Couverture ===== */}
        <section className={sheet}>
          <div className="mx-auto" style={{ maxWidth: 360 }}>
            <div
              className="rounded overflow-hidden shadow-lg print:shadow-none"
              style={{ aspectRatio: "220 / 300" }}
            >
              <MagazineCover
                number={issue.number}
                monthLabel={issue.monthLabel}
                theme={issue.theme}
                gradient={issue.coverGradient}
                textTone={issue.coverText}
                size="xl"
              />
            </div>
          </div>
          <div className="text-center mt-8">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              Azimut Magazine · Numéro {issueLabel} · {issue.monthLabel}
            </div>
            <h1
              className="text-3xl font-bold text-slate-900 mt-3 leading-tight"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {issue.theme}
            </h1>
            {issue.blurb && (
              <p className="text-base text-slate-600 mt-3 leading-relaxed max-w-xl mx-auto">
                {issue.blurb}
              </p>
            )}
            <div className="mt-4 text-xs text-slate-500">
              {articles.length} articles · {totalReading} min de lecture
              {issue.publishedAt
                ? ` · Publié le ${fmtArticleDate(issue.publishedAt)}`
                : ""}
            </div>
          </div>
        </section>

        {/* ===== Page 2 — Édito + sommaire ===== */}
        <section className={`${sheet} break-before-page`}>
          {issue.editorial && (
            <div className="mb-10">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Édito
              </div>
              <p
                className="text-lg text-slate-800 leading-relaxed italic mt-3"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {issue.editorial}
              </p>
              {editor && (
                <div className="mt-3 text-[11px] text-slate-500">
                  — {editor.name}, {editor.title}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 pb-2">
              Au sommaire de ce numéro
            </div>
            <ol className="mt-4 space-y-3">
              {articles.map((a, i) => {
                const cat = ARTICLE_CATEGORY_META[a.category];
                return (
                  <li key={a.slug} className="flex gap-3 items-baseline">
                    <span
                      className="text-lg font-bold tabular-nums text-slate-300 w-7 shrink-0"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold mr-2"
                        style={{ color: cat.color }}
                      >
                        {cat.label}
                      </span>
                      <span
                        className="text-base font-bold text-slate-900"
                        style={{ fontFamily: "Georgia, serif" }}
                      >
                        {a.title}
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {a.authorName ?? "La rédaction"} · {a.readingTimeMinutes} min
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ===== Une page par article ===== */}
        {articles.map((article) => (
          <PrintArticle key={article.slug} article={article} sheetClass={sheet} />
        ))}

        {/* ===== Colophon ===== */}
        <section className="text-center text-[11px] text-slate-400 py-8 break-before-page">
          <div
            className="font-bold text-slate-500"
            style={{ fontFamily: "Georgia, serif" }}
          >
            AZIMUT magazine
          </div>
          <div className="mt-1">
            Numéro {issueLabel} · {issue.monthLabel} · azimutfinance.com
          </div>
          <div className="mt-2 max-w-md mx-auto leading-relaxed">
            Document généré pour un usage personnel. Les analyses publiées le sont
            à titre informatif et ne constituent pas une recommandation
            d&apos;investissement.
          </div>
        </section>
      </div>
    </div>
  );
}

function PrintArticle({
  article,
  sheetClass,
}: {
  article: Article;
  sheetClass: string;
}) {
  const cat = ARTICLE_CATEGORY_META[article.category];
  return (
    <article className={`${sheetClass} break-before-page`}>
      <div className="border-b border-slate-200 pb-5 mb-6">
        <span
          className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded inline-block"
          style={{ background: cat.color + "15", color: cat.color }}
        >
          {cat.label}
        </span>
        <h2
          className="text-3xl font-bold text-slate-900 mt-3 leading-tight"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {article.title}
        </h2>
        {article.dek && (
          <p className="text-lg text-slate-600 mt-3 leading-relaxed font-light">
            {article.dek}
          </p>
        )}
        <div className="text-[11px] text-slate-500 mt-3">
          {article.authorName ?? "La rédaction"}
          {article.publishedAt ? ` · ${fmtArticleDate(article.publishedAt)}` : ""}
          {` · ${article.readingTimeMinutes} min de lecture`}
        </div>
      </div>

      <div>
        {article.body.map((block, i) => (
          <PrintBlock key={i} block={block} accent={article.accent} />
        ))}
      </div>
    </article>
  );
}

/**
 * Rendu des blocs de contenu, version imprimee : memes styles que l'article en
 * ligne (app/academie/magazine/article/[slug]/page.tsx) mais densite reduite et
 * `break-inside-avoid` pour eviter de couper figures, encadres et citations en
 * travers d'un saut de page.
 */
function PrintBlock({
  block,
  accent,
}: {
  block: ContentBlock;
  accent: string;
}) {
  switch (block.type) {
    case "paragraph":
      if (block.lead) {
        return (
          <p
            className="text-lg text-slate-800 leading-relaxed font-light mb-5 text-justify"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {block.text}
          </p>
        );
      }
      return (
        <p className="text-[15px] text-slate-800 leading-[1.7] mb-4 text-justify">
          {block.text}
        </p>
      );

    case "heading":
      if (block.level === 2) {
        return (
          <h3
            className="text-2xl font-bold text-slate-900 mt-8 mb-3 leading-tight break-after-avoid"
            style={{
              fontFamily: "Georgia, serif",
              borderTop: `2px solid ${accent}`,
              paddingTop: 12,
            }}
          >
            {block.text}
          </h3>
        );
      }
      return (
        <h4
          className="text-lg font-bold text-slate-900 mt-6 mb-2 leading-tight break-after-avoid"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {block.text}
        </h4>
      );

    case "quote":
      return (
        <blockquote
          className="my-6 border-l-4 pl-5 py-1 break-inside-avoid"
          style={{ borderColor: accent }}
        >
          <p
            className="text-xl text-slate-800 leading-relaxed italic font-light"
            style={{ fontFamily: "Georgia, serif" }}
          >
            « {block.text} »
          </p>
          {block.author && (
            <footer className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-2">
              — {block.author}
            </footer>
          )}
        </blockquote>
      );

    case "callout": {
      const tones = {
        info: { bg: "#eff6ff", border: "#1d4ed8", text: "#1e3a8a" },
        warning: { bg: "#fffbeb", border: "#d97706", text: "#92400e" },
        success: { bg: "#f0fdf4", border: "#16a34a", text: "#15803d" },
        neutral: { bg: "#f8fafc", border: "#64748b", text: "#334155" },
      };
      const t = tones[block.tone];
      return (
        <aside
          className="my-5 rounded-r border-l-4 p-4 break-inside-avoid"
          style={{ background: t.bg, borderColor: t.border }}
        >
          {block.title && (
            <div
              className="text-xs uppercase tracking-wide font-bold mb-1"
              style={{ color: t.text }}
            >
              {block.title}
            </div>
          )}
          <p className="text-sm leading-relaxed" style={{ color: t.text }}>
            {block.text}
          </p>
        </aside>
      );
    }

    case "list":
      if (block.ordered) {
        return (
          <ol className="my-4 ml-6 list-decimal space-y-1.5 text-[15px] text-slate-800 leading-relaxed">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="my-4 ml-6 list-disc space-y-1.5 text-[15px] text-slate-800 leading-relaxed">
          {block.items.map((it, i) => (
            <li key={i} className="pl-1">
              {it}
            </li>
          ))}
        </ul>
      );

    case "stats":
      return (
        <div className="my-5 grid grid-cols-4 gap-2 break-inside-avoid">
          {block.items.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded p-2.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">
                {s.label}
              </div>
              <div
                className="text-lg font-bold mt-0.5 tabular-nums"
                style={{
                  color: s.accent ?? accent,
                  fontFamily: "Georgia, serif",
                }}
              >
                {s.value}
              </div>
              {s.sub && (
                <div className="text-[9px] text-slate-500 mt-0.5">{s.sub}</div>
              )}
            </div>
          ))}
        </div>
      );

    case "image":
      return (
        <figure className="my-6 break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            className="w-full h-auto rounded border border-slate-200 bg-slate-50"
          />
          {(block.caption || block.credit) && (
            <figcaption className="mt-2 text-xs text-slate-500 text-center leading-relaxed">
              {block.caption && <span>{block.caption}</span>}
              {block.caption && block.credit && <span className="mx-1">·</span>}
              {block.credit && (
                <span className="text-slate-400 italic">{block.credit}</span>
              )}
            </figcaption>
          )}
        </figure>
      );

    case "divider":
      return (
        <hr
          className="my-7 border-0 mx-auto"
          style={{ width: 64, height: 1, background: accent, opacity: 0.4 }}
        />
      );
  }
}
