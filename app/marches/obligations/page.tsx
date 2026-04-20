import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ListedBondsView from "@/components/ListedBondsView";
import {
  loadListedBonds,
  loadListedBondPrices,
  loadListedBondEvents,
  getMarketStats,
} from "@/lib/dataLoader";

export default function Page() {
  const bonds = loadListedBonds();
  const prices = loadListedBondPrices();
  const events = loadListedBondEvents();
  const stats = getMarketStats(bonds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <ListedBondsView
        bonds={bonds}
        prices={prices}
        events={events}
        stats={stats}
      />
    </div>
  );
}