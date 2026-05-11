import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import ListedBondsView from "@/components/ListedBondsView";
import ProfileNudge from "@/components/profile/ProfileNudge";
import {
  loadListedBonds,
  loadListedBondEvents,
  getMarketStats,
} from "@/lib/dataLoader";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";
import type { ListedBondPrice } from "@/lib/listedBondsTypes";
import { fetchUserRole } from "@/lib/auth/userRole";

// Lecture de cookies (auth Supabase) + snapshot live BRVM → rendu dynamique.
export const dynamic = "force-dynamic";

export default async function Page() {
  // On exclut les obligations arrivees a echeance (yearsToMaturity <= 0) :
  // elles ne sont plus negociables et fausseraient stats + courbe + tableau.
  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);
  const events = loadListedBondEvents();
  const stats = getMarketStats(bonds);

  const [brvmSnapshot, userRole] = await Promise.all([
    getBrvmBondsSnapshot(),
    fetchUserRole(),
  ]);

  // === COURS = SCRAPING BRVM UNIQUEMENT ===
  // Source unique : brvm.org/cours-obligations. Le CSV obligations-cotees-prix
  // n'est pas utilise sur cette page (snapshot fige, periodicite irreguliere).
  // Mnemonique BRVM (ex "EOM.O10") = champ `code` du CSV obligations-cotees,
  // qu'on mappe vers l'ISIN attendu par <ListedBondsView>.
  // Les valeurs 0 ("aucune transaction du jour" sur BRVM) sont conservees telles
  // quelles : ListedBondsView les affiche en "0" et le YTM tombe a 0 — c'est le
  // comportement souhaite pour signaler l'absence de cours.
  const liveDate = brvmSnapshot.fetchedAt.slice(0, 10);
  const codeToIsin = new Map<string, string>();
  for (const b of bonds) {
    if (b.code) codeToIsin.set(b.code.toUpperCase(), b.isin);
  }
  const prices: ListedBondPrice[] = [];
  for (const q of brvmSnapshot.quotes) {
    const isin = codeToIsin.get(q.code);
    if (!isin) continue;
    if (!Number.isFinite(q.currentPrice)) continue;
    prices.push({
      isin,
      date: liveDate,
      cleanPrice: q.currentPrice,
      dirtyPrice: q.currentPrice + (q.couponCouru || 0),
      volume: 0,
      transactions: 0,
    });
  }

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
        userRole={userRole}
      />
    </div>
  );
}