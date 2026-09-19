"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type FormationLevel = "debutant" | "intermediaire" | "avance";
type FormationFormat = "cours" | "atelier" | "certifiant";
type FormationCategory =
  | "bourse"
  | "obligations"
  | "analyse"
  | "macro"
  | "portefeuille"
  | "pratique";

type FormationCard = {
  slug: string;
  title: string;
  shortDescription: string;
  level: FormationLevel;
  format: FormationFormat;
  category: FormationCategory;
  durationMinutes: number;
  modulesCount: number;
  pricingType: "gratuit" | "premium" | "certifiant";
  priceFcfa: number;
  tags: string[];
  featured?: boolean;
  accentColor: string;
};

const CATEGORIES: { id: FormationCategory; label: string; color: string }[] = [
  { id: "bourse", label: "Bourse & BRVM", color: "#1d4ed8" },
  { id: "obligations", label: "Obligations", color: "#b45309" },
  { id: "analyse", label: "Analyse", color: "#7c3aed" },
  { id: "macro", label: "Macro UEMOA", color: "#059669" },
  { id: "portefeuille", label: "Portefeuille", color: "#be185d" },
  { id: "pratique", label: "Pratique", color: "#475569" },
];

const LEVELS: { id: FormationLevel; label: string; color: string }[] = [
  { id: "debutant", label: "Débutant", color: "#16a34a" },
  { id: "intermediaire", label: "Intermédiaire", color: "#2563eb" },
  { id: "avance", label: "Avancé", color: "#9333ea" },
];

const FORMATS: { id: FormationFormat; label: string }[] = [
  { id: "cours", label: "Cours en ligne" },
  { id: "atelier", label: "Atelier live" },
  { id: "certifiant", label: "Certifiant" },
];

const PRICING: { id: "gratuit" | "premium" | "certifiant"; label: string }[] = [
  { id: "gratuit", label: "Gratuit" },
  { id: "premium", label: "Premium" },
  { id: "certifiant", label: "Certifiant" },
];

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const mm = minutes % 60;
  if (mm === 0) return `${h} h`;
  return `${h} h ${mm.toString().padStart(2, "0")}`;
}

function fmtPrice(card: FormationCard): string {
  if (card.pricingType === "gratuit") return "Gratuit";
  return `${card.priceFcfa.toLocaleString("fr-FR")} FCFA`;
}

