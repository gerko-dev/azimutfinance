"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import WatchlistStar from "./WatchlistStar";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export type MarketRow = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string;
  changePct: number | null;
};

type Props = {
  rows: MarketRow[];
  watchedCodes: string[];
};

type SortKey = "code" | "name" | "sector" | "price" | "changePct";
type SortDir = "asc" | "desc";

export default function MarketBrowser({ rows, watchedCodes }: Props) {
  const watchedSet = useMemo(() => new Set(watchedCodes), [watchedCodes]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.sector || "Autres");
    return ["Tous", ...[...s].sort()];
  }, [rows]);

  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("Tous");
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let out = rows;
    if (sector !== "Tous") out = out.filter((r) => (r.sector || "Autres") === sector);
    if (onlyWatched) out = out.filter((r) => watchedSet.has(r.code));
    if (q) {
      out = out.filter(
        (r) =>
          r.code.toUpperCase().includes(q) ||
          r.name.toUpperCase().includes(q),
      );
    }
    const sorted = [...out].sort((a, b) => {
      const ka = a[sortKey];
      const kb = b[sortKey];
      let cmp = 0;
      if (typeof ka === "number" && typeof kb === "number") {
        cmp = ka - kb;
      } else if (ka === null) {
        cmp = 1;
      } else if (kb === null) {
        cmp = -1;
      } else {
        cmp = String(ka).localeCompare(String(kb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sector, onlyWatched, sortKey, sortDir, watchedSet]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "changePct" || key === "price" ? "desc" : "asc");
    }
  }

  function arrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Rechercher code ou nom…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-sm border border-slate-300 rounded px-2 py-1 w-56 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="text-sm border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-700 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={onlyWatched}
            onChange={(e) => setOnlyWatched(e.target.checked)}
            className="rounded border-slate-300"
          />
          Watchlist uniquement
        </label>
        <div className="ml-auto text-[11px] text-slate-500">
          {filtered.length} / {rows.length} titre{rows.length > 1 ? "s" : ""}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500 bg-slate-50/50">
            <th className="px-3 py-1.5 w-8"></th>
            <th
              className="text-left font-semibold px-3 py-1.5 cursor-pointer hover:text-slate-700"
              onClick={() => toggleSort("code")}
            >
              Code{arrow("code")}
            </th>
            <th
              className="text-left font-semibold px-3 py-1.5 cursor-pointer hover:text-slate-700"
              onClick={() => toggleSort("name")}
            >
              Nom{arrow("name")}
            </th>
            <th
              className="text-left font-semibold px-3 py-1.5 cursor-pointer hover:text-slate-700"
              onClick={() => toggleSort("sector")}
            >
              Secteur{arrow("sector")}
            </th>
            <th
              className="text-right font-semibold px-3 py-1.5 cursor-pointer hover:text-slate-700"
              onClick={() => toggleSort("price")}
            >
              Cours{arrow("price")}
            </th>
            <th
              className="text-right font-semibold px-3 py-1.5 cursor-pointer hover:text-slate-700"
              onClick={() => toggleSort("changePct")}
            >
              Var. {arrow("changePct")}
            </th>
            <th className="text-right font-semibold px-3 py-1.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-slate-500 py-8">
                Aucun titre ne correspond.
              </td>
            </tr>
          ) : (
            filtered.map((r) => (
              <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5">
                  <WatchlistStar
                    code={r.code}
                    initialWatched={watchedSet.has(r.code)}
                    size="sm"
                  />
                </td>
                <td className="px-3 py-1.5 font-mono font-semibold text-slate-900">
                  <Link
                    href={`/academie/simulateur/titre/${r.code}`}
                    className="hover:underline"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-slate-700 truncate max-w-[280px]">
                  {r.name}
                </td>
                <td className="px-3 py-1.5 text-[11px] text-slate-500">
                  {r.sector || "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">
                  {fmtFCFA(r.price)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.changePct === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span
                      className={
                        r.changePct >= 0 ? "text-emerald-700" : "text-rose-700"
                      }
                    >
                      {r.changePct >= 0 ? "+" : ""}
                      {r.changePct.toFixed(2).replace(".", ",")} %
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Link
                    href={`/academie/simulateur/carnet?code=${r.code}`}
                    className="text-[11px] text-amber-700 hover:underline font-medium"
                  >
                    Carnet →
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
