"use client";

import { useState, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import CountryFlag from "./CountryFlag";
import type { ActionRow } from "@/lib/dataLoader";
import type { Quadrant } from "@/lib/stockStats";

type EnrichedStock = ActionRow & {
  volatility: number | null;
  quadrant: Quadrant | null;
};

type Props = {
  stocks: EnrichedStock[];
};

const QUADRANT_LABELS: Record<Quadrant, { emoji: string; name: string; pill: string }> = {
  cashcow: {
    emoji: "🎯",
    name: "Cash cow",
    pill: "border-green-200 bg-green-50 text-green-800",
  },
  hiddengem: {
    emoji: "💎",
    name: "Hidden gem",
    pill: "border-purple-200 bg-purple-50 text-purple-800",
  },
  defensive: {
    emoji: "🛡️",
    name: "Defensive",
    pill: "border-blue-200 bg-blue-50 text-blue-800",
  },
  speculative: {
    emoji: "⚡",
    name: "Spéculative",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

const PAGE_SIZE = 20;

type SortKey =
  | "code"
  | "price"
  | "changePercent"
  | "capitalization"
  | "per"
  | "yieldPct"
  | "volatility";
type SortOrder = "asc" | "desc";

function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M";
  return formatFCFA(value);
}

/** Parse "12,5" ou "12.5" en nombre, retourne null si vide ou invalide */
function parseFloatLoose(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

export default function ScreenerView({ stocks }: Props) {
  // === FILTRES ===
  const [search, setSearch] = useState("");
  const [sectorsSel, setSectorsSel] = useState<Set<string>>(new Set());
  const [countriesSel, setCountriesSel] = useState<Set<string>>(new Set());
  const [quadrantsSel, setQuadrantsSel] = useState<Set<Quadrant>>(new Set());
  const [perMin, setPerMin] = useState("");
  const [perMax, setPerMax] = useState("");
  const [yieldMin, setYieldMin] = useState("");
  const [yieldMax, setYieldMax] = useState("");
  const [capMinMds, setCapMinMds] = useState("");
  const [capMaxMds, setCapMaxMds] = useState("");
  const [volMin, setVolMin] = useState("");
  const [volMax, setVolMax] = useState("");

  // === TRI ET PAGINATION ===
  const [sortKey, setSortKey] = useState<SortKey>("capitalization");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // === DEFERRED ===
  const deferredSearch = useDeferredValue(search);
  const deferredPerMin = useDeferredValue(perMin);
  const deferredPerMax = useDeferredValue(perMax);
  const deferredYieldMin = useDeferredValue(yieldMin);
  const deferredYieldMax = useDeferredValue(yieldMax);
  const deferredCapMin = useDeferredValue(capMinMds);
  const deferredCapMax = useDeferredValue(capMaxMds);
  const deferredVolMin = useDeferredValue(volMin);
  const deferredVolMax = useDeferredValue(volMax);

  const availableSectors = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))).sort(),
    [stocks]
  );
  const availableCountries = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.country).filter(Boolean))).sort(),
    [stocks]
  );

  function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function resetFilters() {
    setSearch("");
    setSectorsSel(new Set());
    setCountriesSel(new Set());
    setQuadrantsSel(new Set());
    setPerMin("");
    setPerMax("");
    setYieldMin("");
    setYieldMax("");
    setCapMinMds("");
    setCapMaxMds("");
    setVolMin("");
    setVolMax("");
    setCurrentPage(1);
  }

  const hasAnyFilter =
    !!deferredSearch ||
    sectorsSel.size > 0 ||
    countriesSel.size > 0 ||
    quadrantsSel.size > 0 ||
    !!deferredPerMin ||
    !!deferredPerMax ||
    !!deferredYieldMin ||
    !!deferredYieldMax ||
    !!deferredCapMin ||
    !!deferredCapMax ||
    !!deferredVolMin ||
    !!deferredVolMax;

  // === FILTRAGE + TRI ===
  const processed = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    const perMinN = parseFloatLoose(deferredPerMin);
    const perMaxN = parseFloatLoose(deferredPerMax);
    const yieldMinN = parseFloatLoose(deferredYieldMin);
    const yieldMaxN = parseFloatLoose(deferredYieldMax);
    const capMinFCFA =
      parseFloatLoose(deferredCapMin) !== null
        ? parseFloatLoose(deferredCapMin)! * 1e9
        : null;
    const capMaxFCFA =
      parseFloatLoose(deferredCapMax) !== null
        ? parseFloatLoose(deferredCapMax)! * 1e9
        : null;
    const volMinN = parseFloatLoose(deferredVolMin);
    const volMaxN = parseFloatLoose(deferredVolMax);

    const filtered = stocks.filter((s) => {
      if (q) {
        if (
          !s.code.toLowerCase().includes(q) &&
          !s.name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (sectorsSel.size > 0 && !sectorsSel.has(s.sector)) return false;
      if (countriesSel.size > 0 && !countriesSel.has(s.country)) return false;
      if (quadrantsSel.size > 0) {
        if (!s.quadrant || !quadrantsSel.has(s.quadrant)) return false;
      }
      if (perMinN !== null && (!s.hasPer || s.per < perMinN)) return false;
      if (perMaxN !== null && (!s.hasPer || s.per > perMaxN)) return false;
      if (yieldMinN !== null && (!s.hasYield || s.yieldPct < yieldMinN)) return false;
      if (yieldMaxN !== null && (!s.hasYield || s.yieldPct > yieldMaxN)) return false;
      if (capMinFCFA !== null && s.capitalization < capMinFCFA) return false;
      if (capMaxFCFA !== null && s.capitalization > capMaxFCFA) return false;
      if (volMinN !== null && (s.volatility === null || s.volatility < volMinN)) return false;
      if (volMaxN !== null && (s.volatility === null || s.volatility > volMaxN)) return false;
      return true;
    });

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
          cmp =
            (a.hasYield ? a.yieldPct : -Infinity) -
            (b.hasYield ? b.yieldPct : -Infinity);
          break;
        case "volatility":
          cmp = (a.volatility ?? -Infinity) - (b.volatility ?? -Infinity);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    stocks,
    deferredSearch,
    sectorsSel,
    countriesSel,
    quadrantsSel,
    deferredPerMin,
    deferredPerMax,
    deferredYieldMin,
    deferredYieldMax,
    deferredCapMin,
    deferredCapMax,
    deferredVolMin,
    deferredVolMax,
    sortKey,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return processed.slice(start, start + PAGE_SIZE);
  }, [processed, currentPage, totalPages]);

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

  const effectivePage = Math.min(currentPage, totalPages);

  return (
    <>
      {/* === HERO === */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:text-slate-900">Outils</Link>
            <span className="mx-2">›</span>
            <span>Screener d&apos;actions</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-2xl md:text-3xl font-semibold">
              Screener d&apos;actions BRVM
            </h1>
            <span className="text-xs px-2 py-1 rounded font-medium bg-blue-100 text-blue-700">
              Premium
            </span>
          </div>
          <p className="text-sm md:text-base text-slate-600 max-w-3xl">
            Filtre les {stocks.length} sociétés cotées par PER, rendement,
            capitalisation, volatilité, secteur, pays et profil quadrant.
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-6">
        {/* === FILTRES === */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 space-y-4">
          {/* Recherche */}
          <input
            type="text"
            placeholder="Rechercher par code ou nom..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
          />

          {/* Multi-select pills : Secteur / Pays / Quadrant */}
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Secteur {sectorsSel.size > 0 && `(${sectorsSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {availableSectors.map((s) => {
                  const active = sectorsSel.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSectorsSel(toggleInSet(sectorsSel, s));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Pays {countriesSel.size > 0 && `(${countriesSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {availableCountries.map((c) => {
                  const active = countriesSel.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCountriesSel(toggleInSet(countriesSel, c));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1.5 ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <CountryFlag country={c} size={12} />
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Quadrant {quadrantsSel.size > 0 && `(${quadrantsSel.size})`}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(QUADRANT_LABELS) as Quadrant[]).map((q) => {
                  const active = quadrantsSel.has(q);
                  const info = QUADRANT_LABELS[q];
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setQuadrantsSel(toggleInSet(quadrantsSel, q));
                        setCurrentPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? info.pill
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {info.emoji} {info.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Range inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <RangeInput
              label="PER"
              minValue={perMin}
              maxValue={perMax}
              onMin={(v) => {
                setPerMin(v);
                setCurrentPage(1);
              }}
              onMax={(v) => {
                setPerMax(v);
                setCurrentPage(1);
              }}
            />
            <RangeInput
              label="Rendement (%)"
              minValue={yieldMin}
              maxValue={yieldMax}
              onMin={(v) => {
                setYieldMin(v);
                setCurrentPage(1);
              }}
              onMax={(v) => {
                setYieldMax(v);
                setCurrentPage(1);
              }}
            />
            <RangeInput
              label="Capi (Mds FCFA)"
              minValue={capMinMds}
              maxValue={capMaxMds}
              onMin={(v) => {
                setCapMinMds(v);
                setCurrentPage(1);
              }}
              onMax={(v) => {
                setCapMaxMds(v);
                setCurrentPage(1);
              }}
            />
            <RangeInput
              label="Volatilité (%)"
              minValue={volMin}
              maxValue={volMax}
              onMin={(v) => {
                setVolMin(v);
                setCurrentPage(1);
              }}
              onMax={(v) => {
                setVolMax(v);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Reset + count */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-600">
              <strong>{processed.length}</strong> action
              {processed.length > 1 ? "s" : ""} sur {stocks.length}
            </div>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                ↺ Reset filtres
              </button>
            )}
          </div>
        </section>

        {/* === TABLEAU === */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
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
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    Secteur
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">
                    Pays
                  </th>
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
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort("volatility")}
                      className="flex items-center gap-1 hover:text-slate-900 ml-auto"
                    >
                      Vol {sortIcon("volatility")}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    Quadrant
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((a) => (
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
                      <Link
                        href={`/titre/${a.code}`}
                        className="hover:text-blue-700"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-xs text-slate-600">
                      {a.sector || "—"}
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
                      {a.capitalization > 0
                        ? formatBigFCFA(a.capitalization)
                        : "—"}
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
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {a.volatility !== null
                        ? `${a.volatility.toFixed(1).replace(".", ",")}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      {a.quadrant ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${
                            QUADRANT_LABELS[a.quadrant].pill
                          }`}
                        >
                          {QUADRANT_LABELS[a.quadrant].emoji}{" "}
                          {QUADRANT_LABELS[a.quadrant].name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {paged.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                Aucune action ne correspond à vos critères
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 text-sm">
              <button
                onClick={() => setCurrentPage(Math.max(1, effectivePage - 1))}
                disabled={effectivePage === 1}
                className="px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Précédent
              </button>
              <span className="text-slate-600">
                Page <b>{effectivePage}</b> sur <b>{totalPages}</b>
              </span>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, effectivePage + 1))
                }
                disabled={effectivePage === totalPages}
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

// === Sous-composant : input range min-max ===
function RangeInput({
  label,
  minValue,
  maxValue,
  onMin,
  onMax,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-1.5">{label}</div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          placeholder="min"
          value={minValue}
          onChange={(e) => onMin(e.target.value)}
          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
        />
        <span className="text-slate-400 text-xs">—</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="max"
          value={maxValue}
          onChange={(e) => onMax(e.target.value)}
          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
