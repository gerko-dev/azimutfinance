import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";
import BondsScreenerView from "@/components/screeners/BondsScreenerView";
import { buildBondsScreenerPayload } from "@/lib/screeners/obligations";

export const metadata = pageMetadata({
  title: "Screener d'obligations BRVM — AzimutFinance",
  description: "Filtrez la cote obligataire par coupon, maturité résiduelle, rendement, notation, type d'amortissement et émetteur.",
  path: "/outils/screener-obligations",
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
          breadcrumb={[{ label: "Outils" }, { label: "Screener obligations" }]}
          title="Screener d'obligations BRVM"
          description="Filtrez la cote obligataire par coupon, maturité résiduelle, rendement, notation, type d'amortissement et émetteur."
          features={[
            "Coupon, maturité résiduelle et rendement à l'échéance",
            "Filtres par émetteur, pays, notation et amortissement",
            "Obligations vertes et titres rappelables identifiés",
            "Synthèse du sous-ensemble filtré : rendement moyen, encours",
          ]}
          isMember={isMember}
          back={{ label: "Retour à l'accueil", href: "/" }}
        />
      </div>
    );
  }

  const payload = await buildBondsScreenerPayload();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Outils" },
          { label: "Screener obligations" },
        ]}
        title="Screener d'obligations BRVM"
        subtitle={`${payload.rows.length} lignes en vie sur la cote obligataire.`}
      />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <BondsScreenerView
          rows={payload.rows}
          issuerTypes={payload.issuerTypes}
          countries={payload.countries}
          ratings={payload.ratings}
          amortizationTypes={payload.amortizationTypes}
          priceDate={payload.priceDate}
          pricesFromFallback={payload.pricesFromFallback}
        />
      </main>
    </div>
  );
}
