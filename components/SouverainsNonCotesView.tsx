"use client";

import { useState, useMemo, useEffect, useDeferredValue } from "react";
import Link from "next/link";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import type { SovereignBondLite } from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

const PAGE_SIZE = 50;

// === HELPERS FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
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
    month: "2-digit",
    year: "2-digit",
  });
}

type Props = {
  bonds: SovereignBondLite[];
  stats: {
    totalBonds: number;
    totalBAT: number;
    totalOAT: number;
    totalVolume: number;
    avgYield: number;
    avgMaturity: number;
    byCountry: Record<string, number>;
    volumeByCountry: Record<string, number>;
  };
};

type SortKey =
  | "country"
  | "maturity"
  | "lastYield"
  | "totalAmount"
  | "lastIssueDate"
  | "nbRounds";
type SortOrder = "asc" | "desc";

// Couleurs par pays
const countryColors: Record<string, string> = {
  CI: "#2563eb",
  SN: "#16a34a",
  BF: "#9333ea",
  ML: "#ea580c",
  BJ: "#0891b2",
  TG: "#db2777",
  NE: "#ca8a04",
  GW: "#6b7280",
};

export default function SouverainsNonCotesView({ bonds, stats }: Props) {
  // === ETATS ===
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastIssueDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // === VALEURS DEFEREES (React 18) ===
  // L'input reste instantane, le tableau se met a jour en arriere-plan
  const deferredSearch = useDeferredValue(search);
  const deferredCountry = useDeferredValue(filterCountry);
  const deferredType = useDeferredValue(filterType);
  const deferredDuration = useDeferredValue(filterDuration);

  // Filtrage + tri
  const processedBonds = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    let filtered = bonds;

    if (
      q ||
      deferredCountry !== "all" ||
      deferredType !== "all" ||
      deferredDuration !== "all"
    ) {
      filtered = bonds.filter((b) => {
        if (q) {
          if (
            !b.isin.toLowerCase().includes(q) &&
            !b.country.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (deferredCountry !== "all" && b.country !== deferredCountry) return false;
        if (deferredType !== "all" && b.type !== deferredType) return false;
        if (deferredDuration !== "all") {
          const y = b.maturity;
          if (deferredDuration === "0-2" && (y < 0 || y > 2)) return false;
          if (deferredDuration === "2-5" && (y <= 2 || y > 5)) return false;
          if (deferredDuration === "5-10" && (y <= 5 || y > 10)) return false;
          if (deferredDuration === "10+" && y <= 10) return false;
        }
        return true;
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "country":
          cmp = a.country.localeCompare(b.country);
          break;
        case "maturity":
          cmp = a.maturity - b.maturity;
          break;
        case "lastYield":
          cmp = a.lastYield - b.lastYield;
          break;
        case "totalAmount":
          cmp = a.totalAmount - b.totalAmount;
          break;
        case "lastIssueDate":
          cmp = a.lastIssueDate.localeCompare(b.lastIssueDate);
          break;
        case "nbRounds":
          cmp = a.nbRounds - b.nbRounds;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    bonds,
    deferredSearch,
    deferredCountry,
    deferredType,
    deferredDuration,
    sortKey,
    sortOrder,
  ]);

  // Indicateur visuel : tableau en cours de mise a jour
  const isFiltering =
    search !== deferredSearch ||
    filterCountry !== deferredCountry ||
    filterType !== deferredType ||
    filterDuration !== deferredDuration;

  // Pagination
  const totalPages = Math.ceil(processedBonds.length / PAGE_SIZE);
  const pagedBonds = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedBonds.slice(start, start + PAGE_SIZE);
  }, [processedBonds, currentPage]);

  // Reset page quand filtre change (sur valeurs deferees pour rester coherent)
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, deferredCountry, deferredType, deferredDuration]);

  // Donnees pour les courbes (calculees une seule fois, independantes des filtres)
  const oatCurveData = useMemo(() => {
    return bonds
      .filter((b) => b.type === "OAT")
      .map((b) => ({
        x: b.maturity,
        y: b.lastYield * 100,
        country: b.country,
        isin: b.isin,
        amount: b.totalAmount,
        nbRounds: b.nbRounds,
        date: b.lastIssueDate,
      }));
  }, [bonds]);

  const batCurveData = useMemo(() => {
    return bonds
      .filter((b) => b.type === "BAT")
      .map((b) => ({
        x: b.maturity,
        y: b.lastYield * 100,
        country: b.country,
        amount: b.totalAmount,
        date: b.lastIssueDate,
      }));
  }, [bonds]);

  const recentAdjudications = useMemo(() => {
    return [...bonds]
      .sort((a, b) => b.lastIssueDate.localeCompare(a.lastIssueDate))
      .slice(0, 10);
  }, [bonds]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-slate-300">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  }

  const availableCountries = Object.keys(stats.byCountry).sort();

  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:text-slate-900">
              Marchés
            </Link>
            <span className="mx-2">›</span>
            <span>Souverains non cotés</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Souverains non cotés UEMOA
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-3xl">
            Obligations (OAT) et bons (BAT) du Trésor des 8 États UEMOA émis via
            UMOA-Titres.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Titres actifs</div>
              <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                {stats.totalBonds}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {stats.totalOAT} OAT · {stats.totalBAT} BAT
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Volume émis total</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatBigFCFA(stats.totalVolume)}
              </div>
              <div className="text-xs text-slate-400 mt-1">cumulé UEMOA</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Taux moyen pondéré</div>
              <div className="text-2xl md:text-3xl font-semibold text-green-700">
                {(stats.avgYield * 100).toFixed(2).replace(".", ",")}%
              </div>
              <div className="text-xs text-slate-400 mt-1">dernières adjudications</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Maturité moyenne</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {stats.avgMaturity.toFixed(1).replace(".", ",")}
              </div>
              <div className="text-xs text-slate-400 mt-1">années pondérées</div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* COURBES DES TAUX */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
            <h2 className="text-lg md:text-xl font-semibold">
              📊 Courbe des taux souveraine UEMOA
            </h2>
            <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
              EXCLUSIVITÉ AZIMUT
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-600 mb-4">
            Chaque point = une émission à sa dernière adjudication.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div>
              <h3 className="text-sm font-medium mb-2">
                BAT — Court terme ({batCurveData.length} émissions)
              </h3>
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 15, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      unit=" ans"
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{
                        value: "Maturité (années)",
                        position: "bottom",
                        offset: 15,
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      unit="%"
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{
                        value: "Taux (%)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                            <div className="font-medium mb-1">BAT {d.country}</div>
                            <div>
                              Maturité : <b>{d.x.toFixed(2).replace(".", ",")} ans</b>
                            </div>
                            <div>
                              Taux : <b>{d.y.toFixed(2).replace(".", ",")}%</b>
                            </div>
                            <div>
                              Montant : <b>{formatBigFCFA(d.amount)}</b>
                            </div>
                            <div className="text-slate-400 mt-1">
                              {formatDate(d.date)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={24}
                      wrapperStyle={{ fontSize: "10px" }}
                    />
                    {availableCountries.map((country) => {
                      const data = batCurveData.filter((d) => d.country === country);
                      if (data.length === 0) return null;
                      return (
                        <Scatter
                          key={country}
                          name={country}
                          data={data}
                          fill={countryColors[country] || "#6b7280"}
                        >
                          {data.map((_, i) => (
                            <Cell key={i} fill={countryColors[country] || "#6b7280"} />
                          ))}
                        </Scatter>
                      );
                    })}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">
                OAT — Moyen/long terme ({oatCurveData.length} émissions)
              </h3>
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 15, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      unit=" ans"
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{
                        value: "Maturité (années)",
                        position: "bottom",
                        offset: 15,
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      unit="%"
                      stroke="#94a3b8"
                      fontSize={11}
                      label={{
                        value: "Taux (%)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                            <div className="font-medium mb-1">OAT {d.country}</div>
                            <div className="font-mono text-slate-500">{d.isin}</div>
                            <div className="mt-1">
                              Maturité : <b>{d.x.toFixed(1).replace(".", ",")} ans</b>
                            </div>
                            <div>
                              Taux : <b>{d.y.toFixed(2).replace(".", ",")}%</b>
                            </div>
                            <div>
                              Montant cumulé : <b>{formatBigFCFA(d.amount)}</b>
                            </div>
                            <div>
                              Ré-abondements : <b>{d.nbRounds}</b>
                            </div>
                            <div className="text-slate-400 mt-1">
                              Dernière adj : {formatDate(d.date)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={24}
                      wrapperStyle={{ fontSize: "10px" }}
                    />
                    {availableCountries.map((country) => {
                      const data = oatCurveData.filter((d) => d.country === country);
                      if (data.length === 0) return null;
                      return (
                        <Scatter
                          key={country}
                          name={country}
                          data={data}
                          fill={countryColors[country] || "#6b7280"}
                        >
                          {data.map((_, i) => (
                            <Cell key={i} fill={countryColors[country] || "#6b7280"} />
                          ))}
                        </Scatter>
                      );
                    })}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* DERNIERES ADJUDICATIONS */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">
            🔔 Dernières adjudications
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Pays</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                    ISIN
                  </th>
                  <th className="text-right px-3 py-2 font-medium">Maturité</th>
                  <th className="text-right px-3 py-2 font-medium">Montant</th>
                  <th className="text-right px-3 py-2 font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {recentAdjudications.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 hover:bg-blue-50/30 transition"
                  >
                    <td className="px-3 py-2">{formatDate(b.lastIssueDate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CountryFlag country={b.country} size={18} />
                        <span>{b.country}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          b.type === "OAT"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {b.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs hidden md:table-cell">
                      {b.isin || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {b.maturity.toFixed(1).replace(".", ",")} ans
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {formatBigFCFA(b.totalAmount)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* TABLEAU PAGINE */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
              <h2 className="text-lg md:text-xl font-semibold">
                Tous les titres souverains
              </h2>
              <span className="text-xs text-slate-500 flex items-center gap-2">
                {isFiltering && (
                  <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                )}
                {processedBonds.length} résultat
                {processedBonds.length > 1 ? "s" : ""} sur {bonds.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Rechercher (ISIN, pays...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les pays</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {c} ({stats.byCountry[c]})
                  </option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">OAT + BAT</option>
                <option value="OAT">OAT uniquement</option>
                <option value="BAT">BAT uniquement</option>
              </select>
              <select
                value={filterDuration}
                onChange={(e) => setFilterDuration(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Toutes durées</option>
                <option value="0-2">0-2 ans (BAT)</option>
                <option value="2-5">2-5 ans</option>
                <option value="5-10">5-10 ans</option>
                <option value="10+">Plus de 10 ans</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("country")}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Pays {sortIcon("country")}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Type</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    ISIN
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("maturity")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Maturité {sortIcon("maturity")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("lastYield")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Dernier taux {sortIcon("lastYield")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden md:table-cell">
                    <button
                      onClick={() => toggleSort("totalAmount")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Volume {sortIcon("totalAmount")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("nbRounds")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Rounds {sortIcon("nbRounds")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("lastIssueDate")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Dernière adj {sortIcon("lastIssueDate")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedBonds.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 hover:bg-blue-50/30 transition"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <CountryFlag country={b.country} size={18} />
                        <span>{b.country}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          b.type === "OAT"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {b.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs hidden md:table-cell">
                      {b.isin || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {b.maturity.toFixed(1).replace(".", ",")} ans
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {(b.lastYield * 100).toFixed(2).replace(".", ",")}%
                    </td>
                    <td className="px-3 py-3 text-right text-xs hidden md:table-cell">
                      {formatBigFCFA(b.totalAmount)}
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {b.nbRounds > 1 ? (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                          ×{b.nbRounds}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">1</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      {formatDate(b.lastIssueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagedBonds.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                Aucun titre ne correspond à vos critères
              </div>
            )}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 text-sm">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Précédent
              </button>
              <span className="text-slate-600">
                Page <b>{currentPage}</b> sur <b>{totalPages}</b> ·{" "}
                <span className="text-slate-400">
                  ({(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, processedBonds.length)} sur{" "}
                  {processedBonds.length})
                </span>
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant →
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}