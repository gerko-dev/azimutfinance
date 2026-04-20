import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import SouverainsNonCotesView from "@/components/SouverainsNonCotesView";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  getSovereignMarketStats,
} from "@/lib/listedBondsTypes";

export default function Page() {
  const emissions = loadUmoaEmissions();
  const bonds = aggregateSovereignBonds(emissions);
  const stats = getSovereignMarketStats(bonds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <SouverainsNonCotesView bonds={bonds} stats={stats} />
    </div>
  );
}