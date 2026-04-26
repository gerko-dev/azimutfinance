"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  Line,
  LineChart,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SovereignBond } from "@/lib/listedBondsTypes";
import {
  getSovereignCashflows,
  calculateSovereignActuarialMetrics,
} from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(millions: number): string {
  // Les montants UMOA-Titres sont stockes en MILLIONS de FCFA
  const fcfa = millions * 1_000_000;
  if (fcfa >= 1e12) return (fcfa / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (fcfa >= 1e9) return (fcfa / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (fcfa >= 1e6) return (fcfa / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(fcfa) + " FCFA";
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

function formatMaturity(years: number): string {
  if (years < 1) {
    const months = Math.round(years * 12);
    return `${months} mois`;
  }
  return `${years.toFixed(1).replace(".", ",")} ans`;
}

function residualMaturityYears(maturityDate: string): number {
  const mat = new Date(maturityDate).getTime();
  const now = Date.now();
  if (mat <= now) return 0;
  return (mat - now) / (365.25 * 24 * 60 * 60 * 1000);
}

type Props = {
  bond: SovereignBond;
  spread: number | null;
  related: SovereignBond[];
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  interCountrySpreads: Array<{
    country: string;
    ytm: number;
    spread: number;
    isTarget: boolean;
  }>;
};

type Tab =
  | "overview"
  | "pricing"
  | "adjudications"
  | "cashflow"
  | "risk"
  | "characteristics";

export default function SovereignDetailView({
  bond,
  spread,
  related,
  theoreticalHistory,
  interCountrySpreads,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const last = bond.adjudications[bond.adjudications.length - 1];
  const first = bond.adjudications[0];
  const residual = residualMaturityYears(bond.maturityDate);
  const isExpired = residual <= 0;

  // Date "aujourd'hui" stabilisee au montage du composant (eviter Date.now()
  // pendant le render — recommandation react-hooks/purity).
  const [now] = useState(() => new Date());
  const todayMs = now.getTime();

  // === ECHEANCIER & METRIQUES ACTUARIELLES ===
  const cashflows = useMemo(() => getSovereignCashflows(bond), [bond]);
  const futureCashflows = useMemo(
    () => cashflows.filter((cf) => new Date(cf.date).getTime() > todayMs),
    [cashflows, todayMs]
  );
  const pastCashflowsCount = cashflows.length - futureCashflows.length;
  const nextCashflow = futureCashflows[0];

  // Metriques pour le YTM "marche" = lastYield (rendement du dernier round cash)
  const marketMetrics = useMemo(() => {
    if (isExpired) return null;
    return calculateSovereignActuarialMetrics(bond, now, bond.lastYield);
  }, [bond, isExpired, now]);

  // Stress-test taux : impact ΔP ≈ −ModDur × Δy × P + ½ × Conv × Δy² × P
  const stressScenarios = useMemo(() => {
    if (!marketMetrics) return [];
    const shocks = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
    const P = marketMetrics.cleanPrice;
    return shocks.map((bp) => {
      const dy = bp / 10000;
      const linear = -marketMetrics.modified * dy * P;
      const conv = 0.5 * marketMetrics.convexity * dy * dy * P;
      const deltaPrice = linear + conv;
      return {
        bp,
        deltaPrice,
        deltaPct: deltaPrice / P,
        newPrice: P + deltaPrice,
        newYtm: bond.lastYield + dy,
        linear,
        conv,
      };
    });
  }, [marketMetrics, bond.lastYield]);

  // === DONNEES POUR L'ONGLET PRICING ===
  // Series : prix theorique continu + points d'adjudication (prix moyen pondere
  // converti a partir du yield si pas de prix observe).
  const pricingSeries = useMemo(() => {
    type Point = {
      date: string;
      theoretical: number | null;
      adjudicated: number | null;
    };
    const map = new Map<string, Point>();
    for (const t of theoreticalHistory) {
      map.set(t.date, { date: t.date, theoretical: t.theoreticalPrice, adjudicated: null });
    }
    for (const a of bond.adjudications) {
      // Prix moyen pondere si dispo, sinon prix marginal.
      const adjudicatedPrice =
        a.weightedAvgPrice ?? a.marginalPrice ?? null;
      if (adjudicatedPrice == null) continue;
      const existing = map.get(a.valueDate);
      if (existing) existing.adjudicated = adjudicatedPrice;
      else
        map.set(a.valueDate, {
          date: a.valueDate,
          theoretical: null,
          adjudicated: adjudicatedPrice,
        });
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [theoreticalHistory, bond.adjudications]);

  // Adjudications triees chronologiquement, avec un index humain (Round 1, 2, ...)
  const orderedAdjudications = useMemo(() => {
    return bond.adjudications
      .slice()
      .sort((a, b) => a.valueDate.localeCompare(b.valueDate))
      .map((a, i) => ({ ...a, roundIndex: i + 1 }));
  }, [bond.adjudications]);

  // Donnees pour le mini-chart d'evolution du yield par round
  const roundsChartData = useMemo(() => {
    return orderedAdjudications.map((a) => ({
      round: `R${a.roundIndex}`,
      date: a.valueDate,
      yield: a.yield * 100,
      coupon: bond.couponRate ? bond.couponRate * 100 : null,
    }));
  }, [orderedAdjudications, bond.couponRate]);

  const cashCoverage =
    bond.cashAmount > 0 ? bond.cashSubmitted / bond.cashAmount : 0;

  // Variation par rapport au premier round (si multi-rounds)
  const yieldEvolution = useMemo(() => {
    if (orderedAdjudications.length < 2) return null;
    const firstY = orderedAdjudications[0].yield;
    const lastY = orderedAdjudications[orderedAdjudications.length - 1].yield;
    return { delta: lastY - firstY, firstY, lastY };
  }, [orderedAdjudications]);

  return (
    <>
      {/* ====== HERO ====== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          <div className="text-xs md:text-sm text-slate-500 mb-3">
            <Link href="/marches/souverains-non-cotes" className="hover:text-slate-900">
              Souverains non cotés
            </Link>
            <span className="mx-2">›</span>
            <span className="text-slate-900">
              {bond.type} {bond.country} {formatMaturity(bond.maturity)}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            <div className="flex gap-4 items-start">
              <div className="mt-1">
                <CountryFlag country={bond.country} size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl md:text-2xl font-semibold">
                    {bond.type} {bond.countryName} · {formatMaturity(bond.maturity)}
                  </h1>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      bond.type === "OAT"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {bond.type}
                  </span>
                  {bond.nbRounds > 1 && (
                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-medium">
                      ×{bond.nbRounds} rounds
                    </span>
                  )}
                  {isExpired && (
                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded font-medium">
                      Échue
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  Trésor de {bond.countryName} · UMOA-Titres
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  ISIN <span className="font-mono">{bond.isin || "—"}</span>
                  {bond.amortizationType && ` · ${bond.amortizationType}`}
                  {bond.graceYears > 0 && ` · différé ${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
          </div>

          {/* Yield + montant cumule */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">
                {(bond.lastYield * 100).toFixed(2).replace(".", ",")}%
              </span>
              <span className="text-sm text-slate-500 ml-2">
                rendement dernier round
              </span>
            </div>
            {bond.couponRate != null && (
              <div className="text-sm text-slate-600">
                Coupon nominal :{" "}
                <span className="font-medium text-slate-900">
                  {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                </span>
              </div>
            )}
            <div className="text-xs text-slate-400">
              Dernière adjudication : {formatDateShort(bond.lastIssueDate)}
              {!isExpired && (
                <>
                  {" · "}échéance {formatDateShort(bond.maturityDate)}
                  {" · "}résiduelle {formatMaturity(residual)}
                </>
              )}
            </div>
          </div>

          {/* Onglets */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {[
              { id: "overview", label: "Vue d'ensemble" },
              { id: "pricing", label: "Pricing" },
              { id: "adjudications", label: `Adjudications (${bond.nbRounds})` },
              { id: "cashflow", label: "Échéancier & flux" },
              { id: "risk", label: "Risque & analytics" },
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
            {/* Métriques clés */}
            <section>
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
                Métriques clés
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                  <div className="text-xs text-blue-700 font-medium mb-1">
                    Rendement dernier round
                  </div>
                  <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                    {(bond.lastYield * 100).toFixed(2).replace(".", ",")}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Rendement moyen pondéré · {formatDateShort(bond.lastIssueDate)}
                  </div>
                </div>
                {bond.couponRate != null ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Coupon nominal</div>
                    <div className="text-2xl md:text-3xl font-semibold">
                      {(bond.couponRate * 100).toFixed(2).replace(".", ",")}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Annuel · {bond.amortizationType || "—"}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="text-xs text-slate-500 mb-1">Type</div>
                    <div className="text-2xl md:text-3xl font-semibold">Zéro-coupon</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Bon assimilable du Trésor (BAT)
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500 mb-1">Cash levé cumulé</div>
                  <div className="text-2xl md:text-3xl font-semibold">
                    {formatBigFCFA(bond.cashAmount)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Encours estimé :{" "}
                    <span className="font-medium text-slate-700">
                      {formatBigFCFA(bond.outstandingEstimate)}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500 mb-1">Couverture moyenne</div>
                  <div className="text-2xl md:text-3xl font-semibold">
                    {cashCoverage > 0 ? cashCoverage.toFixed(2).replace(".", ",") + "×" : "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Cash auctions uniquement
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Dernière adjudication */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">🔔 Dernière adjudication</h3>
                {last ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date opération</span>
                      <span className="font-medium">{formatDate(last.tradeDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date de valeur</span>
                      <span className="font-medium">{formatDate(last.valueDate)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Rendement moyen pondéré</span>
                      <span className="font-medium">
                        {(last.yield * 100).toFixed(2).replace(".", ",")}%
                      </span>
                    </div>
                    {last.marginalYield != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Taux marginal</span>
                        <span className="font-medium">
                          {(last.marginalYield * 100).toFixed(2).replace(".", ",")}%
                        </span>
                      </div>
                    )}
                    {last.weightedAvgPrice != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Prix moyen pondéré</span>
                        <span className="font-medium">
                          {formatFCFA(last.weightedAvgPrice)} FCFA
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Montant retenu</span>
                      <span className="font-medium">{formatBigFCFA(last.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Couverture</span>
                      <span className="font-medium">
                        {last.coverage.toFixed(2).replace(".", ",")}×
                      </span>
                    </div>
                    {last.precisions && (
                      <div className="text-xs text-slate-400 pt-2 italic">
                        {last.precisions}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Aucune adjudication disponible.
                  </p>
                )}
              </section>

              {/* Spread vs courbe pays */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">📐 Prime de pricing du round</h3>
                {spread !== null ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        spread > 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {formatPctSigned(spread, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Écart entre le rendement du dernier round et la courbe primaire
                      UMOA-Titres {bond.country} interpolée à la maturité résiduelle
                      ({formatMaturity(residual)}). Positif (vert) = ce round s&apos;est
                      négocié au-dessus de la courbe ; négatif (rouge) = sous la
                      courbe (signal de demande forte ou pricing serré).
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Spread non calculable (titre échu ou pas assez d&apos;adjudications
                    primaires comparables).
                  </p>
                )}
              </section>

              {/* Évolution des rounds */}
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">📊 Évolution sur les rounds</h3>
                {yieldEvolution ? (
                  <>
                    <div
                      className={`text-2xl md:text-3xl font-semibold ${
                        yieldEvolution.delta > 0
                          ? "text-amber-700"
                          : "text-green-700"
                      }`}
                    >
                      {formatPctSigned(yieldEvolution.delta, 2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Variation du rendement entre le 1er round
                      ({(yieldEvolution.firstY * 100).toFixed(2).replace(".", ",")}%) et
                      le dernier
                      ({(yieldEvolution.lastY * 100).toFixed(2).replace(".", ",")}%).
                      Une dérive positive indique une signature qui s&apos;est tendue
                      au fil des ré-abondements.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Émission unique, pas de comparaison entre rounds.
                  </p>
                )}
              </section>
            </div>

            {/* Identification synthétique */}
            <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 p-4 md:p-6">
              <h3 className="text-base font-medium mb-2">ℹ️ À propos de ce titre</h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {bond.type === "OAT" ? (
                  <>
                    Obligation Assimilable du Trésor émise par l&apos;État de{" "}
                    {bond.countryName} via le marché primaire UMOA-Titres. Coupon{" "}
                    {bond.couponRate != null
                      ? (bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"
                      : "—"}
                    , amortissement {bond.amortizationType || "—"}
                    {bond.graceYears > 0 ? `, différé ${bond.graceYears} ans` : ""}.
                    Émise le {formatDate(bond.firstIssueDate)}, échéance{" "}
                    {formatDate(bond.maturityDate)}.{" "}
                    {describeRoundActivity(bond)}
                  </>
                ) : (
                  <>
                    Bon Assimilable du Trésor (zéro-coupon) émis par l&apos;État
                    de {bond.countryName} via UMOA-Titres. Émission le{" "}
                    {formatDate(bond.firstIssueDate)}, remboursement à
                    l&apos;échéance le {formatDate(bond.maturityDate)}.{" "}
                    {describeRoundActivity(bond)}
                  </>
                )}
              </p>
            </section>
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET PRICING                                                 */}
        {/* ============================================================ */}
        {activeTab === "pricing" && (
          <>
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-medium">📈 Prix théorique</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {theoreticalHistory.length} points hebdomadaires + {
                      bond.adjudications.filter(
                        (a) => a.weightedAvgPrice != null || a.marginalPrice != null
                      ).length
                    } prix d&apos;adjudication observés
                  </p>
                </div>
                <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  EXCLUSIVITÉ AZIMUT
                </span>
              </div>
              {pricingSeries.length > 0 ? (
                <div className="h-72 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pricingSeries}>
                      <defs>
                        <linearGradient id="sovPrice" x1="0" y1="0" x2="0" y2="1">
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
                          if (!isFinite(v) || v === 0) return ["—", String(name ?? "")];
                          if (name === "theoretical")
                            return [formatFCFA(v) + " FCFA", "Prix théorique"];
                          if (name === "adjudicated")
                            return [formatFCFA(v) + " FCFA", "Prix adjudication"];
                          return [String(value ?? "—"), String(name ?? "")];
                        }}
                        labelFormatter={(d) => formatDate(d as string)}
                      />
                      <ReferenceLine
                        y={bond.nominalValue}
                        stroke="#94a3b8"
                        strokeDasharray="3 3"
                        label={{
                          value: "Pair",
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
                        fill="url(#sovPrice)"
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Scatter
                        dataKey="adjudicated"
                        fill="#0f172a"
                        shape="circle"
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-slate-500">
                  Pas de série de prix disponible (titre échu ou pas de calibration).
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                <strong>Méthodologie :</strong> à chaque date hebdomadaire, le prix
                théorique pied de coupon est calculé en actualisant les flux futurs au
                YTM moyen pondéré des adjudications cash UMOA-Titres du même pays sur
                les 3 derniers mois, interpolé sur la maturité résiduelle. Les points
                noirs sont les prix moyens pondérés effectivement enregistrés à chaque
                round d&apos;adjudication. Pas de cotation secondaire pour ce titre :
                il n&apos;est pas listé sur la BRVM.
              </div>
            </section>

            {marketMetrics && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">
                  💰 Prix actuariel au YTM marché
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Prix calculé en actualisant l&apos;échéancier complet au taux du
                  dernier round cash ({(bond.lastYield * 100).toFixed(2).replace(".", ",")}%).
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix pied de coupon</div>
                    <div className="text-2xl font-semibold">
                      {formatFCFA(marketMetrics.cleanPrice)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA / titre</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Coupon couru</div>
                    <div className="text-2xl font-semibold">
                      {formatFCFA(marketMetrics.accruedInterest)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA / titre</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Prix coupon couru</div>
                    <div className="text-2xl font-semibold text-blue-900">
                      {formatFCFA(marketMetrics.dirtyPrice)}
                    </div>
                    <div className="text-xs text-slate-400">FCFA réel / titre</div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET ADJUDICATIONS                                           */}
        {/* ============================================================ */}
        {activeTab === "adjudications" && (
          <>
            {orderedAdjudications.length > 1 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-medium">
                      📈 Évolution du rendement par round
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rendement moyen pondéré à chaque adjudication.
                      {bond.couponRate != null &&
                        " Trait pointillé = coupon nominal."}
                    </p>
                  </div>
                </div>
                <div className="h-56 md:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roundsChartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="round"
                        stroke="#94a3b8"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        unit="%"
                        domain={[
                          (dataMin: number) => Math.max(0, Math.floor(dataMin - 0.5)),
                          (dataMax: number) => Math.ceil(dataMax + 0.5),
                        ]}
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
                          if (name === "yield")
                            return [v.toFixed(2).replace(".", ",") + "%", "Rendement"];
                          if (name === "coupon")
                            return [
                              v.toFixed(2).replace(".", ",") + "%",
                              "Coupon nominal",
                            ];
                          return [String(value ?? "—"), String(name ?? "")];
                        }}
                        labelFormatter={(round, payload) => {
                          const d = payload?.[0]?.payload?.date as string;
                          return `${round} · ${formatDate(d)}`;
                        }}
                      />
                      {bond.couponRate != null && (
                        <ReferenceLine
                          y={bond.couponRate * 100}
                          stroke="#94a3b8"
                          strokeDasharray="3 3"
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="yield"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#2563eb" }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <h3 className="text-base font-medium">
                    📜 Historique des adjudications
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chaque ligne = un round (initial ou ré-abondement)
                  </p>
                </div>
                <div className="text-xs text-slate-500 flex gap-3">
                  <span>{bond.nbRounds} round{bond.nbRounds > 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>Cumul : {formatBigFCFA(bond.totalAmount)}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-2 py-2 font-medium">#</th>
                      <th className="text-left px-2 py-2 font-medium">Date opération</th>
                      <th className="text-left px-2 py-2 font-medium hidden md:table-cell">
                        Date valeur
                      </th>
                      <th className="text-left px-2 py-2 font-medium">Nature</th>
                      <th className="text-left px-2 py-2 font-medium hidden lg:table-cell">
                        Type
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Rendement
                      </th>
                      <th className="text-right px-2 py-2 font-medium hidden md:table-cell">
                        Taux marginal
                      </th>
                      <th className="text-right px-2 py-2 font-medium hidden lg:table-cell">
                        Prix moyen
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Soumis
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Retenu
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Couverture
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedAdjudications.map((a) => (
                      <tr
                        key={`${a.valueDate}-${a.roundIndex}`}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-2 py-2 text-xs">
                          <span className="text-slate-500">R</span>
                          {a.roundIndex}
                          {a.roundIndex === 1 && (
                            <span className="ml-1 text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded">
                              initial
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateShort(a.tradeDate)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap hidden md:table-cell">
                          {formatDateShort(a.valueDate)}
                        </td>
                        <td className="px-2 py-2">
                          {a.kind === "cash_auction" ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              Cash
                            </span>
                          ) : a.kind === "swap" ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"
                              title="Échange / Rachat simultané — pas de cash neuf"
                            >
                              Swap
                            </span>
                          ) : (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                              title="Rachat — sortie de dette"
                            >
                              Rachat
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs hidden lg:table-cell text-slate-600">
                          {a.precisions || "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {(a.yield * 100).toFixed(2).replace(".", ",")}%
                        </td>
                        <td className="px-2 py-2 text-right hidden md:table-cell">
                          {a.marginalYield != null
                            ? (a.marginalYield * 100).toFixed(2).replace(".", ",") + "%"
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right hidden lg:table-cell">
                          {a.weightedAvgPrice != null
                            ? formatFCFA(a.weightedAvgPrice)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right text-xs">
                          {formatBigFCFA(a.amountSubmitted)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-medium">
                          {formatBigFCFA(a.amount)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              a.coverage >= 1.5
                                ? "bg-green-50 text-green-700"
                                : a.coverage >= 1
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {a.coverage.toFixed(2).replace(".", ",")}×
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed space-y-1">
                <div>
                  <strong>Couverture</strong> = montant soumis / montant retenu. Au-dessus
                  de 1× = sur-souscription. <strong>Taux marginal</strong> = taux le plus
                  élevé accepté à l&apos;adjudication ; <strong>Rendement moyen
                  pondéré</strong> = moyenne pondérée par les montants alloués.
                </div>
                <div>
                  <strong>Nature</strong> :{" "}
                  <span className="text-blue-700">Cash</span> = adjudication compétitive
                  avec entrée de cash neuf · <span className="text-amber-700">Swap</span> =
                  échange ou rachat simultané (pas de cash, rendement mécanique non
                  comparable au marché) · <span className="text-slate-600">Rachat</span> =
                  sortie de dette. Seuls les rounds <strong>Cash</strong> entrent dans le
                  KPI &quot;Cash levé cumulé&quot; et dans la calibration de la courbe
                  des taux pays.
                </div>
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
                      {formatFCFA(nextCashflow.amount)} FCFA / titre
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Capital restant après :{" "}
                    <span className="font-medium">
                      {formatFCFA(nextCashflow.outstandingAfter)} FCFA
                    </span>
                  </div>
                </div>
              </section>
            )}

            {cashflows.length > 0 ? (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <h3 className="text-base font-medium">📅 Échéancier complet des flux</h3>
                  <div className="text-xs text-slate-500 flex gap-3">
                    <span>{pastCashflowsCount} versés</span>
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
                              {formatFCFA(cf.amount)} FCFA
                            </td>
                            <td className="py-2 px-2 text-right hidden md:table-cell text-xs text-slate-500">
                              {formatFCFA(cf.outstandingAfter)} FCFA
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <strong>Convention UMOA-Titres :</strong> coupon annuel sur capital
                  restant dû ·{" "}
                  {bond.amortizationType === "Linéaire"
                    ? "amortissement linéaire constant"
                    : bond.amortizationType === "In Fine"
                    ? "remboursement bullet à l'échéance (in fine)"
                    : "BAT zéro-coupon — remboursement au pair à l'échéance"}
                  {bond.graceYears > 0
                    ? ` · différé d'amortissement de ${bond.graceYears} an${
                        bond.graceYears > 1 ? "s" : ""
                      }`
                    : ""}
                  . Échéancier généré sur la base du nominal de référence{" "}
                  {formatFCFA(bond.nominalValue)} FCFA.
                </div>
              </section>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Aucun flux n&apos;a pu être généré (données incomplètes).
              </div>
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
                  <p className="text-xs text-slate-500 mb-4">
                    Calculé au YTM marché ={" "}
                    {(bond.lastYield * 100).toFixed(2).replace(".", ",")}% (dernier round
                    cash) · prix pied de coupon{" "}
                    {formatFCFA(marketMetrics.cleanPrice)} FCFA.
                  </p>
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
                      value={formatFCFA(marketMetrics.bpv)}
                      hint="FCFA pour +1 bp · par titre"
                    />
                  </div>
                </section>

                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-1">Stress-test taux</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Impact sur le prix pied de coupon en appliquant un choc parallèle de
                    la courbe (approximation duration + convexité).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-3 py-2 font-medium">Choc</th>
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
                                {formatFCFA(s.deltaPrice)}
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
                                {formatFCFA(s.newPrice)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.linear >= 0 ? "+" : ""}
                                {formatFCFA(s.linear)}
                              </td>
                              <td className="px-3 py-2 text-right hidden md:table-cell text-xs text-slate-500">
                                {s.conv >= 0 ? "+" : ""}
                                {formatFCFA(s.conv)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                    <strong>Méthodologie :</strong> ΔP ≈ −ModDur × Δy × P + ½ × Convexité
                    × Δy² × P. Approximation valide pour des chocs modérés. Au-delà de
                    ±200 bps, recalculer le prix actuariel exact.
                  </div>
                </section>

                {interCountrySpreads.length > 1 && (
                  <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                    <h3 className="text-base font-medium mb-1">
                      Spread inter-pays UEMOA
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Rendement de chaque courbe pays à la maturité résiduelle (
                      {formatMaturity(residual)}). Permet de positionner ce titre dans
                      le panel souverain UEMOA.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-3 py-2 font-medium">Pays</th>
                            <th className="text-right px-3 py-2 font-medium">
                              YTM courbe
                            </th>
                            <th className="text-right px-3 py-2 font-medium">
                              Spread vs {bond.country}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {interCountrySpreads.map((r) => (
                            <tr
                              key={r.country}
                              className={`border-b border-slate-100 ${
                                r.isTarget
                                  ? "bg-blue-50/50 font-medium"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <CountryFlag country={r.country} size={16} />
                                  <span>{r.country}</span>
                                  {r.isTarget && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                      ce titre
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {(r.ytm * 100).toFixed(2).replace(".", ",")}%
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  r.isTarget
                                    ? "text-slate-400"
                                    : r.spread > 0
                                    ? "text-green-700"
                                    : "text-red-700"
                                }`}
                              >
                                {r.isTarget ? "—" : formatPctSigned(r.spread, 2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                      Spread positif (vert) = ce pays paye plus que le pays cible à cette
                      maturité (signature plus risquée ou prime de liquidité plus
                      élevée). Toutes les courbes sont calibrées sur les cash auctions
                      des 3 derniers mois.
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
                Métriques de risque indisponibles (titre arrivé à échéance).
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ONGLET CARACTÉRISTIQUES                                        */}
        {/* ============================================================ */}
        {activeTab === "characteristics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 lg:col-span-2">
              <h3 className="text-base font-medium mb-4">📋 Fiche signalétique</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Row label="ISIN" value={bond.isin || "—"} mono />
                <Row label="Instrument" value={bond.type} />
                <Row label="Émetteur" value={`Trésor de ${bond.countryName}`} />
                <Row label="Pays" value={`${bond.countryName} (${bond.country})`} />

                <SectionTitle>Caractéristiques financières</SectionTitle>

                <Row
                  label="Coupon nominal"
                  value={
                    bond.couponRate != null
                      ? (bond.couponRate * 100).toFixed(2).replace(".", ",") + "%"
                      : "Zéro-coupon"
                  }
                />
                <Row
                  label="Amortissement"
                  value={bond.amortizationType || "—"}
                />
                <Row
                  label="Différé"
                  value={
                    bond.graceYears > 0
                      ? `${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`
                      : "—"
                  }
                />
                <Row label="Fréquence coupon" value={bond.type === "OAT" ? "Annuelle" : "—"} />

                <SectionTitle>Calendrier</SectionTitle>

                <Row label="1er round" value={formatDate(bond.firstIssueDate)} />
                <Row label="Dernier round" value={formatDate(bond.lastIssueDate)} />
                <Row label="Échéance" value={formatDate(bond.maturityDate)} />
                <Row
                  label="Maturité initiale"
                  value={formatMaturity(bond.maturity)}
                />
                <Row
                  label="Maturité résiduelle"
                  value={isExpired ? "Échue" : formatMaturity(residual)}
                />

                <SectionTitle>Volumes & demande</SectionTitle>

                <Row
                  label="Encours estimé circulant"
                  value={formatBigFCFA(bond.outstandingEstimate)}
                />
                <Row label="Cash levé cumulé" value={formatBigFCFA(bond.cashAmount)} />
                {bond.swapAmount > 0 && (
                  <Row
                    label="Notional créé par swap"
                    value={formatBigFCFA(bond.swapAmount)}
                  />
                )}
                {bond.buybackAmount > 0 && (
                  <Row
                    label="Rachats partiels"
                    value={`− ${formatBigFCFA(bond.buybackAmount)}`}
                  />
                )}
                <Row
                  label="Couverture moyenne (cash)"
                  value={cashCoverage > 0 ? cashCoverage.toFixed(2).replace(".", ",") + "×" : "—"}
                />
                <Row
                  label="Rounds"
                  value={
                    [
                      bond.cashRoundsCount > 0 && `${bond.cashRoundsCount} cash`,
                      bond.swapRoundsCount > 0 &&
                        `${bond.swapRoundsCount} swap${bond.swapRoundsCount > 1 ? "s" : ""}`,
                      bond.buybackRoundsCount > 0 &&
                        `${bond.buybackRoundsCount} rachat${bond.buybackRoundsCount > 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" + ") || `${bond.nbRounds}`
                  }
                />

                <SectionTitle>Yields</SectionTitle>

                <Row
                  label="Rendement dernier round cash"
                  value={(bond.lastYield * 100).toFixed(2).replace(".", ",") + "%"}
                />
                <Row
                  label="Rendement moyen pondéré (cash)"
                  value={(bond.avgYield * 100).toFixed(2).replace(".", ",") + "%"}
                />
                {first && (
                  <Row
                    label="Rendement 1er round"
                    value={(first.yield * 100).toFixed(2).replace(".", ",") + "%"}
                  />
                )}
                {bond.buybackAmount > 0 && (
                  <Row
                    label="Yield de sortie moyen (rachats)"
                    value={(bond.avgBuybackYield * 100).toFixed(2).replace(".", ",") + "%"}
                  />
                )}
              </dl>
            </section>

            <div className="space-y-4 md:space-y-6">
              {related.length > 0 && (
                <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                  <h3 className="text-base font-medium mb-3">
                    🇫{bond.country} Autres titres {bond.country}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Maturité proche, même émetteur souverain
                  </p>
                  <div className="space-y-2">
                    {related.map((b) => (
                      <Link
                        key={b.id}
                        href={`/souverain/${encodeURIComponent(b.id)}`}
                        className="block p-2.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition"
                      >
                        <div className="text-sm font-medium truncate">
                          {b.type} · {formatMaturity(b.maturity)}
                        </div>
                        <div className="text-xs text-slate-500 flex justify-between mt-0.5">
                          <span>
                            {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                            {b.nbRounds > 1 && ` · ×${b.nbRounds}`}
                          </span>
                          {b.isin && <span className="font-mono">{b.isin}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 leading-relaxed pt-2">
          Données issues des adjudications UMOA-Titres. Les souverains non cotés ne
          font pas l&apos;objet d&apos;une cotation secondaire — le YTM affiché est
          celui du dernier round primaire.
        </div>

        <div className="pt-2">
          <Link
            href="/marches/souverains-non-cotes"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la liste des souverains non cotés
          </Link>
        </div>
      </main>
    </>
  );
}

// === Helper : description de l'activite des rounds ===
function describeRoundActivity(bond: SovereignBond): string {
  const parts: string[] = [];
  if (bond.cashRoundsCount === 1) {
    parts.push("Émission unique en cash");
  } else if (bond.cashRoundsCount > 1) {
    parts.push(
      `${bond.cashRoundsCount} émissions cash cumulant ${formatBigFCFA(bond.cashAmount)}`
    );
  }
  if (bond.swapRoundsCount > 0) {
    parts.push(
      `${bond.swapRoundsCount} ${bond.swapRoundsCount > 1 ? "échanges" : "échange"} (${formatBigFCFA(bond.swapAmount)} de notional créé sans cash)`
    );
  }
  if (bond.buybackRoundsCount > 0) {
    parts.push(
      `${bond.buybackRoundsCount} ${bond.buybackRoundsCount > 1 ? "rachats partiels" : "rachat partiel"} pour ${formatBigFCFA(bond.buybackAmount)}`
    );
  }
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
  return `${list}. Encours circulant estimé : ${formatBigFCFA(bond.outstandingEstimate)}.`;
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
