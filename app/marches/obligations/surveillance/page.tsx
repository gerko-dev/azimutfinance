import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Link from "next/link";
import BondAnomalies from "@/components/BondAnomalies";
import BondsPaywallSection from "@/components/BondsPaywallSection";
import BondsRelatedLinks from "@/components/BondsRelatedLinks";
import { loadListedBonds, loadListedBondPrices } from "@/lib/dataLoader";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";
import { fetchUserRole } from "@/lib/auth/userRole";
import type { ListedBondPrice } from "@/lib/listedBondsTypes";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Obligations à surveiller — AzimutFinance",
  path: "/marches/obligations/surveillance",
});

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
          breadcrumb="À surveiller"
          title="Détection d'anomalies sur les obligations cotées"
          description="Repérez automatiquement les obligations dont le YTM s'écarte statistiquement de leurs pairs (même pays, même rating, durée comparable). Z-score > 1,5σ."
          features={[
            "Algorithme z-score sur cohorte pays + rating + durée ±1 an",
            "Décote relative (📈) : potentiel d'achat à creuser",
            "Surcote relative (📉) : risque sous-évalué à interroger",
            "Liens directs vers la fiche détaillée de chaque obligation",
          ]}
          isMember={isMember}
        />
      </div>
    );
  }

  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);

  // Le detecteur a besoin d'un PRIX pour chaque ligne : sans lui,
  // getBondYTMFromLatest retombe sur le taux de coupon et l'outil compare des
  // caracteristiques d'emission au lieu de rendements de marche. Le snapshot
  // live seul ne suffit pas — il revient parfois vide hors seance. On part
  // donc de l'historique BOC, et le live ne fait que rafraichir ce qu'il
  // couvre. On ne transmet qu'une ligne par titre : passer les 31 000
  // cotations au composant client alourdirait la page pour rien.
  const derniere = new Map<string, ListedBondPrice>();
  for (const p of loadListedBondPrices()) {
    const cur = derniere.get(p.isin);
    if (!cur || p.date > cur.date) derniere.set(p.isin, p);
  }

  const brvmSnapshot = await getBrvmBondsSnapshot();
  const liveDate = brvmSnapshot.fetchedAt.slice(0, 10);
  const codeToIsin = new Map<string, string>();
  for (const b of bonds) {
    if (b.code) codeToIsin.set(b.code.toUpperCase(), b.isin);
  }
  for (const q of brvmSnapshot.quotes) {
    const isin = codeToIsin.get(q.code);
    if (!isin) continue;
    if (!Number.isFinite(q.currentPrice) || q.currentPrice <= 0) continue;
    const cur = derniere.get(isin);
    if (cur && cur.date > liveDate) continue;
    derniere.set(isin, {
      isin,
      date: liveDate,
      cleanPrice: q.currentPrice,
      dirtyPrice: q.currentPrice + (q.couponCouru || 0),
      volume: 0,
      valeurTransigee: 0,
    });
  }

  const prices: ListedBondPrice[] = Array.from(derniere.values());

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
            <span className="text-slate-200">À surveiller</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">
            🔎 Obligations à surveiller
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Obligations dont le YTM s&apos;écarte statistiquement de leurs pairs
            (même pays, même notation, durée similaire). Z-score &gt; 1,5σ. Une
            analyse approfondie est recommandée avant toute décision.
          </p>
        </div>
      </div>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <BondAnomalies bonds={bonds} prices={prices} />
        <BondsRelatedLinks current="surveillance" />
      </main>
    </div>
  );
}
