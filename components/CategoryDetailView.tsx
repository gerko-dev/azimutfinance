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
  Legend,
} from "recharts";
import type { CategoryFundRow, CategoryManagerRow, DispersionRow } from "@/app/fcp/categorie/[slug]/page";

// Helpers
function fmtBigFCFA(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return (sign + (v * 100).toFixed(digits)).replace(".", ",") + "%";
}
function fmtPctRaw(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + "%";
}
function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};
const QUARTILE_COLORS: Record<number, string> = {
  1: "#15803d",
  2: "#86efac",
  3: "#fbbf24",
  4: "#dc2626",
};

type Props = {
  category: string;
  refQuarter: string;
  latestVLGlobal: string;
  nbFunds: number;
  nbManagers: number;
  aumTotal: number;
  marketShare: number;
  dispersionRows: DispersionRow[];
  fundsRows: CategoryFundRow[];
  managerRows: CategoryManagerRow[];
  aumTimeline: Array<Record<string, number | string>>;
  top5FundsShare: number;
  top5MgrShare: number;
  otherCategories: { slug: string; name: string }[];
};

type FundSortKey = "nom" | "gestionnaire" | "aum" | "ytd" | "y1" | "y3";
type FundSortOrder = "asc" | "desc";

export default function CategoryDetailView(props: Props) {
  const {
    category,
    refQuarter,
    nbFunds,
    nbManagers,
    aumTotal,
    marketShare,
    dispersionRows,
    fundsRows,
    managerRows,
    aumTimeline,
    top5FundsShare,
    top5MgrShare,
    otherCategories,
  } = props;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<FundSortKey>("aum");
  const [sortOrder, setSortOrder] = useState<FundSortOrder>("desc");
  const [hideStale, setHideStale] = useState(false);

  const filteredFunds = useMemo(() => {
    let f = fundsRows;
    if (hideStale) f = f.filter((r) => !r.isStale);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter((r) =>
        `${r.nom} ${r.gestionnaire}`.toLowerCase().includes(q)
      );
    }
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "nom": return a.nom.localeCompare(b.nom);
          case "gestionnaire": return a.gestionnaire.localeCompare(b.gestionnaire);
          case "aum": return (a.aum ?? -1) - (b.aum ?? -1);
          case "ytd": return (a.ytd ?? -Infinity) - (b.ytd ?? -Infinity);
          case "y1": return (a.y1 ?? -Infinity) - (b.y1 ?? -Infinity);
          case "y3": return (a.y3 ?? -Infinity) - (b.y3 ?? -Infinity);
        }
      })();
      return cmp * dir;
    });
  }, [fundsRows, search, sortKey, sortOrder, hideStale]);

  const color = CATEGORY_COLORS[category] || "#94a3b8";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* === HEADER === */}
      <header className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              <Link href="/marches/fcp" className="hover:underline">FCP / OPCVM</Link>
              {" · "}
              <Link href="/fcp/categories" className="hover:underline">Catégories</Link>
            </p>
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 rounded-full" style={{ background: color }} />
              <h1 className="text-3xl font-bold text-slate-900">{category}</h1>
            </div>
            <p className="text-sm text-slate-600 max-w-2xl">
              {nbFunds} fonds gérés par {nbManagers} sociétés de gestion · encours total{" "}
              <strong>{fmtBigFCFA(aumTotal)} FCFA</strong> au {fmtDateFR(refQuarter)}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[300px]">
            <KPI label="Encours" value={fmtBigFCFA(aumTotal) + " FCFA"} sub={`${fmtPctRaw(marketShare, 0)} du marché`} />
            <KPI label="Fonds" value={String(nbFunds)} sub={`${nbManagers} SGP actives`} />
            <KPI label="Top 5 fonds" value={fmtPctRaw(top5FundsShare, 0)} sub="de l'encours cat." />
            <KPI label="Top 5 SGP" value={fmtPctRaw(top5MgrShare, 0)} sub="de l'encours cat." />
          </div>
        </div>
      </header>

      {/* === DISPERSION === */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Dispersion des performances</h2>
          <p className="text-xs text-slate-500">
            Distribution non paramétrique sur les fonds éligibles · plus l&apos;écart Q1-Q3 est
            grand, plus le choix du gérant compte
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="text-left px-5 py-2 text-xs font-semibold text-slate-600">Fenêtre</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Min</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Q1 (25%)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Médiane</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Q3 (75%)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Max</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Spread Q1-Q3</th>
                <th className="text-right px-5 py-2 text-xs font-semibold text-slate-600">n</th>
              </tr>
            </thead>
            <tbody>
              {dispersionRows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2.5 font-medium text-slate-700">{r.label}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-rose-700">{fmtPct(r.min, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{fmtPct(r.q1, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums font-bold text-slate-900">{fmtPct(r.median, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{fmtPct(r.q3, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-emerald-700">{fmtPct(r.max, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-700">{fmtPct(r.iqr, 1)}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-slate-500">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === EVOLUTION AUM === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Évolution de l&apos;encours</h2>
          <p className="text-xs text-slate-500">Empilement trimestriel — toutes les SGP cumulées dans la catégorie</p>
        </div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={aumTimeline}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => String(d).slice(0, 7)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBigFCFA(Number(v))} width={70} />
              <Tooltip
                formatter={(v) => fmtBigFCFA(Number(v)) + " FCFA"}
                labelFormatter={(d) => fmtDateFR(String(d))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey={category} stackId="1" stroke={color} fill={color} fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === GESTIONNAIRES ACTIFS === */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Sociétés de gestion actives ({managerRows.length})</h2>
          <p className="text-xs text-slate-500">Triées par AUM dans la catégorie</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-12">#</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">SGP</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Fonds</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">AUM</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Part cat.</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden sm:table-cell">Perf 1A pondérée</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">Médiane 1A</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">% top Q</th>
              </tr>
            </thead>
            <tbody>
              {managerRows.map((m, i) => (
                <tr key={m.slug} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs font-bold text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2">
                    <Link href={`/sgp/${m.slug}`} className="text-sm font-medium text-slate-900 hover:underline">{m.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{m.nbFunds}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{fmtBigFCFA(m.aum)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{fmtPctRaw(m.share, 1)}</td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium hidden sm:table-cell ${m.perfWeighted1Y !== null && m.perfWeighted1Y >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {fmtPct(m.perfWeighted1Y, 1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-600 hidden md:table-cell">
                    {fmtPct(m.perfMedian1Y, 1)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-700 hidden md:table-cell">
                    {fmtPctRaw(m.topQuartileShare, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === LISTE DES FONDS === */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Liste des fonds ({fundsRows.length})</h2>
            <p className="text-xs text-slate-500">Triable par toute colonne</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-md w-48"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hideStale}
                onChange={(e) => setHideStale(e.target.checked)}
                className="w-4 h-4"
              />
              Masquer stales
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <SortTh col="nom" label="Fonds" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} />
                <SortTh col="gestionnaire" label="SGP" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} className="hidden md:table-cell" />
                <SortTh col="aum" label="AUM" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" />
                <SortTh col="ytd" label="YTD" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" className="hidden sm:table-cell" />
                <SortTh col="y1" label="1 an" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" />
                <SortTh col="y3" label="3 ans (ann.)" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" className="hidden md:table-cell" />
                <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center hidden md:table-cell">Q1A</th>
              </tr>
            </thead>
            <tbody>
              {filteredFunds.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">Aucun fonds.</td></tr>
              ) : (
                filteredFunds.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 min-w-0">
                      <Link href={`/fcp/${f.id}`} className="text-sm font-medium text-slate-900 hover:underline">{f.nom}</Link>
                      <div className="text-[11px] text-slate-500 md:hidden">
                        <Link href={`/sgp/${f.managerSlug}`} className="hover:underline">{f.gestionnaire}</Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 hidden md:table-cell">
                      <Link href={`/sgp/${f.managerSlug}`} className="hover:underline">{f.gestionnaire}</Link>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">{fmtBigFCFA(f.aum)}</td>
                    <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium hidden sm:table-cell ${f.ytd !== null && f.ytd >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmtPct(f.ytd, 1)}
                    </td>
                    <td className={`px-3 py-2 text-right text-sm tabular-nums font-bold ${f.y1 !== null && f.y1 >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmtPct(f.y1, 1)}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs tabular-nums hidden md:table-cell ${f.y3 !== null && f.y3 >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {fmtPct(f.y3, 1)}
                    </td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      {f.quartile !== null ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold rounded" style={{ background: QUARTILE_COLORS[f.quartile] + "33", color: QUARTILE_COLORS[f.quartile] }}>
                          Q{f.quartile}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* === AUTRES CATEGORIES === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Autres catégories</h3>
        <div className="flex flex-wrap gap-2">
          {otherCategories.map((c) => (
            <Link
              key={c.slug}
              href={`/fcp/categorie/${c.slug}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 hover:border-slate-400 transition"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[c.name] || "#94a3b8" }} />
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function SortTh({
  col, label, sortKey, sortOrder, onSort, align = "left", className = "",
}: {
  col: FundSortKey;
  label: string;
  sortKey: FundSortKey;
  sortOrder: FundSortOrder;
  onSort: (col: FundSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2 text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {label}
      {active && <span className="ml-1 text-slate-400">{sortOrder === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
