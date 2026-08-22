import SouverainsProView, {
  type SouverainsProData,
} from "@/components/pros/SouverainsProView";
import {
  loadUmoaEmissions,
  loadUmoaEmissionsAVenir,
  loadUmoaEmissionsPlanifiees,
} from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  getSovereignMarketStats,
  calibrateTheoreticalYTM,
  toLite,
} from "@/lib/listedBondsTypes";

export const metadata = {
  title: "Souverains UMOA-Titres — Pro Terminal",
};

// Source unique : les 3 CSV scrapés par scripts/scrape_umoa_emissions.py
// (réalisées / à venir / planifiées). Rendu dynamique pour rester aligné avec
// les autres vues pro (calibration de courbe au jour J).
export const dynamic = "force-dynamic";

export default async function SouverainsProPage() {
  const emissions = loadUmoaEmissions();
  const allBonds = aggregateSovereignBonds(emissions);
  const stats = getSovereignMarketStats(allBonds);
  const upcoming = loadUmoaEmissionsAVenir();
  const planned = loadUmoaEmissionsPlanifiees();

  const asOf = new Date();

  // === COURBES PRIMAIRES PAR PAYS (outil pro) ===
  // Pour chaque pays émetteur, on extrait les points calibrés sur les
  // adjudications cash des 90 derniers jours (basePoints). Sert d'overlay
  // "marché primaire actuel" sur le nuage des derniers rendements.
  const countryCurves: Record<string, Array<{ maturity: number; ytm: number }>> = {};
  for (const country of Object.keys(stats.byCountry)) {
    const calib = calibrateTheoreticalYTM(country, asOf, 5, emissions);
    if (calib && calib.basePoints.length > 0) {
      countryCurves[country] = calib.basePoints
        .map((p) => ({ maturity: p.maturity, ytm: p.ytm }))
        .sort((a, b) => a.maturity - b.maturity);
    }
  }

  // Date de la dernière adjudication observée (pour l'en-tête).
  const lastAdjudication = allBonds.reduce(
    (max, b) => (b.lastTradeDate > max ? b.lastTradeDate : max),
    ""
  );

  const data: SouverainsProData = {
    bonds: allBonds.map(toLite),
    stats,
    upcoming,
    planned,
    countryCurves,
    lastAdjudication,
  };

  return <SouverainsProView data={data} />;
}
