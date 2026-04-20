import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import BondDetailView from "@/components/BondDetailView";
import {
  loadListedBonds,
  loadListedBondPrices,
  loadListedBondEvents,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import {
  buildTheoreticalPriceHistory,
  calculateSignatureSpread,
} from "@/lib/listedBondsTypes";

export default async function Page({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const isinUpper = isin.toUpperCase();

  const bonds = loadListedBonds();
  const bond = bonds.find((b) => b.isin === isinUpper);
  if (!bond) notFound();

  const allPrices = loadListedBondPrices();
  const priceHistory = allPrices.filter((p) => p.isin === isinUpper);

  const events = loadListedBondEvents().filter((e) => e.isin === isinUpper);

  // Chargement des emissions UMOA-Titres pour le prix theorique
  const emissions = loadUmoaEmissions();
  const theoreticalHistory = buildTheoreticalPriceHistory(bond, emissions, 24);
  const signatureSpread = calculateSignatureSpread(bond, emissions);

  // Obligations similaires : meme pays, duree similaire
  const similarBonds = bonds
    .filter(
      (b) =>
        b.isin !== bond.isin &&
        b.country === bond.country &&
        Math.abs(b.yearsToMaturity - bond.yearsToMaturity) < 3
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
        theoreticalHistory={theoreticalHistory}
        signatureSpread={signatureSpread}
      />
    </div>
  );
}