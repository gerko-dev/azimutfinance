import { notFound } from "next/navigation";
import SovereignProView, {
  type SovereignProData,
} from "@/components/pros/SovereignProView";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  calculateSovereignSpread,
  getRelatedSovereignBonds,
  buildSovereignTheoreticalHistory,
  calculateInterCountrySpreads,
} from "@/lib/listedBondsTypes";

// Calibration de courbe au jour J (comme les autres vues souveraines) → dynamique.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const bond = aggregateSovereignBonds(loadUmoaEmissions()).find(
    (b) => b.id === decodedId,
  );
  if (!bond) return { title: "Titre souverain introuvable — Pro Terminal" };
  const echeance = bond.maturityDate?.slice(0, 4);
  return {
    title: `${bond.type} ${bond.countryName}${echeance ? ` ${echeance}` : ""} — Pro Terminal`,
  };
}

export default async function SovereignProPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Les ids OAT sont des ISIN ; les ids BAT contiennent ":" / "-" → décodage URL.
  const decodedId = decodeURIComponent(id);

  const emissions = loadUmoaEmissions();
  const bonds = aggregateSovereignBonds(emissions);
  const bond = bonds.find((b) => b.id === decodedId);
  if (!bond) notFound();

  const spread = calculateSovereignSpread(bond, emissions);
  const theoreticalHistory = buildSovereignTheoreticalHistory(bond, emissions, 24);
  const interCountrySpreads = calculateInterCountrySpreads(bond, emissions);
  const related = getRelatedSovereignBonds(bond, bonds, 6).map((b) => ({
    id: b.id,
    isin: b.isin,
    country: b.country,
    type: b.type,
    maturity: b.maturity,
    lastYield: b.lastYield,
    outstandingEstimate: b.outstandingEstimate,
  }));

  const data: SovereignProData = {
    bond,
    spread,
    theoreticalHistory,
    interCountrySpreads,
    related,
  };

  return <SovereignProView data={data} />;
}
