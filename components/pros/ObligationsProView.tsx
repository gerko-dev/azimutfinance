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
import LivePriceBadge from "../LivePriceBadge";
import type { MarketStats } from "@/lib/listedBondsTypes";
import { bondHref } from "@/lib/listedBondsTypes";

// ============================================================================
// TYPES
// ============================================================================
export type ProBondRow = {
  isin: string;
  code: string;
  name: string;
  issuer: string;
  issuerType: string;
  country: string;
  sector: string;
  couponRate: number;
  maturityDate: string;
  yearsToMaturity: number;
  outstanding: number;
  nominalValue: number;
  rating: string | null;
  greenBond: boolean;
  callable: boolean;
  cleanPrice: number | null;
  ytm: number;
  hasQuote: boolean;
  modifiedDuration: number | null;
  convexity: number | null;
  bpv: number | null;
  signatureSpread: number | null; // décimal (0,012 = +120 pb)
};

type Props = {
  rows: ProBondRow[];
  stats: MarketStats;
  eventsCount: number;
  session: { sessionLabel: string | null; isClosed: boolean | null };
};

type SortKey =
  | "name"
  | "couponRate"
  | "cleanPrice"
  | "ytm"
  | "spread"
  | "duration"
  | "maturity"
  | "outstanding";
type SortOrder = "asc" | "desc";

// ============================================================================
// HELPERS DE FORMATAGE (thème sombre Pro Terminal)
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

function fmtPctRaw(n: number, digits = 2): string {
  return `${n.toFixed(digits).replace(".", ",")}%`;
}

// Spread en points de base, signé.
function fmtSpread(decimal: number | null): string {
  if (decimal === null || !isFinite(decimal)) return "—";
  const bp = decimal * 10000;
  const sign = bp > 0 ? "+" : "";
  return `${sign}${Math.round(bp)} pb`;
}

