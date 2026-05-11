import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import SouverainsNonCotesView from "@/components/SouverainsNonCotesView";
import {
  loadUmoaEmissions,
  loadUmoaEmissionsAVenir,
  loadUmoaEmissionsPlanifiees,
} from "@/lib/dataLoader";
import {
  aggregateSovereignBonds,
  getSovereignMarketStats,
} from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";

// Source de donnees UNIQUE : les 3 CSV scrapes par scripts/scrape_umoa_emissions.py.
//   - umoa-emissions-realisees.csv    -> bonds historiques (adjudications passees)
//   - umoa-emissions-a-venir.csv      -> prochaines adjudications avec details
//   - umoa-emissions-planifiees.csv   -> calendrier annuel agence
// Cron 19h GMT (.github/workflows/scrape-umoa-emissions.yml).
// userRole lu via cookies Supabase → rendu dynamique.
export const dynamic = "force-dynamic";

export default async function Page() {
  const emissions = loadUmoaEmissions();
  const bonds = aggregateSovereignBonds(emissions);
  const stats = getSovereignMarketStats(bonds);
  const upcoming = loadUmoaEmissionsAVenir();
  const planned = loadUmoaEmissionsPlanifiees();
  const userRole = await fetchUserRole();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <SouverainsNonCotesView
        bonds={bonds}
        stats={stats}
        upcoming={upcoming}
        planned={planned}
        userRole={userRole}
      />
    </div>
  );
}