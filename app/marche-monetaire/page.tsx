"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import {
  moneyMarketIndicators,
  yieldCurveUEMOA,
  upcomingAuctions,
  recentIssuances,
} from "@/lib/mockData";

export default function MarcheMonetairePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      {/* En-tete de page */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            Accueil › Marche monetaire
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Marche monetaire UEMOA
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            Taux, adjudications, emissions souveraines et indicateurs cles de la zone UEMOA
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">

        {/* Indicateurs cles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {moneyMarketIndicators.map((indicator) => {
            const trendColor =
              indicator.trend === "up"
                ? "text-red-600"
                : indicator.trend === "down"
                ? "text-green-600"
                : "text-slate-500";
            return (
              <div
                key={indicator.label}
                className="bg-white rounded-lg border border-slate-200 p-4 md:p-5"
              >
                <div className="text-xs md:text-sm text-slate-500 mb-2">
                  {indicator.label}
                </div>
                <div className="text-xl md:text-2xl font-semibold mb-1">
                  {indicator.value}
                </div>
                <div className={`text-xs ${trendColor}`}>
                  {indicator.subtitle}
                </div>
              </div>
            );
          })}
        </div>

        {/* Courbe des taux + Adjudications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Courbe des taux */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="flex justify-between items-baseline mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-base font-medium">Courbe des taux souverains UEMOA</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Rendement (YTM) par maturite - Moyenne pondere BRVM
                </p>
              </div>
              <span className="text-xs text-slate-400">18 avril 2026</span>
            </div>
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yieldCurveUEMOA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="maturity"
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    domain={[3.5, 7.5]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [
                            `${Number(value ?? 0).toFixed(2)}%`,
                            "YTM",
                          ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#1d4ed8"
                    strokeWidth={2.5}
                    dot={{ fill: "#1d4ed8", r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Prochaines adjudications */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h3 className="text-base font-medium mb-4">Prochaines adjudications</h3>
            <div className="space-y-3">
              {upcomingAuctions.map((auction) => (
                <div
                  key={auction.issuer}
                  className="p-3 bg-slate-50 rounded-md"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-sm font-medium">{auction.issuer}</div>
                    <div className="text-xs text-blue-700 font-medium">
                      {auction.date.split(" ").slice(0, 2).join(" ")}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600">
                    {auction.amount} · {auction.maturity} ·{" "}
                    <span className="text-slate-500">{auction.country}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tableau emissions recentes */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-baseline mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-base font-medium">Dernieres emissions</h3>
              <p className="text-xs text-slate-500 mt-1">
                Resultats des adjudications recentes sur le marche UEMOA
              </p>
            </div>
            <button className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50">
              Exporter CSV
            </button>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-sm min-w-[750px]">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Emetteur</th>
                  <th className="text-left py-2 font-medium">Pays</th>
                  <th className="text-right py-2 font-medium">Montant</th>
                  <th className="text-right py-2 font-medium">Demande</th>
                  <th className="text-right py-2 font-medium">Couverture</th>
                  <th className="text-right py-2 font-medium">Taux</th>
                  <th className="text-right py-2 font-medium">Maturite</th>
                </tr>
              </thead>
              <tbody>
                {recentIssuances.map((issuance, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-slate-50 transition ${
                      i < recentIssuances.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    <td className="py-3 text-slate-600">{issuance.date}</td>
                    <td className="py-3 font-medium">{issuance.issuer}</td>
                    <td className="py-3">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                        {issuance.country}
                      </span>
                    </td>
                    <td className="py-3 text-right">{issuance.amount}</td>
                    <td className="py-3 text-right text-slate-500">{issuance.requested}</td>
                    <td className="py-3 text-right">
                      <span className="text-green-700">{issuance.coverage}</span>
                    </td>
                    <td className="py-3 text-right font-medium">{issuance.rate}</td>
                    <td className="py-3 text-right text-slate-600">{issuance.maturity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bloc info explicatif */}
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 md:p-6">
          <h3 className="text-base font-medium text-blue-900 mb-2">
            Comprendre le marche monetaire UEMOA
          </h3>
          <div className="text-sm text-blue-900 space-y-2 leading-relaxed">
            <p>
              Le marche monetaire de l&apos;UEMOA est anime par la BCEAO et les huit Tresors
              nationaux. Les emissions se font principalement via des Obligations du Tresor (OAT,
              OTAR) et des Bons du Tresor (BAT) sur des maturites allant de 3 mois a 15 ans.
            </p>
            <p>
              Les taux suivent le taux directeur BCEAO (actuellement 3,50%), mais integrent
              egalement le risque pays, la liquidite et les attentes d&apos;inflation. Une
              courbe des taux normale (positive) refletre une prime de terme saine.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}