// Catégorie d'émetteur (pour la coloration de la courbe + filtres).
type BondCategory = "souverain" | "regional" | "corporate";
function bondCategory(issuerType: string): BondCategory {
  if (issuerType === "Obligation d'Etat" || issuerType === "Sukuk Etat")
    return "souverain";
  if (issuerType === "Obligation régionale") return "regional";
  return "corporate";
}
const CATEGORY_META: Record<BondCategory, { label: string; color: string }> = {
  souverain: { label: "Souverain", color: "#60a5fa" },
  regional: { label: "Régional / Supra", color: "#a78bfa" },
  corporate: { label: "Corporate", color: "#fbbf24" },
};

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function ObligationsProView({
  rows,
  stats,
  eventsCount,
  session,
}: Props) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [filterQuote, setFilterQuote] = useState<"all" | "quoted" | "unquoted">(
    "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("maturity");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Champs de recherche précalculés (évite toLowerCase par frappe).
  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        category: bondCategory(r.issuerType),
        maturityTime: r.maturityDate ? Date.parse(r.maturityDate) : 0,
        haystack: (
          r.isin +
          " " +
          r.name +
          " " +
          (r.code ?? "") +
          " " +
          r.issuer
        ).toLowerCase(),
      })),
    [rows]
  );

  // Types disponibles + comptage (pour le <select>).
  const { availableTypes, typeCount } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.issuerType, (counts.get(r.issuerType) ?? 0) + 1);
    return {
      availableTypes: Array.from(counts.keys()).sort(),
      typeCount: counts,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return enriched.filter((b) => {
      if (q && !b.haystack.includes(q)) return false;
      if (filterType !== "all" && b.issuerType !== filterType) return false;
      if (filterCountry !== "all" && b.country !== filterCountry) return false;
      if (filterQuote === "quoted" && !b.hasQuote) return false;
      if (filterQuote === "unquoted" && b.hasQuote) return false;
      if (filterDuration !== "all") {
        const y = b.yearsToMaturity;
        if (filterDuration === "0-2" && (y < 0 || y > 2)) return false;
        if (filterDuration === "2-5" && (y <= 2 || y > 5)) return false;
        if (filterDuration === "5-10" && (y <= 5 || y > 10)) return false;
        if (filterDuration === "10+" && y <= 10) return false;
      }
      return true;
    });
  }, [enriched, deferredSearch, filterType, filterCountry, filterQuote, filterDuration]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "couponRate":
          cmp = a.couponRate - b.couponRate;
          break;
        case "cleanPrice": {
          const ap = a.cleanPrice;
          const bp = b.cleanPrice;
          if (ap === null && bp === null) return 0;
          if (ap === null) return 1;
          if (bp === null) return -1;
          cmp = ap - bp;
          break;
        }
        case "ytm":
          cmp = a.ytm - b.ytm;
          break;
        case "spread": {
          const as = a.signatureSpread;
          const bs = b.signatureSpread;
          if (as === null && bs === null) return 0;
          if (as === null) return 1;
          if (bs === null) return -1;
          cmp = as - bs;
          break;
        }
        case "duration": {
          const ad = a.modifiedDuration;
          const bd = b.modifiedDuration;
          if (ad === null && bd === null) return 0;
          if (ad === null) return 1;
          if (bd === null) return -1;
          cmp = ad - bd;
          break;
        }
        case "maturity":
          cmp = a.maturityTime - b.maturityTime;
          break;
        case "outstanding":
          cmp = a.outstanding - b.outstanding;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortOrder]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortOrder(key === "name" ? "asc" : "desc");
      }
    },
    [sortKey]
  );

  // Points de la courbe : uniquement les YTM réellement observés (cote BRVM).
  const scatterByCategory = useMemo(() => {
    const groups: Record<BondCategory, Array<Record<string, number | string>>> = {
      souverain: [],
      regional: [],
      corporate: [],
    };
    for (const b of filtered) {
      if (!b.hasQuote || b.yearsToMaturity <= 0) continue;
      groups[b.category].push({
        x: Number(b.yearsToMaturity.toFixed(2)),
        y: Number((b.ytm * 100).toFixed(3)),
        z: b.outstanding,
        name: b.name,
        code: b.code,
        coupon: b.couponRate * 100,
      });
    }
    return groups;
  }, [filtered]);

  const quotedCount = useMemo(
    () => filtered.filter((b) => b.hasQuote).length,
    [filtered]
  );

  // Export CSV de la sélection courante (outil pro).
  const exportCsv = useCallback(() => {
    const header = [
      "ISIN",
      "Code",
      "Nom",
      "Emetteur",
      "Type",
      "Pays",
      "Coupon_%",
      "Cours",
      "YTM_%",
      "Spread_pb",
      "Duration_mod",
      "BPV",
      "Echeance",
      "Annees_residuelles",
      "Encours",
      "Rating",
    ];
    const lines = sorted.map((b) =>
      [
        b.isin,
        b.code,
        `"${b.name.replace(/"/g, '""')}"`,
        `"${b.issuer.replace(/"/g, '""')}"`,
        b.issuerType,
        b.country,
        (b.couponRate * 100).toFixed(2).replace(".", ","),
        b.cleanPrice != null ? Math.round(b.cleanPrice) : "",
        (b.ytm * 100).toFixed(2).replace(".", ","),
        b.signatureSpread != null ? Math.round(b.signatureSpread * 10000) : "",
        b.modifiedDuration != null
          ? b.modifiedDuration.toFixed(2).replace(".", ",")
          : "",
        b.bpv != null ? b.bpv.toFixed(2).replace(".", ",") : "",
        b.maturityDate,
        b.yearsToMaturity.toFixed(2).replace(".", ","),
        Math.round(b.outstanding),
        b.rating ?? "",
      ].join(";")
    );
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "obligations-cotees-brvm.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [sorted]);

  const boc = stats.boc;
  const bocDateSub = boc ? `au ${formatDate(boc.bocDate)}` : "moyenne pondérée";
  const encoursValue = boc?.capitalisationBoursiere ?? stats.totalOutstanding;
  const bondsCountValue = boc?.bondsCount ?? stats.totalBonds;

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
            <span className="text-slate-400">Obligations cotées</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            Obligations cotées BRVM
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-3xl">
            {rows.length} lignes négociables · cours live, YTM actuariel, duration,
            BPV et spread de signature vs courbe souveraine UMOA-Titres.
          </p>
        </div>
        <LivePriceBadge
          sessionLabel={session.sessionLabel}
          isClosed={session.isClosed}
          variant="dark"
        />
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Obligations cotées" value={`${bondsCountValue}`} sub="sur la BRVM" />
        <Kpi
          label="Encours total"
          value={formatBigFCFA(encoursValue)}
          sub={`FCFA · ${bocDateSub}`}
        />
        <Kpi
          label="Coupon moyen"
          value={fmtPctRaw(stats.weightedYield * 100)}
          sub="pondéré par encours"
        />
        <Kpi
          label="Durée moyenne"
          value={`${stats.averageDuration.toFixed(1).replace(".", ",")} ans`}
          sub="pondérée par encours"
        />
        <Kpi
          label="Volume échangé"
          value={boc ? formatFCFA(boc.volumeEchange) : "—"}
          sub={boc ? bocDateSub : "—"}
        />
        <Kpi
          label="Valeur transigée"
          value={boc ? formatBigFCFA(boc.valeurTransigee) : "—"}
          sub={boc ? `FCFA · ${bocDateSub}` : "—"}
        />
      </div>

      {/* ====== OUTILS PRO (accès direct, débloqués) ====== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ToolLink
          href="/marches/obligations/courbe-taux"
          icon="📈"
          title="Courbe des taux"
          desc="YTM actuariel par durée, régression paramétrable."
        />
        <ToolLink
          href="/marches/obligations/surveillance"
          icon="🔎"
          title="À surveiller"
          desc="Obligations dont le YTM s'écarte de leurs pairs (z-score)."
        />
        <ToolLink
          href="/marches/obligations/calendrier"
          icon="📅"
          title="Calendrier obligataire"
          desc={`${eventsCount} flux (coupons, amortissements) à venir.`}
        />
      </div>

      {/* ====== COURBE DES TAUX (YTM vs maturité) ====== */}
      <Card
        title="Courbe des taux cotés"
        subtitle={`${quotedCount} obligation${quotedCount > 1 ? "s" : ""} cotée${
          quotedCount > 1 ? "s" : ""
        } · YTM observé`}
        accent="blue"
      >
        <div className="p-4">
          {quotedCount === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Aucune cote BRVM disponible pour la séance — courbe indisponible.
            </div>
          ) : (
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
                    label={{
                      value: "Maturité résiduelle (ans)",
                      position: "insideBottom",
                      offset: -14,
                      fill: "#64748b",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="YTM"
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
                      return (
                        <div className="bg-slate-900 border border-slate-700 rounded-md shadow-lg p-3 text-xs text-slate-200 max-w-[240px]">
                          <div className="font-semibold mb-1">{d.name}</div>
                          <div className="font-mono text-slate-500 text-[11px] mb-2">
                            {d.code}
                          </div>
                          <div className="space-y-0.5 font-mono">
                            <div>YTM : {Number(d.y).toFixed(2)}%</div>
                            <div>Maturité : {Number(d.x).toFixed(1)} ans</div>
                            <div>Coupon : {Number(d.coupon).toFixed(2)}%</div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                  {(Object.keys(scatterByCategory) as BondCategory[]).map((cat) =>
                    scatterByCategory[cat].length > 0 ? (
                      <Scatter
                        key={cat}
                        name={CATEGORY_META[cat].label}
                        data={scatterByCategory[cat]}
                        fill={CATEGORY_META[cat].color}
                        fillOpacity={0.75}
                      />
                    ) : null
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      {/* ====== REPARTITIONS ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Répartition par pays" subtitle="nombre de lignes">
          <DistributionBars data={stats.byCountry} accent="#60a5fa" />
        </Card>
        <Card title="Répartition par type d'émetteur" subtitle="nombre de lignes">
          <DistributionBars data={stats.byType} accent="#a78bfa" />
        </Card>
      </div>

      {/* ====== TABLEAU ====== */}
      <Card
        title="Liste des obligations cotées"
        subtitle={
          sorted.length === rows.length
            ? `${rows.length} lignes`
            : `${sorted.length} / ${rows.length}`
        }
        right={
          <button
            type="button"
            onClick={exportCsv}
            className="text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition"
            title="Exporter la sélection courante en CSV"
          >
            ⬇ Export CSV
          </button>
        }
      >
        {/* Filtres */}
        <div className="p-4 border-b border-slate-700 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            type="text"
            placeholder="Rechercher (nom, ISIN, code, émetteur…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 md:col-span-1"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous les types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t} ({typeCount.get(t) ?? 0})
              </option>
            ))}
          </select>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Tous les pays</option>
            {Object.keys(stats.byCountry)
              .sort()
              .map((c) => (
                <option key={c} value={c}>
                  {c} ({stats.byCountry[c]})
                </option>
              ))}
          </select>
          <select
            value={filterDuration}
            onChange={(e) => setFilterDuration(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Toutes durées</option>
            <option value="0-2">0-2 ans</option>
            <option value="2-5">2-5 ans</option>
            <option value="5-10">5-10 ans</option>
            <option value="10+">Plus de 10 ans</option>
          </select>
          <select
            value={filterQuote}
            onChange={(e) =>
              setFilterQuote(e.target.value as "all" | "quoted" | "unquoted")
            }
            className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Cotées + non cotées</option>
            <option value="quoted">Cotées uniquement</option>
            <option value="unquoted">Non cotées uniquement</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <Th onClick={() => toggleSort("name")}>
                  Obligation <SortIcon active={sortKey === "name"} order={sortOrder} />
                </Th>
                <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">
                  Émetteur
                </th>
                <th className="px-2 py-2.5 text-center font-medium">Pays</th>
                <Th right onClick={() => toggleSort("couponRate")}>
                  Coupon{" "}
                  <SortIcon active={sortKey === "couponRate"} order={sortOrder} />
                </Th>
                <Th right onClick={() => toggleSort("cleanPrice")}>
                  Cours{" "}
                  <SortIcon active={sortKey === "cleanPrice"} order={sortOrder} />
                </Th>
                <Th right onClick={() => toggleSort("ytm")}>
                  YTM <SortIcon active={sortKey === "ytm"} order={sortOrder} />
                </Th>
                <Th right cls="hidden md:table-cell" onClick={() => toggleSort("spread")}>
                  Spread souv.{" "}
                  <SortIcon active={sortKey === "spread"} order={sortOrder} />
                </Th>
                <Th
                  right
                  cls="hidden lg:table-cell"
                  onClick={() => toggleSort("duration")}
                >
                  Dur. mod.{" "}
                  <SortIcon active={sortKey === "duration"} order={sortOrder} />
                </Th>
                <th className="px-3 py-2.5 text-right font-medium hidden xl:table-cell">
                  BPV
                </th>
                <Th right onClick={() => toggleSort("maturity")}>
                  Échéance{" "}
                  <SortIcon active={sortKey === "maturity"} order={sortOrder} />
                </Th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">
                  Rating
                </th>
                <Th
                  right
                  cls="hidden xl:table-cell"
                  onClick={() => toggleSort("outstanding")}
                >
                  Encours{" "}
                  <SortIcon active={sortKey === "outstanding"} order={sortOrder} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const priceDelta =
                  b.cleanPrice != null && b.nominalValue > 0
                    ? ((b.cleanPrice - b.nominalValue) / b.nominalValue) * 100
                    : null;
                return (
                  <tr
                    key={b.code || b.isin}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 transition"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/pros${bondHref(b)}`}
                        className="flex items-center gap-1.5 group"
                      >
                        {b.greenBond && (
                          <span title="Obligation verte" className="text-green-500">
                            🌱
                          </span>
                        )}
                        <span>
                          <span className="font-medium text-slate-200 group-hover:text-blue-400">
                            {b.name}
                            {b.code && (
                              <span className="ml-1.5 text-[10px] text-slate-500 font-normal">
                                ({b.code})
                              </span>
                            )}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            {b.isin}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <div className="text-slate-300 truncate max-w-[180px]">
                        {b.issuer}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                        {b.issuerType}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <CountryFlag country={b.country} size={16} />
                        <span className="text-[9px] text-slate-500 leading-none">
                          {b.country}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                      {(b.couponRate * 100).toFixed(2).replace(".", ",")}%
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {b.cleanPrice != null ? (
                        <div>
                          <div className="font-mono font-medium text-slate-200">
                            {formatFCFA(b.cleanPrice)}
                          </div>
                          {priceDelta != null && (
                            <div className="text-[10px]">
                              {Math.abs(priceDelta) < 0.05 ? (
                                <span className="text-slate-500">au pair</span>
                              ) : (
                                <span
                                  className={
                                    priceDelta > 0
                                      ? "text-red-400"
                                      : "text-emerald-400"
                                  }
                                >
                                  {priceDelta > 0 ? "+" : ""}
                                  {priceDelta.toFixed(2).replace(".", ",")}%
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium">
                      <span
                        className={
                          !b.hasQuote
                            ? "text-slate-500"
                            : b.ytm > b.couponRate
                            ? "text-emerald-400"
                            : b.ytm < b.couponRate
                            ? "text-red-400"
                            : "text-slate-200"
                        }
                      >
                        {(b.ytm * 100).toFixed(2).replace(".", ",")}%
                      </span>
                      {!b.hasQuote && (
                        <div className="text-[9px] text-slate-600 font-normal">
                          au pair
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">
                      <span
                        className={
                          b.signatureSpread == null
                            ? "text-slate-600"
                            : b.signatureSpread > 0
                            ? "text-emerald-400"
                            : b.signatureSpread < 0
                            ? "text-red-400"
                            : "text-slate-300"
                        }
                      >
                        {fmtSpread(b.signatureSpread)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300 hidden lg:table-cell">
                      {b.modifiedDuration != null
                        ? b.modifiedDuration.toFixed(2).replace(".", ",")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden xl:table-cell">
                      {b.bpv != null ? b.bpv.toFixed(2).replace(".", ",") : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="text-slate-300">{formatDate(b.maturityDate)}</div>
                      <div className="text-[10px] text-slate-500">
                        {b.yearsToMaturity.toFixed(1).replace(".", ",")} ans
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      {b.rating ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">
                          {b.rating}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden xl:table-cell">
                      {formatBigFCFA(b.outstanding)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              Aucune obligation ne correspond à vos critères.
            </div>
          )}
        </div>
        <div className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-800">
          Spread souv. = YTM coté − courbe primaire UMOA-Titres du pays (interpolée à
          la maturité résiduelle). BPV = sensibilité prix pour 1 pb de taux (par
          titre). YTM « au pair » = coupon, faute de cote BRVM du jour.
        </div>
      </Card>
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
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-lg md:text-xl font-semibold text-white font-mono mt-1">
        {value}
      </div>
      {sub && <div className="text-[11px] mt-0.5 text-slate-500">{sub}</div>}
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

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return <span className="text-slate-600">↕</span>;
  return <span className="text-blue-400">{order === "asc" ? "↑" : "↓"}</span>;
}

function ToolLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-lg p-3 hover:border-blue-500/50 hover:bg-slate-800/70 transition"
    >
      <span className="text-lg leading-none mt-0.5" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200 group-hover:text-blue-300">
          {title}
        </span>
        <span className="block text-[11px] text-slate-500 mt-0.5">{desc}</span>
      </span>
      <span className="ml-auto text-slate-600 group-hover:text-blue-400" aria-hidden>
        →
      </span>
    </Link>
  );
}

// Mini histogramme horizontal : distribution clé → nombre, trié décroissant.
function DistributionBars({
  data,
  accent,
}: {
  data: Record<string, number>;
  accent: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <div className="p-4 space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-slate-400" title={key}>
            {key}
          </span>
          <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(value / max) * 100}%`, backgroundColor: accent }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-slate-400">
            {value}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-xs text-slate-500">Aucune donnée.</div>
      )}
    </div>
  );
}
