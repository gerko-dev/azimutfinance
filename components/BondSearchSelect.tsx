"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Bond } from "@/lib/bondsUEMOA";

type Props = {
  bonds: Bond[];
  value: string;
  onChange: (isin: string) => void;
  placeholder?: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function BondSearchSelect({
  bonds,
  value,
  onChange,
  placeholder = "Rechercher...",
}: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Obligation selectionnee (cherchee dans la liste des bonds passes en props)
  const selectedBond = bonds.find((b) => b.isin === value);

  // FILTRAGE : multi-mots, sur ISIN / nom / emetteur / taux
  const filteredBonds = useMemo(() => {
    const normalizedSearch = normalize(search);
    if (!normalizedSearch) return bonds;

    const searchWords = normalizedSearch.split(" ").filter((w) => w.length > 0);

    return bonds.filter((b) => {
      const isin = normalize(b.isin || "");
      const name = normalize(b.nameShort || "");
      const issuer = normalize(b.issuer || "");
      const coupon = (b.couponRate * 100).toFixed(2);
      const haystack = `${isin} ${name} ${issuer} ${coupon}`;

      return searchWords.every((word) => haystack.includes(word));
    });
  }, [search, bonds]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  function handleSelect(bond: Bond) {
    onChange(bond.isin);
    setSearch("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((i) => Math.min(i + 1, filteredBonds.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredBonds[highlightedIndex]) {
        handleSelect(filteredBonds[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  const displayValue = isOpen
    ? search
    : selectedBond
    ? `${selectedBond.isin} — ${selectedBond.nameShort}`
    : search;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setSearch("");
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 bg-white"
        autoComplete="off"
      />

      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
          <div className="sticky top-0 px-3 py-1.5 text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
            {filteredBonds.length} résultat{filteredBonds.length > 1 ? "s" : ""} sur {bonds.length}
            {search && <span className="ml-2 text-slate-400">· « {search} »</span>}
          </div>

          {filteredBonds.length === 0 ? (
            <div className="px-3 py-6 text-sm text-slate-500 text-center">
              Aucune obligation trouvée
            </div>
          ) : (
            filteredBonds.map((bond, index) => (
              <button
                key={bond.isin}
                type="button"
                onClick={() => handleSelect(bond)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-3 ${
                  index === highlightedIndex
                    ? "bg-blue-50 text-blue-900"
                    : "hover:bg-slate-50"
                } ${bond.isin === value ? "font-medium" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">{bond.nameShort}</div>
                  <div className="text-xs text-slate-500 truncate font-mono">
                    {bond.isin}
                  </div>
                </div>
                <div className="text-xs text-slate-400 whitespace-nowrap">
                  {(bond.couponRate * 100).toFixed(2)}%
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}