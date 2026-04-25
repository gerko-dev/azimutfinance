"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type {
  ReturnsMatrix,
  RiskMetrics,
  Quadrant,
} from "@/lib/stockStats";
import type { ActionRow } from "@/lib/dataLoader";

type Tab = "overview" | "stats" | "fundamentals" | "dividends" | "news";
type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "Max";

const QUADRANT_INFO: Record<
  Quadrant,
  { emoji: string; name: string; desc: string; cls: string; link: string }
> = {
  cashcow: {
    emoji: "🎯",
    name: "Cash cow",
    desc: "Rendement élevé pour une volatilité faible — profil revenu stable.",
    cls: "bg-green-50 border-green-200 text-green-900",
    link: "text-green-700 hover:text-green-900",
  },
  hiddengem: {
    emoji: "💎",
    name: "Hidden gem",
    desc: "Rendement élevé mais volatilité élevée — profil rendement opportuniste.",
    cls: "bg-purple-50 border-purple-200 text-purple-900",
    link: "text-purple-700 hover:text-purple-900",
  },
  defensive: {
    emoji: "🛡️",
    name: "Defensive",
    desc: "Rendement faible et volatilité faible — profil capital préservé.",
    cls: "bg-blue-50 border-blue-200 text-blue-900",
    link: "text-blue-700 hover:text-blue-900",
  },
  speculative: {
    emoji: "⚡",
    name: "Spéculative",
    desc: "Rendement faible et volatilité élevée — profil croissance/spéculation.",
    cls: "bg-amber-50 border-amber-200 text-amber-900",
    link: "text-amber-700 hover:text-amber-900",
  },
};

const PERIOD_LABELS: Record<keyof ReturnsMatrix, string> = {
  "1M": "1 mois",
  "3M": "3 mois",
  "6M": "6 mois",
  YTD: "Depuis le 1er janvier",
  "1A": "1 an",
  "3A": "3 ans",
  "5A": "5 ans",
  depuis: "Depuis cotation",
};

