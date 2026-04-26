"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type {
  ListedBond,
  ListedBondPrice,
  ListedBondEvent,
} from "@/lib/listedBondsTypes";
import {
  calculateActuarialYTM,
  calculateDuration,
  calculateBPV,
  getBondCashflows,
} from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatFCFA2(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(value) + " FCFA";
}

function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateShort(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatPctSigned(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

// === HELPER : prix pied de coupon a partir d'un YTM cible ===
function priceFromYtmActuarial(
  bond: ListedBond,
  operationDate: Date,
  ytm: number
): number {
  const issueDate = new Date(bond.issueDate);
  const maturityDate = new Date(bond.maturityDate);
  const monthsPerPeriod = 12 / bond.couponFrequency;

  const couponDates: Date[] = [];
  const current = new Date(maturityDate);
  while (current.getTime() > issueDate.getTime()) {
    couponDates.unshift(new Date(current));
    current.setUTCMonth(current.getUTCMonth() - monthsPerPeriod);
  }

  const futureDates = couponDates.filter((d) => d.getTime() > operationDate.getTime());
  const periodicCoupon = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;

  let dirtyPrice = 0;
  for (let i = 0; i < futureDates.length; i++) {
    const daysFromNow =
      (futureDates[i].getTime() - operationDate.getTime()) / (24 * 60 * 60 * 1000);
    const years = daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);
    const cashflow =
      i === futureDates.length - 1 ? periodicCoupon + bond.nominalValue : periodicCoupon;
    dirtyPrice += cashflow * df;
  }

  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate =
    pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;

  const daysSinceLastCoupon = Math.floor(
    (operationDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  const nextCouponDateForAccrual =
    futureDates.length > 0 ? futureDates[0] : maturityDate;
  const daysInPeriod = Math.round(
    (nextCouponDateForAccrual.getTime() - previousCouponDate.getTime()) /
      (24 * 60 * 60 * 1000)
  );

  const accruedInterest =
    daysInPeriod > 0 ? (periodicCoupon * daysSinceLastCoupon) / daysInPeriod : 0;

  return dirtyPrice - accruedInterest;
}

// === HELPER : calcul complet des metriques ===
function computeMetrics(
  bond: ListedBond,
  operationDate: Date,
  cleanPrice: number,
  ytmOverride?: number
) {
  if (bond.yearsToMaturity <= 0 || cleanPrice <= 0) return null;

  const ytm =
    ytmOverride !== undefined
      ? ytmOverride
      : calculateActuarialYTM(bond, operationDate, cleanPrice);

  const { macaulay, modified, convexity } = calculateDuration(bond, operationDate, ytm);
  const bpv = calculateBPV(bond, operationDate, ytm, cleanPrice);

  const issueDate = new Date(bond.issueDate);
  const maturityDate = new Date(bond.maturityDate);
  const monthsPerPeriod = 12 / bond.couponFrequency;
  const couponDates: Date[] = [];
  const cur = new Date(maturityDate);
  while (cur.getTime() > issueDate.getTime()) {
    couponDates.unshift(new Date(cur));
    cur.setUTCMonth(cur.getUTCMonth() - monthsPerPeriod);
  }

  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate =
    pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;

  const daysSinceLastCoupon = Math.floor(
    (operationDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  const nextCouponDate =
    couponDates.find((d) => d.getTime() > operationDate.getTime()) || maturityDate;
  const daysInPeriod = Math.round(
    (nextCouponDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  const periodicCoupon = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;
  const accruedInterest =
    daysInPeriod > 0 ? (periodicCoupon * daysSinceLastCoupon) / daysInPeriod : 0;
  const dirtyPrice = cleanPrice + accruedInterest;

  return {
    ytm,
    cleanPrice,
    macaulay,
    modified,
    convexity,
    bpv,
    accruedInterest,
    dirtyPrice,
    daysSinceLastCoupon,
    daysInPeriod,
    periodicCoupon,
    nextCouponDate,
  };
}

type Props = {
  bond: ListedBond;
  priceHistory: ListedBondPrice[];
  events: ListedBondEvent[];
  similarBonds: ListedBond[];
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  signatureSpread: number | null;
};

type Tab =
  | "overview"
  | "quotations"
  | "cashflow"
  | "risk"
  | "simulator"
  | "characteristics";

export default function BondDetailView({
  bond,
  priceHistory,
  events,
  similarBonds,
  theoreticalHistory,
  signatureSpread,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Émetteur souverain : l'écart vs courbe UMOA-Titres du pays n'est pas une
  // prime de risque crédit (l'État est comparé à lui-même), mais une prime de
  // liquidité / cotation BRVM vs primaire. On adapte le wording en conséquence.
  const isSovereign =
    bond.issuerType === "Obligation d'Etat" || bond.issuerType === "Sukuk Etat";

  // === PRIX DE MARCHE ===
  const latestHistoricalPrice =
    priceHistory.length > 0
      ? priceHistory.reduce((latest, p) =>
          new Date(p.date) > new Date(latest.date) ? p : latest
        )
      : null;

  const latestTheoretical =
    theoreticalHistory.length > 0
      ? theoreticalHistory[theoreticalHistory.length - 1]
      : null;

  const marketPrice =
    latestHistoricalPrice?.cleanPrice ||
    latestTheoretical?.theoreticalPrice ||
    bond.nominalValue;

  // === DATE DE COTATION ===
  const operationDate = useMemo(() => {
    if (latestHistoricalPrice) {
      const [y, m, d] = latestHistoricalPrice.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    if (latestTheoretical) {
      const [y, m, d] = latestTheoretical.date.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  }, [latestHistoricalPrice, latestTheoretical]);

  // === METRIQUES MARCHE ===
  const marketMetrics = useMemo(
    () => computeMetrics(bond, operationDate, marketPrice),
    [bond, operationDate, marketPrice]
  );

  // === ETATS DU SIMULATEUR ===
  const [simPrice, setSimPrice] = useState<number>(marketPrice);
  const [simYtm, setSimYtm] = useState<number>(bond.couponRate);
  const [simMode, setSimMode] = useState<"price" | "ytm">("price");

  const simMetrics = useMemo(() => {
    if (simMode === "price") {
      return computeMetrics(bond, operationDate, simPrice);
    } else {
      const cleanPrice = priceFromYtmActuarial(bond, operationDate, simYtm);
      return computeMetrics(bond, operationDate, cleanPrice, simYtm);
    }
  }, [bond, simPrice, simYtm, simMode, operationDate]);

  // === ECHEANCIER DES FLUX ===
  const cashflows = useMemo(() => getBondCashflows(bond), [bond]);
  const todayMs = operationDate.getTime();
  const futureCashflows = cashflows.filter((cf) => new Date(cf.date).getTime() > todayMs);
  const pastCashflows = cashflows.filter((cf) => new Date(cf.date).getTime() <= todayMs);
  const nextCashflow = futureCashflows[0];

  // === DONNEES POUR L'ONGLET COTATIONS : merge theorique + observe par date ===
  const quotationsSeries = useMemo(() => {
    const map = new Map<
      string,
      { date: string; theoretical: number | null; observed: number | null }
    >();
    for (const t of theoreticalHistory) {
      map.set(t.date, {
        date: t.date,
        theoretical: t.theoreticalPrice,
        observed: null,
      });
    }
    for (const p of priceHistory) {
      const existing = map.get(p.date);
      if (existing) {
        existing.observed = p.cleanPrice;
      } else {
        map.set(p.date, { date: p.date, theoretical: null, observed: p.cleanPrice });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [theoreticalHistory, priceHistory]);

  const hasObservedPrices = priceHistory.length > 0;

  // === STRESS TEST TAUX (Risque & analytics) ===
  // Variation prix ≈ -ModDur × Δy × P + 0.5 × Convex × Δy² × P
  const stressScenarios = useMemo(() => {
    if (!marketMetrics) return [];
    const shocks = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
    return shocks.map((bp) => {
      const dy = bp / 10000;
      const linear = -marketMetrics.modified * dy * marketPrice;
      const conv = 0.5 * marketMetrics.convexity * dy * dy * marketPrice;
      const deltaPrice = linear + conv;
      const newPrice = marketPrice + deltaPrice;
      const deltaPct = deltaPrice / marketPrice;
      const newYtm = marketMetrics.ytm + dy;
      return {
        bp,
        dy,
        deltaPrice,
        deltaPct,
        newPrice,
        newYtm,
        linear,
        conv,
      };
    });
  }, [marketMetrics, marketPrice]);

  // === VARIATION DU PRIX MARCHE ===
  const marketDelta = marketPrice - bond.nominalValue;
  const marketDeltaPct = (marketDelta / bond.nominalValue) * 100;
  const marketUp = marketDelta >= 0;

  return (
    <>
      {/* ====== HERO ====== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          <div className="text-xs md:text-sm text-slate-500 mb-3">
            <Link href="/marches/obligations" className="hover:text-slate-900">
              Obligations cotées
            </Link>
            <span className="mx-2">›</span>
            <span className="text-slate-900">{bond.name}</span>
          </div>

          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            <div className="flex gap-4 items-start">
              <div className="mt-1">
                <CountryFlag country={bond.country} size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl md:text-2xl font-semibold">{bond.name}</h1>
                  {bond.code && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                      {bond.code}
                    </span>
                  )}
                  {bond.greenBond && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      🌱 Green Bond
                    </span>
                  )}
                  {bond.callable && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                      📞 Callable
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600">{bond.issuer}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {bond.issuerType} · {bond.sector} · ISIN{" "}
                  <span className="font-mono">{bond.isin}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                + Watchlist
              </button>
              <button className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                🔔 Alerte
              </button>
            </div>
          </div>

          {/* Prix de marche */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">
                {formatFCFA2(marketPrice)}
              </span>
              <span className="text-sm text-slate-500 ml-2">
                FCFA (prix pied de coupon)
              </span>
            </div>
            <div className={`font-medium ${marketUp ? "text-red-600" : "text-green-600"}`}>
              <span className="text-base md:text-lg">
                {marketUp ? "+" : ""}
                {formatFCFA2(marketDelta)}
              </span>
              <span className="text-sm ml-1">
                ({marketUp ? "+" : ""}
                {marketDeltaPct.toFixed(2).replace(".", ",")}%)
              </span>
              <span className="text-xs text-slate-400 ml-2">vs nominal</span>
            </div>
            {latestHistoricalPrice ? (
              <div className="text-xs text-slate-400">
                Date de cotation : {formatDateShort(latestHistoricalPrice.date)}
              </div>
            ) : latestTheoretical ? (
              <div className="text-xs text-slate-400">
                Prix théorique au {formatDateShort(latestTheoretical.date)} · calibré UMOA-Titres
              </div>
            ) : (
              <div className="text-xs text-slate-400">Pas de cotation récente</div>
            )}
          </div>

          {/* Onglets */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {[
              { id: "overview", label: "Vue d'ensemble" },
              { id: "quotations", label: "Pricing" },
              { id: "cashflow", label: "Échéancier & flux" },
              { id: "risk", label: "Risque & analytics" },
              { id: "simulator", label: "Simulateur" },
              { id: "characteristics", label: "Caractéristiques" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`px-3 md:px-4 py-3 whitespace-nowrap border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-blue-700 text-blue-700 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* ============================================================ */}
        {/* ONGLET VUE D'ENSEMBLE                                          */}
        {/* ============================================================ */}
        {activeTab === "overview" && (
          <>
            {marketMetrics && (
              <section>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                    Métriques de marché
                  </h2>
                  <span className="text-xs text-slate-400">
                    Basées sur le prix marché : {formatFCFA2(marketPrice)} FCFA
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                    <div className="text-xs text-blue-700 font-medium mb-1">YTM actuariel</div>
                    <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                      {(marketMetrics.ytm * 100).toFixed(2).replace(".", ",")}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Convention Act/365</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Duration modifiée</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {marketMetrics.modified.toFixed(2).replace(".", ",")}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      années · sensibilité aux taux
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Convexité</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {marketMetrics.convexity.toFixed(2).replace(".", ",")}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Courbure prix-taux</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">BPV (par titre)</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {formatFCFA2(marketMetrics.bpv)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">FCFA pour +1 bp</div>
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Coupon couru / prochain coupon */}
              {marketMetrics && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">💰 Prochain coupon</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date</span>
                      <span className="font-medium">
                        {formatDate(marketMetrics.nextCouponDate.toISOString().slice(0, 10))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Montant par titre</span>
                      <span className="font-medium">
                        {formatFCFA2(marketMetrics.periodicCoupon)} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Coupon couru</span>
                      <span className="font-medium">
                        {formatFCFA2(marketMetrics.accruedInterest)} FCFA
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Avancement</span>
                      <span>
                        {marketMetrics.daysSinceLastCoupon}/{marketMetrics.daysInPeriod} j
                        · Act/Act
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Spread signature / Prime cotation BRVM */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">
                  {isSovereign ? "📐 Prime cotation BRVM" : "📐 Spread de signature"}
                </h3>
                {signatureSpread !== null ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        signatureSpread > 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {formatPctSigned(signatureSpread, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      {isSovereign
                        ? "Écart entre le YTM coté BRVM et la courbe primaire UMOA-Titres du pays à maturité équivalente. Positif (vert) = rendement coté supérieur au primaire, l'investisseur capte une prime de liquidité ; négatif (rouge) = sous-rémunération vs primaire."
                        : "Écart de YTM vs la courbe souveraine UMOA-Titres du même pays, maturité équivalente. Positif (vert) = rendement supplémentaire perçu par l'investisseur pour le risque crédit assumé ; négatif (rouge) = rendement inférieur au souverain pour un risque pourtant supérieur."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Spread non calculable : pas de cotation BRVM observée, ou pas assez
                    d&apos;adjudications primaires comparables sur la fenêtre.
                  </p>
                )}
              </section>

              {/* Prix vs nominal */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">📊 Prix vs nominal</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Prix marché</span>
                    <span className="font-medium">{formatFCFA2(marketPrice)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal actuel</span>
                    <span className="font-medium">{formatFCFA(bond.nominalValue)} FCFA</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-500">Écart</span>
                    <span
                      className={`font-medium ${marketUp ? "text-red-700" : "text-green-700"}`}
                    >
                      {marketUp ? "+" : ""}
                      {marketDeltaPct.toFixed(2).replace(".", ",")}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    {Math.abs(marketDeltaPct) < 0.05
                      ? "Cotation au pair"
                      : marketUp
                      ? "Au-dessus du pair (above par)"
                      : "Sous le pair (below par)"}
                  </div>
                </div>
              </section>
            </div>

            {bond.description && (
              <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
                <h3 className="text-base font-medium mb-2">ℹ️ À propos de cette obligation</h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {bond.description}
                </p>
              </section>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET COTATIONS                                               */}
        {/* ============================================================ */}
        {activeTab === "quotations" && (
          <>
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-medium">📈 Historique du prix</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {hasObservedPrices
                      ? `${priceHistory.length} cotations observées + ${theoreticalHistory.length} points théoriques`
                      : `${theoreticalHistory.length} points théoriques hebdomadaires`}
                  </p>
                </div>
                <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  EXCLUSIVITÉ AZIMUT
                </span>
              </div>
              {quotationsSeries.length > 0 ? (
                <div className="h-72 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={quotationsSeries}>
                      <defs>
                        <linearGradient id="bondPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9333ea" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#9333ea" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickFormatter={(d) => formatDateShort(d as string)}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => formatFCFA(Number(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value, name) => {
                          const v = Number(value ?? 0);
                          if (!isFinite(v) || v === 0) return ["—", name];
                          if (name === "theoretical")
                            return [formatFCFA2(v) + " FCFA", "Prix théorique"];
                          if (name === "observed")
                            return [formatFCFA2(v) + " FCFA", "Prix observé"];
                          return [v, name];
                        }}
                        labelFormatter={(d) => formatDate(d as string)}
                      />
                      <ReferenceLine
                        y={bond.nominalValue}
                        stroke="#94a3b8"
                        strokeDasharray="3 3"
                        label={{
                          value: "Nominal",
                          position: "right",
                          fill: "#64748b",
                          fontSize: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="theoretical"
                        stroke="#9333ea"
                        strokeWidth={2}
                        fill="url(#bondPrice)"
                        connectNulls
                        isAnimationActive={false}
                      />
                      {hasObservedPrices && (
                        <Line
                          type="monotone"
                          dataKey="observed"
                          stroke="#0f172a"
                          strokeWidth={1.8}
                          dot={{ r: 2 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-500">
                  Aucun historique de prix disponible.
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                <strong>Méthodologie :</strong> à chaque date hebdomadaire, le prix
                théorique est calculé en actualisant les flux futurs au YTM moyen pondéré
                des émissions UMOA-Titres du même pays (OAT, 3 derniers mois), interpolé
                sur la maturité résiduelle. Les prix observés (en noir) proviennent des
                cotations BRVM.
              </div>
            </section>
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET ÉCHÉANCIER & FLUX                                       */}
        {/* ============================================================ */}
        {activeTab === "cashflow" && (
          <>
            {nextCashflow && (
              <section className="bg-blue-50 border border-blue-100 rounded-lg p-4 md:p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-blue-700 font-medium mb-1">
                      Prochain flux
                    </div>
                    <div className="text-lg md:text-xl font-semibold">
                      {formatDate(nextCashflow.date)}
                    </div>
                    <div className="text-sm text-slate-600 mt-1 capitalize">
                      {nextCashflow.type === "coupon"
                        ? "Coupon"
                        : nextCashflow.type === "amortissement"
                        ? "Amortissement"
                        : "Remboursement final"}
                      {" · "}
                      {formatFCFA2(nextCashflow.amount)} FCFA / titre
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Capital restant après :{" "}
                    <span className="font-medium">
                      {formatFCFA2(nextCashflow.outstandingAfter)} FCFA
                    </span>
                  </div>
                </div>
              </section>
            )}

            {events.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-medium">📜 Événements observés</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Coupons, amortissements et remboursements effectivement déclarés
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {events.length} événement{events.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-medium">Statut</th>
                        <th className="text-left py-2 px-2 font-medium">Date</th>
                        <th className="text-left py-2 px-2 font-medium">Type</th>
                        <th className="text-left py-2 px-2 font-medium">Description</th>
                        <th className="text-right py-2 px-2 font-medium">
                          Montant par titre
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {events
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((e, i) => {
                          const isPast = new Date(e.date).getTime() <= todayMs;
                          const badge =
                            e.eventType === "coupon" ? (
                              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                💰 Coupon
                              </span>
                            ) : e.eventType === "remboursement" ? (
                              <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                                📉 Remboursement
                              </span>
                            ) : e.eventType === "call" ? (
                              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                                📞 Call
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                                🔨 Adjudication
                              </span>
                            );
                          return (
                            <tr
                              key={i}
                              className={`border-b border-slate-100 hover:bg-slate-50 ${
                                isPast ? "opacity-60" : ""
                              }`}
                            >
                              <td className="py-2 px-2">
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    isPast
                                      ? "bg-slate-100 text-slate-500"
                                      : "bg-blue-50 text-blue-700"
                                  }`}
                                >
                                  {isPast ? "Versé" : "À venir"}
                                </span>
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {formatDate(e.date)}
                              </td>
                              <td className="py-2 px-2">{badge}</td>
                              <td className="py-2 px-2 text-slate-600">
                                {e.description || "—"}
                              </td>
                              <td className="py-2 px-2 text-right font-medium">
                                {e.amount > 0 ? formatFCFA2(e.amount) + " FCFA" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {cashflows.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h3 className="text-base font-medium">📅 Échéancier complet des flux</h3>
                  <div className="text-xs text-slate-500 flex gap-3">
                    <span>{pastCashflows.length} versés</span>
                    <span>·</span>
                    <span>{futureCashflows.length} à venir</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-medium">Statut</th>
                        <th className="text-left py-2 px-2 font-medium">Date</th>
                        <th className="text-left py-2 px-2 font-medium">Type</th>
                        <th className="text-right py-2 px-2 font-medium">
                          Montant par titre
                        </th>
                        <th className="text-right py-2 px-2 font-medium hidden md:table-cell">
                          Capital restant
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflows.map((cf, i) => {
                        const isPast = new Date(cf.date).getTime() <= todayMs;
                        return (
                          <tr
                            key={i}
                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                              isPast ? "opacity-60" : ""
                            }`}
                          >
                            <td className="py-2 px-2">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  isPast
                                    ? "bg-slate-100 text-slate-500"
                                    : "bg-blue-50 text-blue-700"
                                }`}
                              >
                                {isPast ? "Versé" : "À venir"}
                              </span>
                            </td>
                            <td className="py-2 px-2">{formatDate(cf.date)}</td>
                            <td className="py-2 px-2">
                              {cf.type === "coupon" ? (
                                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                  💰 Coupon
                                </span>
                              ) : cf.type === "amortissement" ? (
                                <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                                  📉 Amortissement
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                                  🏁 Remboursement final
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
                              {formatFCFA2(cf.amount)} FCFA
                            </td>
                            <td className="py-2 px-2 text-right hidden md:table-cell text-xs text-slate-500">
                              {formatFCFA2(cf.outstandingAfter)} FCFA
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <strong>Convention UEMOA :</strong> coupon sur capital restant dû ·
                  Act/Act ICMA pour le coupon couru · amortissement{" "}
                  {bond.amortizationType === "IF"
                    ? "in fine"
                    : bond.amortizationType === "ACD"
                    ? "constant différé"
                    : "constant"}
                  .
                </div>
              </section>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET RISQUE & ANALYTICS                                      */}
        {/* ============================================================ */}
        {activeTab === "risk" && (
          <>
            {marketMetrics ? (
              <>
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-4">
                    Sensibilité au taux d&apos;intérêt
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    <Stat
                      label="Duration Macaulay"
                      value={marketMetrics.macaulay.toFixed(2).replace(".", ",")}
                      hint="années · maturité moyenne pondérée"
                    />
                    <Stat
                      label="Duration modifiée"
                      value={marketMetrics.modified.toFixed(2).replace(".", ",")}
                      hint="−ΔP/Δy en %"
                    />
                    <Stat
                      label="Convexité"
                      value={marketMetrics.convexity.toFixed(2).replace(".", ",")}
                      hint="terme du second ordre"
                    />
                    <Stat
                      label="BPV (DV01)"
                      value={formatFCFA2(marketMetrics.bpv)}
                      hint="FCFA pour +1 bp · par titre"
                    />
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-1">
                    Stress-test taux
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Impact sur le prix pied de coupon en appliquant un choc parallèle de
                    la courbe (approximation duration + convexité).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-3 py-2 font-medium">Choc taux</th>
                          <th className="text-right px-3 py-2 font-medium">YTM résultant</th>
                          <th className="text-right px-3 py-2 font-medium">
                            Variation prix
                          </th>
                          <th className="text-right px-3 py-2 font-medium">Δ prix (%)</th>
                          <th className="text-right px-3 py-2 font-medium">Prix simulé</th>
                          <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                            Effet duration
                          </th>
                          <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                            Effet convexité
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stressScenarios.map((s) => {
                          const isCenter = s.bp === 0;
                          const sign = s.bp > 0 ? "+" : "";
                          return (
                            <tr
                              key={s.bp}
                              className={`border-b border-slate-100 ${
                                isCenter
                                  ? "bg-blue-50/50 font-medium"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-3 py-2 font-mono">
                                {sign}
                                {s.bp} bps
                              </td>
                              <td className="px-3 py-2 text-right">
                                {(s.newYtm * 100).toFixed(2).replace(".", ",")}%
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  s.deltaPrice > 0
                                    ? "text-green-700"
                                    : s.deltaPrice < 0
                                    ? "text-red-700"
                                    : "text-slate-500"
                                }`}
                              >
                                {s.deltaPrice >= 0 ? "+" : ""}
                                {formatFCFA2(s.deltaPrice)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  s.deltaPct > 0
                                    ? "text-green-700"
                                    : s.deltaPct < 0
                                    ? "text-red-700"
                                    : "text-slate-500"
                                }`}
                              >
                                {formatPctSigned(s.deltaPct, 2)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {formatFCFA2(s.newPrice)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.linear >= 0 ? "+" : ""}
                                {formatFCFA2(s.linear)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.conv >= 0 ? "+" : ""}
                                {formatFCFA2(s.conv)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                    <strong>Méthodologie :</strong> ΔP ≈ −ModDur × Δy × P + ½ × Convexité
                    × Δy² × P. Approximation valide pour des chocs modérés. Au-delà de ±200
                    bps, recalculer le prix actuariel exact.
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">
                    {isSovereign ? "Liquidité & signature" : "Risque de signature"}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">
                        {isSovereign ? "Prime cotation BRVM" : "Spread vs souverains"}
                      </div>
                      <div
                        className={`text-2xl font-semibold ${
                          signatureSpread === null
                            ? "text-slate-400"
                            : signatureSpread > 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {signatureSpread !== null
                          ? formatPctSigned(signatureSpread, 2)
                          : "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {isSovereign
                          ? `coté BRVM vs primaire ${bond.country}`
                          : `vs courbe UMOA-Titres ${bond.country}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Rating</div>
                      <div className="text-2xl font-semibold">
                        {bond.rating || "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {bond.ratingAgency || "Non noté"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Type d&apos;émetteur</div>
                      <div className="text-base font-medium mt-1">{bond.issuerType}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {bond.issuer} · {bond.country}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Métriques de risque indisponibles (obligation arrivée à échéance ou prix
                non valide).
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET SIMULATEUR                                              */}
        {/* ============================================================ */}
        {activeTab === "simulator" && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="text-base font-medium">🧮 Simulateur obligataire</h3>
              <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
                <button
                  onClick={() => setSimMode("price")}
                  className={`px-3 py-1 rounded transition ${
                    simMode === "price"
                      ? "bg-white shadow-sm font-medium"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Prix → YTM
                </button>
                <button
                  onClick={() => setSimMode("ytm")}
                  className={`px-3 py-1 rounded transition ${
                    simMode === "ytm"
                      ? "bg-white shadow-sm font-medium"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  YTM → Prix
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {simMode === "price"
                ? "Saisissez un prix pied de coupon pour calculer le YTM actuariel correspondant."
                : "Saisissez un YTM cible pour calculer le prix pied de coupon correspondant."}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {simMode === "price" ? (
                  <>
                    <label className="block text-sm text-slate-600 mb-1">
                      Prix pied de coupon (FCFA)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={simPrice}
                      onChange={(e) => setSimPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Nominal : {formatFCFA(bond.nominalValue)} FCFA · Marché :{" "}
                      {formatFCFA(marketPrice)} FCFA
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm text-slate-600 mb-1">
                      YTM cible (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={(simYtm * 100).toFixed(2)}
                      onChange={(e) => setSimYtm(Number(e.target.value) / 100)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Taux coupon :{" "}
                      {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                    </p>
                  </>
                )}
              </div>

              {simMetrics && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    {simMode === "price"
                      ? "YTM résultant"
                      : "Prix pied de coupon résultant"}
                  </label>
                  <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
                    <div className="text-2xl font-semibold text-blue-900">
                      {simMode === "price"
                        ? `${(simMetrics.ytm * 100).toFixed(3).replace(".", ",")}%`
                        : `${formatFCFA2(simMetrics.cleanPrice)} FCFA`}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {simMode === "price"
                        ? "Convention Act/365 · bissection"
                        : "Prix pied de coupon théorique"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {simMetrics && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-500 uppercase">YTM sim.</div>
                  <div className="text-sm font-medium">
                    {(simMetrics.ytm * 100).toFixed(2).replace(".", ",")}%
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-500 uppercase">Duration</div>
                  <div className="text-sm font-medium">
                    {simMetrics.modified.toFixed(2).replace(".", ",")}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-500 uppercase">Convexité</div>
                  <div className="text-sm font-medium">
                    {simMetrics.convexity.toFixed(2).replace(".", ",")}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-500 uppercase">BPV</div>
                  <div className="text-sm font-medium">{formatFCFA2(simMetrics.bpv)}</div>
                </div>
              </div>
            )}

            {simMetrics && (
              <div className="mt-4 p-3 bg-slate-50 rounded-md text-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Coupon couru</div>
                    <div className="font-medium">
                      {formatFCFA2(simMetrics.accruedInterest)} FCFA
                    </div>
                    <div className="text-xs text-slate-400">
                      {simMetrics.daysSinceLastCoupon}/{simMetrics.daysInPeriod} jours · Act/Act
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix pied de coupon</div>
                    <div className="font-medium">
                      {formatFCFA2(simMetrics.cleanPrice)} FCFA
                    </div>
                    <div className="text-xs text-slate-400">prix marché théorique</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix coupon couru</div>
                    <div className="font-semibold text-blue-900">
                      {formatFCFA2(simMetrics.dirtyPrice)} FCFA
                    </div>
                    <div className="text-xs text-slate-400">prix réel payé</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* ONGLET CARACTÉRISTIQUES                                        */}
        {/* ============================================================ */}
        {activeTab === "characteristics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 lg:col-span-2">
              <h3 className="text-base font-medium mb-4">📋 Fiche signalétique</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Row label="ISIN" value={bond.isin} mono />
                <Row label="Code BRVM" value={bond.code || "—"} />
                <Row label="Émetteur" value={bond.issuer} />
                <Row label="Type" value={bond.issuerType} />
                <Row label="Secteur" value={bond.sector} />
                <Row label="Pays" value={bond.country} />

                <SectionTitle>Caractéristiques financières</SectionTitle>

                <Row
                  label="Nominal actuel"
                  value={formatFCFA(bond.nominalValue) + " FCFA"}
                />
                <Row
                  label="Taux coupon"
                  value={(bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"}
                />
                <Row
                  label="Fréquence"
                  value={
                    bond.couponFrequency === 1
                      ? "Annuelle"
                      : bond.couponFrequency === 2
                      ? "Semestrielle"
                      : "Trimestrielle"
                  }
                />
                <Row
                  label="Type d'amortissement"
                  value={
                    bond.amortizationType === "IF"
                      ? "In Fine"
                      : bond.amortizationType === "ACD"
                      ? "Constant différé"
                      : "Constant"
                  }
                />

                <SectionTitle>Calendrier</SectionTitle>

                <Row label="Date d'émission" value={formatDate(bond.issueDate)} />
                {bond.firstAmortizationDate && (
                  <Row
                    label="1er amortissement"
                    value={formatDate(bond.firstAmortizationDate)}
                  />
                )}
                <Row label="Date d'échéance" value={formatDate(bond.maturityDate)} />
                <Row
                  label="Durée résiduelle"
                  value={bond.yearsToMaturity.toFixed(1).replace(".", ",") + " ans"}
                />

                <SectionTitle>Volume & rating</SectionTitle>

                <Row label="Montant émis" value={formatBigFCFA(bond.totalIssued)} />
                <Row label="Encours" value={formatBigFCFA(bond.outstanding)} />
                {bond.rating && (
                  <Row
                    label="Rating"
                    value={`${bond.rating} (${bond.ratingAgency || "agence non précisée"})`}
                  />
                )}
                {bond.callable && bond.callDate && (
                  <Row label="Date d'appel" value={formatDate(bond.callDate)} />
                )}
              </dl>
            </section>

            <div className="space-y-4 md:space-y-6">
              {similarBonds.length > 0 && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">🔀 Obligations similaires</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Même pays, durée résiduelle proche
                  </p>
                  <div className="space-y-2">
                    {similarBonds.map((b) => (
                      <Link
                        key={b.isin}
                        href={`/obligation/${b.isin}`}
                        className="block p-2.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition"
                      >
                        <div className="text-sm font-medium truncate">{b.name}</div>
                        <div className="text-xs text-slate-500 flex justify-between mt-0.5">
                          <span>
                            {(b.couponRate * 100).toFixed(2).replace(".", ",")}% ·{" "}
                            {b.yearsToMaturity.toFixed(1).replace(".", ",")} ans
                          </span>
                          <span className="font-mono">{b.isin}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {bond.description && (
                <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-2">ℹ️ Description</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {bond.description}
                  </p>
                </section>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 leading-relaxed pt-2">
          Les informations affichées sont indicatives et ne constituent pas un conseil en
          investissement. Les calculs utilisent Act/365 pour le YTM et Act/Act ICMA pour
          le coupon couru (convention UEMOA).
        </div>

        <div className="pt-2">
          <Link
            href="/marches/obligations"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la liste des obligations cotées
          </Link>
        </div>
      </main>
    </>
  );
}

// ===== sous-composants =====

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-slate-50/50 rounded-md border border-slate-100 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl md:text-2xl font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:col-span-2 pt-3 mt-1 border-t border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 font-medium">
      {children}
    </div>
  );
}
