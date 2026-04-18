"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
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
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import { stocksDetails } from "@/lib/mockData";

type Tab = "overview" | "fundamentals" | "dividends" | "news" | "analyses" | "documents";

// Formatage FCFA avec espace en milliers
function formatFCFA(value: number): string {
  return value.toLocaleString("fr-FR").replace(/,/g, " ");
}

export default function TitrePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const stock = stocksDetails[code.toUpperCase()];
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (!stock) {
    notFound();
  }

  const isUp = stock.change >= 0;
  const changeColor = isUp ? "text-green-600" : "text-red-600";
  const changeSign = isUp ? "+" : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      {/* En-tete du titre */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          {/* Fil d'Ariane */}
          <div className="text-xs md:text-sm text-slate-500 mb-3">
            <Link href="/" className="hover:text-slate-900">Marches</Link>
            <span className="mx-2">›</span>
            <span>Actions</span>
            <span className="mx-2">›</span>
            <span>{stock.sector}</span>
            <span className="mx-2">›</span>
            <span className="text-slate-900">{stock.name}</span>
          </div>

          {/* Titre + actions */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-100 rounded-lg flex items-center justify-center font-semibold text-blue-900 text-sm md:text-base">
                {stock.code.slice(0, 3)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl md:text-2xl font-semibold">{stock.name}</h1>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                    {stock.code}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 rounded text-blue-700">
                    BRVM · {stock.country}
                  </span>
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  {stock.sector} · ISIN {stock.isin}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                + Watchlist
              </button>
              <button className="px-3 py-1.5 text-xs md:text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                Alerte
              </button>
              <button className="px-3 py-1.5 text-xs md:text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800">
                Rapport complet
              </button>
            </div>
          </div>

          {/* Prix principal */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">{formatFCFA(stock.price)}</span>
              <span className="text-sm text-slate-500 ml-2">FCFA</span>
            </div>
            <div className={`font-medium ${changeColor}`}>
              <span className="text-base md:text-lg">
                {changeSign}{formatFCFA(stock.change)}
              </span>
              <span className="text-sm ml-1">
                ({changeSign}{stock.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Temps reel · 14:32 GMT · Seance ouverte
            </div>
          </div>

          {/* Onglets */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {[
              { id: "overview", label: "Vue d'ensemble" },
              { id: "fundamentals", label: "Fondamentaux" },
              { id: "dividends", label: "Dividendes" },
              { id: "news", label: "Actualites" },
              { id: "analyses", label: "Analyses" },
              { id: "documents", label: "Documents" },
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

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">

        {activeTab === "overview" && (
          <>
            {/* Graphique + Donnees cles */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Graphique historique */}
              <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <div className="flex gap-1.5 text-xs flex-wrap">
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">1J</button>
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">5J</button>
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">1M</button>
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">6M</button>
                    <button className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">1A</button>
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">5A</button>
                    <button className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">Max</button>
                  </div>
                </div>
                <div className="h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stock.priceHistory}>
                      <defs>
                        <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isUp ? "#16a34a" : "#dc2626"} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={isUp ? "#16a34a" : "#dc2626"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} domain={["dataMin - 500", "dataMax + 500"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [formatFCFA(value) + " FCFA", "Cours"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={isUp ? "#16a34a" : "#dc2626"}
                        strokeWidth={2}
                        fill="url(#stockGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Statistiques 52 semaines */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div>
                    <div className="text-xs text-slate-500">Plus haut 52s</div>
                    <div className="text-sm font-medium">{formatFCFA(stock.high52w)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Plus bas 52s</div>
                    <div className="text-sm font-medium">{formatFCFA(stock.low52w)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Var. 1 an</div>
                    <div className={`text-sm font-medium ${stock.yearChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {stock.yearChange >= 0 ? "+" : ""}{stock.yearChange.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Volatilite</div>
                    <div className="text-sm font-medium">{stock.volatility.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {/* Carte donnees cles */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">Donnees cles</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Ouverture</dt>
                    <dd className="font-medium">{formatFCFA(stock.open)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Cloture veille</dt>
                    <dd className="font-medium">{formatFCFA(stock.previousClose)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Plus haut jour</dt>
                    <dd className="font-medium">{formatFCFA(stock.high)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Plus bas jour</dt>
                    <dd className="font-medium">{formatFCFA(stock.low)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Volume</dt>
                    <dd className="font-medium">{formatFCFA(stock.volume)}</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-500">Capitalisation</dt>
                    <dd className="font-medium">{formatFCFA(stock.capitalization)} M</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Titres emis</dt>
                    <dd className="font-medium">{formatFCFA(stock.sharesOutstanding)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Flottant</dt>
                    <dd className="font-medium">{stock.float.toFixed(1)}%</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-500">PER</dt>
                    <dd className="font-medium">{stock.per.toFixed(1)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Rendement</dt>
                    <dd className="font-medium">{stock.yield.toFixed(1)}%</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* A propos */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-medium mb-3">A propos</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{stock.description}</p>
            </div>
          </>
        )}

        {activeTab !== "overview" && (
          <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
            <div className="text-4xl mb-3">🚧</div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">Section en construction</h3>
            <p className="text-sm text-slate-500">
              Cette section sera disponible prochainement.
            </p>
          </div>
        )}

      </main>
    </div>
  );
}