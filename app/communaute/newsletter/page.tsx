import Link from "next/link";
import Header from "@/components/Header";
import NewsletterForm from "./NewsletterForm";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Newsletter — AzimutFinance",
  description:
    "Recevez chaque semaine la synthèse des marchés BRVM/UEMOA : actions, obligations, adjudications UMOA-Titres, matières premières et indicateurs macro.",
  path: "/communaute/newsletter",
});

export const dynamic = "force-static";

export default function NewsletterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      {/* === HERO === */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-white">
              Accueil
            </Link>
            <span>›</span>
            <span className="text-slate-200">Communauté</span>
            <span>›</span>
            <span className="text-slate-200">Newsletter</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">
            La synthèse hebdo BRVM &amp; UEMOA
          </h1>
          <p className="text-xs md:text-sm text-slate-300 mt-1.5 max-w-2xl">
            Chaque dimanche soir, l&apos;essentiel de la semaine sur les marchés
            financiers ouest-africains. Format court, lisible en 5 minutes,
            sourcé sur les publications BRVM, BCEAO et UMOA-Titres.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 lg:gap-10">
          {/* === COLONNE GAUCHE : pitch + détails === */}
          <div className="space-y-6 order-2 lg:order-1">
            {/* Ce que vous recevez */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4">
                Ce que vous recevez
              </h2>
              <ul className="space-y-3">
                <ContentItem
                  icon="📈"
                  title="Récapitulatif des actions BRVM"
                  text="Top 5 hausses/baisses, volumes notables, mouvements d'indices BRVM Composite et BRVM 30."
                />
                <ContentItem
                  icon="🏦"
                  title="Adjudications UMOA-Titres"
                  text="Résultats des émissions de la semaine (taux moyens pondérés, montants servis, couverture)."
                />
                <ContentItem
                  icon="🛢️"
                  title="Matières premières clés"
                  text="Cacao, café, brent, or, huile de palme. Variation hebdo et impact macro UEMOA."
                />
                <ContentItem
                  icon="💱"
                  title="Devises FX"
                  text="USD/XOF, EUR/USD, paires à risque pour les importateurs régionaux."
                />
                <ContentItem
                  icon="📰"
                  title="Le brief de la semaine"
                  text="Analyse en 1 paragraphe sur le fait marquant : décision BCEAO, ouverture de marché, dossier ouvert dans la presse."
                />
                <ContentItem
                  icon="🎯"
                  title="Les rendez-vous à venir"
                  text="Adjudications UMOA programmées, publications BCEAO, dividendes BRVM à venir."
                />
              </ul>
            </section>

            {/* Format & fréquence */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4">
                Format &amp; fréquence
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="Cadence" value="1× / semaine" sub="Dimanche soir" />
                <Stat label="Lecture" value="~5 min" sub="Format court" />
                <Stat label="Coût" value="Gratuit" sub="Aucun engagement" />
              </div>
            </section>

            {/* FAQ */}
            <section className="bg-white border border-slate-200 rounded-lg p-5 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4">
                Questions fréquentes
              </h2>
              <div className="space-y-4">
                <Faq
                  q="Est-ce que c'est vraiment gratuit ?"
                  a="Oui. La newsletter est offerte à tous les visiteurs du site. Aucune carte bancaire requise. Les contenus Premium (alertes personnalisées, watchlists illimitées, outils Pro) restent payants — la newsletter, elle, est ouverte."
                />
                <Faq
                  q="Combien d'emails par semaine ?"
                  a="Un seul email, le dimanche soir entre 19h et 21h GMT. Pas de promotion, pas d'email commercial supplémentaire."
                />
                <Faq
                  q="Comment vous désinscrire ?"
                  a={
                    <>
                      Chaque email contient un lien de désinscription en pied
                      d&apos;email. Vous pouvez aussi le faire manuellement{" "}
                      <Link
                        href="/communaute/newsletter/desinscrire"
                        className="text-blue-700 hover:underline"
                      >
                        sur cette page
                      </Link>
                      .
                    </>
                  }
                />
                <Faq
                  q="Mes données sont-elles partagées ?"
                  a="Non. Votre email est stocké uniquement sur nos serveurs (Supabase, hébergement européen) et n'est jamais cédé, vendu ou partagé avec un tiers."
                />
                <Faq
                  q="Puis-je proposer un thème ou un sujet ?"
                  a={
                    <>
                      Bien sûr — écris-nous à{" "}
                      <a
                        href="mailto:contact@azimutfinance.com"
                        className="text-blue-700 hover:underline"
                      >
                        contact@azimutfinance.com
                      </a>{" "}
                      avec ton idée. Les meilleurs sujets sont intégrés à la
                      newsletter hebdo ou à la section magazine.
                    </>
                  }
                />
              </div>
            </section>

            {/* Magazine cross-promo */}
            <section className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-200 rounded-lg p-5 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
                Aller plus loin
              </h2>
              <p className="text-sm text-slate-700">
                Pour des analyses approfondies (formats longs, dossiers
                trimestriels, focus émetteur), consulte le{" "}
                <Link
                  href="/academie/magazine"
                  className="text-blue-700 font-semibold hover:underline"
                >
                  Magazine AzimutFinance
                </Link>
                . Pour les alertes personnalisées et le suivi multi-titres,{" "}
                <Link
                  href="/premium"
                  className="text-blue-700 font-semibold hover:underline"
                >
                  passe Premium
                </Link>
                .
              </p>
            </section>
          </div>

          {/* === COLONNE DROITE : formulaire (sticky desktop) === */}
          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-6">
              <NewsletterForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ContentItem({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="text-xl shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{text}</div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900 tabular-nums mt-0.5">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group border border-slate-200 rounded-md">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-900 flex items-center justify-between gap-2 hover:bg-slate-50">
        <span>{q}</span>
        <span className="text-slate-400 group-open:rotate-180 transition-transform">
          ▾
        </span>
      </summary>
      <div className="px-4 pb-3 text-xs text-slate-600 leading-relaxed">
        {a}
      </div>
    </details>
  );
}
