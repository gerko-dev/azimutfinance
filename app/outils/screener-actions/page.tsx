import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";
import ScreenerView from "@/components/ScreenerView";
import { buildActionsScreenerRows } from "@/lib/screeners/actions";

export const metadata = pageMetadata({
  title: "Screener d'actions BRVM — AzimutFinance",
  description: "Filtres multi-critères sur les titres cotés à la BRVM : quadrants risque/rendement, fondamentaux, momentum et volumes.",
  path: "/outils/screener-actions",
});

// Le role est lu via cookies pour la garde Premium : rendu dynamique impose.
export const dynamic = "force-dynamic";

export default async function Page() {
  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <PremiumPaywall
          breadcrumb={[{ label: "Outils" }, { label: "Screener actions" }]}
          title="Screener d'actions BRVM"
          description="Filtres multi-critères sur les titres cotés à la BRVM : quadrants risque/rendement, fondamentaux, momentum et volumes."
          features={[
            "Quadrants risque / rendement sur l'ensemble de la cote",
            "Ratios fondamentaux sur plusieurs exercices",
            "Momentum, volatilité et volumes moyens",
            "Critères de marché combinables librement",
          ]}
          isMember={isMember}
          back={{ label: "Retour à l'accueil", href: "/" }}
        />
      </div>
    );
  }

  const stocks = await buildActionsScreenerRows();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Outils" },
          { label: "Screener actions" },
        ]}
        title="Screener d'actions BRVM"
        subtitle={`Filtres multi-critères sur les ${stocks.length} titres cotés.`}
      />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <ScreenerView stocks={stocks} />
      </main>
    </div>
  );
}
