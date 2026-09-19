import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Lien from "@/components/NavigationProgress";
import SovereignAuctionSimulator from "@/components/SovereignAuctionSimulator";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import {
  loadUmoaEmissions,
  loadUmoaEmissionsAVenir,
  loadUmoaEmissionsPlanifiees,
} from "@/lib/dataLoader";
import {
  UMOA_COUNTRY_CODE,
  aggregateSovereignBonds,
} from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Simulateur d'adjudication — AzimutFinance",
  path: "/outils/simulateur-adjudication",
});

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
        <BondsPaywallSection
          breadcrumb="Simulateur d'adjudication"
          title="Simulateur d'adjudication"
          description="À quel prix soumissionner pour être retenu ? L'outil reprend les cinq dernières émissions comparables de l'émetteur et en déduit le prix à ne pas dépasser."
          features={[
            "Prix limite, déduit de la moyenne des taux marginaux",
            "Prix médian du marché, d'après les rendements moyens pondérés",
            "Taux précompté à inscrire sur le bulletin pour un BAT",
            "Les cinq séances retenues, avec couverture et absorption",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = aggregateSovereignBonds(loadUmoaEmissions());

  // Emetteurs presents au gisement, pour le selecteur.
  const paysSimulateur = Array.from(
    new Map(bonds.map((b) => [b.country, b.countryName])).entries(),
  )
    .map(([code, nom]) => ({ code, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  // Seances deja annoncees. UMOA-Titres ne publie a ce stade que l'emetteur, la
  // date et l'enveloppe : de quoi preselectionner le pays, pas de quoi remplir
  // les caracteristiques du titre.
  const codeParNom = new Map(
    bonds.map((b) => [b.countryName, b.country] as const),
  );
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const annonces = [
    ...loadUmoaEmissionsAVenir(),
    ...loadUmoaEmissionsPlanifiees(),
  ]
    .filter((e) => e.dateOperation >= aujourdHui)
    .map((e) => ({
      pays: e.country,
      paysCode: codeParNom.get(e.country) ?? UMOA_COUNTRY_CODE[e.country] ?? "",
      dateOperation: e.dateOperation,
      montantM: e.amount,
      url: e.url,
    }))
    .filter((e) => e.paysCode)
    .sort((a, b) => a.dateOperation.localeCompare(b.dateOperation))
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Lien href="/" className="hover:text-white transition">
              Marchés
            </Lien>
            <span className="mx-2 text-slate-500">›</span>
            <Lien
              href="/marches/souverains-non-cotes"
              className="hover:text-white transition"
            >
              Souverains UMOA-Titres
            </Lien>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">
              Simulateur d&apos;adjudication
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Simulateur d&apos;adjudication
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            À quel prix soumissionner pour être retenu.
          </p>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <SovereignAuctionSimulator
          pays={paysSimulateur}
          annonces={annonces}
          userRole={userRole}
        />
      </main>
    </div>
  );
}
