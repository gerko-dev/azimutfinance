"use client";

import { useState, useMemo, useDeferredValue, useCallback } from "react";
import Link from "next/link";
import {
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import CountryFlag from "../CountryFlag";
import type {
  SovereignBondLite,
  EmissionUMOAFuture,
  EmissionUMOAPlanned,
} from "@/lib/listedBondsTypes";

// ============================================================================
// TYPES
// ============================================================================
type SovStats = {
  totalBonds: number;
  totalBAT: number;
  totalOAT: number;
  totalVolume: number;
  avgYield: number;
  avgMaturity: number;
  volumeOAT: number;
  volumeBAT: number;
  avgYieldOAT: number;
  avgYieldBAT: number;
  avgMaturityOAT: number;
  avgMaturityBAT: number;
  byCountry: Record<string, number>;
  volumeByCountry: Record<string, number>;
};

export type SouverainsProData = {
  bonds: SovereignBondLite[];
  stats: SovStats;
  upcoming: EmissionUMOAFuture[];
  planned: EmissionUMOAPlanned[];
  countryCurves: Record<string, Array<{ maturity: number; ytm: number }>>;
  lastAdjudication: string;
};

type SortKey =
  | "country"
  | "type"
  | "maturity"
  | "lastYield"
  | "outstandingEstimate"
  | "nbRounds"
  | "lastIssueDate";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 25;

// ============================================================================
// CONSTANTES PAYS
// ============================================================================
const COUNTRY_NAME: Record<string, string> = {
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  BF: "Burkina Faso",
  ML: "Mali",
  BJ: "Bénin",
  TG: "Togo",
  NE: "Niger",
  GW: "Guinée-Bissau",
};
const COUNTRY_COLOR: Record<string, string> = {
  CI: "#60a5fa",
  SN: "#34d399",
  BF: "#a78bfa",
  ML: "#fb923c",
  BJ: "#22d3ee",
  TG: "#f472b6",
  NE: "#fbbf24",
  GW: "#94a3b8",
};
function countryName(code: string): string {
  return COUNTRY_NAME[code] ?? code;
}
function countryColor(code: string): string {
  return COUNTRY_COLOR[code] ?? "#64748b";
}

// ============================================================================
// FORMATAGE
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
// Les montants UMOA-Titres sont stockés en millions FCFA → ×1e6 avant format.
function fmtMFCFA(millions: number): string {
  return formatBigFCFA(millions * 1e6);
}
function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
function fmtPct(n: number, digits = 2): string {
  return `${n.toFixed(digits).replace(".", ",")}%`;
}
function maturityLabel(years: number): string {
  if (years < 1) return `${Math.round(years * 12)} mois`;
  return `${years.toFixed(years % 1 === 0 ? 0 : 1).replace(".", ",")} ans`;
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function SouverainsProView({ data }: { data: SouverainsProData }) {
  const { bonds, stats, upcoming, planned, countryCurves, lastAdjudication } = data;

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "OAT" | "BAT">("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastIssueDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Filtres de la courbe (indépendants de la table).
  const [curveType, setCurveType] = useState<"all" | "OAT" | "BAT">("OAT");
  const [curveCountry, setCurveCountry] = useState<string>("all");

  const countriesSorted = useMemo(
    () => Object.keys(stats.byCountry).sort(),
    [stats.byCountry]
  );

  const enriched = useMemo(
    () =>
      bonds.map((b) => ({
        ...b,
        issueTime: b.lastIssueDate ? Date.parse(b.lastIssueDate) : 0,
        haystack: (
          b.isin +
          " " +
          b.country +
          " " +
          countryName(b.country) +
          " " +
          b.type
        ).toLowerCase(),
      })),
    [bonds]
  );

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return enriched.filter((b) => {
      if (q && !b.haystack.includes(q)) return false;
      if (filterCountry !== "all" && b.country !== filterCountry) return false;
      if (filterType !== "all" && b.type !== filterType) return false;
      if (filterDuration !== "all") {
        const y = b.maturity;
        if (filterDuration === "0-1" && y > 1) return false;
        if (filterDuration === "1-3" && (y <= 1 || y > 3)) return false;
        if (filterDuration === "3-7" && (y <= 3 || y > 7)) return false;
        if (filterDuration === "7+" && y <= 7) return false;
      }
      return true;
    });
  }, [enriched, deferredSearch, filterCountry, filterType, filterDuration]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "country":
          cmp = a.country.localeCompare(b.country);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "maturity":
          cmp = a.maturity - b.maturity;
          break;
        case "lastYield":
          cmp = a.lastYield - b.lastYield;
          break;
        case "outstandingEstimate":
          cmp = a.outstandingEstimate - b.outstandingEstimate;
          break;
        case "nbRounds":
          cmp = a.nbRounds - b.nbRounds;
          break;
        case "lastIssueDate":
          cmp = a.issueTime - b.issueTime;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortOrder]);

  // Reset page quand la sélection change.
  const filtersKey = `${deferredSearch}|${filterCountry}|${filterType}|${filterDuration}|${sortKey}|${sortOrder}`;
  const [prevKey, setPrevKey] = useState(filtersKey);
  if (prevKey !== filtersKey) {
    setPrevKey(filtersKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paged = sorted.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortOrder(key === "country" || key === "type" ? "asc" : "desc");
      }
    },
    [sortKey]
  );

  // Dernières adjudications : 8 plus récentes par date d'adjudication.
  const recentAdjudications = useMemo(
    () =>
      [...bonds]
        .filter((b) => b.lastTradeDate)
        .sort((a, b) => b.lastTradeDate.localeCompare(a.lastTradeDate))
        .slice(0, 8),
    [bonds]
  );

  // Données du nuage : un point par bond filtré sur (type, pays) de la courbe.
  const scatterByCountry = useMemo(() => {
    const groups: Record<string, Array<Record<string, number | string>>> = {};
    for (const b of bonds) {
      if (curveType !== "all" && b.type !== curveType) continue;
      if (curveCountry !== "all" && b.country !== curveCountry) continue;
      if (b.maturity <= 0 || b.lastYield <= 0) continue;
      (groups[b.country] ??= []).push({
        x: Number(b.maturity.toFixed(2)),
        y: Number((b.lastYield * 100).toFixed(3)),
        z: b.outstandingEstimate,
        isin: b.isin || b.id,
        type: b.type,
        country: b.country,
      });
    }
    return groups;
  }, [bonds, curveType, curveCountry]);

  // Overlay courbe primaire : uniquement si un seul pays est sélectionné.
  const primaryCurve = useMemo(() => {
    if (curveCountry === "all") return null;
    const pts = countryCurves[curveCountry];
    if (!pts || pts.length < 2) return null;
    return pts.map((p) => ({ x: p.maturity, y: Number((p.ytm * 100).toFixed(3)) }));
  }, [curveCountry, countryCurves]);

  const exportCsv = useCallback(() => {
    const header = [
      "ISIN",
      "Pays",
      "Type",
      "Maturite_ans",
      "Dernier_rendement_%",
      "Encours_estime_MFCFA",
      "Nb_rounds",
      "Derniere_adjudication",
    ];
    const lines = sorted.map((b) =>
      [
        b.isin,
        b.country,
        b.type,
        b.maturity.toFixed(2).replace(".", ","),
        (b.lastYield * 100).toFixed(2).replace(".", ","),
        Math.round(b.outstandingEstimate),
        b.nbRounds,
        b.lastTradeDate,
      ].join(";")
    );
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "souverains-umoa-titres.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [sorted]);

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5">
            <a href="/pros" className="hover:text-slate-300 transition">
              Pro Terminal
            </a>
            <span className="text-slate-700">›</span>
            <span className="text-slate-400">Souverains UMOA-Titres</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            Souverains UMOA-Titres
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-3xl">
            Marché primaire des OAT & BAT des États de l&apos;UEMOA (non cotés) ·
            rendements d&apos;adjudication, courbe par pays et calendrier des
            émissions.
          </p>
        </div>
        {lastAdjudication && (
          <div className="text-[11px] text-slate-500">
            Dernière adjudication ·{" "}
            <span className="text-slate-300 font-mono">
              {formatDate(lastAdjudication)}
            </span>
          </div>
        )}
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Titres actifs" value={`${stats.totalBonds}`} sub={`${countriesSorted.length} États`} />
        <Kpi label="OAT / BAT" value={`${stats.totalOAT} / ${stats.totalBAT}`} sub="obligations / bons" />
        <Kpi label="Encours estimé" value={fmtMFCFA(stats.totalVolume)} sub="FCFA · net rachats" />
        <Kpi label="Rendement moyen" value={fmtPct(stats.avgYield * 100)} sub="pondéré par volume" />
        <Kpi label="Maturité moyenne" value={maturityLabel(stats.avgMaturity)} sub="résiduelle pondérée" />
        <Kpi
          label="Rdt OAT / BAT"
          value={`${fmtPct(stats.avgYieldOAT * 100, 1)} / ${fmtPct(stats.avgYieldBAT * 100, 1)}`}
          sub="long / court terme"
        />
      </div>

      {/* ====== COURBE DES TAUX SOUVERAINE ====== */}
      <Card
        title="Courbe des taux souverains"
        subtitle="rendement d'adjudication × maturité"
        right={
          <div className="flex items-center gap-1.5 text-[11px]">
            <select
              value={curveType}
              onChange={(e) => setCurveType(e.target.value as "all" | "OAT" | "BAT")}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
            >
              <option value="all">OAT + BAT</option>
              <option value="OAT">OAT</option>
              <option value="BAT">BAT</option>
            </select>
            <select
              value={curveCountry}
              onChange={(e) => setCurveCountry(e.target.value)}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
            >
              <option value="all">Tous pays</option>
              {countriesSorted.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Maturité"
                  stroke="#64748b"
                  fontSize={11}
                  domain={[0, "dataMax"]}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}a`}
                  label={{ value: "Maturité (ans)", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Rendement"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                  domain={["auto", "auto"]}
                  width={44}
                />
                <ZAxis type="number" dataKey="z" range={[40, 400]} name="Encours" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "#475569" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload as Record<string, number | string>;
                    if (d.isCurve) {
                      return (
                        <div className="bg-slate-900 border border-slate-700 rounded-md shadow-lg p-2.5 text-xs text-slate-200">
                          <div className="font-mono">Courbe primaire</div>
                          <div className="font-mono">{Number(d.x).toFixed(1)} ans · {Number(d.y).toFixed(2)}%</div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-slate-900 border border-slate-700 rounded-md shadow-lg p-3 text-xs text-slate-200 max-w-[230px]">
                        <div className="font-semibold mb-1">
                          {countryName(String(d.country))} · {d.type}
                        </div>
                        <div className="font-mono text-slate-500 text-[11px] mb-1">{d.isin}</div>
                        <div className="space-y-0.5 font-mono">
                          <div>Rendement : {Number(d.y).toFixed(2)}%</div>
                          <div>Maturité : {Number(d.x).toFixed(1)} ans</div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                {Object.keys(scatterByCountry)
                  .sort()
                  .map((c) => (
                    <Scatter
                      key={c}
                      name={countryName(c)}
                      data={scatterByCountry[c]}
                      fill={countryColor(c)}
                      fillOpacity={0.7}
                    />
                  ))}
                {primaryCurve && (
                  <Scatter
                    name={`Courbe primaire ${curveCountry}`}
                    data={primaryCurve.map((p) => ({ ...p, isCurve: 1 }))}
                    fill="#e2e8f0"
                    line={{ stroke: "#e2e8f0", strokeWidth: 2, strokeDasharray: "6 3" }}
                    lineType="joint"
                    shape="cross"
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            La courbe primaire (sélection d&apos;un pays) interpole les
            adjudications cash des 90 derniers jours ; les points sont les
            derniers rendements de chaque ligne, taille ∝ encours estimé.
          </p>
        </div>
      </Card>

      {/* ====== REPARTITIONS + DERNIERES ADJUDICATIONS ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Encours par pays" subtitle="estimé · FCFA">
          <DistributionBars
            data={stats.volumeByCountry}
            labelFor={countryName}
            colorFor={countryColor}
            format={(v) => fmtMFCFA(v)}
          />
        </Card>
        <Card title="Dernières adjudications" subtitle="8 plus récentes">
          {recentAdjudications.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {recentAdjudications.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <CountryFlag country={b.country} size={14} />
                    <span className="text-slate-300 truncate">
                      {b.isin || `${b.type} ${countryName(b.country)}`}
                    </span>
                    <TypeBadge type={b.type} />
                  </div>
                  <div className="flex items-center gap-3 font-mono text-slate-400 shrink-0">
                    <span>{maturityLabel(b.maturity)}</span>
                    <span className="text-emerald-400">{fmtPct(b.lastYield * 100)}</span>
                    <span className="text-slate-500 hidden md:inline">{formatDate(b.lastTradeDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-xs text-slate-500">Aucune adjudication récente.</div>
          )}
        </Card>
      </div>

      {/* ====== TABLEAU ====== */}
      <Card
        title="Titres souverains"
        subtitle={sorted.length === bonds.length ? `${bonds.length} lignes` : `${sorted.length} / ${bonds.length}`}
        right={
          <button
            type="button"
            onClick={exportCsv}
            className="text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition"
          >
            ⬇ Export CSV
          </button>
        }
      >
        <div className="p-4 border-b border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="Rechercher (ISIN, pays…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous les pays</option>
            {countriesSorted.map((c) => (
              <option key={c} value={c}>
                {countryName(c)} ({stats.byCountry[c]})
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "all" | "OAT" | "BAT")}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">OAT + BAT</option>
            <option value="OAT">OAT (obligations)</option>
            <option value="BAT">BAT (bons)</option>
          </select>
          <select
            value={filterDuration}
            onChange={(e) => setFilterDuration(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Toutes maturités</option>
            <option value="0-1">≤ 1 an</option>
            <option value="1-3">1-3 ans</option>
            <option value="3-7">3-7 ans</option>
            <option value="7+">7 ans +</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <Th onClick={() => toggleSort("country")}>
                  Pays <SortIcon active={sortKey === "country"} order={sortOrder} />
                </Th>
                <th className="px-3 py-2.5 text-left font-medium">ISIN</th>
                <Th onClick={() => toggleSort("type")}>
                  Type <SortIcon active={sortKey === "type"} order={sortOrder} />
                </Th>
                <Th right onClick={() => toggleSort("maturity")}>
                  Maturité <SortIcon active={sortKey === "maturity"} order={sortOrder} />
                </Th>
                <Th right onClick={() => toggleSort("lastYield")}>
                  Dernier rdt <SortIcon active={sortKey === "lastYield"} order={sortOrder} />
                </Th>
                <Th right cls="hidden md:table-cell" onClick={() => toggleSort("outstandingEstimate")}>
                  Encours est. <SortIcon active={sortKey === "outstandingEstimate"} order={sortOrder} />
                </Th>
                <Th right cls="hidden lg:table-cell" onClick={() => toggleSort("nbRounds")}>
                  Rounds <SortIcon active={sortKey === "nbRounds"} order={sortOrder} />
                </Th>
                <Th right onClick={() => toggleSort("lastIssueDate")}>
                  Dern. émission <SortIcon active={sortKey === "lastIssueDate"} order={sortOrder} />
                </Th>
                <th className="px-3 py-2.5 text-right font-medium hidden lg:table-cell">UMOA</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 transition">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/pros/souverain/${encodeURIComponent(b.id)}`}
                      className="flex items-center gap-2 group"
                      title="Ouvrir la fiche pro"
                    >
                      <CountryFlag country={b.country} size={16} />
                      <span className="text-slate-300 group-hover:text-white transition">{b.country}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">
                    <Link
                      href={`/pros/souverain/${encodeURIComponent(b.id)}`}
                      className="hover:text-blue-300 transition"
                    >
                      {b.isin || b.id.replace(/^BAT-/, "")}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <TypeBadge type={b.type} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{maturityLabel(b.maturity)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-emerald-400">
                    {fmtPct(b.lastYield * 100)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden md:table-cell">
                    {fmtMFCFA(b.outstandingEstimate)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500 hidden lg:table-cell">{b.nbRounds}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">{formatDate(b.lastIssueDate)}</td>
                  <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                    {b.lastUrl ? (
                      <a
                        href={b.lastUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                        title="Fiche UMOA-Titres"
                      >
                        ↗
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paged.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              Aucun titre ne correspond à vos critères.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {pageClamped} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Préc.
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Suiv. →
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ====== CALENDRIER ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Émissions à venir" subtitle={`${upcoming.length} adjudication${upcoming.length > 1 ? "s" : ""}`}>
          {upcoming.length > 0 ? (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {upcoming.map((e, i) => (
                <CalendarRow
                  key={i}
                  date={e.dateOperation}
                  country={e.country}
                  instrument={e.instrument || e.titreES}
                  precisions={e.precisions}
                  maturityMonths={e.maturityMonths}
                  amount={e.amount}
                  url={e.url}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-xs text-slate-500">Aucune adjudication programmée.</div>
          )}
        </Card>
        <Card title="Calendrier planifié" subtitle={`${planned.length} opération${planned.length > 1 ? "s" : ""}`}>
          {planned.length > 0 ? (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {planned.map((e, i) => (
                <CalendarRow
                  key={i}
                  date={e.dateOperation}
                  country={e.country}
                  instrument={e.instrument || e.titreES}
                  precisions={e.precisions}
                  maturityMonths={0}
                  amount={e.amount}
                  url={e.url}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-xs text-slate-500">Calendrier indisponible.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// SOUS-COMPOSANTS
// ============================================================================
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg md:text-xl font-semibold text-white font-mono mt-1">{value}</div>
      {sub && <div className="text-[11px] mt-0.5 text-slate-500">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        {subtitle && <span className="text-[10px] text-slate-500">· {subtitle}</span>}
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
      <button onClick={onClick} className={`flex items-center gap-1 hover:text-slate-100 ${right ? "ml-auto" : ""}`}>
        {children}
      </button>
    </th>
  );
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return <span className="text-slate-600">↕</span>;
  return <span className="text-blue-400">{order === "asc" ? "↑" : "↓"}</span>;
}

function TypeBadge({ type }: { type: "OAT" | "BAT" }) {
  const cls =
    type === "OAT"
      ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
      : "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>{type}</span>
  );
}

function CalendarRow({
  date,
  country,
  instrument,
  precisions,
  maturityMonths,
  amount,
  url,
}: {
  date: string;
  country: string;
  instrument: string;
  precisions: string;
  maturityMonths: number;
  amount: number;
  url: string;
}) {
  const detail = [instrument, precisions].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <CountryFlag country={country} size={14} />
        <div className="min-w-0">
          <div className="text-slate-300">
            {formatDate(date)}
            {maturityMonths > 0 && (
              <span className="text-slate-500 ml-1.5">· {maturityMonths} mois</span>
            )}
          </div>
          {detail && <div className="text-[10px] text-slate-500 truncate">{detail}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-slate-300">{amount > 0 ? `${fmtMFCFA(amount)}` : "—"}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
            title="Fiche UMOA-Titres"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

// Mini histogramme horizontal : distribution clé → valeur, trié décroissant.
function DistributionBars({
  data,
  labelFor,
  colorFor,
  format,
}: {
  data: Record<string, number>;
  labelFor: (k: string) => string;
  colorFor: (k: string) => string;
  format: (v: number) => string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <div className="p-4 space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-slate-400" title={labelFor(key)}>
            {labelFor(key)}
          </span>
          <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: colorFor(key) }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-slate-400">{format(value)}</span>
        </div>
      ))}
      {entries.length === 0 && <div className="text-xs text-slate-500">Aucune donnée.</div>}
    </div>
  );
}
