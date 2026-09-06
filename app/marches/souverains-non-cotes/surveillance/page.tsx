import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Link from "next/link";
import SovereignAnomalies from "@/components/SovereignAnomalies";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import { aggregateSovereignBonds } from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Souverains à surveiller — AzimutFinance",
  path: "/marches/souverains-non-cotes/surveillance",
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
          breadcrumb="À surveiller"
          title="Écarts de taux sur les souverains UMOA"
          description="Les lignes dont le taux d'adjudication s'écarte de leurs pairs — même pays, même instrument, maturité comparable."
          features={[
            "Cohorte pays + instrument (BAT / OAT) + maturité à un an près",
            "Écart exprimé en points de base, pas seulement en z-score",
            "Cohorte d'au moins 5 pairs et dispersion minimale exigées",
            "Fraîcheur de la dernière adjudication signalée",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = aggregateSovereignBonds(loadUmoaEmissions());

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link
              href="/marches/souverains-non-cotes"
              className="hover:text-white transition"
            >
              Souverains UMOA-Titres
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">À surveiller</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Souverains à surveiller
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Lignes dont le taux de la dernière adjudication s&apos;écarte de
            celui de leurs pairs de même pays, même instrument et maturité
            comparable. Un point d&apos;analyse, pas une recommandation.
          </p>
        </div>
      </div>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <SovereignAnomalies bonds={bonds} />
      </main>
    </div>
  );
}
