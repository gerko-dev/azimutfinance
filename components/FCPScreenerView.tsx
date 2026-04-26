"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScreenerRow, ScreenerPeriodKey, ScreenerCadence } from "@/app/outils/screener-fcp/page";

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
function fmtDateFR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
function managerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PERIOD_LABEL: Record<ScreenerPeriodKey, string> = {
  lastPeriod: "Dernière",
  ytd: "YTD",
  m3: "3 mois",
  m6: "6 mois",
  m9: "9 mois",
  y1: "1 an",
  y3: "3 ans (ann.)",
};
const PERIOD_ORDER: ScreenerPeriodKey[] = ["lastPeriod", "ytd", "m3", "m6", "m9", "y1", "y3"];

const CATEGORY_COLORS: Record<string, string> = {
  Obligataire: "#185FA5",
  Monétaire: "#0891b2",
  Diversifié: "#7F77DD",
  Actions: "#0F6E56",
  "Actifs non cotés": "#854F0B",
};

const CADENCE_LABEL: Record<ScreenerCadence, string> = {
  quotidienne: "Quot.",
  hebdomadaire: "Hebdo",
  trimestrielle: "Trim.",
  "irrégulière": "Irrég.",
};
const ALL_CADENCES: ScreenerCadence[] = [
  "quotidienne",
  "hebdomadaire",
  "trimestrielle",
  "irrégulière",
];

// ==========================================
// TYPES
// ==========================================
type SortKey =
  | "nom"
  | "gestionnaire"
  | "categorie"
  | "aum"
  | "latestVL"
  | "ageYears"
  | "cadence"
  | "perf";

type SortOrder = "asc" | "desc";

type Props = {
  rows: ScreenerRow[];
  refQuarter: string;
  latestVLGlobal: string;
  stalenessCutoff: string;
  categories: string[];
  managers: string[];
  types: string[];
};

const PAGE_SIZE = 25;

