import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import {
  CATEGORY_META,
  FORMAT_META,
  FORMATIONS,
  FORMATIONS_BY_SLUG,
  LEVEL_META,
  pricingLabel,
  pricingShortLabel,
  totalDurationLabel,
} from "@/lib/formations";

export function generateStaticParams() {
  return FORMATIONS.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = FORMATIONS_BY_SLUG[slug];
  if (!f) return { title: "Formation — AzimutFinance" };
  return {
    title: `${f.title} — Académie AzimutFinance`,
    description: f.shortDescription,
  };
}

function fmtDateFr(iso: string): string {
  if (!iso || iso.length < 10) return iso || "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtModuleDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return mm === 0 ? `${h} h` : `${h} h ${mm.toString().padStart(2, "0")}`;
}

export default async function FormationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const formation = FORMATIONS_BY_SLUG[slug];
  if (!formation) notFound();

  const categoryMeta = CATEGORY_META[formation.category];
  const levelMeta = LEVEL_META[formation.level];
  const formatMeta = FORMAT_META[formation.format];
  const accent = formation.accentColor ?? categoryMeta.color;

  const totalMinutes = formation.modules.reduce((s, m) => s + m.durationMinutes, 0);
  const totalLabel = totalDurationLabel(formation);

  // Suggestions : autres formations même catégorie + niveau adjacent
  const suggestions = FORMATIONS.filter(
    (f) => f.slug !== formation.slug && f.category === formation.category,
  ).slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
          <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-700">Accueil</Link>
            <span>›</span>
            <Link href="/academie/formations" className="hover:text-slate-700">Catalogue</Link>
            <span>›</span>
            <span className="text-slate-700">{formation.title}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-4">
            {/* Header content */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span
                  className="text-[11px] px-2 py-0.5 rounded font-medium"
                  style={{
                    background: accent + "15",
                    color: accent,
                  }}
                >
                  {categoryMeta.label}
                </span>
                <span
                  className="text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1.5"
                  style={{
                    background: levelMeta.color + "15",
                    color: levelMeta.color,
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: levelMeta.color }}
                  />
                  {levelMeta.label}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700">
                  {formatMeta.label}
                </span>
                {formation.featured && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
                    ★ Mise en avant
                  </span>
                )}
              </div>

              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 leading-tight">
                {formation.title}
              </h1>

              <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-3xl">
                {formation.shortDescription}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="text-slate-400">Durée totale :</span>
                  <span className="font-medium text-slate-800 tabular-nums">{totalLabel}</span>
                </span>
                <span>·</span>
                <span>
                  <span className="text-slate-400">Modules :</span>{" "}
                  <span className="font-medium text-slate-800">{formation.modules.length}</span>
                </span>
                <span>·</span>
                <span>
                  <span className="text-slate-400">Mise à jour :</span>{" "}
                  <span className="font-medium text-slate-800">{fmtDateFr(formation.updatedAt)}</span>
                </span>
                {formation.instructor && (
                  <>
                    <span>·</span>
                    <span>
                      <span className="text-slate-400">Animation :</span>{" "}
                      <span className="font-medium text-slate-800">{formation.instructor.name}</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* CTA card sticky */}
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <div
                className="bg-white rounded-lg border-t-4 border border-slate-200 shadow-sm p-4"
                style={{ borderTopColor: accent }}
              >
                <div className="text-[11px] text-slate-500">Tarif</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={`text-2xl font-semibold tabular-nums ${
                      formation.pricing.type === "gratuit"
                        ? "text-emerald-700"
                        : formation.pricing.type === "certifiant"
                        ? "text-purple-700"
                        : "text-slate-900"
                    }`}
                  >
                    {pricingLabel(formation)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {pricingShortLabel(formation)}
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full text-sm bg-slate-900 hover:bg-slate-700 text-white py-2.5 rounded font-medium transition"
                >
                  {formation.pricing.type === "gratuit"
                    ? "Démarrer la formation"
                    : "S'inscrire à cette formation"}
                </button>
                {formation.format === "atelier" && (
                  <div className="mt-3 text-[11px] text-slate-500 text-center">
                    Atelier en visioconférence — calendrier sur demande
                  </div>
                )}
                {formation.pricing.type === "certifiant" && (
                  <div className="mt-3 text-[11px] text-purple-700 bg-purple-50 px-2 py-1.5 rounded text-center">
                    Examen + certificat numérique inclus
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-500">Niveau</div>
                    <div className="font-medium text-slate-800">{levelMeta.label}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Format</div>
                    <div className="font-medium text-slate-800">{formatMeta.label}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Durée</div>
                    <div className="font-medium text-slate-800 tabular-nums">{totalLabel}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Modules</div>
                    <div className="font-medium text-slate-800">{formation.modules.length}</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6 min-w-0">
            {/* Description longue */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-2">
                À propos de cette formation
              </h2>
              <p className="text-sm text-slate-700 leading-relaxed">
                {formation.longDescription}
              </p>
            </section>

            {/* Outcomes */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Ce que vous saurez faire à la fin
              </h2>
              <ul className="space-y-2">
                {formation.outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold shrink-0 mt-0.5"
                      style={{ background: accent + "15", color: accent }}
                    >
                      ✓
                    </span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Programme / modules */}
            <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900">Programme détaillé</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formation.modules.length} modules · {totalLabel} ·{" "}
                  {formation.modules.filter((m) => m.preview).length} en accès libre
                </p>
              </div>
              <ol className="divide-y divide-slate-100">
                {formation.modules.map((m, i) => (
                  <li
                    key={i}
                    className="px-4 md:px-6 py-3 flex items-center gap-3 hover:bg-slate-50/60"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{
                        background: accent + "12",
                        color: accent,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 font-medium">{m.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {fmtModuleDuration(m.durationMinutes)}
                        {m.preview && (
                          <span className="ml-2 text-emerald-700 font-medium">
                            · Aperçu gratuit
                          </span>
                        )}
                      </div>
                    </div>
                    {m.preview ? (
                      <span className="text-[11px] text-emerald-700 font-medium">▶ Aperçu</span>
                    ) : (
                      <span className="text-[11px] text-slate-400">🔒</span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="px-4 md:px-6 py-2.5 border-t border-slate-100 bg-slate-50/40 flex justify-between items-center text-[11px] text-slate-500">
                <span>Total</span>
                <span className="tabular-nums font-semibold text-slate-700">
                  {totalMinutes} min · {totalLabel}
                </span>
              </div>
            </section>

            {/* Prerequisites */}
            {formation.prerequisites.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Prérequis</h2>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {formation.prerequisites.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-slate-400 mt-0.5">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Tags */}
            {formation.tags.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">Mots-clés</h3>
                <div className="flex flex-wrap gap-1.5">
                  {formation.tags.map((t) => (
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

          {/* Aside : suggestions */}
          <aside className="space-y-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-2">
              Dans la même catégorie
            </div>
            {suggestions.length === 0 ? (
              <div className="text-xs text-slate-400 px-2 py-3">
                Pas d&apos;autre formation dans cette catégorie pour l&apos;instant.
              </div>
            ) : (
              suggestions.map((s) => {
                const sLevel = LEVEL_META[s.level];
                const sCategory = CATEGORY_META[s.category];
                return (
                  <Link
                    key={s.slug}
                    href={`/academie/formations/${s.slug}`}
                    className="block bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: s.accentColor ?? sCategory.color }}
                      />
                      <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {sLevel.label}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 leading-snug">
                      {s.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-2">
                      <span>{totalDurationLabel(s)}</span>
                      <span className="text-slate-300">·</span>
                      <span
                        className={
                          s.pricing.type === "gratuit"
                            ? "text-emerald-700 font-medium"
                            : "text-slate-700"
                        }
                      >
                        {pricingLabel(s)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
            <Link
              href="/academie/formations"
              className="block text-center text-[11px] text-slate-600 hover:text-slate-900 px-2 py-2 border border-dashed border-slate-200 rounded-lg"
            >
              ← Tout le catalogue
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
