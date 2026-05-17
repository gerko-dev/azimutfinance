"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchKind =
  | "stock"
  | "listed-bond"
  | "sovereign"
  | "fund"
  | "fx"
  | "commodity"
  | "country";

type Result = {
  id: string;
  kind: SearchKind;
  label: string;
  sublabel: string;
  href: string;
};

const KIND_LABEL: Record<SearchKind, string> = {
  stock: "Actions",
  "listed-bond": "Obligations cotées",
  sovereign: "Souverains UMOA",
  fund: "OPCVM",
  fx: "Devises / FX",
  commodity: "Matières premières",
  country: "États",
};

// Couleurs de badge par classe d'actif — alignees sur la palette ProShell
// (slate fonce) pour rester discretes.
const KIND_BADGE: Record<SearchKind, string> = {
  stock: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "listed-bond": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  sovereign: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  fund: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  fx: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  commodity: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  country: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const KIND_SHORT: Record<SearchKind, string> = {
  stock: "ACT",
  "listed-bond": "OBL",
  sovereign: "SOUV",
  fund: "OPCVM",
  fx: "FX",
  commodity: "MP",
  country: "PAYS",
};

export default function ProSearchBox() {
  const router = useRouter();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch debounce — 150ms est un bon compromis entre reactivite et nombre
  // de hits. L'index serveur est memoize donc le cout par requete est faible.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pros/search?q=${encodeURIComponent(q)}&limit=20`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results?: Result[] };
        setResults(Array.isArray(data.results) ? data.results : []);
        setHighlight(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [query]);

  // Click-outside ferme le dropdown.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Raccourci global "/" pour focus la barre (Bloomberg / Slack-style).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      // Pas de capture si l'utilisateur tape deja dans un champ.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function commit(r: Result) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && results.length > 0) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (results[highlight]) {
        e.preventDefault();
        commit(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="flex-1 max-w-md relative">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Rechercher un titre, ISIN, devise, MP…"
          className="w-full pl-8 pr-12 py-1.5 text-xs bg-slate-800/60 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:bg-slate-800"
        />
        {/* Indicateur de raccourci */}
        <span
          className="hidden md:inline-flex items-center absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-900/70 border border-slate-700 rounded"
          aria-hidden
        >
          /
        </span>
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-[28rem] overflow-y-auto bg-slate-900 border border-slate-700 rounded shadow-xl"
        >
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Recherche…</div>
          )}
          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">
              Aucun résultat pour « {query} ».
            </div>
          )}
          {results.length > 0 && (
            <ul className="py-1">
              {groupResults(results).map((group, groupIdx) => (
                <li key={group.kind}>
                  {groupIdx > 0 && <div className="my-1 border-t border-slate-800" />}
                  <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    {KIND_LABEL[group.kind]}
                  </div>
                  <ul>
                    {group.items.map((r) => {
                      const globalIdx = results.indexOf(r);
                      const isActive = globalIdx === highlight;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setHighlight(globalIdx)}
                            onClick={() => commit(r)}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                              isActive
                                ? "bg-slate-800 text-white"
                                : "text-slate-200 hover:bg-slate-800/60"
                            }`}
                          >
                            <span
                              className={`shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono border rounded ${KIND_BADGE[r.kind]}`}
                            >
                              {KIND_SHORT[r.kind]}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="block text-xs font-medium truncate">
                                {r.label}
                              </span>
                              {r.sublabel && (
                                <span className="block text-[11px] text-slate-500 truncate">
                                  {r.sublabel}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Groupe les resultats par classe d'actif en preservant l'ordre de ranking :
// le premier groupe est celui du resultat 1er, etc.
function groupResults(results: Result[]): Array<{ kind: SearchKind; items: Result[] }> {
  const groups: Array<{ kind: SearchKind; items: Result[] }> = [];
  const byKind = new Map<SearchKind, Result[]>();
  for (const r of results) {
    if (!byKind.has(r.kind)) {
      byKind.set(r.kind, []);
      groups.push({ kind: r.kind, items: byKind.get(r.kind)! });
    }
    byKind.get(r.kind)!.push(r);
  }
  return groups;
}
