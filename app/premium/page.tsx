import Link from "next/link";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/auth/premium";
import { PREMIUM_FEATURES } from "@/lib/premium/plans";
import { getDynamicPlanList } from "@/lib/premium/pricingQueries";
import PremiumPlanCards from "./PremiumPlanCards";

export const metadata = {
  title: "Premium — AzimutFinance",
  description:
    "Accédez aux analyses macro UEMOA, outils Pro, alertes et données historiques étendues pour la BRVM. À partir de 9 999 FCFA / mois.",
};

export const dynamic = "force-dynamic";

export default async function PremiumPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const premium = await getPremiumStatus();
  const plans = await getDynamicPlanList();
  const cheapestPerMonth = plans.length
    ? Math.min(...plans.map((p) => p.pricePerMonthFcfa))
    : 8333;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <PageHero
        breadcrumb={[{ label: "Accueil", href: "/" }, { label: "Premium" }]}
        title="Investissez avec une longueur d'avance"
        subtitle={
          <>
            Accédez à toutes les analyses macro, outils pro et données
            historiques étendues sur la BRVM et l&apos;UEMOA. À partir de{" "}
            <span className="font-semibold text-white">
              {cheapestPerMonth.toLocaleString("fr-FR")} FCFA / mois
            </span>{" "}
            avec l&apos;abonnement annuel.
          </>
        }
      />

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12">
        {premium.isPremium && premium.premiumUntil && (
          <div className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium text-emerald-900">
                ✓ Tu es déjà Premium
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                Accès actif jusqu&apos;au{" "}
                {premium.premiumUntil.toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
                .
              </div>
            </div>
            <Link
              href="/compte"
              className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
            >
              Voir mon compte
            </Link>
          </div>
        )}

        <PremiumPlanCards
          isAuthenticated={!!user}
          isPremium={premium.isPremium}
          plans={plans}
        />

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-slate-900 mb-4">
              Ce que comprend Premium
            </h2>
            <ul className="space-y-3">
              {PREMIUM_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="text-emerald-600 shrink-0 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Paiement 100 % local
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Paie en quelques secondes avec ton moyen habituel :
            </p>
            <ul className="text-sm text-slate-700 space-y-1.5">
              <li>📱 Orange Money</li>
              <li>🌊 Wave</li>
              <li>💳 Visa / Mastercard</li>
            </ul>
            <p className="text-xs text-slate-500 mt-4">
              Paiement sur nos numéros officiels Orange Money et Wave, puis
              validation par notre équipe sous 24 h ouvrées. Un reçu te sera
              envoyé par email dès activation.
            </p>
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-6 md:p-8">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900 mb-4">
            Questions fréquentes
          </h2>
          <div className="space-y-5 text-sm">
            <Faq
              q="Puis-je annuler à tout moment ?"
              a="Oui. Aucun engagement de durée : ton accès Premium reste actif jusqu'à la fin de la période payée, après quoi il n'est pas renouvelé automatiquement."
            />
            <Faq
              q="Quelle est la différence entre Premium et Pro ?"
              a="Premium ouvre toutes les analyses et outils pour particuliers. Pro (à venir) ajoute des fonctionnalités pour les institutions : API, rapports white-label, support dédié."
            />
            <Faq
              q="Comment se passe la facturation ?"
              a="Tu paies en une fois pour la durée choisie (1, 6 ou 12 mois). Un reçu te sera envoyé par email après chaque paiement."
            />
            <Faq
              q="Puis-je passer du mensuel à l'annuel plus tard ?"
              a="Oui, contacte-nous à contact@azimutfinance.com et nous créditerons la portion non utilisée de ton abonnement courant."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <div className="font-medium text-slate-900 mb-1">{q}</div>
      <div className="text-slate-600">{a}</div>
    </div>
  );
}
