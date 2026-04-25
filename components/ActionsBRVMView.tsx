"use client";

import { useState, useMemo, useEffect, useDeferredValue } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import CountryFlag from "./CountryFlag";
import type { ActionRow, RiskReturnPoint } from "@/lib/dataLoader";

// === HELPERS ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(value) + " FCFA";
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

// === COULEURS ET LIBELLES SECTEURS BRVM ===
// Couleurs et libelles secteurs BRVM
// Les noms officiels en majuscules dans le CSV utilisent ESPACE-TIRET-ESPACE
// Exemple : "BRVM - SERVICES FINANCIERS"
// Couleurs et libelles secteurs BRVM
// Vos noms réels dans titres.csv n'ont PAS le préfixe "BRVM -"
const sectorColors: Record<string, string> = {
  TELECOMMUNICATIONS: "#0F6E56",
  "SERVICES FINANCIERS": "#185FA5",
  "CONSOMMATION DISCRETIONNAIRE": "#534AB7",
  "CONSOMMATION DE BASE": "#4F46E5",
  INDUSTRIELS: "#993C1D",
  ENERGIE: "#854F0B",
  "SERVICES PUBLICS": "#0891b2",
};

const sectorShort: Record<string, string> = {
  TELECOMMUNICATIONS: "T\u00e9l\u00e9coms",
  "SERVICES FINANCIERS": "Finance",
  "CONSOMMATION DISCRETIONNAIRE": "Conso. discr.",
  "CONSOMMATION DE BASE": "Conso. base",
  INDUSTRIELS: "Industrie",
  ENERGIE: "\u00c9nergie",
  "SERVICES PUBLICS": "Services pub.",
};

// Helper qui normalise un secteur pour matcher meme si la casse/accents different
function normalizeSectorKey(sector: string): string {
  return sector
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/\uFFFD/g, "") // retire le caractere de remplacement Unicode (caracteres mal decodes)
    .replace(/[^A-Z0-9 ]/g, "") // ne garde que A-Z, 0-9 et espaces
    .replace(/\s+/g, " ")
    .trim();
}

function getSectorColor(sector: string): string {
  if (!sector) return "#888780";
  const normalized = normalizeSectorKey(sector);
  for (const [key, color] of Object.entries(sectorColors)) {
    if (normalizeSectorKey(key) === normalized) return color;
  }
  // Debug : afficher dans la console les secteurs non matches
  if (typeof window !== "undefined") {
    console.warn("[Sector] Pas de couleur pour :", sector, "→ normalise :", normalized);
  }
  return "#888780";
}

function getSectorShort(sector: string): string {
  if (!sector) return "—";
  const normalized = normalizeSectorKey(sector);
  for (const [key, short] of Object.entries(sectorShort)) {
    if (normalizeSectorKey(key) === normalized) return short;
  }
  return sector;
}

type IndexSeries = {
  code: string;
  name: string;
  data: { date: string; value: number }[];
  color: string;
};

type IndexStat = {
  code: string;
  name: string;
  latestValue: number;
  latestDate: string;
  variationPct: number;
  variationValue: number;
} | null;

type Props = {
  actions: ActionRow[];
  marketStats: {
    totalActions: number;
    totalCapitalization: number;
    totalVolume: number;
    averagePer: number;
    averageYield: number;
    bySector: Record<string, number>;
    byCountry: Record<string, number>;
  };
  topGainers: ActionRow[];
  topLosers: ActionRow[];
  indicesSeries: IndexSeries[];
  compositeStat: IndexStat;
  riskReturn: {
    points: RiskReturnPoint[];
    excludedCount: number;
    excludedReasons: { noYield: number; insufficientHistory: number };
  };
};

type SortKey = "code" | "price" | "changePercent" | "capitalization" | "per" | "yieldPct";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 20;

type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "MAX";

type Quadrant = "cashcow" | "hiddengem" | "defensive" | "speculative";

const QUADRANT_LABELS: Record<Quadrant, string> = {
  cashcow: "🎯 Cash cows",
  hiddengem: "💎 Hidden gems",
  defensive: "🛡️ Defensives",
  speculative: "⚡ Spéculatives",
};

