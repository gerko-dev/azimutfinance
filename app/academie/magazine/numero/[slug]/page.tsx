import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import MagazineCover from "@/components/academie/MagazineCover";
import {
  ARTICLE_CATEGORY_META,
  AUTHORS,
  fmtArticleDate,
  getArticlesByIssue,
  ISSUES,
  ISSUES_BY_SLUG,
} from "@/lib/magazine";

export function generateStaticParams() {
  return ISSUES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const i = ISSUES_BY_SLUG[slug];
  if (!i) return { title: "Numéro — Azimut Magazine" };
  return {
    title: `${i.theme} — Azimut Magazine N° ${String(i.number).padStart(2, "0")} (${i.monthLabel})`,
    description: i.blurb,
  };
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = ISSUES_BY_SLUG[slug];
  if (!issue) notFound();

  const articles = getArticlesByIssue(issue.slug);
  const editor = AUTHORS[issue.editorSlug];

  // Numéros adjacents pour navigation
  const sortedIssues = [...ISSUES].sort((a, b) => b.number - a.number);
  const idx = sortedIssues.findIndex((i) => i.slug === issue.slug);
  const prevIssue = idx >= 0 && idx + 1 < sortedIssues.length ? sortedIssues[idx + 1] : null;
  const nextIssue = idx > 0 ? sortedIssues[idx - 1] : null;

  return (
    <div className="min-h-screen bg-slate-50">
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
          <span className="text-slate-300">
            N° {String(issue.number).padStart(2, "0")} · {issue.monthLabel}
          </span>
        </div>
      </div>

      {/* HERO : couverture + edito */}
      <div
        className="border-b border-slate-200"
        style={{
          background: `linear-gradient(135deg, ${issue.coverGradient.from}10 0%, ${issue.coverGradient.to}10 100%)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="text-xs text-slate-500 mb-4 flex items-center gap-1.5 flex-wrap">
            <Link href="/academie/magazine" className="hover:text-slate-700">
              Magazine
            </Link>
            <span>›</span>
            <span className="text-slate-700">{issue.monthLabel}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-12 items-center">
            {/* Cover */}
            <div className="justify-self-center lg:justify-self-start">
              <div
                className="rounded shadow-2xl overflow-hidden"
                style={{ width: 280, aspectRatio: "220 / 300" }}
              >
                <MagazineCover
                  number={issue.number}
                  monthLabel={issue.monthLabel}
                  theme={issue.theme}
                  gradient={issue.coverGradient}
                  textTone={issue.coverText}
                  size="lg"
                />
              </div>
              <button
                type="button"
                className="mt-4 w-full text-xs bg-slate-900 hover:bg-slate-700 text-white py-2.5 rounded font-medium transition flex items-center justify-center gap-2"
                title="Téléchargement bientôt disponible"
              >
                ↓ Télécharger en PDF
              </button>
            </div>

            {/* Edito */}
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Numéro {String(issue.number).padStart(2, "0")} · {issue.monthLabel}
              </div>
              <h1
                className="text-3xl md:text-5xl font-bold text-slate-900 mt-2 leading-[1.1]"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {issue.theme}
              </h1>
              <p className="text-base md:text-lg text-slate-600 mt-3 leading-relaxed max-w-2xl">
                {issue.blurb}
              </p>

              <div className="mt-6 p-4 md:p-5 bg-white border border-slate-200 rounded-lg max-w-2xl">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                  Édito
                </div>
                <p
                  className="text-base text-slate-800 leading-relaxed italic"
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

              <div className="mt-5 flex items-center gap-4 flex-wrap text-xs text-slate-500">
                <span>
                  <span className="font-semibold text-slate-700">{articles.length}</span> articles
                </span>
                <span>·</span>
                <span>
                  <span className="font-semibold text-slate-700">
                    {articles.reduce((s, a) => s + a.readingTimeMinutes, 0)}
                  </span>{" "}
                  min de lecture totale
                </span>
                <span>·</span>
                <span>Publié le {fmtArticleDate(issue.publishedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-10">
        {/* SOMMAIRE */}
        <section>
          <div className="flex items-end justify-between gap-3 flex-wrap border-b border-slate-200 pb-3 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                Sommaire
              </div>
              <h2
                className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5"
                style={{ fontFamily: "Georgia, serif" }}
              >
                Au sommaire de ce numéro
              </h2>
            </div>
          </div>

          <ol className="space-y-2">
            {articles.map((a, i) => {
              const cat = ARTICLE_CATEGORY_META[a.category];
              return (
                <li key={a.slug}>
                  <Link
                    href={`/academie/magazine/article/${a.slug}`}
                    className="group block p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="grid grid-cols-[40px_1fr_auto] gap-3 items-start">
                      <div
                        className="text-2xl font-bold tabular-nums text-slate-300 group-hover:text-slate-500 transition"
                        style={{ fontFamily: "Georgia, serif" }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold"
                            style={{ color: cat.color }}
                          >
                            {cat.label}
                          </span>
                          {a.featured && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
                              ★ À la une
                            </span>
                          )}
                        </div>
                        <h3
                          className="text-base md:text-lg font-bold text-slate-900 group-hover:text-blue-700 transition leading-snug"
                          style={{ fontFamily: "Georgia, serif" }}
                        >
                          {a.title}
                        </h3>
                        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed line-clamp-2">
                          {a.dek}
                        </p>
                        <div className="text-[11px] text-slate-500 mt-2">
                          {AUTHORS[a.authorSlug]?.name} · {a.readingTimeMinutes} min
                        </div>
                      </div>
                      <div className="text-slate-400 group-hover:text-blue-700 group-hover:translate-x-0.5 transition shrink-0 mt-1">
                        →
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Navigation entre numéros */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prevIssue ? (
            <Link
              href={`/academie/magazine/numero/${prevIssue.slug}`}
              className="group block p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-4">
                <div
                  className="rounded shadow-sm overflow-hidden shrink-0"
                  style={{ width: 60, aspectRatio: "220 / 300" }}
                >
                  <MagazineCover
                    number={prevIssue.number}
                    monthLabel={prevIssue.monthLabel}
                    theme={prevIssue.theme}
                    gradient={prevIssue.coverGradient}
                    textTone={prevIssue.coverText}
                    size="sm"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Numéro précédent
                  </div>
                  <div
                    className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition truncate"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {prevIssue.theme}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    N° {String(prevIssue.number).padStart(2, "0")} · {prevIssue.monthLabel}
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextIssue ? (
            <Link
              href={`/academie/magazine/numero/${nextIssue.slug}`}
              className="group block p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-4 justify-end text-right">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Numéro suivant
                  </div>
                  <div
                    className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition truncate"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {nextIssue.theme}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    N° {String(nextIssue.number).padStart(2, "0")} · {nextIssue.monthLabel}
                  </div>
                </div>
                <div
                  className="rounded shadow-sm overflow-hidden shrink-0"
                  style={{ width: 60, aspectRatio: "220 / 300" }}
                >
                  <MagazineCover
                    number={nextIssue.number}
                    monthLabel={nextIssue.monthLabel}
                    theme={nextIssue.theme}
                    gradient={nextIssue.coverGradient}
                    textTone={nextIssue.coverText}
                    size="sm"
                  />
                </div>
              </div>
            </Link>
          ) : (
            <div />
          )}
        </section>

        {/* Retour landing */}
        <div>
          <Link
            href="/academie/magazine"
            className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700 hover:underline"
          >
            ← Toutes les éditions du magazine
          </Link>
        </div>
      </main>
    </div>
  );
}
