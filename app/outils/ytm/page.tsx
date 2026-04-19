// Server Component : charge les donnees depuis les CSV au build
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import YTMCalculator from "@/components/YTMCalculator";
import { loadBonds, loadIssuances } from "@/lib/dataLoader";

export default function YTMCalculatorPage() {
  // Chargement des donnees cote serveur (lecture CSV)
  const bonds = loadBonds();
  const issuances = loadIssuances();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      {/* En-tete */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            Accueil › Outils Pro › Calculateur YTM
          </div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-semibold">
              Calculateur YTM & Pricing obligataire
            </h1>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">
              PREMIUM
            </span>
          </div>
          <p className="text-sm md:text-base text-slate-600">
            Pricing, YTM, duration et intérêts courus · Base de {bonds.length} obligations UEMOA · Convention Act/365
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <YTMCalculator bonds={bonds} issuances={issuances} />
      </main>
    </div>
  );
}