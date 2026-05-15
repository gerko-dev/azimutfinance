import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import ProDemoForm from "./ProDemoForm";

export const metadata = {
  title: "Demander une démo Pro — AzimutFinance",
  description:
    "Pro Terminal, OTC, données macro UEMOA, API, screeners et études sectorielles pour les institutions financières. Demande une démo personnalisée.",
};

export const dynamic = "force-dynamic";

const BENEFITS: { title: string; description: string }[] = [
  {
    title: "Pro Terminal complet",
    description:
      "Tableau de bord marché (cours différés ~15 min), watchlists pro, alertes sur indicateurs techniques et fondamentaux.",
  },
  {
    title: "Place de marché OTC",
    description:
      "Quotation gré-à-gré sur obligations et fonds, mise en relation avec contreparties UEMOA.",
  },
  {
    title: "Données brutes & API",
    description:
      "Exports Excel multi-data, accès API REST aux séries historiques, fundamentaux, courbe des taux.",
  },
  {
    title: "Études & private equity",
    description:
      "Études sectorielles trimestrielles, base de données private equity, league tables sociétés de gestion.",
  },
];

const USE_CASES = [
  "Gestion de portefeuille",
  "Analyse crédit / obligataire",
  "Recherche actions",
  "Trésorerie / ALM",
  "Conformité / risk",
  "M&A / corporate",
  "Études économiques",
  "Autre",
];

const TEAM_SIZES = [
  "1 à 5 personnes",
  "6 à 20 personnes",
  "21 à 50 personnes",
  "Plus de 50 personnes",
];

const UEMOA_COUNTRIES = [
  "Bénin",
  "Burkina Faso",
  "Côte d'Ivoire",
  "Guinée-Bissau",
  "Mali",
  "Niger",
  "Sénégal",
  "Togo",
  "Autre (Afrique)",
  "Hors Afrique",
];

export default function DemandeDemoProPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Démo Pro" },
        ]}
        title="Demande une démo de la plateforme Pro"
        subtitle="Pro Terminal, OTC, données brutes, API, études sectorielles. Une seule plateforme pour piloter votre activité sur les marchés UEMOA. Notre équipe revient vers vous sous 48 h ouvrées."
      >
        <div className="inline-block text-[11px] uppercase tracking-wider font-semibold bg-white/10 text-white px-3 py-1 rounded-full border border-white/20">
          ⚡ Offre Pro · Institutions
        </div>
      </PageHero>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-10">
          {/* FORMULAIRE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <h2 className="text-lg md:text-xl font-semibold text-slate-900 mb-1">
              Parlez-nous de votre institution
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Les champs marqués <span className="text-rose-600">*</span> sont
              obligatoires.
            </p>

            <ProDemoForm
              teamSizes={TEAM_SIZES}
              useCases={USE_CASES}
              countries={UEMOA_COUNTRIES}
            />
          </div>

          {/* RAIL DROIT */}
          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Ce que comprend l&apos;offre Pro
              </h3>
              <ul className="space-y-4">
                {BENEFITS.map((b) => (
                  <li key={b.title}>
                    <div className="text-sm font-medium text-slate-900">
                      ✓ {b.title}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {b.description}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-slate-900 text-white rounded-2xl p-5">
              <h3 className="text-sm font-semibold mb-2">Une question ?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Vous pouvez aussi nous écrire directement à{" "}
                <a
                  href="mailto:contact@azimutfinance.com"
                  className="text-blue-300 hover:text-blue-200 underline"
                >
                  contact@azimutfinance.com
                </a>
                .
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