export default function FormationsCatalog({
  formations,
}: {
  formations: FormationCard[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<FormationCategory>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<FormationLevel>>(new Set());
  const [selectedFormats, setSelectedFormats] = useState<Set<FormationFormat>>(new Set());
  const [selectedPricing, setSelectedPricing] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"recommended" | "duration" | "price-asc" | "price-desc">(
    "recommended",
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = formations.filter((f) => {
      if (selectedCategories.size > 0 && !selectedCategories.has(f.category)) return false;
      if (selectedLevels.size > 0 && !selectedLevels.has(f.level)) return false;
      if (selectedFormats.size > 0 && !selectedFormats.has(f.format)) return false;
      if (selectedPricing.size > 0 && !selectedPricing.has(f.pricingType)) return false;
      if (q) {
        const haystack =
          f.title.toLowerCase() +
          " " +
          f.shortDescription.toLowerCase() +
          " " +
          f.tags.join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sort === "duration") {
      arr = [...arr].sort((a, b) => a.durationMinutes - b.durationMinutes);
    } else if (sort === "price-asc") {
      arr = [...arr].sort((a, b) => a.priceFcfa - b.priceFcfa);
    } else if (sort === "price-desc") {
      arr = [...arr].sort((a, b) => b.priceFcfa - a.priceFcfa);
    } else {
      // Recommended : featured d'abord, puis débutant > intermédiaire > avancé
      const levelRank: Record<FormationLevel, number> = {
        debutant: 0,
        intermediaire: 1,
        avance: 2,
      };
      arr = [...arr].sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return levelRank[a.level] - levelRank[b.level];
      });
    }
    return arr;
  }, [formations, search, selectedCategories, selectedLevels, selectedFormats, selectedPricing, sort]);

  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  function reset() {
    setSearch("");
    setSelectedCategories(new Set());
    setSelectedLevels(new Set());
    setSelectedFormats(new Set());
    setSelectedPricing(new Set());
    setSort("recommended");
  }

  const activeFiltersCount =
    selectedCategories.size +
    selectedLevels.size +
    selectedFormats.size +
    selectedPricing.size +
    (search.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Search + sort */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une formation, un thème, un mot-clé..."
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-500">Tri :</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              <option value="recommended">Recommandé</option>
              <option value="duration">Durée croissante</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
            </select>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-3 space-y-2">
          {/* Catégories */}
          <FilterRow
            label="Catégorie"
            items={CATEGORIES.map((c) => ({
              key: c.id,
              label: c.label,
              color: c.color,
              active: selectedCategories.has(c.id),
              onClick: () => toggle(selectedCategories, c.id, setSelectedCategories),
            }))}
          />
          <FilterRow
            label="Niveau"
            items={LEVELS.map((l) => ({
              key: l.id,
              label: l.label,
              color: l.color,
              active: selectedLevels.has(l.id),
              onClick: () => toggle(selectedLevels, l.id, setSelectedLevels),
            }))}
          />
          <FilterRow
            label="Format"
            items={FORMATS.map((f) => ({
              key: f.id,
              label: f.label,
              active: selectedFormats.has(f.id),
              onClick: () => toggle(selectedFormats, f.id, setSelectedFormats),
            }))}
          />
          <FilterRow
            label="Tarif"
            items={PRICING.map((p) => ({
              key: p.id,
              label: p.label,
              active: selectedPricing.has(p.id),
              onClick: () => toggle(selectedPricing, p.id, setSelectedPricing),
            }))}
          />
        </div>

        {activeFiltersCount > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[11px] text-slate-500">
              {activeFiltersCount} filtre{activeFiltersCount > 1 ? "s" : ""} actif
              {activeFiltersCount > 1 ? "s" : ""}
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
          {filtered.length} formation{filtered.length > 1 ? "s" : ""}
        </h2>
        <span className="text-[11px] text-slate-400">
          sur {formations.length} dans le catalogue
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-600">
            Aucune formation ne correspond à votre recherche.
          </p>
          <button
            onClick={reset}
            className="mt-3 text-xs text-slate-700 hover:text-slate-900 underline"
          >
            Effacer les filtres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <Card key={f.slug} card={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; color?: string; active: boolean; onClick: () => void }[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-slate-500 mr-1 min-w-[60px]">{label} :</span>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={it.onClick}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
            it.active
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {it.color && (
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: it.color, opacity: it.active ? 1 : 0.7 }}
            />
          )}
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Card({ card }: { card: FormationCard }) {
  const levelMeta = LEVELS.find((l) => l.id === card.level)!;
  const categoryMeta = CATEGORIES.find((c) => c.id === card.category)!;

  return (
    <Link
      href={`/academie/formations/${card.slug}`}
      className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-md transition overflow-hidden flex flex-col"
    >
      {/* Bandeau couleur catégorie */}
      <div
        className="h-1.5"
        style={{ background: card.accentColor }}
      />
      <div className="p-4 flex flex-col flex-1">
        {/* Top : catégorie + featured */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded font-medium"
            style={{
              background: card.accentColor + "15",
              color: card.accentColor,
            }}
          >
            {categoryMeta.label}
          </span>
          {card.featured && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
              ★ Mise en avant
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition leading-snug">
          {card.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-600 mt-2 leading-relaxed flex-1">
          {card.shortDescription}
        </p>

        {/* Meta : niveau · format · durée · modules */}
        <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: levelMeta.color }}
            />
            <span style={{ color: levelMeta.color }} className="font-medium">
              {levelMeta.label}
            </span>
          </span>
          <span>·</span>
          <span>{FORMATS.find((f) => f.id === card.format)?.label}</span>
          <span>·</span>
          <span className="tabular-nums">{fmtDuration(card.durationMinutes)}</span>
          <span>·</span>
          <span>
            {card.modulesCount} module{card.modulesCount > 1 ? "s" : ""}
          </span>
        </div>

        {/* Footer : prix + CTA */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span
            className={`text-sm font-semibold tabular-nums ${
              card.pricingType === "gratuit"
                ? "text-emerald-700"
                : card.pricingType === "certifiant"
                ? "text-purple-700"
                : "text-slate-900"
            }`}
          >
            {fmtPrice(card)}
          </span>
          <span className="text-xs text-slate-500 group-hover:text-blue-700 group-hover:translate-x-0.5 transition">
            Voir →
          </span>
        </div>
      </div>
    </Link>
  );
}
