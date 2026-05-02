"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";

type Source = "jiji" | "coinafrique";
type Transaction = "achat" | "location";

type Listing = {
  source: Source;
  transaction: Transaction;
  type_bien: string;
  titre: string;
  prix_fcfa: number | null;
  surface_m2: number | null;
  prix_m2_fcfa: number | null;
  chambres: number | null;
  quartier: string;
  sous_quartier: string;
  standing: string;
  url: string;
};

type HeatmapCell = {
  quartier: string;
  type_bien: string;
  count: number;
  prix_median: number | null;
};

type YieldRow = {
  quartier: string;
  type_bien: string;
  chambres: number | null;
  countAchat: number;
  countLocation: number;
  prix_achat_median: number;
  loyer_mensuel_mean: number;
  rendement_brut_pct: number;
};

type DealRow = {
  listing: Listing;
  reference_median: number;
  spread_pct: number;
  groupSize: number;
};

type PriceM2Row = {
  quartier: string;
  transaction: Transaction;
  count: number;
  prix_m2_median: number | null;
  prix_m2_p25: number | null;
  prix_m2_p75: number | null;
  prix_m2_mean: number | null;
};

const ALL_TYPES = ["appartement", "villa", "studio", "maison", "immeuble", "terrain", "commercial"] as const;

function fmtFCFA(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2).replace(".", ",")} Md`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
}

function fmtPct(v: number | null, dec = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${v.toFixed(dec).replace(".", ",")} %`;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function quantile(arr: number[], q: number): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (pos - lo) * (s[hi] - s[lo]);
}

