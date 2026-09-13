import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PremiumPaywall from "@/components/PremiumPaywall";
import YTMCalculator from "@/components/YTMCalculator";
import { loadBonds, loadIssuances } from "@/lib/dataLoader";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Simulateur YTM & pricing obligataire — AzimutFinance",
  description:
    "Calculez le prix, le rendement à l'échéance, la duration et les intérêts courus d'une obligation souveraine UEMOA.",
  path: "/outils/simulateur-ytm",
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
          breadcrumb={[{ label: "Outils" }, { label: "Simulateur YTM" }]}
          title="Simulateur YTM & pricing obligataire"
          description="Prix, rendement à l'échéance, duration et intérêts courus sur les obligations souveraines de la zone UEMOA."
          features={[
            "Prix propre et prix pied de coupon à une date donnée",
            "Rendement à l'échéance à partir d'un prix, et l'inverse",
            "Duration de Macaulay, duration modifiée et convexité",
            "Intérêts courus en Act/365 et échéancier des flux",
          ]}
          isMember={isMember}
          back={{ label: "Retour à l'accueil", href: "/" }}
        />
      </div>
    );
  }

  const bonds = loadBonds();
  const issuances = loadIssuances();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Outils" },
          { label: "Simulateur YTM" },
        ]}
        title="Simulateur YTM & pricing obligataire"
        subtitle={`Pricing, YTM, duration et intérêts courus · ${bonds.length} obligations UEMOA`}
      />
      {/* Pas d'enveloppe `.pro-tool` ici, contrairement a l'ancienne page du
          Pro Terminal : cette classe inverse le theme pour un fond sombre et
          rendrait le calculateur illisible sur le site public. */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <YTMCalculator bonds={bonds} issuances={issuances} />
      </main>
    </div>
  );
}
