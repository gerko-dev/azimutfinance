import Link from "next/link";
import Header from "@/components/Header";
import FormationsCatalog from "@/components/academie/FormationsCatalog";
import {
  CATEGORY_META,
  FORMATIONS,
  getCatalogStats,
  totalDurationMinutes,
} from "@/lib/formations";

export const metadata = {
  title: "Catalogue de formations — AzimutFinance",
  description:
    "14 formations couvrant la BRVM, les obligations UEMOA, l'analyse fondamentale et technique, la macro UEMOA, la gestion de portefeuille et la fiscalité. Parcours certifiant niveau 1 disponible.",
};

export const dynamic = "force-static";

export default async function Page() {
  const stats = getCatalogStats();

  // Map vers le format card (light, sans modules détaillés)
  const cards = FORMATIONS.map((f) => ({
    slug: f.slug,
    title: f.title,
    shortDescription: f.shortDescription,
    level: f.level,
    format: f.format,
    category: f.category,
    durationMinutes: totalDurationMinutes(f),
    modulesCount: f.modules.length,
    pricingType: f.pricing.type,
    priceFcfa: f.pricing.type === "gratuit" ? 0 : f.pricing.priceFcfa,
    tags: f.tags,
    featured: f.featured,
    accentColor: f.accentColor ?? CATEGORY_META[f.category].color,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs text-slate-500 mb-2">
            Accueil &rsaquo; Académie &rsaquo; Catalogue de formations
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                Catalogue de formations
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-3xl">
                {stats.total} formations structurées sur les marchés financiers de l&apos;UEMOA :
                BRVM, obligations souveraines et corporates, analyse, macro, gestion de portefeuille
                et fiscalité. {stats.freeCount} formations gratuites pour démarrer.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">
                {stats.totalHours} h
              </span>{" "}
              de contenu · 6 catégories
            </div>
          </div>

          {/* KPIs hero */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <HeroKpi
              label="Formations"
              value={stats.total.toString()}
              sub={`${stats.freeCount} gratuites · ${stats.premiumCount} premium · ${stats.certifyingCount} certifiante`}
            />
            <HeroKpi
              label="Heures de contenu"
              value={`${stats.totalHours} h`}
              sub="modules vidéo, lecture et exercices"
            />
            <HeroKpi
              label="Niveau débutant"
              value={String(stats.byLevel.debutant)}
              sub="accessibles sans prérequis"
            />
            <HeroKpi
              label="Parcours certifiant"
              value={String(stats.certifyingCount)}
              sub="examen + certificat numérique"
              accent="text-purple-700"
            />
          </div>

          {/* Quick links catégories */}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="text-[11px] text-slate-500 mr-1 mt-1.5">Explorer par thème :</span>
            {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = stats.byCategory[cat];
              if (count === 0) return null;
              return (
                <a
                  key={cat}
                  href={`#cat-${cat}`}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: meta.color }}
                  />
                  {meta.label}
                  <span className="text-slate-400">({count})</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Catalogue interactif */}
        <FormationsCatalog formations={cards} />

        {/* Sections par catégorie (ancres pour les quick links) */}
        <section className="hidden">
          {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((cat) => (
            <div key={cat} id={`cat-${cat}`} aria-hidden="true" />
          ))}
        </section>

        {/* Bandeau parcours certifiant */}
        <section className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-lg border border-purple-100 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">
                Parcours certifiant
              </span>
              <h2 className="text-lg md:text-xl font-semibold text-slate-900 mt-2">
                Certification AzimutFinance — Niveau 1
              </h2>
              <p className="text-xs md:text-sm text-slate-700 mt-2 leading-relaxed">
                40 heures de contenu structuré, 8 modules thématiques couvrant la BRVM, les
                obligations UEMOA, l&apos;analyse, la gestion de portefeuille, le risque et la
                fiscalité. Examen final en ligne (60 QCM, 90 minutes), certificat numérique
                vérifiable, valorisable sur LinkedIn et CV.
              </p>
            </div>
            <Link
              href="/academie/formations/certification-azimut-niveau-1"
              className="text-sm bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded font-medium transition"
            >
              Voir le parcours →
            </Link>
          </div>
        </section>

        {/* À propos */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">À propos de l&apos;Académie</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Public visé :</strong> particuliers, professionnels et étudiants qui veulent
              comprendre et investir sur les marchés financiers de la zone UEMOA. Toutes les
              formations sont contextualisées sur la BRVM, le marché UMOA-Titres et la BCEAO.
            </p>
            <p>
              <strong>Format :</strong> cours en ligne (vidéo + lecture + quiz), ateliers live
              animés en visioconférence, et parcours certifiants avec examen final.
            </p>
            <p>
              <strong>Tarifs :</strong> {stats.freeCount} formations gratuites pour démarrer ;
              les modules premium se situent entre 25 000 et 55 000 FCFA ; le parcours certifiant
              niveau 1 est à 250 000 FCFA tout inclus.
            </p>
            <p>
              <strong>Mise à jour :</strong> chaque formation est révisée a minima une fois par an.
              Les évolutions réglementaires (CREPMF, BCEAO) sont intégrées en continu.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function HeroKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl md:text-2xl font-semibold tabular-nums mt-0.5 ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
