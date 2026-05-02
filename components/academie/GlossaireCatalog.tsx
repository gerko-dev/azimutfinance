"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type GlossCategory =
  | "bourse"
  | "obligations"
  | "analyse"
  | "macro"
  | "portefeuille"
  | "reglementation"
  | "fiscalite"
  | "general";

type GlossTermLight = {
  slug: string;
  term: string;
  acronym?: string;
  short: string;
  category: GlossCategory;
  tags?: string[];
};

const CATEGORIES: { id: GlossCategory; label: string; color: string }[] = [
  { id: "bourse", label: "Bourse & actions", color: "#1d4ed8" },
  { id: "obligations", label: "Obligations & taux", color: "#b45309" },
  { id: "analyse", label: "Analyse financière", color: "#7c3aed" },
  { id: "macro", label: "Macro & UEMOA", color: "#059669" },
  { id: "portefeuille", label: "Gestion de portefeuille", color: "#be185d" },
  { id: "reglementation", label: "Réglementation", color: "#0369a1" },
  { id: "fiscalite", label: "Fiscalité", color: "#9a3412" },
  { id: "general", label: "Général", color: "#475569" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function firstLetter(term: string): string {
  const n = normalize(term);
  const c = n.charAt(0);
  return c >= "a" && c <= "z" ? c.toUpperCase() : "#";
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function GlossaireCatalog({
  terms,
}: {
  terms: GlossTermLight[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<GlossCategory>>(new Set());
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return terms.filter((t) => {
      if (selectedCategories.size > 0 && !selectedCategories.has(t.category)) return false;
      if (activeLetter && firstLetter(t.term) !== activeLetter) return false;
      if (q) {
        const haystack =
          normalize(t.term) +
          " " +
          (t.acronym ? normalize(t.acronym) : "") +
          " " +
          normalize(t.short) +
          " " +
          (t.tags ? t.tags.map(normalize).join(" ") : "");
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [terms, search, selectedCategories, activeLetter]);

  const grouped = useMemo(() => {
    const map = new Map<string, GlossTermLight[]>();
    for (const t of filtered) {
      const l = firstLetter(t.term);
      const arr = map.get(l) ?? [];
      arr.push(t);
      map.set(l, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => normalize(a.term).localeCompare(normalize(b.term)));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    for (const t of terms) set.add(firstLetter(t.term));
    return set;
  }, [terms]);

  function toggleCategory(c: GlossCategory) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function reset() {
    setSearch("");
    setSelectedCategories(new Set());
    setActiveLetter(null);
  }

  const activeFilters =
    selectedCategories.size + (search.trim() ? 1 : 0) + (activeLetter ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Search + alphabet */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un terme, un acronyme, un mot-clé..."
          className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500"
        />

        {/* Alphabet nav */}
        <div className="mt-3 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveLetter(null)}
            className={`text-[11px] px-2 py-1 rounded font-medium ${
              activeLetter === null
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Tous
          </button>
          {ALPHABET.map((l) => {
            const available = availableLetters.has(l);
            return (
              <button
                key={l}
                onClick={() => setActiveLetter(activeLetter === l ? null : l)}
                disabled={!available}
                className={`text-[11px] w-7 h-7 rounded flex items-center justify-center font-medium transition ${
                  activeLetter === l
                    ? "bg-slate-900 text-white"
                    : available
                    ? "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                    : "text-slate-300 cursor-not-allowed"
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>

        {/* Catégories */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const active = selectedCategories.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCategory(c.id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: c.color, opacity: active ? 1 : 0.7 }}
                />
                {c.label}
              </button>
            );
          })}
        </div>

        {activeFilters > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[11px] text-slate-500">
              {activeFilters} filtre{activeFilters > 1 ? "s" : ""} actif{activeFilters > 1 ? "s" : ""}
            </span>
            <button
              onClick={reset}
              className="text-[11px] text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">
          {filtered.length} terme{filtered.length > 1 ? "s" : ""}
        </h2>
        <span className="text-[11px] text-slate-400">sur {terms.length} dans le glossaire</span>
      </div>

      {/* Grouped grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-600">Aucun terme ne correspond à votre recherche.</p>
          <button
            onClick={reset}
            className="mt-3 text-xs text-slate-700 hover:text-slate-900 underline"
          >
            Effacer les filtres
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([letter, items]) => (
            <section key={letter}>
              <div className="sticky top-0 bg-slate-50 z-10 py-1 mb-2 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 px-1">{letter}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((t) => (
                  <TermCard key={t.slug} term={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TermCard({ term }: { term: GlossTermLight }) {
  const cat = CATEGORIES.find((c) => c.id === term.category)!;
  return (
    <Link
      href={`/academie/glossaire/${term.slug}`}
      className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition p-3"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition leading-snug">
            {term.term}
            {term.acronym && (
              <span className="text-[11px] text-slate-500 font-normal ml-1.5">
                ({term.acronym})
              </span>
            )}
          </h3>
        </div>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium"
          style={{ background: cat.color + "15", color: cat.color }}
        >
          {cat.label.split(" ")[0]}
        </span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{term.short}</p>
    </Link>
  );
}
