import { notFound } from "next/navigation";
import BondProView, {
  type BondProData,
  type SerializedCashflow,
} from "@/components/pros/BondProView";
import {
  loadListedBonds,
  loadListedBondPrices,
  loadListedBondEvents,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import {
  buildBondCashflowSchedule,
  priceFromBondSchedule,
  calculateActuarialYTM,
  calculateSimpleYTM,
  calculateDuration,
  calculateBPV,
  buildTheoreticalPriceHistory,
  calculateSignatureSpread,
} from "@/lib/listedBondsTypes";
import { getBrvmBondQuote, getBrvmBondsSnapshot } from "@/lib/brvm/liveBonds";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const idUpper = isin.toUpperCase();
  const bond = loadListedBonds().find(
    (b) => b.isin === idUpper || b.code.toUpperCase() === idUpper
  );
  if (!bond) return { title: "Obligation introuvable — Pro Terminal" };
  return { title: `${bond.name} (${bond.isin}) — Pro Terminal` };
}

export default async function BondProPage({
  params,
}: {
  params: Promise<{ isin: string }>;
}) {
  const { isin } = await params;
  const idUpper = isin.toUpperCase();

  const bonds = loadListedBonds();
  const bond = bonds.find(
    (b) => b.isin === idUpper || b.code.toUpperCase() === idUpper
  );
  if (!bond) notFound();
  const isinUpper = bond.isin;

  const observedPrices = loadListedBondPrices()
    .filter((p) => p.isin === isinUpper)
    .sort((a, b) => a.date.localeCompare(b.date));
  const events = loadListedBondEvents().filter((e) => e.isin === isinUpper);
  const emissions = loadUmoaEmissions();

  const [liveQuote, brvmSnapshot] = await Promise.all([
    getBrvmBondQuote(bond.code),
    getBrvmBondsSnapshot(),
  ]);

  // === PRIX DE MARCHE retenu : live > dernière cote CSV > pair ===
  const lastObserved =
    observedPrices.length > 0 ? observedPrices[observedPrices.length - 1] : null;
  const hasLive = !!liveQuote && liveQuote.currentPrice > 0;
  const marketCleanPrice = hasLive
    ? liveQuote!.currentPrice
    : lastObserved?.cleanPrice ?? bond.nominalValue;
  const hasMarketQuote = hasLive || !!lastObserved;
  const operationDate = hasLive
    ? new Date()
    : lastObserved
    ? new Date(lastObserved.date)
    : new Date();

  // === ECHEANCIER + METRIQUES ACTUARIELLES ===
  const schedule = buildBondCashflowSchedule(bond, operationDate);
  // Le coupon couru est indépendant du YTM : on le lit via un repricing quelconque.
  const accruedInterest = priceFromBondSchedule(
    schedule,
    bond.couponRate
  ).accruedInterest;
  const couponCouruLive = hasLive ? liveQuote!.couponCouru : accruedInterest;

  let marketYtm = calculateActuarialYTM(bond, operationDate, marketCleanPrice);
  if (!Number.isFinite(marketYtm) || marketYtm === 0) {
    marketYtm = calculateSimpleYTM(bond, marketCleanPrice);
  }
  const dirtyPrice = marketCleanPrice + accruedInterest;
  const dur = calculateDuration(bond, operationDate, marketYtm);
  const bpv = calculateBPV(bond, operationDate, marketYtm, dirtyPrice);

  // === PRIX THEORIQUE (courbe primaire UMOA-Titres) ===
  const theoreticalHistory = buildTheoreticalPriceHistory(bond, emissions, 24);
  const theoNow =
    theoreticalHistory.length > 0
      ? theoreticalHistory[theoreticalHistory.length - 1]
      : null;
  const observedYtm = hasMarketQuote ? marketYtm : null;
  const signatureSpread = calculateSignatureSpread(bond, observedYtm, emissions);

  // === SERIALISATION DE L'ECHEANCIER (Date → ISO) ===
  const cashflows: SerializedCashflow[] = schedule.futureCashflows.map((cf) => ({
    date: cf.date.toISOString().slice(0, 10),
    daysFromNow: cf.daysFromNow,
    coupon: cf.coupon,
    amort: cf.amort,
    totalFlow: cf.totalFlow,
    outstandingBefore: cf.outstandingBefore,
    outstandingAfter: cf.outstandingAfter,
  }));

  // === OBLIGATIONS SIMILAIRES (même pays, durée proche) ===
  const similarBonds = bonds
    .filter(
      (b) =>
        b.isin !== bond.isin &&
        b.country === bond.country &&
        Math.abs(b.yearsToMaturity - bond.yearsToMaturity) < 3 &&
        b.yearsToMaturity > 0
    )
    .sort(
      (a, b) =>
        Math.abs(a.yearsToMaturity - bond.yearsToMaturity) -
        Math.abs(b.yearsToMaturity - bond.yearsToMaturity)
    )
    .slice(0, 6)
    .map((b) => ({
      isin: b.isin,
      code: b.code,
      name: b.name,
      country: b.country,
      couponRate: b.couponRate,
      yearsToMaturity: b.yearsToMaturity,
    }));

  const data: BondProData = {
    bond,
    market: {
      cleanPrice: marketCleanPrice,
      dirtyPrice,
      accruedInterest,
      couponCouruLive,
      ytm: marketYtm,
      macaulay: Number.isFinite(dur.macaulay) ? dur.macaulay : null,
      modified: Number.isFinite(dur.modified) ? dur.modified : null,
      convexity: Number.isFinite(dur.convexity) ? dur.convexity : null,
      bpv: Number.isFinite(bpv) ? bpv : null,
      hasQuote: hasMarketQuote,
      isLive: hasLive,
      operationDate: operationDate.toISOString().slice(0, 10),
      theoreticalPrice: theoNow?.theoreticalPrice ?? null,
      theoreticalYtm: theoNow?.ytm ?? null,
      signatureSpread:
        signatureSpread != null && Number.isFinite(signatureSpread)
          ? signatureSpread
          : null,
    },
    cashflows,
    observedPrices: observedPrices.map((p) => ({
      date: p.date,
      cleanPrice: p.cleanPrice,
      dirtyPrice: p.dirtyPrice,
      volume: p.volume,
    })),
    theoreticalHistory,
    eventsCount: events.length,
    similarBonds,
    session: {
      sessionLabel: brvmSnapshot.sessionLabel,
      isClosed: brvmSnapshot.isClosed,
    },
  };

  return <BondProView data={data} />;
}
