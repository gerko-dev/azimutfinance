import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import BondDetailView from "@/components/BondDetailView";
import {
  loadListedBonds,
  loadListedBondPrices,
  loadListedBondEvents,
} from "@/lib/dataLoader";

export default async function BondPage({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const isinUpper = isin.toUpperCase();

  const bonds = loadListedBonds();
  const bond = bonds.find((b) => b.isin.toUpperCase() === isinUpper);

  if (!bond) {
    notFound();
  }

  const allPrices = loadListedBondPrices();
  const priceHistory = allPrices.filter((p) => p.isin.toUpperCase() === isinUpper);

  const allEvents = loadListedBondEvents();
  const events = allEvents.filter((e) => e.isin.toUpperCase() === isinUpper);

  // Obligations similaires : meme pays + meme rating + duree ±2 ans
  const similarBonds = bonds
    .filter(
      (b) =>
        b.isin !== bond.isin &&
        b.country === bond.country &&
        b.rating === bond.rating &&
        Math.abs(b.yearsToMaturity - bond.yearsToMaturity) < 2
    )
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <BondDetailView
        bond={bond}
        priceHistory={priceHistory}
        events={events}
        similarBonds={similarBonds}
      />
    </div>
  );
}