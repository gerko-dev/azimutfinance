import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ReadingProgressBar from "@/components/academie/ReadingProgressBar";
import {
  ARTICLE_CATEGORY_META,
  ARTICLES,
  ARTICLES_BY_SLUG,
  AUTHORS,
  buildToc,
  fmtArticleDate,
  getRelatedArticles,
  ISSUES_BY_SLUG,
  type ContentBlock,
} from "@/lib/magazine";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = ARTICLES_BY_SLUG[slug];
  if (!a) return { title: "Article — Azimut Magazine" };
  return {
    title: `${a.title} — Azimut Magazine`,
    description: a.dek,
  };
}

function slugifyHeading(text: string, fallback?: string): string {
  if (fallback) return fallback;
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = ARTICLES_BY_SLUG[slug];
  if (!article) notFound();

  const author = AUTHORS[article.authorSlug];
  const category = ARTICLE_CATEGORY_META[article.category];
  const issue = ISSUES_BY_SLUG[article.issueSlug];
  const related = getRelatedArticles(article, 3);
  const toc = buildToc(article);

  return (
    <div className="min-h-screen bg-white">
      <ReadingProgressBar accent={article.accent} />
      <Header />

      {/* Bandeau magazine */}
      <div className="bg-slate-900 text-white py-2">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-[11px]">
          <Link
            href="/academie/magazine"
            className="flex items-baseline gap-1.5 hover:text-slate-300 transition"
          >
            <span className="font-bold tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
              AZIMUT
            </span>
            <span className="italic text-slate-300" style={{ fontFamily: "Georgia, serif" }}>
              magazine
            </span>
          </Link>
          {issue && (
            <Link
              href={`/academie/magazine/numero/${issue.slug}`}
              className="text-slate-300 hover:text-white transition"
            >
              N° {String(issue.number).padStart(2, "0")} · {issue.monthLabel}
            </Link>
          )}
        </div>
      </div>

      {/* HERO ARTICLE */}
      <header
        className="border-b border-slate-200"
        style={{
          background: `linear-gradient(180deg, ${article.accent}08 0%, transparent 100%)`,
        }}
      >
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 flex-wrap">
            <Link href="/academie/magazine" className="hover:text-slate-700">
              Magazine
            </Link>
            <span>›</span>
            {issue && (
              <>
                <Link
                  href={`/academie/magazine/numero/${issue.slug}`}
                  className="hover:text-slate-700"
                >
                  {issue.monthLabel}
                </Link>
                <span>›</span>
              </>
            )}
            <span className="text-slate-700">{category.label}</span>
          </div>

          <span
            className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded inline-block"
            style={{
              background: category.color + "15",
              color: category.color,
            }}
          >
            {category.label}
          </span>

          <h1
            className="text-3xl md:text-5xl font-bold text-slate-900 mt-4 leading-[1.1]"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {article.title}
          </h1>
          <p className="text-lg md:text-xl text-slate-600 mt-4 leading-relaxed font-light">
            {article.dek}
          </p>

          <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
            <AuthorAvatar slug={article.authorSlug} />
            <div>
              <div className="font-medium text-slate-800">{author?.name}</div>
              <div className="text-[11px] text-slate-500">
                {fmtArticleDate(article.publishedAt)} · {article.readingTimeMinutes} min de
                lecture
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* TOC sticky aside */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4">
              {toc.length > 0 && (
                <nav>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    Sommaire
                  </div>
                  <ul className="space-y-1.5 border-l border-slate-200">
                    {toc.map((t) => (
                      <li key={t.id}>
                        <a
                          href={`#${t.id}`}
                          className={`block text-xs leading-snug py-1 -ml-px border-l-2 border-transparent hover:border-slate-700 hover:text-slate-900 transition pl-3 ${
                            t.level === 3 ? "pl-6 text-slate-500" : "text-slate-700"
                          }`}
                        >
                          {t.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <div className="pt-3 border-t border-slate-200">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                  Mots-clés
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {article.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* BODY */}
          <article id="article-body" className="max-w-2xl">
            <div className="prose-magazine">
              {article.body.map((block, i) => (
                <BlockRenderer key={i} block={block} accent={article.accent} index={i} />
              ))}
            </div>

            {/* Auteur en bas */}
            {author && (
              <div className="mt-12 pt-6 border-t border-slate-200 flex items-start gap-4">
                <AuthorAvatar slug={article.authorSlug} large />
                <div>
                  <div className="text-base font-semibold text-slate-900">{author.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                    {author.title}
                  </div>
                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">{author.bio}</p>
                </div>
              </div>
            )}

            {/* Articles liés */}
            {related.length > 0 && (
              <section className="mt-12 pt-6 border-t border-slate-200">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-4">
                  À lire ensuite
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {related.map((r) => {
                    const c = ARTICLE_CATEGORY_META[r.category];
                    return (
                      <Link
                        key={r.slug}
                        href={`/academie/magazine/article/${r.slug}`}
                        className="group block border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition"
                      >
                        <div
                          className="text-[10px] uppercase tracking-wide font-semibold"
                          style={{ color: c.color }}
                        >
                          {c.label}
                        </div>
                        <div
                          className="text-base font-bold text-slate-900 mt-1 leading-snug group-hover:text-blue-700 transition"
                          style={{ fontFamily: "Georgia, serif" }}
                        >
                          {r.title}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-2">
                          {r.readingTimeMinutes} min · {fmtArticleDate(r.publishedAt)}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Retour au sommaire */}
            {issue && (
              <div className="mt-12 pt-6 border-t border-slate-200">
                <Link
                  href={`/academie/magazine/numero/${issue.slug}`}
                  className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700 hover:underline"
                >
                  ← Retour au sommaire de {issue.monthLabel}
                </Link>
              </div>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// BLOCK RENDERERS
// =============================================================================

function BlockRenderer({
  block,
  accent,
  index,
}: {
  block: ContentBlock;
  accent: string;
  index: number;
}) {
  switch (block.type) {
    case "paragraph":
      if (block.lead) {
        return (
          <p
            className="text-xl text-slate-800 leading-relaxed font-light mb-6 first:first-letter:text-5xl first:first-letter:font-bold first:first-letter:font-serif first:first-letter:float-left first:first-letter:mr-2 first:first-letter:leading-[0.9] first:first-letter:mt-1"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {block.text}
          </p>
        );
      }
      return (
        <p className="text-base md:text-[17px] text-slate-800 leading-[1.7] mb-5">{block.text}</p>
      );

    case "heading": {
      const id = slugifyHeading(block.text, block.id);
      if (block.level === 2) {
        return (
          <h2
            id={id}
            className="text-2xl md:text-3xl font-bold text-slate-900 mt-10 mb-4 leading-tight scroll-mt-20"
            style={{
              fontFamily: "Georgia, serif",
              borderTop: `2px solid ${accent}`,
              paddingTop: 16,
            }}
          >
            {block.text}
          </h2>
        );
      }
      return (
        <h3
          id={id}
          className="text-xl font-bold text-slate-900 mt-7 mb-3 leading-tight scroll-mt-20"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {block.text}
        </h3>
      );
    }

    case "quote":
      return (
        <blockquote
          className="my-8 border-l-4 pl-6 py-1"
          style={{ borderColor: accent }}
        >
          <p
            className="text-xl md:text-2xl text-slate-800 leading-relaxed italic font-light"
            style={{ fontFamily: "Georgia, serif" }}
          >
            « {block.text} »
          </p>
          {block.author && (
            <footer className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-3">
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
          className="my-7 rounded-r-lg border-l-4 p-4"
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
          <ol className="my-5 ml-6 list-decimal space-y-2 text-base text-slate-800 leading-relaxed">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="my-5 ml-6 space-y-2 text-base text-slate-800 leading-relaxed">
          {block.items.map((it, i) => (
            <li key={i} className="pl-1 list-disc">
              {it}
            </li>
          ))}
        </ul>
      );

    case "stats":
      return (
        <div className="my-7 grid grid-cols-2 md:grid-cols-4 gap-3 not-prose">
          {block.items.map((s, i) => (
            <div
              key={i}
              className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50"
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                {s.label}
              </div>
              <div
                className="text-xl md:text-2xl font-bold mt-1 tabular-nums"
                style={{
                  color: s.accent ?? accent,
                  fontFamily: "Georgia, serif",
                }}
              >
                {s.value}
              </div>
              {s.sub && <div className="text-[10px] text-slate-500 mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>
      );

    case "divider":
      return (
        <hr
          className="my-10 border-0 mx-auto"
          style={{ width: 80, height: 1, background: accent, opacity: 0.4 }}
          key={`div-${index}`}
        />
      );
  }
}

function AuthorAvatar({ slug, large = false }: { slug: string; large?: boolean }) {
  const author = AUTHORS[slug];
  if (!author) return null;
  const dim = large ? 56 : 36;
  const colors = ["#1d4ed8", "#7c3aed", "#be185d", "#059669", "#b45309", "#0d9488"];
  const code = author.initials.charCodeAt(0) + (author.initials.charCodeAt(1) || 0);
  const color = colors[code % colors.length];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0"
      style={{
        width: dim,
        height: dim,
        background: color,
        fontSize: large ? 16 : 12,
      }}
    >
      {author.initials}
    </span>
  );
}
