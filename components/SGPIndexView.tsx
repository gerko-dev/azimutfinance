"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SGPIndexRow } from "@/app/sgp/page";

// ==========================================
// HELPERS
// ==========================================
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
const CADENCE_COLORS: Record<string, string> = {
  quotidienne: "#15803d",
  hebdomadaire: "#0F6E56",
  trimestrielle: "#185FA5",
  "irrégulière": "#dc2626",
};

type SortKey =
  | "name"
  | "nbFunds"
  | "aum"
  | "marketShare"
  | "perfWeighted1Y"
  | "topQuartileShare";
type SortOrder = "asc" | "desc";

type Props = {
  rows: SGPIndexRow[];
  refQuarter: string;
  marketTotalAUM: number;
  totalFunds: number;
};

export default function SGPIndexView({ rows, refQuarter, marketTotalAUM, totalFunds }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("aum");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) =>
      search ? r.name.toLowerCase().includes(search.toLowerCase()) : true
    );
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "name":
            return a.name.localeCompare(b.name);
          case "nbFunds":
            return a.nbFunds - b.nbFunds;
          case "aum":
            return a.aumAtRef - b.aumAtRef;
          case "marketShare":
            return a.marketShare - b.marketShare;
          case "perfWeighted1Y":
            return (a.perfWeighted1Y ?? -Infinity) - (b.perfWeighted1Y ?? -Infinity);
          case "topQuartileShare":
            return (a.topQuartileShare ?? -1) - (b.topQuartileShare ?? -1);
        }
      })();
      return cmp * dir;
    });
  }, [rows, search, sortKey, sortOrder]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          <Link href="/marches/fcp" className="hover:underline">FCP / OPCVM</Link>
        </p>
        <h1 className="text-3xl font-bold text-slate-900">Sociétés de gestion UEMOA</h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          {rows.length} sociétés de gestion gèrent {totalFunds} fonds pour un encours total de{" "}
          <strong>{fmtBigFCFA(marketTotalAUM)} FCFA</strong> au {fmtDateFR(refQuarter)}.
        </p>
      </header>

      {/* === KPI BAR === */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Sociétés de gestion" value={String(rows.length)} sub="actives sur le marché" />
        <KPI label="Encours total" value={fmtBigFCFA(marketTotalAUM) + " FCFA"} sub={`au ${fmtDateFR(refQuarter)}`} />
        <KPI label="Fonds suivis" value={String(totalFunds)} sub="historique disponible" />
        <KPI
          label="Concentration top 5"
          value={fmtPctRaw(
            sorted.slice(0, 5).reduce((s, r) => s + r.marketShare, 0),
            0
          )}
          sub="part de marché agrégée"
        />
      </section>

      {/* === FILTRE === */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Recherche par nom de SGP…"
          className="w-full md:w-96 px-3 py-2 text-sm border border-slate-200 rounded-md"
        />
      </section>

      {/* === TABLEAU === */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 w-12">#</th>
                <Th label="Société de gestion" col="name" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} />
                <Th label="Catégories couvertes" col="name" sortKey={sortKey} sortOrder={sortOrder} onSort={() => {}} sortable={false} className="hidden lg:table-cell" />
                <Th label="Fonds" col="nbFunds" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" />
                <Th label="AUM" col="aum" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" />
                <Th label="PdM" col="marketShare" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" className="hidden sm:table-cell" />
                <Th label="Perf 1A pondérée" col="perfWeighted1Y" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" className="hidden md:table-cell" />
                <Th label="% top Q" col="topQuartileShare" sortKey={sortKey} sortOrder={sortOrder} onSort={(k) => { sortKey === k ? setSortOrder(sortOrder === "asc" ? "desc" : "asc") : (setSortKey(k), setSortOrder("desc")); }} align="right" className="hidden md:table-cell" />
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 hidden lg:table-cell">Cadence</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                    Aucune SGP ne correspond.
                  </td>
                </tr>
              ) : (
                sorted.map((r, i) => (
                  <tr key={r.slug} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-xs font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/sgp/${r.slug}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {r.categories.map((c) => (
                          <span
                            key={c}
                            title={c}
                            className="w-2 h-2 rounded-full"
                            style={{ background: CATEGORY_COLORS[c] || "#94a3b8" }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-700">
                      {r.nbFunds}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm tabular-nums font-semibold text-slate-900">
                      {fmtBigFCFA(r.aumAtRef)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-700 hidden sm:table-cell">
                      {fmtPctRaw(r.marketShare, 1)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-xs tabular-nums font-medium hidden md:table-cell ${
                        r.perfWeighted1Y !== null && r.perfWeighted1Y >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {fmtPct(r.perfWeighted1Y, 1)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-700 hidden md:table-cell">
                      {fmtPctRaw(r.topQuartileShare, 0)}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px]"
                        style={{ color: CADENCE_COLORS[r.dominantCadence] || "#64748b" }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: CADENCE_COLORS[r.dominantCadence] || "#94a3b8" }}
                        />
                        {r.dominantCadence}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Encours ponctuel au {fmtDateFR(refQuarter)}. Perf pondérée AUM = somme des perf × AUM /
        somme AUM. % top quartile = part des fonds en Q1 dans leur catégorie sur 1 an.
      </p>
    </main>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border border-slate-200 bg-white">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function Th({
  label,
  col,
  sortKey,
  sortOrder,
  onSort,
  align = "left",
  className = "",
  sortable = true,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (col: SortKey) => void;
  align?: "left" | "right";
  className?: string;
  sortable?: boolean;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={sortable ? () => onSort(col) : undefined}
      className={`px-3 py-2 text-xs font-semibold text-slate-600 select-none ${
        sortable ? "cursor-pointer hover:text-slate-900" : ""
      } ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {label}
      {active && sortable && (
        <span className="ml-1 text-slate-400">{sortOrder === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}
