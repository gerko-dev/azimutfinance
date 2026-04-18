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

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Ligne 1 : Graphique + Top Mouvements */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <MarketChart />
          </div>
          <TopMovers />
        </div>

        {/* Ligne 2 : Actualités + Premium */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
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