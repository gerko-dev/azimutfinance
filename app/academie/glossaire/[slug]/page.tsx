import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import {
  GLOSSAIRE,
  GLOSSAIRE_BY_SLUG,
  GLOSS_CATEGORY_META,
  resolveRelated,
} from "@/lib/glossaire";

export function generateStaticParams() {
  return GLOSSAIRE.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = GLOSSAIRE_BY_SLUG[slug];
  if (!t) return { title: "Glossaire — AzimutFinance" };
  return {
    title: `${t.term}${t.acronym ? ` (${t.acronym})` : ""} — Glossaire AzimutFinance`,
    description: t.short,
  };
}

export default async function GlossTermPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = GLOSSAIRE_BY_SLUG[slug];
  if (!term) notFound();

  const categoryMeta = GLOSS_CATEGORY_META[term.category];
  const related = resolveRelated(term);

  // Autres termes de la même catégorie pour le sidebar
  const sameCategory = GLOSSAIRE.filter(
    (t) => t.category === term.category && t.slug !== term.slug,
  ).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
          <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-700">Accueil</Link>
            <span>›</span>
            <Link href="/academie/glossaire" className="hover:text-slate-700">Glossaire</Link>
            <span>›</span>
            <span className="text-slate-700">{term.term}</span>
          </div>

          <div className="flex items-center gap-2 mb-2 mt-4">
            <span
              className="text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1.5"
              style={{ background: categoryMeta.color + "15", color: categoryMeta.color }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: categoryMeta.color }}
              />
              {categoryMeta.label}
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 leading-tight">
            {term.term}
            {term.acronym && (
              <span className="text-base md:text-lg text-slate-500 font-normal ml-2">
                ({term.acronym})
              </span>
            )}
          </h1>

          <p className="text-base text-slate-700 mt-3 leading-relaxed max-w-3xl">
            {term.short}
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <div className="space-y-5 min-w-0">
            {/* Définition longue */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Définition</h2>
              <p className="text-sm text-slate-700 leading-relaxed">{term.long}</p>
            </section>

            {/* Termes liés */}
            {related.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Voir aussi</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {related.map((r) => {
                    const cat = GLOSS_CATEGORY_META[r.category];
                    return (
                      <Link
                        key={r.slug}
                        href={`/academie/glossaire/${r.slug}`}
                        className="group block border border-slate-200 rounded p-2.5 hover:border-slate-300 hover:shadow-sm transition"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900 group-hover:text-blue-700 transition leading-snug">
                            {r.term}
                            {r.acronym && (
                              <span className="text-[10px] text-slate-500 font-normal ml-1">
                                ({r.acronym})
                              </span>
                            )}
                          </span>
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0"
                            style={{ background: cat.color }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                          {r.short}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Tags */}
            {term.tags && term.tags.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">Mots-clés</h3>
                <div className="flex flex-wrap gap-1.5">
                  {term.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Aside */}
          <aside className="space-y-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-2">
              Dans la même catégorie
            </div>
            {sameCategory.length === 0 ? (
              <div className="text-xs text-slate-400 px-2 py-3">
                Pas d&apos;autre terme dans cette catégorie pour l&apos;instant.
              </div>
            ) : (
              sameCategory.map((r) => (
                <Link
                  key={r.slug}
                  href={`/academie/glossaire/${r.slug}`}
                  className="block border border-slate-200 rounded p-2.5 bg-white hover:border-slate-300 hover:shadow-sm transition"
                >
                  <div className="text-xs font-medium text-slate-900">
                    {r.term}
                    {r.acronym && (
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        ({r.acronym})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">
                    {r.short}
                  </p>
                </Link>
              ))
            )}
            <Link
              href="/academie/glossaire"
              className="block text-center text-[11px] text-slate-600 hover:text-slate-900 px-2 py-2 border border-dashed border-slate-200 rounded-lg"
            >
              ← Tout le glossaire
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
