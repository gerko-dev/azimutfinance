import ObligationsProView, {
  type ProBondRow,
} from "@/components/pros/ObligationsProView";
import {
  loadListedBonds,
  loadListedBondEvents,
  getMarketStats,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";
import {
  getBondYTMFromLatest,
  calculateDuration,
  calculateBPV,
  calculateSignatureSpread,
  type ListedBondPrice,
} from "@/lib/listedBondsTypes";

export const metadata = {
  title: "Obligations cotées BRVM — Pro Terminal",
};

// Page dynamique : cours live BRVM (scraping cours-obligations, cache mémoire
// ~5 min côté liveBonds) + enrichissement actuariel calculé à la volée.
export const dynamic = "force-dynamic";

export default async function ObligationsProPage() {
  // On exclut les obligations échues (yearsToMaturity <= 0) : non négociables,
  // elles fausseraient stats, courbe et table — comme sur la page publique.
  const bonds = loadListedBonds().filter((b) => b.yearsToMaturity > 0);
  const events = loadListedBondEvents();
  const stats = getMarketStats(bonds);
  const emissions = loadUmoaEmissions();

  const brvmSnapshot = await getBrvmBondsSnapshot();

  // === COURS = SCRAPING BRVM (cours-obligations) ===
  // Le mnémonique BRVM (champ `code` du CSV) est mappé vers l'ISIN. Les cours 0
  // ("aucune transaction du jour") sont ignorés : pas de cote => pas de YTM
  // observé, donc pas de spread/BPV (qui seraient dérivés du prix théorique).
  const liveDate = brvmSnapshot.fetchedAt.slice(0, 10);
  const codeToIsin = new Map<string, string>();
  for (const b of bonds) {
    if (b.code) codeToIsin.set(b.code.toUpperCase(), b.isin);
  }
  const priceByIsin = new Map<string, ListedBondPrice>();
  for (const q of brvmSnapshot.quotes) {
    const isin = codeToIsin.get(q.code.toUpperCase());
    if (!isin) continue;
    if (!Number.isFinite(q.currentPrice) || q.currentPrice <= 0) continue;
    priceByIsin.set(isin, {
      isin,
      date: liveDate,
      cleanPrice: q.currentPrice,
      dirtyPrice: q.currentPrice + (q.couponCouru || 0),
      volume: 0,
      valeurTransigee: 0,
    });
  }

  // === ENRICHISSEMENT ACTUARIEL (outil pro) ===
  // Pour chaque obligation : YTM observé, duration modifiée, convexité, BPV/PV01
  // et spread de signature vs la courbe primaire UMOA-Titres du pays.
  const asOf = new Date();
  const rows: ProBondRow[] = bonds.map((bond) => {
    const price = priceByIsin.get(bond.isin) ?? null;
    const hasQuote = !!price;
    const ytm = getBondYTMFromLatest(bond, price);
    const opDate = price ? new Date(price.date) : asOf;

    const { modified, convexity } = calculateDuration(bond, opDate, ytm);
    const bpv =
      hasQuote && price ? calculateBPV(bond, opDate, ytm, price.dirtyPrice) : null;
    // Le spread n'a de sens informatif que sur un YTM réellement observé.
    const signatureSpread = hasQuote
      ? calculateSignatureSpread(bond, ytm, emissions, asOf)
      : null;

    return {
      isin: bond.isin,
      code: bond.code,
      name: bond.name,
      issuer: bond.issuer,
      issuerType: bond.issuerType,
      country: bond.country,
      sector: bond.sector,
      couponRate: bond.couponRate,
      maturityDate: bond.maturityDate,
      yearsToMaturity: bond.yearsToMaturity,
      outstanding: bond.outstanding,
      nominalValue: bond.nominalValue,
      rating: bond.rating || null,
      greenBond: bond.greenBond,
      callable: bond.callable,
      cleanPrice: hasQuote && price ? price.cleanPrice : null,
      ytm,
      hasQuote,
      modifiedDuration: Number.isFinite(modified) ? modified : null,
      convexity: Number.isFinite(convexity) ? convexity : null,
      bpv: bpv != null && Number.isFinite(bpv) ? bpv : null,
      signatureSpread:
        signatureSpread != null && Number.isFinite(signatureSpread)
          ? signatureSpread
          : null,
    };
  });

  return (
    <ObligationsProView
      rows={rows}
      stats={stats}
      eventsCount={events.length}
      session={{
        sessionLabel: brvmSnapshot.sessionLabel,
        isClosed: brvmSnapshot.isClosed,
      }}
    />
  );
}
