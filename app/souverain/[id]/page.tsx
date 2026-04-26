import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import SovereignDetailView from "@/components/SovereignDetailView";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  calculateSovereignSpread,
  getRelatedSovereignBonds,
  buildSovereignTheoreticalHistory,
  calculateInterCountrySpreads,
} from "@/lib/listedBondsTypes";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Les ids OAT sont des ISIN; les ids BAT contiennent du caractere ":" / "-"
  // qu'il faut decoder depuis l'URL.
  const decodedId = decodeURIComponent(id);

  const emissions = loadUmoaEmissions();
  const bonds = aggregateSovereignBonds(emissions);
  const bond = bonds.find((b) => b.id === decodedId);
  if (!bond) notFound();

  const spread = calculateSovereignSpread(bond, emissions);
  const related = getRelatedSovereignBonds(bond, bonds, 6);
  const theoreticalHistory = buildSovereignTheoreticalHistory(bond, emissions, 24);
  const interCountrySpreads = calculateInterCountrySpreads(bond, emissions);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <SovereignDetailView
        bond={bond}
        spread={spread}
        related={related}
        theoreticalHistory={theoreticalHistory}
        interCountrySpreads={interCountrySpreads}
      />
    </div>
  );
}
