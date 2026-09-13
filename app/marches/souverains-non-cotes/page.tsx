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
import { pageMetadata, breadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata = pageMetadata({
  title: "Souverains UMOA-Titres — AzimutFinance",
  path: "/marches/souverains-non-cotes",
});

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
  // Le calendrier UMOA-Titres n'est jamais purge a la source : une adjudication
  // tenue reste listee comme « a venir » jusqu'a ce que le scraper la deplace
  // vers les realisees. Sans tri, la page annonce comme futures des operations
  // deja passees.
  //
  // Le tri se fait ICI, cote serveur, et non dans SovereignCalendar qui est un
  // composant client : y lire la date du jour ferait diverger le rendu serveur
  // du premier rendu client des que l'un des deux franchit minuit.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const toutUpcoming = loadUmoaEmissionsAVenir();
  const toutPlanned = loadUmoaEmissionsPlanifiees();

  const upcoming = toutUpcoming.filter((e) => e.dateOperation >= aujourdhui);
  const planned = toutPlanned.filter((e) => e.dateOperation >= aujourdhui);

  // Operations dont la date est passee mais dont les resultats ne sont pas
  // encore publies. Les masquer laisserait croire qu'il ne s'est rien passe ;
  // les annoncer comme « a venir » serait faux. On les montre pour ce qu'elles
  // sont : en attente de resultats.
  const enAttente = [
    ...toutUpcoming.filter((e) => e.dateOperation < aujourdhui),
    ...toutPlanned.filter((e) => e.dateOperation < aujourdhui),
  ].sort((a, b) => b.dateOperation.localeCompare(a.dateOperation));

  const userRole = await fetchUserRole();

  return (
    <div className="min-h-screen bg-slate-50">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Accueil", path: "/" },
          { name: "Marchés", path: "/marches/actions" },
          { name: "Souverains UMOA-Titres" },
        ])}
      />
      <Header />
      <Ticker />
      <SouverainsNonCotesView
        bonds={bonds}
        stats={stats}
        upcoming={upcoming}
        planned={planned}
        enAttente={enAttente}
        userRole={userRole}
      />
    </div>
  );
}