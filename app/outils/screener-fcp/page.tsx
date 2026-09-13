import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import PageHero from "@/components/PageHero";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";
import FCPScreenerView from "@/components/FCPScreenerView";
import { buildFcpScreenerPayload } from "@/lib/screeners/fcp";

export const metadata = pageMetadata({
  title: "Screener FCP / OPCVM — AzimutFinance",
  description: "Performance, encours et fraîcheur des valeurs liquidatives des fonds de la zone UEMOA.",
  path: "/outils/screener-fcp",
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
          breadcrumb={[{ label: "Outils" }, { label: "Screener FCP" }]}
          title="Screener FCP / OPCVM"
          description="Performance, encours et fraîcheur des valeurs liquidatives des fonds de la zone UEMOA."
          features={[
            "Performance 3M / 6M / YTD / 1 an / 3 ans",
            "Encours sous gestion au trimestre de référence",
            "Fraîcheur et cadence de publication des VL",
            "Filtres par société de gestion, catégorie et type",
          ]}
          isMember={isMember}
          back={{ label: "Retour à l'accueil", href: "/" }}
        />
      </div>
    );
  }

  const payload = buildFcpScreenerPayload();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "Outils" },
          { label: "Screener FCP" },
        ]}
        title="Screener FCP / OPCVM"
        subtitle={`Performance et encours de ${payload.rows.length} fonds de la zone UEMOA.`}
      />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <FCPScreenerView
          rows={payload.rows}
          refQuarter={payload.refQuarter}
          latestVLGlobal={payload.latestVLGlobal}
          stalenessCutoff={payload.stalenessCutoff}
          categories={payload.categories}
          managers={payload.managers}
          types={payload.types}
        />
      </main>
    </div>
  );
}
