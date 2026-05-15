import { notFound } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
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
  getBondYTMFromLatest,
} from "@/lib/listedBondsTypes";
import {
  getBrvmBondQuote,
  getBrvmBondsSnapshot,
} from "@/lib/brvm/liveBonds";
import { fetchUserRole } from "@/lib/auth/userRole";

// Page rendue dynamiquement pour beneficier du cours live BRVM.
// Le cache module-level dans liveBonds.ts limite la frequence des fetchs reels.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const idUpper = isin.toUpperCase();
  // Même résolution ISIN-ou-code mnémonique que le composant page.
  const bond = loadListedBonds().find(
    (b) => b.isin === idUpper || b.code.toUpperCase() === idUpper,
  );
  if (!bond) return { title: "Obligation introuvable — AzimutFinance" };
  return {
    title: `${bond.name} (${bond.isin}) — Obligation cotée BRVM`,
    description: `Fiche obligation ${bond.name} émise par ${bond.issuer} — ${bond.country} : cotation BRVM, rendement à maturité, prix théorique, échéancier d'amortissement et événements.`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const idUpper = isin.toUpperCase();

  // Le segment d'URL accepte soit l'ISIN ISO, soit le code symbole BRVM
  // (ex: "TPBF.O12") qui est ce qu'on stocke dans watchlist_items / alerts.
  const bonds = loadListedBonds();
  const bond = bonds.find(
    (b) => b.isin === idUpper || b.code.toUpperCase() === idUpper,
  );
  if (!bond) notFound();
  const isinUpper = bond.isin;

  const allPrices = loadListedBondPrices();
  const priceHistory = allPrices.filter((p) => p.isin === isinUpper);

  const events = loadListedBondEvents().filter((e) => e.isin === isinUpper);

  // Cours en direct depuis BRVM (cache 5 min, mise a jour BRVM toutes les 15 min).
  // Le code mnemonique BRVM matche le champ `code` du CSV (ex "EOM.O10").
  const [liveQuote, brvmSnapshot, userRole] = await Promise.all([
    getBrvmBondQuote(bond.code),
    getBrvmBondsSnapshot(),
    fetchUserRole(),
  ]);

  // Chargement des emissions UMOA-Titres pour le prix theorique
  const emissions = loadUmoaEmissions();
  const theoreticalHistory = buildTheoreticalPriceHistory(bond, emissions, 24);

  // Spread de signature : YTM coté BRVM observé vs courbe primaire au jour J,
  // interpolée à la maturité résiduelle. Sans cotation observée → null
  // (le prix théorique est dérivé de la même courbe, le spread serait nul
  // par construction).
  const latestObservedPrice = priceHistory.length
    ? priceHistory.reduce((latest, p) => (p.date > latest.date ? p : latest))
    : null;
  const observedYtm = latestObservedPrice
    ? getBondYTMFromLatest(bond, latestObservedPrice)
    : null;
  const signatureSpread = calculateSignatureSpread(bond, observedYtm, emissions);

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
      <PageHero
        breadcrumb={[
          { label: "Marchés", href: "/" },
          { label: "Obligations cotées", href: "/marches/obligations" },
          { label: bond.name },
        ]}
        title={bond.name}
        subtitle={`${bond.issuer} · ${bond.issuerType} · ${bond.sector} · ISIN ${bond.isin}`}
      />
      <BondDetailView
        bond={bond}
        priceHistory={priceHistory}
        events={events}
        similarBonds={similarBonds}
        theoreticalHistory={theoreticalHistory}
        signatureSpread={signatureSpread}
        livePrice={
          liveQuote
            ? {
                currentPrice: liveQuote.currentPrice,
                couponCouru: liveQuote.couponCouru,
                lastPaymentDate: liveQuote.lastPaymentDate,
                lastPaymentAmount: liveQuote.lastPaymentAmount,
                fetchedAt: brvmSnapshot.fetchedAt,
                sessionLabel: brvmSnapshot.sessionLabel,
                isClosed: brvmSnapshot.isClosed,
              }
            : null
        }
        userRole={userRole}
      />
    </div>
  );
}