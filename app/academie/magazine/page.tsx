import Link from "next/link";
import Header from "@/components/Header";
import MagazineCover from "@/components/academie/MagazineCover";
import NewsletterForm from "@/components/academie/NewsletterForm";
import {
  ARTICLE_CATEGORY_META,
  ARTICLES,
  AUTHORS,
  fmtArticleDate,
  getArticlesByIssue,
  getFeaturedArticles,
  getLatestArticles,
  getMagazineStats,
  ISSUES,
} from "@/lib/magazine";

export const metadata = {
  title: "Azimut Magazine — Magazine digital AzimutFinance",
  description:
    "Magazine digital mensuel sur les marchés financiers de l'UEMOA : analyses BRVM, dossiers obligataires, interviews et tendances macro. Téléchargeable et lisible en ligne.",
};

export const dynamic = "force-static";

export default async function Page() {
  const stats = getMagazineStats();
  const latestIssue = ISSUES[0]; // déjà trié dans le catalogue (le plus récent en premier)
  const latestIssueArticles = getArticlesByIssue(latestIssue.slug);
  const heroArticle = latestIssueArticles.find((a) => a.featured) ?? latestIssueArticles[0];
  const featured = getFeaturedArticles(4);
  const latest = getLatestArticles(6);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* MASTHEAD BANDEAU */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span
              className="font-serif text-lg md:text-xl tracking-tight font-bold"
              style={{ fontFamily: "Georgia, serif" }}
            >
              AZIMUT
            </span>
            <span
              className="italic text-base md:text-lg text-slate-300"
              style={{ fontFamily: "Georgia, serif" }}
            >
              magazine
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
            <span>Numéro {String(latestIssue.number).padStart(2, "0")} · {latestIssue.monthLabel}</span>
            <span>·</span>
            <span>
              {stats.articlesCount} articles · {stats.issuesCount} numéros parus
            </span>
          </div>
        </div>
      </div>

      {/* HERO : article featured + dernier numero */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-center">
            {/* Featured article */}
            {heroArticle && (
              <article className="min-w-0">
                <Link
                  href={`/academie/magazine/article/${heroArticle.slug}`}
                  className="group block"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: ARTICLE_CATEGORY_META[heroArticle.category].color + "15",
                        color: ARTICLE_CATEGORY_META[heroArticle.category].color,
                      }}
                    >
                      {ARTICLE_CATEGORY_META[heroArticle.category].label}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                      À la une — {latestIssue.monthLabel}
                    </span>
                  </div>
                  <h1
                    className="text-3xl md:text-5xl font-bold text-slate-900 leading-[1.1] group-hover:text-slate-700 transition"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {heroArticle.title}
                  </h1>
                  <p className="text-base md:text-lg text-slate-600 mt-4 leading-relaxed max-w-2xl">
                    {heroArticle.dek}
                  </p>
                  <div className="mt-5 flex items-center gap-3 text-[11px] text-slate-500">
                    <AuthorAvatar slug={heroArticle.authorSlug} />
                    <span>
                      <span className="font-medium text-slate-700">
                        {AUTHORS[heroArticle.authorSlug]?.name}
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      {fmtArticleDate(heroArticle.publishedAt)}
                      <span className="mx-2 text-slate-300">·</span>
                      {heroArticle.readingTimeMinutes} min de lecture
                    </span>
                  </div>
                </Link>
              </article>
            )}

            {/* Cover du dernier numero */}
            <Link
              href={`/academie/magazine/numero/${latestIssue.slug}`}
              className="block group justify-self-center lg:justify-self-end"
            >
              <div
                className="rounded shadow-2xl overflow-hidden transition-transform group-hover:-translate-y-1"
                style={{
                  width: 280,
                  aspectRatio: "220 / 300",
                }}
              >
                <MagazineCover
                  number={latestIssue.number}
                  monthLabel={latestIssue.monthLabel}
                  theme={latestIssue.theme}
                  gradient={latestIssue.coverGradient}
                  textTone={latestIssue.coverText}
                  size="lg"
                />
              </div>
              <div className="mt-3 text-center">
                <div className="text-xs text-slate-500">Numéro en cours</div>
                <div className="text-sm font-semibold text-slate-900">
                  {latestIssueArticles.length} articles · {latestIssue.theme}
                </div>
                <span className="text-[11px] text-blue-700 group-hover:underline mt-1 inline-block">
                  Lire le sommaire →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">
        {/* Section : ce mois-ci */}
        <section>
          <SectionHeading
            kicker="Ce mois-ci dans Azimut"
            title={latestIssue.theme}
            link={`/academie/magazine/numero/${latestIssue.slug}`}
            linkLabel="Tout le sommaire"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
            {latestIssueArticles.slice(0, 4).map((a, i) => (
              <ArticleCard key={a.slug} article={a} variant={i === 0 ? "feature" : "normal"} />
            ))}
          </div>
        </section>

        {/* Section : articles populaires (asymétrique) */}
        <section>
          <SectionHeading kicker="Sélection" title="À la une cette saison" />
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Article featured grand */}
            {featured[0] && (
              <article className="lg:col-span-2 lg:row-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition group">
                <Link href={`/academie/magazine/article/${featured[0].slug}`} className="block">
                  <div
                    className="h-64 md:h-80 relative flex items-end p-6"
                    style={{
                      background: `linear-gradient(135deg, ${featured[0].accent} 0%, ${featured[0].accent}aa 100%)`,
                    }}
                  >
                    <div className="text-white max-w-xl">
                      <span className="text-[10px] uppercase tracking-wide font-semibold bg-white/20 px-2 py-0.5 rounded">
                        {ARTICLE_CATEGORY_META[featured[0].category].label}
                      </span>
                      <h3
                        className="text-2xl md:text-3xl font-bold mt-3 leading-tight group-hover:underline"
                        style={{ fontFamily: "Georgia, serif" }}
                      >
                        {featured[0].title}
                      </h3>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-slate-700 leading-relaxed">{featured[0].excerpt}</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                      <AuthorAvatar slug={featured[0].authorSlug} small />
                      <span className="font-medium text-slate-700">
                        {AUTHORS[featured[0].authorSlug]?.name}
                      </span>
                      <span>·</span>
                      <span>{fmtArticleDate(featured[0].publishedAt)}</span>
                      <span>·</span>
                      <span>{featured[0].readingTimeMinutes} min</span>
                    </div>
                  </div>
                </Link>
              </article>
            )}

            {/* Articles featured plus petits */}
            {featured.slice(1, 5).map((a) => (
              <ArticleCard key={a.slug} article={a} variant="compact" />
            ))}
          </div>
        </section>

        {/* Section : derniers articles */}
        <section>
          <SectionHeading kicker="Derniers articles" title="L'actualité Azimut" />
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {latest.map((a) => (
              <ArticleCard key={a.slug} article={a} variant="normal" />
            ))}
          </div>
        </section>

        {/* Section : tous les numéros */}
        <section>
          <SectionHeading kicker="Archives" title="Tous les numéros" />
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {ISSUES.map((issue) => {
              const articleCount = getArticlesByIssue(issue.slug).length;
              return (
                <Link
                  key={issue.slug}
                  href={`/academie/magazine/numero/${issue.slug}`}
                  className="group block"
                >
                  <div
                    className="rounded shadow-md overflow-hidden transition group-hover:shadow-xl group-hover:-translate-y-1"
                    style={{ aspectRatio: "220 / 300" }}
                  >
                    <MagazineCover
                      number={issue.number}
                      monthLabel={issue.monthLabel}
                      theme={issue.theme}
                      gradient={issue.coverGradient}
                      textTone={issue.coverText}
                      size="md"
                    />
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] text-slate-500">
                      N° {String(issue.number).padStart(2, "0")} · {issue.monthLabel}
                    </div>
                    <div className="text-xs font-medium text-slate-900 group-hover:text-blue-700 transition truncate">
                      {issue.theme}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {articleCount} articles
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Section : explorer par catégorie */}
        <section>
          <SectionHeading kicker="Thèmes" title="Explorer par catégorie" />
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(Object.keys(ARTICLE_CATEGORY_META) as (keyof typeof ARTICLE_CATEGORY_META)[]).map(
              (cat) => {
                const meta = ARTICLE_CATEGORY_META[cat];
                const count = ARTICLES.filter((a) => a.category === cat).length;
                if (count === 0) return null;
                return (
                  <div
                    key={cat}
                    className="border border-slate-200 rounded-lg p-3 bg-white hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: meta.color }}
                      />
                      <span className="text-sm font-medium text-slate-900">{meta.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {count} article{count > 1 ? "s" : ""}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>

        {/* Newsletter */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-lg p-6 md:p-8 text-white">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                Newsletter mensuelle
              </div>
              <h2
                className="text-2xl md:text-3xl font-bold mt-2 leading-tight"
                style={{ fontFamily: "Georgia, serif" }}
              >
                Recevez Azimut Magazine chaque mois
              </h2>
              <p className="text-sm text-slate-300 mt-3 max-w-xl leading-relaxed">
                Une seule édition par mois, dans votre boîte mail le 1er. Pas de spam, juste
                l&apos;essentiel des marchés UEMOA décrypté par notre équipe éditoriale.
              </p>
            </div>
            <NewsletterForm />
          </div>
        </section>
      </main>
    </div>
  );
}

// =============================================================================
// SOUS-COMPONENTS
// =============================================================================

function SectionHeading({
  kicker,
  title,
  link,
  linkLabel,
}: {
  kicker: string;
  title: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap border-b border-slate-200 pb-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
          {kicker}
        </div>
        <h2
          className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {title}
        </h2>
      </div>
      {link && linkLabel && (
        <Link
          href={link}
          className="text-xs text-slate-700 hover:text-blue-700 hover:underline font-medium"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function ArticleCard({
  article,
  variant = "normal",
}: {
  article: (typeof ARTICLES)[number];
  variant?: "feature" | "normal" | "compact";
}) {
  const cat = ARTICLE_CATEGORY_META[article.category];

  if (variant === "compact") {
    return (
      <Link
        href={`/academie/magazine/article/${article.slug}`}
        className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition p-4 flex gap-3"
      >
        <div
          className="w-1 rounded shrink-0"
          style={{ background: article.accent }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: cat.color }}>
            {cat.label}
          </div>
          <h3
            className="text-base font-semibold text-slate-900 mt-1 leading-snug group-hover:text-blue-700 transition line-clamp-2"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {article.title}
          </h3>
          <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
            {article.excerpt}
          </p>
          <div className="text-[10px] text-slate-400 mt-2 tabular-nums">
            {AUTHORS[article.authorSlug]?.name} · {article.readingTimeMinutes} min
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "feature") {
    return (
      <Link
        href={`/academie/magazine/article/${article.slug}`}
        className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-md transition overflow-hidden col-span-1 md:col-span-2"
      >
        <div
          className="h-32 md:h-40 relative"
          style={{
            background: `linear-gradient(135deg, ${article.accent} 0%, ${article.accent}cc 100%)`,
          }}
        />
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: cat.color }}>
            {cat.label}
          </div>
          <h3
            className="text-lg font-bold text-slate-900 mt-1 leading-tight group-hover:text-blue-700 transition"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {article.title}
          </h3>
          <p className="text-sm text-slate-600 mt-2 line-clamp-2 leading-relaxed">{article.excerpt}</p>
          <div className="text-[11px] text-slate-500 mt-3 flex items-center gap-2">
            <AuthorAvatar slug={article.authorSlug} small />
            <span>{AUTHORS[article.authorSlug]?.name}</span>
            <span>·</span>
            <span>{article.readingTimeMinutes} min</span>
          </div>
        </div>
      </Link>
    );
  }

  // normal
  return (
    <Link
      href={`/academie/magazine/article/${article.slug}`}
      className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition overflow-hidden flex flex-col"
    >
      <div
        className="h-2"
        style={{ background: article.accent }}
      />
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: cat.color }}>
          {cat.label}
        </div>
        <h3
          className="text-base font-bold text-slate-900 mt-1 leading-snug group-hover:text-blue-700 transition line-clamp-3"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {article.title}
        </h3>
        <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed flex-1">
          {article.excerpt}
        </p>
        <div className="text-[10px] text-slate-500 mt-3 flex items-center gap-2">
          <AuthorAvatar slug={article.authorSlug} small />
          <span>{AUTHORS[article.authorSlug]?.name}</span>
          <span>·</span>
          <span className="tabular-nums">{article.readingTimeMinutes} min</span>
        </div>
      </div>
    </Link>
  );
}

function AuthorAvatar({ slug, small = false }: { slug: string; small?: boolean }) {
  const author = AUTHORS[slug];
  if (!author) return null;
  const dim = small ? 18 : 24;
  // Couleur deterministe basee sur les initiales
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
        fontSize: small ? 9 : 10,
      }}
      title={author.name}
    >
      {author.initials}
    </span>
  );
}
