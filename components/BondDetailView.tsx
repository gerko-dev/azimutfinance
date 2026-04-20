"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  });
}

function formatDateShort(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
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
  const couponAmount = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;

  let dirtyPrice = 0;
  for (let i = 0; i < futureDates.length; i++) {
    const daysFromNow =
      (futureDates[i].getTime() - operationDate.getTime()) / (24 * 60 * 60 * 1000);
    const years = daysFromNow / 365;
    const df = Math.pow(1 + ytm, -years);
    const cashflow =
      i === futureDates.length - 1 ? couponAmount + bond.nominalValue : couponAmount;
    dirtyPrice += cashflow * df;
  }

  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate = pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;
  const daysSinceLastCoupon =
    (operationDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000);
  const accruedInterest = (bond.nominalValue * bond.couponRate * daysSinceLastCoupon) / 365;

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
  const monthsPerPeriod = 12 / bond.couponFrequency;
  const couponDates: Date[] = [];
  const maturityDate = new Date(bond.maturityDate);
  const cur = new Date(maturityDate);
  while (cur.getTime() > issueDate.getTime()) {
    couponDates.unshift(new Date(cur));
    cur.setUTCMonth(cur.getUTCMonth() - monthsPerPeriod);
  }
  const pastDates = couponDates.filter((d) => d.getTime() <= operationDate.getTime());
  const previousCouponDate =
    pastDates.length > 0 ? pastDates[pastDates.length - 1] : issueDate;
  const daysSinceLastCoupon =
    (operationDate.getTime() - previousCouponDate.getTime()) / (24 * 60 * 60 * 1000);
  const annualCoupon = bond.nominalValue * bond.couponRate;
  const accruedInterest = (annualCoupon * daysSinceLastCoupon) / 365;
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
    daysSinceLastCoupon: Math.round(daysSinceLastCoupon),
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

export default function BondDetailView({
  bond,
  priceHistory,
  similarBonds,
  theoreticalHistory,
  signatureSpread,
}: Props) {
  // === PRIX DE MARCHE (fixe) ===
  const latestHistoricalPrice =
    priceHistory.length > 0
      ? priceHistory.reduce((latest, p) =>
          new Date(p.date) > new Date(latest.date) ? p : latest
        )
      : null;

  // Si pas de cotation marche, on utilise le dernier prix theorique
  const latestTheoretical =
    theoreticalHistory.length > 0
      ? theoreticalHistory[theoreticalHistory.length - 1]
      : null;

  const marketPrice =
    latestHistoricalPrice?.cleanPrice ||
    latestTheoretical?.theoreticalPrice ||
    bond.nominalValue;

  // === DATE OPERATION ===
  const operationDate = useMemo(() => new Date(), []);

  // === METRIQUES MARCHE (fixes, basees sur le dernier prix) ===
  const marketMetrics = useMemo(
    () => computeMetrics(bond, operationDate, marketPrice),
    [bond, operationDate, marketPrice]
  );

  // === ETATS DU SIMULATEUR (INDEPENDANTS du marche) ===
  const [simPrice, setSimPrice] = useState<number>(marketPrice);
  const [simYtm, setSimYtm] = useState<number>(bond.couponRate);
  const [simMode, setSimMode] = useState<"price" | "ytm">("price");

  // === METRIQUES SIMULATEUR (dependantes du mode) ===
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

  // === VARIATION DU PRIX MARCHE ===
  const marketDelta = marketPrice - bond.nominalValue;
  const marketDeltaPct = (marketDelta / bond.nominalValue) * 100;
  const marketUp = marketDelta >= 0;

  return (
    <>
      {/* ====== HERO ====== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5">
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

          {/* Prix de marche FIXE */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7">
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
                Dernière cotation : {formatDateShort(latestHistoricalPrice.date)}
              </div>
            ) : latestTheoretical ? (
              <div className="text-xs text-slate-400">
                Prix théorique au {formatDateShort(latestTheoretical.date)} · calibré UMOA-Titres
              </div>
            ) : (
              <div className="text-xs text-slate-400">Pas de cotation récente</div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* ====== KPIS MARCHE ====== */}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ====== COLONNE PRINCIPALE ====== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Graphique du prix theorique */}
            {theoreticalHistory.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-medium">
                      📈 Évolution du prix théorique
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Calibré sur la courbe UMOA-Titres (
                      {theoreticalHistory.length} points hebdomadaires)
                    </p>
                  </div>
                  <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    EXCLUSIVITÉ AZIMUT
                  </span>
                </div>
                <div className="h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={theoreticalHistory}>
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
                        tickFormatter={(d) => formatDateShort(d)}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => formatFCFA(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value, name) => {
                          if (name === "theoreticalPrice") {
                            return [
                              formatFCFA2(Number(value ?? 0)) + " FCFA",
                              "Prix théorique",
                            ];
                          }
                          return [value, name];
                        }}
                        labelFormatter={(d) => formatDate(d as string)}
                      />
                      <Area
                        type="monotone"
                        dataKey="theoreticalPrice"
                        stroke="#9333ea"
                        strokeWidth={2}
                        fill="url(#bondPrice)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                  <strong>Méthodologie :</strong> à chaque date hebdomadaire, le prix
                  théorique est calculé en actualisant les flux futurs au YTM moyen pondéré
                  des émissions UMOA-Titres du même pays (OAT, 3 derniers mois), interpolé
                  sur la maturité résiduelle.
                </div>
              </section>
            )}

            {/* Simulateur bi-directionnel */}
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
                        {simMetrics.daysSinceLastCoupon} jours · Act/365
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
                      <div className="text-xs text-slate-500 mb-0.5">
                        Prix coupon couru
                      </div>
                      <div className="font-semibold text-blue-900">
                        {formatFCFA2(simMetrics.dirtyPrice)} FCFA
                      </div>
                      <div className="text-xs text-slate-400">prix réel payé</div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Echeancier des flux */}
            {cashflows.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">📅 Échéancier des flux</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
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
                      {cashflows.map((cf, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
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
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <strong>Convention UEMOA :</strong> le coupon est calculé sur le{" "}
                  <em>capital restant dû</em>. L&apos;amortissement est{" "}
                  {bond.amortizationType === "IF"
                    ? "in fine (remboursement total à l'échéance)"
                    : bond.amortizationType === "ACD"
                    ? "constant avec différé"
                    : "constant"}
                  .
                </div>
              </section>
            )}
          </div>

          {/* ====== COLONNE DROITE ====== */}
          <div className="space-y-6">
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-medium mb-4">📋 Caractéristiques</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">ISIN</dt>
                  <dd className="font-mono text-xs">{bond.isin}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Code</dt>
                  <dd className="font-medium">{bond.code || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Émetteur</dt>
                  <dd className="font-medium text-right">{bond.issuer}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="font-medium">{bond.issuerType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Secteur</dt>
                  <dd className="font-medium">{bond.sector}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Pays</dt>
                  <dd className="font-medium">{bond.country}</dd>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between">
                  <dt className="text-slate-500">Nominal actuel</dt>
                  <dd className="font-medium">{formatFCFA(bond.nominalValue)} FCFA</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Taux coupon</dt>
                  <dd className="font-medium">
                    {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Fréquence</dt>
                  <dd className="font-medium">
                    {bond.couponFrequency === 1
                      ? "Annuelle"
                      : bond.couponFrequency === 2
                      ? "Semestrielle"
                      : "Trimestrielle"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Amortissement</dt>
                  <dd className="font-medium">
                    {bond.amortizationType === "IF"
                      ? "In Fine"
                      : bond.amortizationType === "ACD"
                      ? "Constant différé"
                      : "Constant"}
                  </dd>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between">
                  <dt className="text-slate-500">Date émission</dt>
                  <dd className="font-medium text-xs">{formatDate(bond.issueDate)}</dd>
                </div>
                {bond.firstAmortizationDate && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">1er amortissement</dt>
                    <dd className="font-medium text-xs">
                      {formatDate(bond.firstAmortizationDate)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Date échéance</dt>
                  <dd className="font-medium text-xs">{formatDate(bond.maturityDate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Durée résiduelle</dt>
                  <dd className="font-medium">
                    {bond.yearsToMaturity.toFixed(1).replace(".", ",")} ans
                  </dd>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between">
                  <dt className="text-slate-500">Montant émis</dt>
                  <dd className="font-medium text-xs">{formatBigFCFA(bond.totalIssued)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Encours</dt>
                  <dd className="font-medium text-xs">{formatBigFCFA(bond.outstanding)}</dd>
                </div>
                {signatureSpread !== null && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Spread de signature</dt>
                    <dd className="font-medium">
                      <span
                        className={
                          signatureSpread > 0 ? "text-amber-700" : "text-green-700"
                        }
                      >
                        {signatureSpread >= 0 ? "+" : ""}
                        {(signatureSpread * 100).toFixed(2).replace(".", ",")}%
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        vs UMOA-Titres
                      </span>
                    </dd>
                  </div>
                )}
                {bond.rating && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Rating</dt>
                    <dd className="font-medium">
                      {bond.rating}{" "}
                      <span className="text-xs text-slate-400">({bond.ratingAgency})</span>
                    </dd>
                  </div>
                )}
                {bond.callable && bond.callDate && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Date appel</dt>
                    <dd className="font-medium text-xs">{formatDate(bond.callDate)}</dd>
                  </div>
                )}
              </dl>
            </section>

            {similarBonds.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">🔀 Obligations similaires</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Même pays, durée similaire
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

            <div className="text-xs text-slate-400 leading-relaxed">
              Les informations affichées sont indicatives et ne constituent pas un conseil en
              investissement. Les calculs (YTM, duration, convexité) utilisent la convention
              Act/365. Vérifiez les caractéristiques auprès de sources officielles avant toute
              décision.
            </div>
          </div>
        </div>

        <div className="pt-4">
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