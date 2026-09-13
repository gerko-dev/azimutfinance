import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PremiumPaywall from "@/components/PremiumPaywall";
import ComparateurView from "@/components/outils/ComparateurView";
import { buildComparateurPayload } from "@/lib/screeners/comparateur";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Comparateur de titres BRVM — AzimutFinance",
  description:
    "Comparez jusqu'à quatre sociétés cotées à la BRVM : valorisation, rentabilité, croissance, structure financière et performance rebasée.",
  path: "/outils/comparateur",
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
          breadcrumb={[{ label: "Outils" }, { label: "Comparateur de titres" }]}
          title="Comparateur de titres BRVM"
          description="Mettez jusqu'à quatre sociétés cotées côte à côte : ce qu'elles valent, ce qu'elles rapportent, ce qu'elles doivent."
          features={[
            "Valorisation : PER, Price to Book, bénéfice par action, rendement",
            "Rentabilité et marges sur le dernier exercice publié",
            "Croissance du chiffre d'affaires et du résultat net",
            "Structure financière : gearing, autonomie, liquidité",
            "Performance rebasée à 100 sur 6 mois, 1 an ou 3 ans",
          ]}
          isMember={isMember}
          back={{ label: "Retour à l'accueil", href: "/" }}
        />
      </div>
    );
  }

  const payload = await buildComparateurPayload();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Outils" },
          { label: "Comparateur de titres" },
        ]}
        title="Comparateur de titres BRVM"
        subtitle={`Jusqu'à quatre sociétés côte à côte, parmi les ${payload.titres.length} titres cotés.`}
      />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <ComparateurView
          titres={payload.titres}
          dates={payload.dates}
          series={payload.series}
        />
      </main>
    </div>
  );
}