function formatReturn(r: number | null): string {
  if (r === null || !isFinite(r)) return "—";
  const pct = r * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2).replace(".", ",")}%`;
}

function returnColor(r: number | null): string {
  if (r === null || !isFinite(r) || r === 0) return "text-slate-500";
  return r > 0 ? "text-green-700" : "text-red-700";
}

function formatPctNeutral(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function formatNumber(v: number | null, decimals = 2): string {
  if (v === null || !isFinite(v)) return "—";
  return v.toFixed(decimals).replace(".", ",");
}

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
  returnsMatrix: ReturnsMatrix;
  riskMetrics: RiskMetrics;
  quadrant: Quadrant | null;
  brvmcHistory: PricePoint[];
  sectorIndex: { code: string; name: string; history: PricePoint[] } | null;
  peers: ActionRow[];
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

export default function StockDetailView({
  stock,
  priceHistory,
  returnsMatrix,
  riskMetrics,
  quadrant,
  brvmcHistory,
  sectorIndex,
  peers,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("1A");
  const [showBrvmc, setShowBrvmc] = useState(false);
  const [showSector, setShowSector] = useState(false);

  const filteredHistory = useMemo(
    () => filterByPeriod(priceHistory, period),
    [priceHistory, period]
  );

  // Données du chart : si un overlay est actif, on normalise toutes les séries
  // en base 100 au début de la période visible. Sinon on garde la valeur brute.
  const chartData = useMemo(() => {
    if (filteredHistory.length === 0) return [];

    const useNormalization = showBrvmc || showSector;
    const brvmcMap = new Map(brvmcHistory.map((p) => [p.date, p.value]));
    const sectorMap = sectorIndex
      ? new Map(sectorIndex.history.map((p) => [p.date, p.value]))
      : null;

    function findBaseAtOrBefore(
      map: Map<string, number>,
      dateStr: string
    ): number | null {
      if (map.has(dateStr)) return map.get(dateStr)!;
      let bestDate = "";
      let bestVal: number | null = null;
      for (const [d, v] of map) {
        if (d <= dateStr && d > bestDate) {
          bestDate = d;
          bestVal = v;
        }
      }
      return bestVal;
    }

    const firstDate = filteredHistory[0].date;
    const firstStock = filteredHistory[0].value;
    const baseBrvmc = showBrvmc ? findBaseAtOrBefore(brvmcMap, firstDate) : null;
    const baseSector =
      showSector && sectorMap ? findBaseAtOrBefore(sectorMap, firstDate) : null;

    return filteredHistory.map((p) => {
      const point: {
        date: string;
        stock: number;
        brvmc?: number;
        sector?: number;
      } = {
        date: p.date,
        stock:
          useNormalization && firstStock > 0
            ? (p.value / firstStock) * 100
            : p.value,
      };
      if (showBrvmc && baseBrvmc && baseBrvmc > 0) {
        const v = brvmcMap.get(p.date);
        if (v !== undefined) point.brvmc = (v / baseBrvmc) * 100;
      }
      if (showSector && baseSector && baseSector > 0 && sectorMap) {
        const v = sectorMap.get(p.date);
        if (v !== undefined) point.sector = (v / baseSector) * 100;
      }
      return point;
    });
  }, [filteredHistory, brvmcHistory, sectorIndex, showBrvmc, showSector]);

  const isNormalized = showBrvmc || showSector;
  const BRVMC_COLOR = "#185FA5";
  const SECTOR_COLOR = "#854F0B";

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
                  {quadrant && (
                    <Link
                      href="/marches/actions"
                      title="Classification Azimut · cliquer pour voir le scatter"
                      className={`text-xs px-2 py-0.5 rounded border ${QUADRANT_INFO[quadrant].cls}`}
                    >
                      {QUADRANT_INFO[quadrant].emoji}{" "}
                      {QUADRANT_INFO[quadrant].name}
                    </Link>
                  )}
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
              { id: "stats", label: "Statistiques" },
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

                {/* Toggles benchmark : visibles uniquement s'il y a des données */}
                {hasHistory && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setShowBrvmc(!showBrvmc)}
                      aria-pressed={showBrvmc}
                      className={`text-xs px-2.5 py-1 rounded-md border transition ${
                        showBrvmc
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        style={{
                          backgroundColor: showBrvmc ? BRVMC_COLOR : "#cbd5e1",
                        }}
                      />
                      BRVM Composite
                    </button>
                    {sectorIndex && (
                      <button
                        type="button"
                        onClick={() => setShowSector(!showSector)}
                        aria-pressed={showSector}
                        className={`text-xs px-2.5 py-1 rounded-md border transition ${
                          showSector
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                          style={{
                            backgroundColor: showSector
                              ? SECTOR_COLOR
                              : "#cbd5e1",
                          }}
                        />
                        {sectorIndex.name}
                      </button>
                    )}
                    {isNormalized && (
                      <span className="text-[11px] text-slate-400 self-center ml-1">
                        Base 100 au début de la période
                      </span>
                    )}
                  </div>
                )}

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
                      <ComposedChart data={chartData}>
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
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={11}
                          domain={["auto", "auto"]}
                          tickFormatter={(v) =>
                            isNormalized
                              ? Number(v).toFixed(0)
                              : formatFCFA(Number(v))
                          }
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
                            if (isNormalized) {
                              const label =
                                name === "stock"
                                  ? stock.code
                                  : name === "brvmc"
                                  ? "BRVM Composite"
                                  : sectorIndex?.name ?? "Indice sectoriel";
                              return [v.toFixed(2).replace(".", ","), label];
                            }
                            return [formatFCFA(v) + " FCFA", "Cours"];
                          }}
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
                          dataKey="stock"
                          stroke={chartColor}
                          strokeWidth={2}
                          fill="url(#stockGradient)"
                        />
                        {showBrvmc && (
                          <Line
                            type="monotone"
                            dataKey="brvmc"
                            stroke={BRVMC_COLOR}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        )}
                        {showSector && (
                          <Line
                            type="monotone"
                            dataKey="sector"
                            stroke={SECTOR_COLOR}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        )}
                      </ComposedChart>
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

            {/* Pairs sectoriels */}
            {peers.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-base font-medium">
                    Autres titres · {stock.sector}
                  </h3>
                  <Link
                    href="/marches/actions"
                    className="text-xs text-blue-700 hover:text-blue-900"
                  >
                    Voir toutes les actions →
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {peers.map((p) => {
                    const isUpPeer = p.changePercent > 0;
                    const isDownPeer = p.changePercent < 0;
                    return (
                      <Link
                        key={p.code}
                        href={`/titre/${p.code}`}
                        className="flex flex-col p-2 rounded border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition"
                      >
                        <div className="text-sm font-mono font-medium">
                          {p.code}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {p.name}
                        </div>
                        <div className="text-sm mt-1">
                          {formatFCFA(p.price)}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            isUpPeer
                              ? "text-green-700"
                              : isDownPeer
                              ? "text-red-700"
                              : "text-slate-500"
                          }`}
                        >
                          {p.changePercent === 0
                            ? "0,00%"
                            : `${isUpPeer ? "+" : ""}${p.changePercent
                                .toFixed(2)
                                .replace(".", ",")}%`}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "stats" && (
          <>
            {/* Banner classification quadrant */}
            {quadrant ? (
              <div
                className={`rounded-lg border p-4 md:p-6 ${QUADRANT_INFO[quadrant].cls}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Classification Azimut
                    </div>
                    <div className="text-xl md:text-2xl font-semibold mt-1">
                      {QUADRANT_INFO[quadrant].emoji}{" "}
                      {QUADRANT_INFO[quadrant].name}
                    </div>
                    <p className="text-sm mt-1 opacity-80 max-w-xl">
                      {QUADRANT_INFO[quadrant].desc}
                    </p>
                  </div>
                  <Link
                    href="/marches/actions"
                    className={`text-xs underline ${QUADRANT_INFO[quadrant].link}`}
                  >
                    Voir le scatter →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:p-6 text-sm text-slate-600">
                Classification quadrant indisponible pour ce titre (rendement
                ou historique de prix insuffisant).
              </div>
            )}

            {/* Grille 2 colonnes : Performances + Risque */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Performances */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">Performances</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {(Object.keys(PERIOD_LABELS) as (keyof ReturnsMatrix)[]).map(
                      (k) => (
                        <tr
                          key={k}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-2 text-slate-500">
                            {PERIOD_LABELS[k]}
                          </td>
                          <td
                            className={`py-2 text-right font-medium ${returnColor(
                              returnsMatrix[k]
                            )}`}
                          >
                            {formatReturn(returnsMatrix[k])}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* Risque */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">Risque</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">
                      Volatilité 12 mois (annualisée)
                    </dt>
                    <dd className="font-medium">
                      {formatPctNeutral(riskMetrics.volatility1A)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Max drawdown 12 mois</dt>
                    <dd
                      className={`font-medium ${
                        riskMetrics.maxDrawdown1A &&
                        riskMetrics.maxDrawdown1A < 0
                          ? "text-red-700"
                          : ""
                      }`}
                    >
                      {formatPctNeutral(riskMetrics.maxDrawdown1A)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Max drawdown historique</dt>
                    <dd
                      className={`font-medium ${
                        riskMetrics.maxDrawdownAll &&
                        riskMetrics.maxDrawdownAll < 0
                          ? "text-red-700"
                          : ""
                      }`}
                    >
                      {formatPctNeutral(riskMetrics.maxDrawdownAll)}
                    </dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-500">Ratio de Sharpe (1 an)</dt>
                    <dd className="font-medium">
                      {formatNumber(riskMetrics.sharpe1A)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Beta vs BRVM Composite</dt>
                    <dd className="font-medium">
                      {formatNumber(riskMetrics.beta)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Méthodologie */}
            <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 md:p-4 border border-slate-100">
              <strong>Méthodologie :</strong> calculs basés sur
              l&apos;historique journalier, log-returns annualisés (Act/252).
              Risk-free rate : 3,5% (~taux directeur BCEAO). Beta vs BRVM
              Composite, sur tout l&apos;historique aligné. Outliers {">"} 30%
              en 1 jour filtrés. Quadrant = position relative aux médianes du
              dataset BRVM (rendement dividende et volatilité 12 mois).
            </div>
          </>
        )}

        {activeTab !== "overview" && activeTab !== "stats" && (
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