// ==========================================
// COMPONENT
// ==========================================
export default function FCPScreenerView(props: Props) {
  const {
    rows,
    refQuarter,
    latestVLGlobal,
    stalenessCutoff,
    categories,
    managers,
    types,
  } = props;

  // === FILTRES ===
  const [search, setSearch] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedCadences, setSelectedCadences] = useState<Set<ScreenerCadence>>(new Set());
  const [aumMin, setAumMin] = useState("");
  const [aumMax, setAumMax] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [perfPeriod, setPerfPeriod] = useState<ScreenerPeriodKey>("ytd");
  const [perfMin, setPerfMin] = useState("");
  const [perfMax, setPerfMax] = useState("");
  const [excludeStale, setExcludeStale] = useState(true);
  const [excludeNoAum, setExcludeNoAum] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>("aum");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Reset à la page 1 dès qu'un filtre change
  const filterSig = useMemo(
    () =>
      [
        search,
        Array.from(selectedCats).join("|"),
        Array.from(selectedManagers).join("|"),
        Array.from(selectedTypes).join("|"),
        Array.from(selectedCadences).join("|"),
        aumMin,
        aumMax,
        ageMin,
        perfPeriod,
        perfMin,
        perfMax,
        excludeStale,
        excludeNoAum,
      ].join("###"),
    [
      search,
      selectedCats,
      selectedManagers,
      selectedTypes,
      selectedCadences,
      aumMin,
      aumMax,
      ageMin,
      perfPeriod,
      perfMin,
      perfMax,
      excludeStale,
      excludeNoAum,
    ]
  );
  if (page !== 1 && filterSig) {
    /* page reset when filterSig changes — handled by below */
  }

  // === FILTRAGE ===
  const filtered = useMemo(() => {
    const aumMinN = aumMin ? parseFloat(aumMin.replace(",", ".")) * 1e9 : -Infinity;
    const aumMaxN = aumMax ? parseFloat(aumMax.replace(",", ".")) * 1e9 : Infinity;
    const ageMinN = ageMin ? parseFloat(ageMin.replace(",", ".")) : -Infinity;
    const perfMinN = perfMin ? parseFloat(perfMin.replace(",", ".")) / 100 : -Infinity;
    const perfMaxN = perfMax ? parseFloat(perfMax.replace(",", ".")) / 100 : Infinity;
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (excludeStale && r.isStale) return false;
      if (excludeNoAum && (r.aumAtRef === null || r.aumAtRef <= 0)) return false;
      if (q && !`${r.nom} ${r.gestionnaire}`.toLowerCase().includes(q)) return false;
      if (selectedCats.size > 0 && !selectedCats.has(r.categorie)) return false;
      if (selectedManagers.size > 0 && !selectedManagers.has(r.gestionnaire)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(r.type)) return false;
      if (selectedCadences.size > 0 && !selectedCadences.has(r.cadence)) return false;
      if (r.aumAtRef !== null) {
        if (r.aumAtRef < aumMinN) return false;
        if (r.aumAtRef > aumMaxN) return false;
      } else if (aumMinN > -Infinity || aumMaxN < Infinity) {
        return false;
      }
      if (ageMinN > -Infinity) {
        if (r.ageYears === null || r.ageYears < ageMinN) return false;
      }
      if (perfMinN > -Infinity || perfMaxN < Infinity) {
        const v = r.perf[perfPeriod];
        if (v === null) return false;
        if (v < perfMinN) return false;
        if (v > perfMaxN) return false;
      }
      return true;
    });
  }, [
    rows,
    search,
    selectedCats,
    selectedManagers,
    selectedTypes,
    selectedCadences,
    aumMin,
    aumMax,
    ageMin,
    perfPeriod,
    perfMin,
    perfMax,
    excludeStale,
    excludeNoAum,
  ]);

  // === TRI ===
  const sorted = useMemo(() => {
    const out = [...filtered];
    const dir = sortOrder === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "nom":
            return a.nom.localeCompare(b.nom);
          case "gestionnaire":
            return a.gestionnaire.localeCompare(b.gestionnaire);
          case "categorie":
            return a.categorie.localeCompare(b.categorie);
          case "aum":
            return (a.aumAtRef ?? -1) - (b.aumAtRef ?? -1);
          case "latestVL":
            return a.latestVLDate.localeCompare(b.latestVLDate);
          case "ageYears":
            return (a.ageYears ?? -1) - (b.ageYears ?? -1);
          case "cadence":
            return a.cadence.localeCompare(b.cadence);
          case "perf":
            return (a.perf[perfPeriod] ?? -Infinity) - (b.perf[perfPeriod] ?? -Infinity);
        }
      })();
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, sortOrder, perfPeriod]);

  // === PAGINATION ===
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // === EXPORT CSV ===
  const exportCSV = () => {
    const headers = [
      "Fonds",
      "Gestionnaire",
      "Catégorie",
      "Type",
      "AUM (FCFA)",
      "Dernière VL",
      "Ancienneté (ans)",
      "Cadence",
      ...PERIOD_ORDER.map((p) => `Perf ${PERIOD_LABEL[p]}`),
    ];
    const lines = [headers.join(";")];
    for (const r of sorted) {
      lines.push(
        [
          `"${r.nom.replace(/"/g, '""')}"`,
          `"${r.gestionnaire.replace(/"/g, '""')}"`,
          `"${r.categorie}"`,
          r.type,
          r.aumAtRef ?? "",
          r.latestVLDate,
          r.ageYears !== null ? r.ageYears.toFixed(1) : "",
          r.cadence,
          ...PERIOD_ORDER.map((p) =>
            r.perf[p] !== null ? (r.perf[p]! * 100).toFixed(2) : ""
          ),
        ].join(";")
      );
    }
    const csv = "﻿" + lines.join("\n"); // BOM pour Excel fr-FR
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screener-fcp-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === RESET ===
  const resetAll = () => {
    setSearch("");
    setSelectedCats(new Set());
    setSelectedManagers(new Set());
    setSelectedTypes(new Set());
    setSelectedCadences(new Set());
    setAumMin("");
    setAumMax("");
    setAgeMin("");
    setPerfMin("");
    setPerfMax("");
    setExcludeStale(true);
    setExcludeNoAum(true);
    setPage(1);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">Outils</p>
        <h1 className="text-3xl font-bold text-slate-900">Screener FCP / OPCVM</h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Recherche libre dans les {rows.length} fonds publiés au {fmtDateFR(refQuarter)}.
          Combine catégorie, gestionnaire, AUM, performance sur fenêtre choisie, cadence et
          ancienneté.
        </p>
      </header>

      {/* === FILTRES === */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Filtres</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="text-xs text-slate-500 hover:text-slate-900 underline"
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Recherche libre */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500">Recherche</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom du fonds ou de la SGP…"
            className="mt-1 w-full md:w-96 px-3 py-2 text-sm border border-slate-200 rounded-md"
          />
        </div>

        {/* Multi-select chips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ChipFilter
            label="Catégorie"
            options={categories}
            selected={selectedCats}
            onToggle={(v) => {
              const s = new Set(selectedCats);
              s.has(v) ? s.delete(v) : s.add(v);
              setSelectedCats(s);
              setPage(1);
            }}
            colorMap={CATEGORY_COLORS}
          />
          <ChipFilter
            label="Type"
            options={types}
            selected={selectedTypes}
            onToggle={(v) => {
              const s = new Set(selectedTypes);
              s.has(v) ? s.delete(v) : s.add(v);
              setSelectedTypes(s);
              setPage(1);
            }}
          />
          <ChipFilter
            label="Cadence"
            options={ALL_CADENCES}
            selected={selectedCadences as Set<string>}
            onToggle={(v) => {
              const s = new Set(selectedCadences) as Set<ScreenerCadence>;
              const k = v as ScreenerCadence;
              s.has(k) ? s.delete(k) : s.add(k);
              setSelectedCadences(s);
              setPage(1);
            }}
            labels={CADENCE_LABEL as Record<string, string>}
          />
        </div>

        {/* Gestionnaire — long, en select multi */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500">
            Société de gestion ({selectedManagers.size > 0 ? `${selectedManagers.size} sélectionnées` : "toutes"})
          </label>
          <div className="mt-1 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-md bg-slate-50">
            <div className="flex flex-wrap gap-1.5">
              {managers.map((m) => {
                const sel = selectedManagers.has(m);
                return (
                  <button
                    key={m}
                    onClick={() => {
                      const s = new Set(selectedManagers);
                      sel ? s.delete(m) : s.add(m);
                      setSelectedManagers(s);
                      setPage(1);
                    }}
                    className={`px-2 py-0.5 text-[11px] rounded-md border transition ${
                      sel
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Numérique */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              AUM min (Mds)
            </label>
            <input
              type="text"
              value={aumMin}
              onChange={(e) => {
                setAumMin(e.target.value);
                setPage(1);
              }}
              placeholder="ex: 5"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              AUM max (Mds)
            </label>
            <input
              type="text"
              value={aumMax}
              onChange={(e) => {
                setAumMax(e.target.value);
                setPage(1);
              }}
              placeholder=""
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Ancienneté min (années)
            </label>
            <input
              type="text"
              value={ageMin}
              onChange={(e) => {
                setAgeMin(e.target.value);
                setPage(1);
              }}
              placeholder="ex: 3"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Période de perf
            </label>
            <select
              value={perfPeriod}
              onChange={(e) => {
                setPerfPeriod(e.target.value as ScreenerPeriodKey);
                setPage(1);
              }}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
            >
              {PERIOD_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Perf min (%)
            </label>
            <input
              type="text"
              value={perfMin}
              onChange={(e) => {
                setPerfMin(e.target.value);
                setPage(1);
              }}
              placeholder="ex: 5"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Perf max (%)
            </label>
            <input
              type="text"
              value={perfMax}
              onChange={(e) => {
                setPerfMax(e.target.value);
                setPage(1);
              }}
              placeholder=""
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-5 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeStale}
              onChange={(e) => {
                setExcludeStale(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4"
            />
            Exclure les fonds avec VL stale (&gt; 15 j avant {fmtDateFR(latestVLGlobal)})
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeNoAum}
              onChange={(e) => {
                setExcludeNoAum(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4"
            />
            Exclure les fonds sans AUM au {fmtDateFR(refQuarter)}
          </label>
        </div>
      </section>

      {/* === RESULTATS === */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-3 border-b border-slate-200">
          <div className="text-sm text-slate-700">
            <strong>{sorted.length}</strong> fonds correspondent · sur {rows.length} au total
          </div>
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export CSV ({sorted.length} fonds)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortableTh col="nom" label="Fonds" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} />
                <SortableTh col="gestionnaire" label="SGP" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} className="hidden md:table-cell" />
                <SortableTh col="categorie" label="Catégorie" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} className="hidden lg:table-cell" />
                <SortableTh col="aum" label="AUM" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} align="right" />
                <SortableTh
                  col="perf"
                  label={`Perf ${PERIOD_LABEL[perfPeriod].toLowerCase()}`}
                  sortKey={sortKey}
                  sortOrder={sortOrder}
                  setSortKey={setSortKey}
                  setSortOrder={setSortOrder}
                  align="right"
                />
                <SortableTh col="cadence" label="Cadence" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} className="hidden sm:table-cell" />
                <SortableTh col="ageYears" label="Ancienneté" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} align="right" className="hidden md:table-cell" />
                <SortableTh col="latestVL" label="Dernière VL" sortKey={sortKey} sortOrder={sortOrder} setSortKey={setSortKey} setSortOrder={setSortOrder} align="right" className="hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                    Aucun fonds ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 min-w-0">
                      <Link
                        href={`/fcp/${r.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {r.nom}
                      </Link>
                      <div className="text-[11px] text-slate-500 md:hidden">
                        <Link
                          href={`/sgp/${managerSlug(r.gestionnaire)}`}
                          className="hover:underline"
                        >
                          {r.gestionnaire}
                        </Link>{" "}
                        · {r.categorie}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 hidden md:table-cell">
                      <Link
                        href={`/sgp/${managerSlug(r.gestionnaire)}`}
                        className="hover:underline"
                      >
                        {r.gestionnaire}
                      </Link>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: CATEGORY_COLORS[r.categorie] || "#94a3b8" }}
                        />
                        {r.categorie}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                      {fmtBigFCFA(r.aumAtRef)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-sm tabular-nums font-bold ${
                        r.perf[perfPeriod] !== null && r.perf[perfPeriod]! >= 0
                          ? "text-emerald-700"
                          : r.perf[perfPeriod] !== null
                          ? "text-rose-700"
                          : "text-slate-400"
                      }`}
                    >
                      {fmtPct(r.perf[perfPeriod], 2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 hidden sm:table-cell">
                      {CADENCE_LABEL[r.cadence]}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums hidden md:table-cell">
                      {r.ageYears !== null ? r.ageYears.toFixed(1) + " ans" : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs hidden lg:table-cell">
                      <span className={r.isStale ? "text-rose-600" : "text-slate-600"}>
                        {fmtDateFR(r.latestVLDate)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              Page {currentPage} sur {totalPages} · {sorted.length} fonds
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
              >
                ←
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Stale = dernière VL antérieure à {fmtDateFR(stalenessCutoff)} (15 j avant{" "}
        {fmtDateFR(latestVLGlobal)}). Indicateurs de risque (vol, Sharpe, drawdown) non calculés —
        fréquence de publication des VL hétérogène entre fonds.
      </p>
    </main>
  );
}

// ==========================================
// SOUS-COMPOSANTS
// ==========================================
function ChipFilter({
  label,
  options,
  selected,
  onToggle,
  colorMap,
  labels,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  colorMap?: Record<string, string>;
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-slate-500">
        {label} ({selected.size > 0 ? `${selected.size} sélectionnée(s)` : "tout"})
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const sel = selected.has(o);
          const color = colorMap?.[o];
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              className={`px-2 py-0.5 text-[11px] rounded-md border transition ${
                sel
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
              style={
                sel && color
                  ? { background: color, borderColor: color }
                  : undefined
              }
            >
              {labels?.[o] || o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortableTh({
  col,
  label,
  sortKey,
  sortOrder,
  setSortKey,
  setSortOrder,
  align = "left",
  className = "",
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortOrder: SortOrder;
  setSortKey: (k: SortKey) => void;
  setSortOrder: (o: SortOrder) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => {
        if (active) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        else {
          setSortKey(col);
          setSortOrder("desc");
        }
      }}
      className={`px-3 py-2 text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {label}
      {active && <span className="ml-1 text-slate-400">{sortOrder === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
