"use client";

import { useState, useMemo, useEffect, useDeferredValue } from "react";
import Link from "next/link";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import CountryFlag from "../CountryFlag";
import LivePriceBadge from "../LivePriceBadge";
import type { ActionRow, RiskReturnPoint } from "@/lib/dataLoader";
import type { BrvmLiveIndex } from "@/lib/brvm/liveIndices";

// ============================================================================
// HELPERS (format + secteurs) — alignes sur ActionsBRVMView (site public) mais
// adaptes au theme sombre du Pro Terminal.
// ============================================================================
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M";
  return formatFCFA(value);
}

function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits).replace(".", ",")}%`;
}

const sectorColors: Record<string, string> = {
  TELECOMMUNICATIONS: "#2dd4bf",
  "SERVICES FINANCIERS": "#60a5fa",
  "CONSOMMATION DISCRETIONNAIRE": "#a78bfa",
  "CONSOMMATION DE BASE": "#818cf8",
  INDUSTRIELS: "#fb923c",
  ENERGIE: "#fbbf24",
  "SERVICES PUBLICS": "#22d3ee",
};

const sectorShort: Record<string, string> = {
  TELECOMMUNICATIONS: "Télécoms",
  "SERVICES FINANCIERS": "Finance",
  "CONSOMMATION DISCRETIONNAIRE": "Conso. discr.",
  "CONSOMMATION DE BASE": "Conso. base",
  INDUSTRIELS: "Industrie",
  ENERGIE: "Énergie",
  "SERVICES PUBLICS": "Services pub.",
};

function normalizeSectorKey(sector: string): string {
  return sector
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/�/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSectorColor(sector: string): string {
  if (!sector) return "#64748b";
  const normalized = normalizeSectorKey(sector);
  for (const [key, color] of Object.entries(sectorColors)) {
    if (normalizeSectorKey(key) === normalized) return color;
  }
  return "#64748b";
}

function getSectorShort(sector: string): string {
  if (!sector) return "—";
  const normalized = normalizeSectorKey(sector);
  for (const [key, short] of Object.entries(sectorShort)) {
    if (normalizeSectorKey(key) === normalized) return short;
  }
  return sector;
}

// ============================================================================
// TYPES
// ============================================================================
type IndexStat = {
  code: string;
  name: string;
  latestValue: number;
  latestDate: string;
  variationPct: number;
  variationValue: number;
} | null;

type Breadth = { up: number; down: number; flat: number };

type Props = {
  actions: ActionRow[];
  marketStats: {
    totalActions: number;
    totalCapitalization: number;
    totalVolume: number;
    medianPer: number;
    averageYield: number;
    bySector: Record<string, number>;
    byCountry: Record<string, number>;
  };
  liveListedCount: number;
  topGainers: ActionRow[];
  topLosers: ActionRow[];
  mostActive: ActionRow[];
  breadth: Breadth;
  compositeStat: IndexStat;
  liveIndices: BrvmLiveIndex[];
  liveIndicesYtd: Record<string, number | null>;
  ytdByAction: Record<string, number | null>;
  liveSession: {
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
  };
  riskReturn: {
    points: RiskReturnPoint[];
    excludedCount: number;
    excludedReasons: { noYield: number; insufficientHistory: number };
  };
};

type SortKey =
  | "code"
  | "price"
  | "changePercent"
  | "ytd"
  | "volume"
  | "turnover"
  | "capitalization"
  | "per"
  | "yieldPct";
type SortOrder = "asc" | "desc";

type Quadrant = "cashcow" | "hiddengem" | "defensive" | "speculative";

const QUADRANT_LABELS: Record<Quadrant, string> = {
  cashcow: "🎯 Cash cows",
  hiddengem: "💎 Hidden gems",
  defensive: "🛡️ Defensives",
  speculative: "⚡ Spéculatives",
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================
export default function ActionsProView({
  actions,
  marketStats,
  liveListedCount,
  topGainers,
  topLosers,
  mostActive,
  breadth,
  compositeStat,
  liveIndices,
  liveIndicesYtd,
  ytdByAction,
  liveSession,
  riskReturn,
}: Props) {
  const [search, setSearch] = useState("");
  const [filterSector, setFilterSector] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("capitalization");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);

  const deferredSearch = useDeferredValue(search);
  const deferredSector = useDeferredValue(filterSector);
  const deferredCountry = useDeferredValue(filterCountry);

  // === Classification par quadrant (medianes du dataset risk-return) ===
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
      (p) => codeToQuadrant.get(p.code) === activeQuadrant,
    );
  }, [riskReturn.points, activeQuadrant, codeToQuadrant]);

  // === Performance par secteur (outil pro : variation moyenne + nb titres) ===
  const sectorPerf = useMemo(() => {
    const acc = new Map<
      string,
      { sumChange: number; count: number; capitalization: number }
    >();
    for (const a of actions) {
      if (!a.sector || a.price <= 0) continue;
      const cur = acc.get(a.sector) || {
        sumChange: 0,
        count: 0,
        capitalization: 0,
      };
      cur.sumChange += a.changePercent;
      cur.count += 1;
      cur.capitalization += a.capitalization;
      acc.set(a.sector, cur);
    }
    return Array.from(acc.entries())
      .map(([sector, v]) => ({
        sector,
        avgChange: v.count > 0 ? v.sumChange / v.count : 0,
        count: v.count,
        capitalization: v.capitalization,
      }))
      .sort((a, b) => b.capitalization - a.capitalization);
  }, [actions]);

  // === Filtrage + tri ===
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
        case "ytd": {
          const ya = ytdByAction[a.code];
          const yb = ytdByAction[b.code];
          cmp = (ya ?? -Infinity) - (yb ?? -Infinity);
          break;
        }
        case "volume":
          cmp = a.volume - b.volume;
          break;
        case "turnover":
          cmp = a.price * a.volume - b.price * b.volume;
          break;
        case "capitalization":
          cmp = a.capitalization - b.capitalization;
          break;
        case "per":
          cmp = (a.hasPer ? a.per : -Infinity) - (b.hasPer ? b.per : -Infinity);
          break;
        case "yieldPct":
          cmp =
            (a.hasYield ? a.yieldPct : -Infinity) -
            (b.hasYield ? b.yieldPct : -Infinity);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    actions,
    deferredSearch,
    deferredSector,
    deferredCountry,
    sortKey,
    sortOrder,
    quadrantCodeSet,
    ytdByAction,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-slate-600">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  }

  function resetFilters() {
    setSearch("");
    setFilterSector("all");
    setFilterCountry("all");
    setActiveQuadrant(null);
  }

  // Export CSV de la vue filtree (outil pro)
  function exportCsv() {
    const header = [
      "Code",
      "Société",
      "Secteur",
      "Pays",
      "Cours",
      "Var %",
      "YTD %",
      "Volume",
      "Valeur échangée",
      "Capitalisation",
      "PER",
      "Rendement %",
    ];
    const lines = processedActions.map((a) => {
      const ytd = ytdByAction[a.code];
      return [
        a.code,
        `"${a.name.replace(/"/g, '""')}"`,
        `"${getSectorShort(a.sector)}"`,
        a.country,
        a.price > 0 ? Math.round(a.price) : "",
        a.changePercent.toFixed(2).replace(".", ","),
        ytd != null ? ytd.toFixed(2).replace(".", ",") : "",
        a.volume,
        Math.round(a.price * a.volume),
        a.capitalization > 0 ? Math.round(a.capitalization) : "",
        a.hasPer && a.per > 0 ? a.per.toFixed(1).replace(".", ",") : "",
        a.hasYield && a.yieldPct > 0 ? a.yieldPct.toFixed(2).replace(".", ",") : "",
      ].join(";");
    });
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `actions-brvm-${liveSession.fetchedAt.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const availableSectors = Object.keys(marketStats.bySector).sort();
  const availableCountries = Object.keys(marketStats.byCountry).sort();
  const sectorsInScatter = Array.from(
    new Set(visibleScatterPoints.map((p) => p.sector)),
  ).sort();

  const breadthTotal = breadth.up + breadth.down + breadth.flat || 1;

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5">
            <Link href="/pros" className="hover:text-slate-300 transition">
              Pro Terminal
            </Link>
            <span className="text-slate-700">›</span>
            <span className="text-slate-400">Actions BRVM</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            Actions BRVM UEMOA
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-3xl">
            {liveListedCount > 0 ? liveListedCount : marketStats.totalActions}{" "}
            sociétés cotées · indices live, valorisation et analyse risque /
            rendement.
          </p>
        </div>
        <LivePriceBadge
          sessionLabel={liveSession.sessionLabel}
          isClosed={liveSession.isClosed}
          variant="dark"
        />
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi
          label="BRVM Composite"
          value={
            compositeStat
              ? compositeStat.latestValue.toFixed(2).replace(".", ",")
              : "—"
          }
          sub={compositeStat ? fmtPct(compositeStat.variationPct) : "N/A"}
          tone={
            compositeStat
              ? compositeStat.variationPct >= 0
                ? "up"
                : "down"
              : "neutral"
          }
        />
        <Kpi
          label="Sociétés cotées"
          value={`${liveListedCount > 0 ? liveListedCount : marketStats.totalActions}`}
          sub={`${Object.keys(marketStats.byCountry).length} pays UEMOA`}
        />
        <Kpi
          label="Capitalisation"
          value={`${formatBigFCFA(marketStats.totalCapitalization)}`}
          sub="FCFA · total marché"
        />
        <Kpi
          label="Volume du jour"
          value={formatFCFA(marketStats.totalVolume)}
          sub="titres échangés"
        />
        <Kpi
          label="PER médian"
          value={
            marketStats.medianPer > 0
              ? marketStats.medianPer.toFixed(1).replace(".", ",")
              : "—"
          }
          sub="médiane du marché"
        />
        <Kpi
          label="Rendement moyen"
          value={
            marketStats.averageYield > 0
              ? `${marketStats.averageYield.toFixed(2).replace(".", ",")}%`
              : "—"
          }
          sub="dividende / cours"
        />
      </div>

      {/* ====== MARKET BREADTH (outil pro) ====== */}
      <Card title="Largeur du marché" subtitle="hausses vs baisses du jour">
        <div className="p-4 space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="bg-emerald-500"
              style={{ width: `${(breadth.up / breadthTotal) * 100}%` }}
            />
            <div
              className="bg-slate-600"
              style={{ width: `${(breadth.flat / breadthTotal) * 100}%` }}
            />
            <div
              className="bg-red-500"
              style={{ width: `${(breadth.down / breadthTotal) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-mono">
              ▲ {breadth.up} hausses
            </span>
            <span className="text-slate-400 font-mono">
              = {breadth.flat} stables
            </span>
            <span className="text-red-400 font-mono">
              ▼ {breadth.down} baisses
            </span>
          </div>
        </div>
      </Card>

      {/* ====== INDICES LIVE ====== */}
      {liveIndices.length > 0 && (
        <Card
          title="Indices BRVM"
          subtitle="live"
          right={
            <Link
              href="/marches/indices"
              className="text-[11px] text-blue-400 hover:text-blue-300"
            >
              Tous les indices →
            </Link>
          }
        >
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {liveIndices
                .filter((i) => i.category === "principal")
                .map((i) => (
                  <IndexCard
                    key={i.code}
                    index={i}
                    ytdValue={liveIndicesYtd[i.code] ?? i.ytdPct}
                  />
                ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {liveIndices
                .filter((i) => i.category === "sectoriel")
                .map((i) => (
                  <IndexCard
                    key={i.code}
                    index={i}
                    compact
                    ytdValue={liveIndicesYtd[i.code] ?? i.ytdPct}
                  />
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* ====== MOVERS + MOST ACTIVE ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Hausses du jour" accent="emerald">
          <MoversTable rows={topGainers} ytdByAction={ytdByAction} />
        </Card>
        <Card title="Baisses du jour" accent="red">
          <MoversTable rows={topLosers} ytdByAction={ytdByAction} />
        </Card>
        <Card title="Plus actifs" subtitle="volume" accent="blue">
          <ActiveTable rows={mostActive} />
        </Card>
      </div>

      {/* ====== PERFORMANCE PAR SECTEUR (outil pro) ====== */}
      {sectorPerf.length > 0 && (
        <Card title="Performance par secteur" subtitle="variation moyenne du jour">
          <div className="p-4 space-y-2">
            {sectorPerf.map((s) => {
              const up = s.avgChange >= 0;
              const width = Math.min(100, Math.abs(s.avgChange) * 12);
              return (
                <button
                  key={s.sector}
                  type="button"
                  onClick={() =>
                    setFilterSector(filterSector === s.sector ? "all" : s.sector)
                  }
                  className={`w-full text-left group ${
                    filterSector === s.sector ? "opacity-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-28 shrink-0 truncate text-slate-300 group-hover:text-white flex items-center gap-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: getSectorColor(s.sector) }}
                      />
                      {getSectorShort(s.sector)}
                    </span>
                    <span className="w-10 shrink-0 text-slate-500 font-mono text-[10px]">
                      ({s.count})
                    </span>
                    <div className="flex-1 flex items-center">
                      <div className="flex-1 flex justify-end pr-1">
                        {!up && (
                          <div
                            className="h-2 rounded-l bg-red-500/70"
                            style={{ width: `${width}%` }}
                          />
                        )}
                      </div>
                      <div className="w-px h-3 bg-slate-700" />
                      <div className="flex-1 pl-1">
                        {up && (
                          <div
                            className="h-2 rounded-r bg-emerald-500/70"
                            style={{ width: `${width}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <span
                      className={`w-16 shrink-0 text-right font-mono ${
                        up ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {fmtPct(s.avgChange)}
                    </span>
                  </div>
                </button>
              );
            })}
            <div className="text-[10px] text-slate-500 pt-1">
              Cliquez un secteur pour filtrer le tableau.
            </div>
          </div>
        </Card>
      )}

      {/* ====== SCATTER RENDEMENT vs VOLATILITE ====== */}
      {riskReturn.points.length > 0 && (
        <Card
          title="Rendement dividende vs Volatilité"
          subtitle="couleur = secteur · vol. 12 mois (Act/252)"
        >
          <div className="p-4">
            <div style={{ width: "100%", height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="volatility"
                    name="Volatilité"
                    stroke="#64748b"
                    fontSize={11}
                    domain={[0, 50]}
                    tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                    label={{
                      value: "Volatilité 12 mois (%)",
                      position: "insideBottom",
                      offset: -10,
                      style: { fontSize: 12, fill: "#94a3b8" },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yieldPct"
                    name="Rendement"
                    stroke="#64748b"
                    fontSize={11}
                    domain={[0, "dataMax + 1"]}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                    label={{
                      value: "Rendement (%)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fontSize: 12, fill: "#94a3b8" },
                    }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "#475569" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as RiskReturnPoint;
                      return (
                        <div className="bg-slate-900 border border-slate-700 rounded-md shadow-lg p-3 text-xs max-w-[260px] text-slate-200">
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
                              Capi : <b>{formatBigFCFA(d.capitalization)} FCFA</b>
                            </div>
                          </div>
                          <div
                            className="text-[10px] mt-2 pt-1 border-t border-slate-700"
                            style={{ color: getSectorColor(d.sector) }}
                          >
                            {getSectorShort(d.sector)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {sectorsInScatter.map((sector) => {
                    const data = visibleScatterPoints.filter(
                      (p) => p.sector === sector,
                    );
                    return (
                      <Scatter
                        key={sector}
                        name={getSectorShort(sector)}
                        data={data}
                        fill={getSectorColor(sector)}
                        fillOpacity={0.8}
                      />
                    );
                  })}
                  <Legend
                    verticalAlign="top"
                    height={32}
                    wrapperStyle={{ fontSize: "11px", color: "#cbd5e1" }}
                    iconSize={10}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legende quadrants — cliquable */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <QuadrantButton
                q="cashcow"
                title="🎯 Cash cows"
                hint="Rdt élevé · Vol faible"
                count={quadrantCounts.cashcow}
                active={activeQuadrant}
                onToggle={setActiveQuadrant}
                color="emerald"
              />
              <QuadrantButton
                q="hiddengem"
                title="💎 Hidden gems"
                hint="Rdt élevé · Vol élevée"
                count={quadrantCounts.hiddengem}
                active={activeQuadrant}
                onToggle={setActiveQuadrant}
                color="purple"
              />
              <QuadrantButton
                q="defensive"
                title="🛡️ Defensives"
                hint="Rdt faible · Vol faible"
                count={quadrantCounts.defensive}
                active={activeQuadrant}
                onToggle={setActiveQuadrant}
                color="blue"
              />
              <QuadrantButton
                q="speculative"
                title="⚡ Spéculatives"
                hint="Rdt faible · Vol élevée"
                count={quadrantCounts.speculative}
                active={activeQuadrant}
                onToggle={setActiveQuadrant}
                color="amber"
              />
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
              <strong className="text-slate-400">
                {riskReturn.points.length} actions affichées.
              </strong>{" "}
              {riskReturn.excludedCount > 0 && (
                <span>
                  {riskReturn.excludedCount} exclues (
                  {riskReturn.excludedReasons.noYield} sans rendement,{" "}
                  {riskReturn.excludedReasons.insufficientHistory} historique
                  insuffisant).
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ====== TABLEAU COMPLET ====== */}
      <Card
        title="Toutes les actions"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">
              {processedActions.length} / {actions.length}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              ⬇ Export CSV
            </button>
          </div>
        }
      >
        <div className="p-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {(activeQuadrant ||
              filterSector !== "all" ||
              filterCountry !== "all" ||
              search) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] px-2 py-1 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition"
              >
                ✕ Réinitialiser
              </button>
            )}
            {activeQuadrant && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-purple-500/20 text-purple-300">
                {QUADRANT_LABELS[activeQuadrant]}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <input
              type="text"
              placeholder="Rechercher (code, nom...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
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
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
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

        <div className="overflow-auto max-h-[640px] pro-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
              <tr className="text-[11px] text-slate-400 border-b border-slate-700">
                <Th onClick={() => toggleSort("code")}>Code {sortIcon("code")}</Th>
                <th className="text-left px-3 py-2.5 font-medium">Société</th>
                <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">
                  Secteur
                </th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">
                  Pays
                </th>
                <Th right onClick={() => toggleSort("price")}>
                  Cours {sortIcon("price")}
                </Th>
                <Th right onClick={() => toggleSort("changePercent")}>
                  Var % {sortIcon("changePercent")}
                </Th>
                <Th right onClick={() => toggleSort("ytd")}>
                  YTD {sortIcon("ytd")}
                </Th>
                <Th right cls="hidden md:table-cell" onClick={() => toggleSort("volume")}>
                  Volume {sortIcon("volume")}
                </Th>
                <Th
                  right
                  cls="hidden lg:table-cell"
                  onClick={() => toggleSort("turnover")}
                >
                  Valeur éch. {sortIcon("turnover")}
                </Th>
                <Th
                  right
                  cls="hidden md:table-cell"
                  onClick={() => toggleSort("capitalization")}
                >
                  Capi {sortIcon("capitalization")}
                </Th>
                <Th right cls="hidden lg:table-cell" onClick={() => toggleSort("per")}>
                  PER {sortIcon("per")}
                </Th>
                <Th
                  right
                  cls="hidden lg:table-cell"
                  onClick={() => toggleSort("yieldPct")}
                >
                  Rdt {sortIcon("yieldPct")}
                </Th>
              </tr>
            </thead>
            <tbody>
              {processedActions.map((a) => {
                const ytd = ytdByAction[a.code];
                return (
                  <tr
                    key={a.code}
                    className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/pros/titre/${a.code}`}
                        className="font-mono font-medium text-slate-200 hover:text-blue-400"
                      >
                        {a.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/pros/titre/${a.code}`}
                        className="text-slate-300 hover:text-blue-400"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: getSectorColor(a.sector) + "22",
                          color: getSectorColor(a.sector),
                        }}
                        title={a.sector}
                      >
                        {getSectorShort(a.sector) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <CountryFlag country={a.country} size={16} />
                        <span className="text-xs text-slate-400">{a.country}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                      {a.price > 0 ? formatFCFA(a.price) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono font-medium ${
                        a.changePercent > 0
                          ? "text-emerald-400"
                          : a.changePercent < 0
                            ? "text-red-400"
                            : "text-slate-500"
                      }`}
                    >
                      {a.changePercent === 0 ? "0,00%" : fmtPct(a.changePercent)}
                    </td>
                    {ytd === null || ytd === undefined ? (
                      <td className="px-3 py-2.5 text-right text-slate-600">—</td>
                    ) : (
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-medium ${
                          ytd > 0
                            ? "text-emerald-400"
                            : ytd < 0
                              ? "text-red-400"
                              : "text-slate-500"
                        }`}
                      >
                        {ytd === 0 ? "0,00%" : fmtPct(ytd)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden md:table-cell">
                      {a.volume > 0 ? formatFCFA(a.volume) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden lg:table-cell">
                      {a.volume > 0 && a.price > 0
                        ? formatBigFCFA(a.price * a.volume)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 text-xs hidden md:table-cell">
                      {a.capitalization > 0
                        ? formatBigFCFA(a.capitalization)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300 hidden lg:table-cell">
                      {a.hasPer && a.per > 0
                        ? a.per.toFixed(1).replace(".", ",")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300 hidden lg:table-cell">
                      {a.hasYield && a.yieldPct > 0
                        ? `${a.yieldPct.toFixed(2).replace(".", ",")}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {processedActions.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              Aucune action ne correspond à vos critères.
            </div>
          )}
        </div>
      </Card>

      <div className="text-[11px] text-slate-500 pt-1">
        Données : BRVM (cours différés), historiques internes. Le rendement et le
        PER sont recalculés sur le cours courant.
      </div>
    </div>
  );
}

// ============================================================================
// SOUS-COMPOSANTS
// ============================================================================
function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const subColor =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
        ? "text-red-400"
        : "text-slate-500";
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-lg md:text-xl font-semibold text-white font-mono mt-1">
        {value}
      </div>
      {sub && <div className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  accent,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "emerald" | "red" | "blue" | "purple";
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentColor: Record<string, string> = {
    emerald: "bg-emerald-400",
    red: "bg-red-400",
    blue: "bg-blue-400",
    purple: "bg-purple-400",
  };
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        {accent && (
          <span className={`w-1 h-3.5 rounded-full ${accentColor[accent]}`} />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-slate-500">· {subtitle}</span>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Th({
  children,
  right,
  cls = "",
  onClick,
}: {
  children: React.ReactNode;
  right?: boolean;
  cls?: string;
  onClick: () => void;
}) {
  return (
    <th className={`px-3 py-2.5 font-medium ${right ? "text-right" : "text-left"} ${cls}`}>
      <button
        onClick={onClick}
        className={`flex items-center gap-1 hover:text-slate-100 ${
          right ? "ml-auto" : ""
        }`}
      >
        {children}
      </button>
    </th>
  );
}

function MoversTable({
  rows,
  ytdByAction,
}: {
  rows: ActionRow[];
  ytdByAction: Record<string, number | null>;
}) {
  if (rows.length === 0) {
    return <div className="p-4 text-xs text-slate-500">Aucun mouvement.</div>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => {
          const up = r.changePercent >= 0;
          const ytd = ytdByAction[r.code];
          return (
            <tr key={r.code} className="border-b border-slate-800 last:border-0">
              <td className="px-4 py-2">
                <Link
                  href={`/pros/titre/${r.code}`}
                  className="font-mono text-slate-200 hover:text-blue-400"
                >
                  {r.code}
                </Link>
                <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                  {r.name}
                </div>
              </td>
              <td className="px-2 py-2 text-right font-mono text-slate-300">
                {formatFCFA(r.price)}
              </td>
              <td
                className={`px-4 py-2 text-right font-mono font-medium ${
                  up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {fmtPct(r.changePercent)}
                {ytd != null && (
                  <div className="text-[9px] text-slate-500 font-normal">
                    YTD {fmtPct(ytd)}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ActiveTable({ rows }: { rows: ActionRow[] }) {
  if (rows.length === 0) {
    return <div className="p-4 text-xs text-slate-500">Aucun volume.</div>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className="border-b border-slate-800 last:border-0">
            <td className="px-4 py-2">
              <Link
                href={`/pros/titre/${r.code}`}
                className="font-mono text-slate-200 hover:text-blue-400"
              >
                {r.code}
              </Link>
              <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                {r.name}
              </div>
            </td>
            <td className="px-2 py-2 text-right font-mono text-slate-300">
              {formatFCFA(r.volume)}
              <div className="text-[9px] text-slate-500 font-normal">
                {formatBigFCFA(r.price * r.volume)} FCFA
              </div>
            </td>
            <td
              className={`px-4 py-2 text-right font-mono ${
                r.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fmtPct(r.changePercent)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuadrantButton({
  q,
  title,
  hint,
  count,
  active,
  onToggle,
  color,
}: {
  q: Quadrant;
  title: string;
  hint: string;
  count: number;
  active: Quadrant | null;
  onToggle: (q: Quadrant | null) => void;
  color: "emerald" | "purple" | "blue" | "amber";
}) {
  const isActive = active === q;
  const palette: Record<string, { on: string; off: string; text: string }> = {
    emerald: {
      on: "bg-emerald-500/20 border-emerald-500/50 ring-1 ring-emerald-400/40",
      off: "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10",
      text: "text-emerald-300",
    },
    purple: {
      on: "bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-400/40",
      off: "bg-purple-500/5 border-purple-500/20 hover:bg-purple-500/10",
      text: "text-purple-300",
    },
    blue: {
      on: "bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-400/40",
      off: "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10",
      text: "text-blue-300",
    },
    amber: {
      on: "bg-amber-500/20 border-amber-500/50 ring-1 ring-amber-400/40",
      off: "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10",
      text: "text-amber-300",
    },
  };
  const p = palette[color];
  return (
    <button
      type="button"
      onClick={() => onToggle(isActive ? null : q)}
      aria-pressed={isActive}
      className={`text-left p-2 rounded border transition cursor-pointer ${
        isActive ? p.on : active ? `${p.off} opacity-60 hover:opacity-100` : p.off
      }`}
    >
      <div className={`font-medium ${p.text}`}>
        {title}
        <span className="ml-1 text-[10px] font-normal opacity-70">({count})</span>
      </div>
      <div className="text-slate-400 text-[11px]">{hint}</div>
    </button>
  );
}

function IndexCard({
  index,
  compact = false,
  ytdValue,
}: {
  index: BrvmLiveIndex;
  compact?: boolean;
  ytdValue: number;
}) {
  const positive = index.variationPct > 0;
  const negative = index.variationPct < 0;
  const colorClass = positive
    ? "text-emerald-400"
    : negative
      ? "text-red-400"
      : "text-slate-500";

  const shortLabel = index.name.replace(/^BRVM\s*[-–—]\s*/i, "");
  const isPrincipal = index.category === "principal";
  const displayLabel = isPrincipal ? index.name : shortLabel;

  return (
    <Link
      href={`/marches/indices/${encodeURIComponent(index.code)}`}
      className="block rounded-md border border-slate-700 bg-slate-900/50 p-2.5 hover:border-slate-600 hover:bg-slate-900 transition"
    >
      <div
        className={`${compact ? "text-[10px]" : "text-[11px]"} font-medium text-slate-400 truncate`}
        title={index.name}
      >
        {displayLabel}
      </div>
      <div
        className={`${compact ? "text-base" : "text-xl"} font-semibold tabular-nums text-white mt-0.5`}
      >
        {index.value.toLocaleString("fr-FR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
      <div className={`${compact ? "text-[10px]" : "text-xs"} ${colorClass} font-medium`}>
        {positive ? "+" : ""}
        {index.variationPct.toFixed(2).replace(".", ",")}%
        <span className="text-slate-500 font-normal ml-1">
          (YTD {ytdValue >= 0 ? "+" : ""}
          {ytdValue.toFixed(2).replace(".", ",")}%)
        </span>
      </div>
    </Link>
  );
}
