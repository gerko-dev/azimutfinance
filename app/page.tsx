import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import MarketChart from "@/components/MarketChart";
import TopMovers from "@/components/TopMovers";
import NewsSection from "@/components/NewsSection";
import PremiumCard from "@/components/PremiumCard";
import StocksTable from "@/components/StocksTable";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Ligne 1 : Graphique + Top Mouvements */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <MarketChart />
          </div>
          <TopMovers />
        </div>

        {/* Ligne 2 : Actualités + Premium */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <NewsSection />
          </div>
          <PremiumCard />
        </div>

        {/* Ligne 3 : Tableau */}
        <StocksTable />
      </main>
    </div>
  );
}