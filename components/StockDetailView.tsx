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

type Tab = "overview" | "fundamentals" | "dividends" | "news";
type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "Max";

type StockDetails = {
  code: string;
  name: string;
  sector: string;
  country: string;
  isin: string;
  description: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  capitalization: number;
  sharesOutstanding: number;
  float: number;
  per: number;
  yield: number;
  high52w: number;
  low52w: number;
  yearChange: number;
  volatility: number;
  hasPer: boolean;
  hasYield: boolean;
  hasYearChange: boolean;
  hasVolume: boolean;
};

type PricePoint = {
  date: string;
  value: number;
};

type Props = {
  stock: StockDetails;
  priceHistory: PricePoint[];
};

function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigNumber(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(2) + " Mds";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M";
  return formatFCFA(value);
}

// Filtre l'historique selon la periode choisie
function filterByPeriod(history: PricePoint[], period: Period): PricePoint[] {
  if (period === "Max" || history.length === 0) return history;

  const lastDate = new Date(history[history.length - 1].date);
  const cutoff = new Date(lastDate);

  switch (period) {
    case "1M": cutoff.setMonth(cutoff.getMonth() - 1); break;
    case "3M": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6M": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "1A": cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    case "3A": cutoff.setFullYear(cutoff.getFullYear() - 3); break;
    case "5A": cutoff.setFullYear(cutoff.getFullYear() - 5); break;
  }

  return history.filter((p) => new Date(p.date) >= cutoff);
}

export default function StockDetailView({ stock, priceHistory }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("1A");

  const filteredHistory = useMemo(
    () => filterByPeriod(priceHistory, period),
    [priceHistory, period]
  );

  const isUp = stock.change >= 0;
  const changeColor = isUp ? "text-green-600" : "text-red-600";
  const changeSign = isUp ? "+" : "";
  const chartColor = isUp ? "#16a34a" : "#dc2626";

  const hasHistory = priceHistory.length > 0;

  return (
    <>
      {/* En-tete fiche */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-5">
          {/* Fil d'Ariane */}
          <div className="text-xs md:text-sm text-slate-500 mb-3">
            <Link href="/" className="hover:text-slate-900">Marchés</Link>
            <span className="mx-2">›</span>
            <Link href="/marches/actions" className="hover:text-slate-900">Actions</Link>
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
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                    {stock.code}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 rounded text-blue-700">
                    BRVM · {stock.country}
                  </span>
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  {stock.sector} {stock.isin && `· ISIN ${stock.isin}`}
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

          {/* Prix principal */}
          <div className="flex flex-wrap items-baseline gap-4 md:gap-7 mb-4">
            <div>
              <span className="text-3xl md:text-4xl font-semibold">{formatFCFA(stock.price)}</span>
              <span className="text-sm text-slate-500 ml-2">FCFA</span>
            </div>
            <div className={`font-medium ${changeColor}`}>
              <span className="text-base md:text-lg">
                {changeSign}{formatFCFA(Math.abs(stock.change))}
              </span>
              <span className="text-sm ml-1">
                ({changeSign}{stock.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Dernière séance
            </div>
          </div>

          {/* Onglets */}
          <div className="flex gap-0 text-sm overflow-x-auto border-b border-slate-200 -mb-px">
            {[
              { id: "overview", label: "Vue d'ensemble" },
              { id: "fundamentals", label: "Fondamentaux" },
              { id: "dividends", label: "Dividendes" },
              { id: "news", label: "Actualités" },
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
                  <div>
                    <h3 className="text-base font-medium">Historique du cours</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {filteredHistory.length} points · Source : BRVM
                    </p>
                  </div>
                  <div className="flex gap-1.5 text-xs flex-wrap">
                    {(["1M", "3M", "6M", "1A", "3A", "5A", "Max"] as Period[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-2.5 py-1 rounded border ${
                          period === p
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {!hasHistory ? (
                  <div className="h-64 md:h-72 flex flex-col items-center justify-center text-center text-slate-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p className="text-sm">Aucun historique disponible pour ce titre</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Code recherché : {stock.code}
                    </p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="h-64 md:h-72 flex flex-col items-center justify-center text-center text-slate-500">
                    <p className="text-sm">Pas de données sur la période {period}</p>
                  </div>
                ) : (
                  <div className="h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredHistory}>
                        <defs>
                          <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickFormatter={(date) => {
                            const d = new Date(date);
                            return d.toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            });
                          }}
                        />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                          formatter={(value) => [
                            formatFCFA(Number(value ?? 0)) + " FCFA",
                            "Cours",
                          ]}
                          labelFormatter={(date) =>
                            new Date(date as string).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={chartColor}
                          strokeWidth={2}
                          fill="url(#stockGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Statistiques 52 semaines */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
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
                    <div className={`text-sm font-medium ${
                      stock.hasYearChange
                        ? stock.yearChange >= 0 ? "text-green-600" : "text-red-600"
                        : "text-slate-400"
                    }`}>
                      {stock.hasYearChange
                        ? (stock.yearChange >= 0 ? "+" : "") + stock.yearChange.toFixed(1) + "%"
                        : "NC"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Volatilité</div>
                    <div className="text-sm font-medium">{stock.volatility.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {/* Carte donnees cles */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">Données clés</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Capitalisation</dt>
                    <dd className="font-medium">{formatBigNumber(stock.capitalization)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Titres émis</dt>
                    <dd className="font-medium">{formatFCFA(stock.sharesOutstanding)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Flottant</dt>
                    <dd className="font-medium">{formatFCFA(stock.float)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Volume du jour</dt>
                    <dd className="font-medium">
                      {stock.hasVolume ? formatFCFA(stock.volume) : "NC"}
                    </dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-500">PER</dt>
                    <dd className="font-medium">
                      {stock.hasPer ? stock.per.toFixed(1) : "NC"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Rendement</dt>
                    <dd className="font-medium">
                      {stock.hasYield ? stock.yield.toFixed(2) + "%" : "NC"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Secteur</dt>
                    <dd className="font-medium text-right">{stock.sector}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Pays</dt>
                    <dd className="font-medium">{stock.country}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* A propos */}
            {stock.description && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-3">À propos de {stock.name}</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{stock.description}</p>
              </div>
            )}
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
    </>
  );
}