import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ListedBondsView from "@/components/ListedBondsView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadListedBonds,
  loadListedBondPrices,
  loadListedBondEvents,
  getMarketStats,
} from "@/lib/dataLoader";

export default async function Page() {
  const bonds = loadListedBonds();
  const prices = loadListedBondPrices();
  const events = loadListedBondEvents();
  const stats = getMarketStats(bonds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4">
        <ProfileNudge field="country" revalidate="/marches/obligations" />
      </div>
      <ListedBondsView
        bonds={bonds}
        prices={prices}
        events={events}
        stats={stats}
      />
    </div>
  );
}