const periodToDays: Record<Period, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1A": 365,
  "3A": 365 * 3,
  "5A": 365 * 5,
  MAX: null,
};

export default function ActionsBRVMView({
  actions,
  marketStats,
  topGainers,
  topLosers,
  indicesSeries,
  compositeStat,
  riskReturn,
}: Props) {
  // === ETATS ===
  const [search, setSearch] = useState("");
  const [filterSector, setFilterSector] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("capitalization");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);

  // Pre-activation du quadrant via le hash de l'URL (ex: /marches/actions#cashcow)
  // pour un lien direct depuis la fiche d'un titre.
  // setState dans l'effet est volontaire : lecture one-shot au mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (
      hash === "cashcow" ||
      hash === "hiddengem" ||
      hash === "defensive" ||
      hash === "speculative"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveQuadrant(hash);
    }
  }, []);

  // === DEFERRED VALUES ===
  const deferredSearch = useDeferredValue(search);
  const deferredSector = useDeferredValue(filterSector);
  const deferredCountry = useDeferredValue(filterCountry);

  // === GRAPHIQUE INDICES : selection toggle ===
  const [activeIndices, setActiveIndices] = useState<Set<string>>(
    new Set(["BRVMC", "BRVM30"])
  );

  function toggleIndex(code: string) {
    const newSet = new Set(activeIndices);
    if (newSet.has(code)) {
      newSet.delete(code);
    } else {
      newSet.add(code);
    }
    setActiveIndices(newSet);
  }

  // === SELECTEUR DE PERIODE ===
  const [period, setPeriod] = useState<Period>("1A");

  // === DONNEES POUR LE GRAPHIQUE ===
  const chartData = useMemo(() => {
    const days = periodToDays[period];
    let cutoffDate: string | null = null;
    if (days !== null) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - days);
      cutoffDate = d.toISOString().substring(0, 10);
    }

    const dateMap = new Map<string, Record<string, number | string>>();
    for (const series of indicesSeries) {
      if (!activeIndices.has(series.code)) continue;
      for (const point of series.data) {
        if (cutoffDate && point.date < cutoffDate) continue;
        const entry = dateMap.get(point.date) || { date: point.date };
        entry[series.code] = point.value;
        dateMap.set(point.date, entry);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  }, [indicesSeries, activeIndices, period]);

  // === CLASSIFICATION PAR QUADRANT (medianes du dataset risk-return) ===
  const { codeToQuadrant, quadrantCounts } = useMemo(() => {
    const points = riskReturn.points;
    const counts: Record<Quadrant, number> = {
      cashcow: 0,
      hiddengem: 0,
      defensive: 0,
      speculative: 0,
    };
    const map = new Map<string, Quadrant>();
    if (points.length === 0) return { codeToQuadrant: map, quadrantCounts: counts };

    const sortedYields = [...points].map((p) => p.yieldPct).sort((a, b) => a - b);
    const sortedVols = [...points].map((p) => p.volatility).sort((a, b) => a - b);
    const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
    const my = median(sortedYields);
    const mv = median(sortedVols);

    for (const p of points) {
      const highYield = p.yieldPct >= my;
      const highVol = p.volatility >= mv;
      let q: Quadrant;
      if (highYield && !highVol) q = "cashcow";
      else if (highYield && highVol) q = "hiddengem";
      else if (!highYield && !highVol) q = "defensive";
      else q = "speculative";
      map.set(p.code, q);
      counts[q]++;
    }
    return { codeToQuadrant: map, quadrantCounts: counts };
  }, [riskReturn.points]);

  const quadrantCodeSet = useMemo(() => {
    if (!activeQuadrant) return null;
    const set = new Set<string>();
    for (const [code, q] of codeToQuadrant) {
      if (q === activeQuadrant) set.add(code);
    }
    return set;
  }, [activeQuadrant, codeToQuadrant]);

  const visibleScatterPoints = useMemo(() => {
    if (!activeQuadrant) return riskReturn.points;
    return riskReturn.points.filter(
      (p) => codeToQuadrant.get(p.code) === activeQuadrant
    );
  }, [riskReturn.points, activeQuadrant, codeToQuadrant]);

  // === FILTRAGE + TRI ===
  const processedActions = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    let filtered = actions;

    if (q || deferredSector !== "all" || deferredCountry !== "all" || quadrantCodeSet) {
      filtered = actions.filter((a) => {
        if (q) {
          if (
            !a.code.toLowerCase().includes(q) &&
            !a.name.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (deferredSector !== "all" && a.sector !== deferredSector) return false;
        if (deferredCountry !== "all" && a.country !== deferredCountry) return false;
        if (quadrantCodeSet && !quadrantCodeSet.has(a.code)) return false;
        return true;
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "price":
          cmp = a.price - b.price;
          break;
        case "changePercent":
          cmp = a.changePercent - b.changePercent;
          break;
        case "capitalization":
          cmp = a.capitalization - b.capitalization;
          break;
        case "per":
          cmp = (a.hasPer ? a.per : -Infinity) - (b.hasPer ? b.per : -Infinity);
          break;
        case "yieldPct":
          cmp = (a.hasYield ? a.yieldPct : -Infinity) - (b.hasYield ? b.yieldPct : -Infinity);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [actions, deferredSearch, deferredSector, deferredCountry, sortKey, sortOrder, quadrantCodeSet]);

  const totalPages = Math.ceil(processedActions.length / PAGE_SIZE);
  const pagedActions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedActions.slice(start, start + PAGE_SIZE);
  }, [processedActions, currentPage]);

  useMemo(() => {
    setCurrentPage(1);
  }, [deferredSearch, deferredSector, deferredCountry, activeQuadrant]);

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

  const availableSectors = Object.keys(marketStats.bySector).sort();
  const availableCountries = Object.keys(marketStats.byCountry).sort();

  // Liste des secteurs distincts dans le scatter (pour generer un Scatter par secteur)
  const sectorsInScatter = Array.from(
    new Set(visibleScatterPoints.map((p) => p.sector))
  ).sort();

  return (
    <>
      {/* ====== HERO + KPIs ====== */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:text-slate-900">Marchés</Link>
            <span className="mx-2">›</span>
            <span>Actions BRVM</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Actions BRVM UEMOA
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-3xl">
            {marketStats.totalActions} sociétés cotées sur la Bourse Régionale des Valeurs
            Mobilières. Indices, valorisation et analyses sectorielles.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">BRVM Composite</div>
              <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                {compositeStat
                  ? compositeStat.latestValue.toFixed(2).replace(".", ",")
                  : "—"}
              </div>
              {compositeStat ? (
                <div
                  className={`text-xs mt-1 font-medium ${
                    compositeStat.variationPct >= 0
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {compositeStat.variationPct >= 0 ? "+" : ""}
                  {compositeStat.variationPct.toFixed(2).replace(".", ",")}%
                </div>
              ) : (
                <div className="text-xs text-slate-400 mt-1">N/A</div>
              )}
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Sociétés cotées</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {marketStats.totalActions}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {Object.keys(marketStats.byCountry).length} pays UEMOA
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Capitalisation</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatBigFCFA(marketStats.totalCapitalization)}
              </div>
              <div className="text-xs text-slate-400 mt-1">total marché</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Volume quotidien</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatFCFA(marketStats.totalVolume)}
              </div>
              <div className="text-xs text-slate-400 mt-1">titres échangés</div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* ====== GRAPHIQUE INDICES ====== */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
            <h2 className="text-lg md:text-xl font-semibold">
              📊 Évolution des indices BRVM
            </h2>
            <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
              {(["1M", "3M", "6M", "1A", "3A", "5A", "MAX"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded transition ${
                    period === p
                      ? "bg-white shadow-sm font-medium text-blue-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {indicesSeries.map((s) => {
              const isActive = activeIndices.has(s.code);
              return (
                <button
                  key={s.code}
                  onClick={() => toggleIndex(s.code)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition ${
                    isActive
                      ? "border-slate-300 shadow-sm"
                      : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-white"
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: s.color + "15",
                          color: s.color,
                          borderColor: s.color + "40",
                        }
                      : {}
                  }
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: isActive ? s.color : "#cbd5e1" }}
                  />
                  {s.name}
                </button>
              );
            })}
          </div>

          <div className="h-72 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(d) => formatDateShort(d as string)}
                  minTickGap={50}
                />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(d) =>
                    new Date(d as string).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  }
                  formatter={(value, name) => {
                    const series = indicesSeries.find((s) => s.code === name);
                    return [
                      Number(value ?? 0).toFixed(2).replace(".", ","),
                      series?.name || name,
                    ];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={24}
                  wrapperStyle={{ fontSize: "11px" }}
                  formatter={(value) => {
                    const series = indicesSeries.find((s) => s.code === value);
                    return series?.name || value;
                  }}
                />
                {indicesSeries
                  .filter((s) => activeIndices.has(s.code))
                  .map((s) => (
                    <Line
                      key={s.code}
                      type="monotone"
                      dataKey={s.code}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ====== SCATTER RENDEMENT vs VOLATILITE ====== */}
        {riskReturn.points.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-lg md:text-xl font-semibold">
                  🎯 Rendement dividende vs Volatilité
                </h2>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Couleur = secteur · Volatilité 12 mois (Act/252)
                </p>
              </div>
              <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                EXCLUSIVITÉ AZIMUT
              </span>
            </div>

            <div style={{ width: "100%", height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="volatility"
                    name="Volatilité"
                    stroke="#94a3b8"
                    fontSize={11}
                    domain={[0, 50]}
                    tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                    label={{
                      value: "Volatilité 12 mois (%)",
                      position: "insideBottom",
                      offset: -10,
                      style: { fontSize: 12, fill: "#64748b" },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yieldPct"
                    name="Rendement"
                    stroke="#94a3b8"
                    fontSize={11}
                    domain={[0, "dataMax + 1"]}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                    label={{
                      value: "Rendement (%)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fontSize: 12, fill: "#64748b" },
                    }}
                  />

                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as RiskReturnPoint;
                      return (
                        <div className="bg-white border border-slate-200 rounded-md shadow-lg p-3 text-xs max-w-[260px]">
                          <div className="font-semibold mb-1">{d.name}</div>
                          <div className="font-mono text-slate-500 text-[11px] mb-2">
                            {d.code} · {d.country}
                          </div>
                          <div className="space-y-0.5">
                            <div>
                              Rendement :{" "}
                              <b>{d.yieldPct.toFixed(2).replace(".", ",")}%</b>
                            </div>
                            <div>
                              Volatilité :{" "}
                              <b>{d.volatility.toFixed(1).replace(".", ",")}%</b>
                            </div>
                            <div>
                              Cours : <b>{formatFCFA(d.price)} FCFA</b>
                            </div>
                            <div>
                              Capi : <b>{formatBigFCFA(d.capitalization)}</b>
                            </div>
                          </div>
                          <div
                            className="text-[10px] mt-2 pt-1 border-t border-slate-100"
                            style={{ color: getSectorColor(d.sector) }}
                          >
                            {getSectorShort(d.sector)}
                          </div>
                        </div>
                      );
                    }}
                  />

                  {sectorsInScatter.map((sector) => {
                    const data = visibleScatterPoints.filter((p) => p.sector === sector);
                    return (
                      <Scatter
                        key={sector}
                        name={getSectorShort(sector)}
                        data={data}
                        fill={getSectorColor(sector)}
                        fillOpacity={0.7}
                      />
                    );
                  })}

                  <Legend
                    verticalAlign="top"
                    height={32}
                    wrapperStyle={{ fontSize: "11px" }}
                    iconSize={10}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legende des quadrants — cliquable pour filtrer scatter + tableau */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  setActiveQuadrant(activeQuadrant === "cashcow" ? null : "cashcow")
                }
                aria-pressed={activeQuadrant === "cashcow"}
                className={`text-left p-2 rounded border transition cursor-pointer ${
                  activeQuadrant === "cashcow"
                    ? "bg-green-100 border-green-400 ring-2 ring-green-300"
                    : activeQuadrant
                    ? "bg-green-50/50 border-green-100 opacity-50 hover:opacity-100"
                    : "bg-green-50/50 border-green-100 hover:bg-green-100/60"
                }`}
              >
                <div className="font-medium text-green-800">
                  🎯 Cash cows
                  <span className="ml-1 text-[10px] font-normal text-green-700/70">
                    ({quadrantCounts.cashcow})
                  </span>
                </div>
                <div className="text-green-700/80 text-[11px]">
                  Rdt élevé · Vol faible
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveQuadrant(activeQuadrant === "hiddengem" ? null : "hiddengem")
                }
                aria-pressed={activeQuadrant === "hiddengem"}
                className={`text-left p-2 rounded border transition cursor-pointer ${
                  activeQuadrant === "hiddengem"
                    ? "bg-purple-100 border-purple-400 ring-2 ring-purple-300"
                    : activeQuadrant
                    ? "bg-purple-50/50 border-purple-100 opacity-50 hover:opacity-100"
                    : "bg-purple-50/50 border-purple-100 hover:bg-purple-100/60"
                }`}
              >
                <div className="font-medium text-purple-800">
                  💎 Hidden gems
                  <span className="ml-1 text-[10px] font-normal text-purple-700/70">
                    ({quadrantCounts.hiddengem})
                  </span>
                </div>
                <div className="text-purple-700/80 text-[11px]">
                  Rdt élevé · Vol élevée
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveQuadrant(activeQuadrant === "defensive" ? null : "defensive")
                }
                aria-pressed={activeQuadrant === "defensive"}
                className={`text-left p-2 rounded border transition cursor-pointer ${
                  activeQuadrant === "defensive"
                    ? "bg-blue-100 border-blue-400 ring-2 ring-blue-300"
                    : activeQuadrant
                    ? "bg-blue-50/50 border-blue-100 opacity-50 hover:opacity-100"
                    : "bg-blue-50/50 border-blue-100 hover:bg-blue-100/60"
                }`}
              >
                <div className="font-medium text-blue-800">
                  🛡️ Defensives
                  <span className="ml-1 text-[10px] font-normal text-blue-700/70">
                    ({quadrantCounts.defensive})
                  </span>
                </div>
                <div className="text-blue-700/80 text-[11px]">
                  Rdt faible · Vol faible
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveQuadrant(activeQuadrant === "speculative" ? null : "speculative")
                }
                aria-pressed={activeQuadrant === "speculative"}
                className={`text-left p-2 rounded border transition cursor-pointer ${
                  activeQuadrant === "speculative"
                    ? "bg-amber-100 border-amber-400 ring-2 ring-amber-300"
                    : activeQuadrant
                    ? "bg-amber-50/50 border-amber-100 opacity-50 hover:opacity-100"
                    : "bg-amber-50/50 border-amber-100 hover:bg-amber-100/60"
                }`}
              >
                <div className="font-medium text-amber-800">
                  ⚡ Spéculatives
                  <span className="ml-1 text-[10px] font-normal text-amber-700/70">
                    ({quadrantCounts.speculative})
                  </span>
                </div>
                <div className="text-amber-700/80 text-[11px]">
                  Rdt faible · Vol élevée
                </div>
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <strong>{riskReturn.points.length} actions affichées.</strong>{" "}
              {riskReturn.excludedCount > 0 && (
                <span>
                  {riskReturn.excludedCount} exclues (
                  {riskReturn.excludedReasons.noYield} sans rendement,{" "}
                  {riskReturn.excludedReasons.insufficientHistory} avec historique
                  insuffisant).
                </span>
              )}
              <div className="mt-1">
                <em>Méthodologie :</em> volatilité = écart-type des rendements log
                quotidiens × √252, sur 12 mois glissants. Outliers (jumps {">"} 30% en 1 jour) filtrés.
              </div>
            </div>
          </section>
        )}

        {/* ====== TOP MOVERS ====== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h3 className="text-base font-medium mb-3 text-green-700">🚀 Hausses du jour</h3>
            <div className="space-y-2">
              {topGainers.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">
                  Aucune hausse aujourd&apos;hui
                </div>
              ) : (
                topGainers.map((a) => (
                  <Link
                    key={a.code}
                    href={`/titre/${a.code}`}
                    className="flex justify-between items-center p-2 rounded hover:bg-green-50/50 transition"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <CountryFlag country={a.country} size={16} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium font-mono">{a.code}</div>
                        <div className="text-xs text-slate-500 truncate">{a.name}</div>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-sm font-medium">{formatFCFA(a.price)}</div>
                      <div className="text-xs text-green-700 font-medium">
                        +{a.changePercent.toFixed(2).replace(".", ",")}%
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <h3 className="text-base font-medium mb-3 text-red-700">📉 Baisses du jour</h3>
            <div className="space-y-2">
              {topLosers.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">
                  Aucune baisse aujourd&apos;hui
                </div>
              ) : (
                topLosers.map((a) => (
                  <Link
                    key={a.code}
                    href={`/titre/${a.code}`}
                    className="flex justify-between items-center p-2 rounded hover:bg-red-50/50 transition"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <CountryFlag country={a.country} size={16} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium font-mono">{a.code}</div>
                        <div className="text-xs text-slate-500 truncate">{a.name}</div>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-sm font-medium">{formatFCFA(a.price)}</div>
                      <div className="text-xs text-red-700 font-medium">
                        {a.changePercent.toFixed(2).replace(".", ",")}%
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ====== TABLEAU COMPLET ====== */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-xl font-semibold">Toutes les actions</h2>
                {activeQuadrant && (
                  <button
                    type="button"
                    onClick={() => setActiveQuadrant(null)}
                    title="Effacer le filtre quadrant"
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                  >
                    <span>Filtre : {QUADRANT_LABELS[activeQuadrant]}</span>
                    <span aria-hidden className="text-slate-500">✕</span>
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-500">
                {processedActions.length} action
                {processedActions.length > 1 ? "s" : ""} sur {actions.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Rechercher (code, nom...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />
              <select
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les secteurs</option>
                {availableSectors.map((s) => (
                  <option key={s} value={s}>
                    {getSectorShort(s)} ({marketStats.bySector[s]})
                  </option>
                ))}
              </select>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">Tous les pays</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {c} ({marketStats.byCountry[c]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("code")}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Code {sortIcon("code")}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Société</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Secteur</th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Pays</th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("price")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Cours {sortIcon("price")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("changePercent")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Var % {sortIcon("changePercent")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden md:table-cell">
                    <button
                      onClick={() => toggleSort("capitalization")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Capi {sortIcon("capitalization")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("per")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      PER {sortIcon("per")}
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("yieldPct")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Rdt {sortIcon("yieldPct")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedActions.map((a) => (
                  <tr
                    key={a.code}
                    className="border-b border-slate-100 hover:bg-blue-50/30 transition"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/titre/${a.code}`}
                        className="font-mono font-medium hover:text-blue-700"
                      >
                        {a.code}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/titre/${a.code}`} className="hover:text-blue-700">
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span
                        className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: getSectorColor(a.sector) + "15",
                          color: getSectorColor(a.sector),
                        }}
                        title={a.sector}
                      >
                        {getSectorShort(a.sector) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <CountryFlag country={a.country} size={16} />
                        <span className="text-xs">{a.country}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {a.price > 0 ? formatFCFA(a.price) : "—"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium ${
                        a.changePercent > 0
                          ? "text-green-700"
                          : a.changePercent < 0
                          ? "text-red-700"
                          : "text-slate-500"
                      }`}
                    >
                      {a.changePercent === 0
                        ? "0,00%"
                        : `${a.changePercent > 0 ? "+" : ""}${a.changePercent
                            .toFixed(2)
                            .replace(".", ",")}%`}
                    </td>
                    <td className="px-3 py-3 text-right text-xs hidden md:table-cell">
                      {a.capitalization > 0 ? formatBigFCFA(a.capitalization) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {a.hasPer && a.per > 0
                        ? a.per.toFixed(1).replace(".", ",")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {a.hasYield && a.yieldPct > 0
                        ? `${a.yieldPct.toFixed(2).replace(".", ",")}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagedActions.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                Aucune action ne correspond à vos critères
              </div>
            )}
          </div>

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
                Page <b>{currentPage}</b> sur <b>{totalPages}</b>
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