function heatmapColor(value: number | null, min: number, max: number): string {
  if (value === null) return "#f8fafc";
  if (max === min) return "#dbeafe";
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  // bleu clair -> bleu fonce
  const r = Math.round(219 + (15 - 219) * t);
  const g = Math.round(234 + (118 - 234) * t);
  const b = Math.round(254 + (183 - 254) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function ImmobilierAnalyzer({
  listings,
  heatmapAchat,
  heatmapLocation,
  yieldsRoom,
  yieldsType,
  topDealsAchat,
  topDealsLocation,
  priceM2Rows,
  allQuartiers,
  allTypes,
}: {
  listings: Listing[];
  heatmapAchat: { quartiers: string[]; types: string[]; cells: HeatmapCell[] };
  heatmapLocation: { quartiers: string[]; types: string[]; cells: HeatmapCell[] };
  yieldsRoom: YieldRow[];
  yieldsType: YieldRow[];
  topDealsAchat: DealRow[];
  topDealsLocation: DealRow[];
  priceM2Rows: PriceM2Row[];
  allQuartiers: string[];
  allTypes: string[];
}) {
  const [transaction, setTransaction] = useState<Transaction>("achat");
  const [selectedQuartiers, setSelectedQuartiers] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [chambresFilter, setChambresFilter] = useState<number | null>(null);
  const [tab, setTab] = useState<
    "distribution" | "heatmap" | "rendements" | "prix_m2" | "deals" | "annonces"
  >("distribution");
  const [tableSort, setTableSort] = useState<{
    col: "prix" | "chambres" | "quartier";
    dir: "asc" | "desc";
  }>({ col: "prix", dir: "desc" });
  const [tablePage, setTablePage] = useState(0);
  const PAGE_SIZE = 25;

  // Filtered listings
  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (l.transaction !== transaction) return false;
      if (selectedQuartiers.size > 0 && !selectedQuartiers.has(l.quartier)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(l.type_bien)) return false;
      if (chambresFilter !== null && l.chambres !== chambresFilter) return false;
      return true;
    });
  }, [listings, transaction, selectedQuartiers, selectedTypes, chambresFilter]);

  // Stats globales sur le filtre
  const stats = useMemo(() => {
    const prices = filtered.map((l) => l.prix_fcfa).filter((v): v is number => v !== null);
    return {
      count: filtered.length,
      median: median(prices),
      p25: quantile(prices, 0.25),
      p75: quantile(prices, 0.75),
      mean: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
    };
  }, [filtered]);

  // Distribution histogram
  const histogram = useMemo(() => {
    const prices = filtered.map((l) => l.prix_fcfa).filter((v): v is number => v !== null);
    if (prices.length < 5) return [];
    const lo = quantile(prices, 0.02) ?? Math.min(...prices);
    const hi = quantile(prices, 0.98) ?? Math.max(...prices);
    if (hi <= lo) return [];
    const NB_BINS = 25;
    const step = (hi - lo) / NB_BINS;
    const bins = Array.from({ length: NB_BINS }, (_, i) => ({
      x0: lo + i * step,
      x1: lo + (i + 1) * step,
      count: 0,
    }));
    for (const p of prices) {
      if (p < lo || p > hi) continue;
      const idx = Math.min(NB_BINS - 1, Math.floor((p - lo) / step));
      bins[idx].count++;
    }
    return bins.map((b) => ({
      mid: (b.x0 + b.x1) / 2,
      count: b.count,
      label: fmtFCFA((b.x0 + b.x1) / 2),
    }));
  }, [filtered]);

  // Bar chart : prix median par quartier (filtre actif)
  const medianByQuartier = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const l of filtered) {
      if (!l.quartier || l.prix_fcfa === null) continue;
      const arr = groups.get(l.quartier) ?? [];
      arr.push(l.prix_fcfa);
      groups.set(l.quartier, arr);
    }
    return Array.from(groups.entries())
      .map(([q, arr]) => ({
        quartier: q,
        count: arr.length,
        median: median(arr) ?? 0,
      }))
      .sort((a, b) => b.median - a.median);
  }, [filtered]);

  const heatmap = transaction === "achat" ? heatmapAchat : heatmapLocation;
  const heatmapValues = heatmap.cells
    .map((c) => c.prix_median)
    .filter((v): v is number => v !== null);
  const heatmapMin = heatmapValues.length ? Math.min(...heatmapValues) : 0;
  const heatmapMax = heatmapValues.length ? Math.max(...heatmapValues) : 1;

  // Sorted listings table (filtered)
  const sortedListings = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = tableSort.dir === "asc" ? 1 : -1;
      if (tableSort.col === "prix") {
        return ((a.prix_fcfa ?? 0) - (b.prix_fcfa ?? 0)) * dir;
      }
      if (tableSort.col === "chambres") {
        return ((a.chambres ?? 0) - (b.chambres ?? 0)) * dir;
      }
      return a.quartier.localeCompare(b.quartier) * dir;
    });
    return arr;
  }, [filtered, tableSort]);

  const pagedListings = sortedListings.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sortedListings.length / PAGE_SIZE));

  function toggleQuartier(q: string) {
    setSelectedQuartiers((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
    setTablePage(0);
  }
  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setTablePage(0);
  }
  function resetFilters() {
    setSelectedQuartiers(new Set());
    setSelectedTypes(new Set());
    setChambresFilter(null);
    setTablePage(0);
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Bandeau filtres */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Studio immobilier Abidjan
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Filtres en direct sur {listings.length.toLocaleString("fr-FR")} annonces.
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTransaction("achat")}
              className={`text-xs px-3 py-1.5 rounded border ${
                transaction === "achat"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              Achat
            </button>
            <button
              onClick={() => setTransaction("location")}
              className={`text-xs px-3 py-1.5 rounded border ${
                transaction === "location"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              Location
            </button>
          </div>
        </div>

        {/* Quartiers */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-slate-500 mr-1">Localités :</span>
          {allQuartiers.slice(0, 12).map((q) => {
            const active = selectedQuartiers.has(q);
            return (
              <button
                key={q}
                onClick={() => toggleQuartier(q)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {q}
              </button>
            );
          })}
          {selectedQuartiers.size > 0 && (
            <button
              onClick={() => setSelectedQuartiers(new Set())}
              className="text-[11px] text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline ml-1"
            >
              Tous
            </button>
          )}
        </div>

        {/* Types */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-slate-500 mr-1">Type :</span>
          {ALL_TYPES.filter((t) => allTypes.includes(t)).map((t) => {
            const active = selectedTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition capitalize ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {t}
              </button>
            );
          })}
          {selectedTypes.size > 0 && (
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="text-[11px] text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline ml-1"
            >
              Tous
            </button>
          )}
        </div>

        {/* Chambres */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">Chambres :</span>
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const active = chambresFilter === n;
            return (
              <button
                key={n}
                onClick={() => {
                  setChambresFilter(active ? null : n);
                  setTablePage(0);
                }}
                className={`text-[11px] px-2 py-0.5 rounded-full border w-7 text-center ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {n}
              </button>
            );
          })}
          <button
            onClick={resetFilters}
            className="text-[11px] text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline ml-2"
          >
            Reset filtres
          </button>
        </div>
      </div>

      {/* KPIs filtres */}
      <div className="border-b border-slate-200 px-4 md:px-6 py-3 grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCell label="Annonces" value={stats.count.toLocaleString("fr-FR")} />
        <KpiCell label="Médiane" value={fmtFCFA(stats.median)} accent="text-slate-900" />
        <KpiCell label="P25" value={fmtFCFA(stats.p25)} />
        <KpiCell label="P75" value={fmtFCFA(stats.p75)} />
        <KpiCell label="Min" value={fmtFCFA(stats.min)} />
        <KpiCell label="Max" value={fmtFCFA(stats.max)} />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 px-4 md:px-6 py-2 flex gap-1 flex-wrap text-xs">
        <TabBtn id="distribution" current={tab} setTab={setTab}>Distribution</TabBtn>
        <TabBtn id="heatmap" current={tab} setTab={setTab}>Heatmap localité × type</TabBtn>
        <TabBtn id="rendements" current={tab} setTab={setTab}>Rendements locatifs</TabBtn>
        <TabBtn id="prix_m2" current={tab} setTab={setTab}>Prix au m²</TabBtn>
        <TabBtn id="deals" current={tab} setTab={setTab}>Top deals</TabBtn>
        <TabBtn id="annonces" current={tab} setTab={setTab}>Annonces ({sortedListings.length})</TabBtn>
      </div>

      {/* Panel content */}
      <div className="px-4 md:px-6 py-4">
        {tab === "distribution" && (
          <DistributionPanel
            histogram={histogram}
            medianByQuartier={medianByQuartier}
            transaction={transaction}
            globalMedian={stats.median}
          />
        )}

        {tab === "heatmap" && (
          <HeatmapPanel
            heatmap={heatmap}
            min={heatmapMin}
            max={heatmapMax}
            transaction={transaction}
          />
        )}

        {tab === "rendements" && (
          <YieldPanel yieldsRoom={yieldsRoom} yieldsType={yieldsType} />
        )}

        {tab === "prix_m2" && <PriceM2Panel rows={priceM2Rows} transaction={transaction} />}

        {tab === "deals" && (
          <DealsPanel
            deals={transaction === "achat" ? topDealsAchat : topDealsLocation}
            transaction={transaction}
          />
        )}

        {tab === "annonces" && (
          <ListingsPanel
            listings={pagedListings}
            sort={tableSort}
            setSort={setTableSort}
            page={tablePage}
            totalPages={totalPages}
            setPage={setTablePage}
            transaction={transaction}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SOUS-COMPONENTS
// =============================================================================

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-slate-200 rounded p-2 bg-slate-50/40">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-sm md:text-base font-semibold tabular-nums mt-0.5 ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function TabBtn({
  id,
  current,
  setTab,
  children,
}: {
  id: "distribution" | "heatmap" | "rendements" | "prix_m2" | "deals" | "annonces";
  current: string;
  setTab: (t: "distribution" | "heatmap" | "rendements" | "prix_m2" | "deals" | "annonces") => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => setTab(id)}
      className={`px-2.5 py-1.5 rounded ${
        current === id
          ? "bg-slate-100 text-slate-900 font-medium"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function DistributionPanel({
  histogram,
  medianByQuartier,
  transaction,
  globalMedian,
}: {
  histogram: { mid: number; count: number; label: string }[];
  medianByQuartier: { quartier: string; count: number; median: number }[];
  transaction: Transaction;
  globalMedian: number | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          Distribution des prix
        </h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Histogramme entre P2 et P98 (les 4 % d&apos;extremes filtres pour lisibilite). La barre rouge marque la médiane.
        </p>
        {histogram.length === 0 ? (
          <div className="text-xs text-slate-400 py-8 text-center">
            Pas assez d&apos;annonces dans le filtre courant.
          </div>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={histogram} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="mid"
                  stroke="#94a3b8"
                  fontSize={9}
                  tickFormatter={(v) => fmtFCFA(v as number)}
                  interval={Math.max(0, Math.floor(histogram.length / 8))}
                />
                <YAxis stroke="#94a3b8" fontSize={10} width={32} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(v, n) => {
                    if (n === "count") return [`${v} annonces`, ""];
                    return [String(v), String(n)];
                  }}
                  labelFormatter={(l) => `≈ ${fmtFCFA(l as number)} FCFA`}
                />
                {globalMedian !== null && (
                  <ReferenceLine x={globalMedian} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3"
                    label={{ value: "Médiane", fontSize: 9, fill: "#dc2626", position: "top" }} />
                )}
                <Bar dataKey="count" fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          Prix médian par localité ({transaction})
        </h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Comparaison des médianes sur le filtre courant. Le volume d&apos;annonces apparait en gris a droite.
        </p>
        {medianByQuartier.length === 0 ? (
          <div className="text-xs text-slate-400 py-8 text-center">
            Pas de données sur le filtre courant.
          </div>
        ) : (
          <div style={{ width: "100%", height: Math.max(180, medianByQuartier.length * 26) }}>
            <ResponsiveContainer>
              <BarChart
                data={medianByQuartier}
                layout="vertical"
                margin={{ top: 4, right: 80, left: 80, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v) => fmtFCFA(v as number)}
                />
                <YAxis
                  type="category"
                  dataKey="quartier"
                  stroke="#475569"
                  fontSize={11}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(v, n) => {
                    if (n === "median")
                      return [`${fmtFCFA(v as number)} FCFA`, "Médiane"];
                    if (n === "count") return [`${v} annonces`, "Volume"];
                    return [String(v), String(n)];
                  }}
                />
                <Bar dataKey="median" fill="#0d9488" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function HeatmapPanel({
  heatmap,
  min,
  max,
  transaction,
}: {
  heatmap: { quartiers: string[]; types: string[]; cells: HeatmapCell[] };
  min: number;
  max: number;
  transaction: Transaction;
}) {
  const cellMap = new Map<string, HeatmapCell>();
  for (const c of heatmap.cells) {
    cellMap.set(`${c.quartier}|${c.type_bien}`, c);
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Prix médian par localité × type ({transaction})
      </h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Croisement des médianes. Plus la cellule est foncée, plus le prix est élevé. Le nombre d&apos;annonces est indiqué en superscript.
      </p>
      {heatmap.quartiers.length === 0 ? (
        <div className="text-xs text-slate-400 py-8 text-center">Pas de données.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="p-1 text-left text-slate-500 font-medium">Localité</th>
                {heatmap.types.map((t) => (
                  <th
                    key={t}
                    className="p-1 text-slate-500 font-medium text-center capitalize"
                    style={{ minWidth: 90 }}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.quartiers.map((q) => (
                <tr key={q}>
                  <td className="p-1 text-slate-700 font-medium pr-2 whitespace-nowrap">
                    {q}
                  </td>
                  {heatmap.types.map((t) => {
                    const c = cellMap.get(`${q}|${t}`);
                    const v = c?.prix_median ?? null;
                    return (
                      <td
                        key={t}
                        className="p-0 text-center"
                        style={{
                          backgroundColor: heatmapColor(v, min, max),
                          minWidth: 90,
                          height: 36,
                          color: v !== null && (v - min) / Math.max(1, max - min) > 0.55 ? "#fff" : "#0f172a",
                        }}
                      >
                        {v !== null ? (
                          <div className="font-medium tabular-nums">
                            {fmtFCFA(v)}
                            <span className="text-[9px] opacity-70 ml-1">{c?.count}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function YieldPanel({
  yieldsRoom,
  yieldsType,
}: {
  yieldsRoom: YieldRow[];
  yieldsType: YieldRow[];
}) {
  const [granularity, setGranularity] = useState<"type" | "chambres">("type");
  const data = granularity === "type" ? yieldsType : yieldsRoom;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Rendement locatif brut estimé
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl">
            Pour chaque groupe (quartier × type {granularity === "chambres" ? "× nb chambres" : ""}), on prend la médiane des prix achats et la moyenne des loyers mensuels, puis on calcule
            <span className="font-mono mx-1 text-[10px] bg-slate-100 px-1 rounded">(loyer moyen × 12) ÷ prix achat médian</span>. Indicatif uniquement.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setGranularity("type")}
            className={`text-[11px] px-2 py-1 rounded ${
              granularity === "type" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Par type
          </button>
          <button
            onClick={() => setGranularity("chambres")}
            className={`text-[11px] px-2 py-1 rounded ${
              granularity === "chambres" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Par type × chambres
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-slate-400 py-8 text-center">
          Pas assez de groupes avec achat ET location pour calculer un rendement sur ce filtre.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pr-3">Quartier</th>
                <th className="text-left font-medium py-2 px-2 capitalize">Type</th>
                {granularity === "chambres" && (
                  <th className="text-center font-medium py-2 px-2">Chambres</th>
                )}
                <th className="text-right font-medium py-2 px-2">Achat médian</th>
                <th className="text-right font-medium py-2 px-2">Loyer moyen / mois</th>
                <th className="text-right font-medium py-2 px-2">Échantillon</th>
                <th className="text-right font-medium py-2 px-2">Rendement brut</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 text-slate-900 font-medium">{r.quartier}</td>
                  <td className="py-1.5 px-2 text-slate-700 capitalize">{r.type_bien}</td>
                  {granularity === "chambres" && (
                    <td className="py-1.5 px-2 text-center text-slate-700">
                      {r.chambres ?? "—"}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-900">
                    {fmtFCFA(r.prix_achat_median)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-900">
                    {fmtFCFA(r.loyer_mensuel_mean)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                    {r.countAchat}A · {r.countLocation}L
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    <span
                      className={`font-semibold ${
                        r.rendement_brut_pct >= 8
                          ? "text-emerald-700"
                          : r.rendement_brut_pct >= 5
                          ? "text-blue-700"
                          : "text-slate-600"
                      }`}
                    >
                      {fmtPct(r.rendement_brut_pct, 1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        Lecture : un rendement &gt; 8 % indique un loyer attractif vs le prix d&apos;achat. Attention : ces valeurs sont brutes (pas net de charges, taxes, vacance, défauts de paiement). Compter en pratique 30 % à 40 % de marge entre rendement brut et net.
      </p>
    </div>
  );
}

function DealsPanel({
  deals,
  transaction,
}: {
  deals: DealRow[];
  transaction: Transaction;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Annonces les plus sous-évaluées ({transaction})
      </h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Pour chaque groupe (quartier × type × chambres) avec ≥ 5 annonces, on calcule la médiane et on classe les annonces par écart relatif (négatif = sous-évalué). Les écarts &gt; -50 % sont souvent du bruit ou des terrains.
      </p>
      {deals.length === 0 ? (
        <div className="text-xs text-slate-400 py-8 text-center">Pas assez de données pour identifier des deals.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pr-3">Annonce</th>
                <th className="text-left font-medium py-2 px-2">Quartier</th>
                <th className="text-left font-medium py-2 px-2 capitalize">Type</th>
                <th className="text-right font-medium py-2 px-2">Chambres</th>
                <th className="text-right font-medium py-2 px-2">Prix</th>
                <th className="text-right font-medium py-2 px-2">Médiane groupe</th>
                <th className="text-right font-medium py-2 px-2">Écart</th>
                <th className="text-right font-medium py-2 px-2">Échantillon</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 max-w-xs">
                    <a
                      href={d.listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-900 hover:text-blue-700 hover:underline truncate block"
                      title={d.listing.titre}
                    >
                      {d.listing.titre}
                    </a>
                  </td>
                  <td className="py-1.5 px-2 text-slate-700">{d.listing.quartier}</td>
                  <td className="py-1.5 px-2 text-slate-700 capitalize">{d.listing.type_bien}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                    {d.listing.chambres ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-900">
                    {fmtFCFA(d.listing.prix_fcfa)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                    {fmtFCFA(d.reference_median)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    <span
                      className={`font-semibold ${
                        d.spread_pct < -30 ? "text-emerald-700" : "text-emerald-600"
                      }`}
                    >
                      {d.spread_pct.toFixed(0)} %
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">
                    n={d.groupSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListingsPanel({
  listings,
  sort,
  setSort,
  page,
  totalPages,
  setPage,
  transaction,
}: {
  listings: Listing[];
  sort: { col: "prix" | "chambres" | "quartier"; dir: "asc" | "desc" };
  setSort: (s: { col: "prix" | "chambres" | "quartier"; dir: "asc" | "desc" }) => void;
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
  transaction: Transaction;
}) {
  function toggleSort(col: "prix" | "chambres" | "quartier") {
    if (sort.col === col) {
      setSort({ col, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ col, dir: "desc" });
    }
  }
  function arrow(col: "prix" | "chambres" | "quartier") {
    if (sort.col !== col) return "";
    return sort.dir === "asc" ? " ↑" : " ↓";
  }
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Annonces ({transaction})
        </h3>
        <span className="text-[11px] text-slate-400">
          page {page + 1} / {totalPages}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pr-3 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort("quartier")}>
                Localité{arrow("quartier")}
              </th>
              <th className="text-left font-medium py-2 px-2">Type</th>
              <th className="text-right font-medium py-2 px-2 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort("chambres")}>
                Chambres{arrow("chambres")}
              </th>
              <th className="text-left font-medium py-2 px-2">Annonce</th>
              <th className="text-right font-medium py-2 px-2 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort("prix")}>
                Prix{arrow("prix")}
              </th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-1.5 pr-3 text-slate-900">{l.quartier}</td>
                <td className="py-1.5 px-2 text-slate-700 capitalize">{l.type_bien}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                  {l.chambres ?? "—"}
                </td>
                <td className="py-1.5 px-2 max-w-md">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-900 hover:text-blue-700 hover:underline truncate block"
                    title={l.titre}
                  >
                    {l.titre}
                  </a>
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-900">
                  {fmtFCFA(l.prix_fcfa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 text-xs">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Précédent
        </button>
        <span className="text-slate-500">
          {listings.length} annonces affichées
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}

function PriceM2Panel({
  rows,
  transaction,
}: {
  rows: PriceM2Row[];
  transaction: Transaction;
}) {
  const filtered = rows.filter((r) => r.transaction === transaction);
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Prix au m² par localité ({transaction})
      </h3>
      <p className="text-[11px] text-slate-500 mb-3 max-w-3xl">
        Médiane et intervalle interquartile (P25–P75) du prix au m², calculés uniquement
        sur les annonces où la surface est explicitement renseignée. Les terrains sont exclus
        car leur m² n&apos;est pas comparable à du m² habitable. Échantillon souvent restreint :
        à utiliser comme indicateur, pas comme référence absolue.
      </p>
      {filtered.length === 0 ? (
        <div className="text-xs text-slate-400 py-8 text-center">
          Pas assez d&apos;annonces avec surface renseignée pour ce type de transaction.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pr-3">Localité</th>
                <th className="text-right font-medium py-2 px-2">Médiane / m²</th>
                <th className="text-right font-medium py-2 px-2">P25</th>
                <th className="text-right font-medium py-2 px-2">P75</th>
                <th className="text-right font-medium py-2 px-2">Moyenne</th>
                <th className="text-right font-medium py-2 px-2">Échantillon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.quartier} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 text-slate-900 font-medium">{r.quartier}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-900 font-semibold">
                    {fmtFCFA(r.prix_m2_median)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                    {fmtFCFA(r.prix_m2_p25)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                    {fmtFCFA(r.prix_m2_p75)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                    {fmtFCFA(r.prix_m2_mean)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                    n={r.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        Lecture : la médiane est plus robuste que la moyenne aux annonces extrêmes. Si la moyenne diverge fortement de la médiane, l&apos;échantillon contient probablement des outliers.
      </p>
    </div>
  );
}
