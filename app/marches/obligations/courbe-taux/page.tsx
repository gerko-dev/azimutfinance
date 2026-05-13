import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Link from "next/link";
import BondYieldCurve from "@/components/BondYieldCurve";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import BondsRelatedLinks from "@/components/BondsRelatedLinks";
import { loadListedBonds } from "@/lib/dataLoader";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";
import { fetchUserRole } from "@/lib/auth/userRole";
import type { ListedBondPrice } from "@/lib/listedBondsTypes";

// Snapshot live BRVM + cookies auth → rendu dynamique.
export const dynamic = "force-dynamic";

export default async function Page() {
  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <BondsPaywallSection
          breadcrumb="Courbe des taux"
          title="Courbe des taux BRVM"
          description="YTM actuariel par durée résiduelle, droite de régression calibrée sur la base de votre choix : États UEMOA, marché global, par pays ou par type d'émetteur."
          features={[
            "YTM actuariel pour chaque obligation cotée",
            "Régression calibrable : États UEMOA, marché global, par pays ou type",
            "Filtrage par pays et type pour comparer signatures",
            "Mise à jour automatique avec les cours BRVM scrapés à la clôture",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);
  const brvmSnapshot = await getBrvmBondsSnapshot();
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
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <Link href="/marches/obligations" className="hover:text-white transition">
              Obligations cotées
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Courbe des taux</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            Courbe des taux BRVM
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            YTM actuariel par durée résiduelle. La régression vous permet de
            visualiser la prime des signatures privées par rapport aux courbes
            souveraines de référence.
          </p>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <BondYieldCurve bonds={bonds} prices={prices} />
        <BondsRelatedLinks current="courbe" />
      </main>
    </div>
  );
}
