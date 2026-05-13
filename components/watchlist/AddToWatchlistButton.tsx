"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WatchlistTargetType } from "@/lib/watchlists/types";
import {
  addToWatchlistAction,
  createWatchlistAction,
  listMyWatchlistOptions,
  type WatchlistOption,
} from "@/lib/watchlists/actions";

type Props = {
  targetType: WatchlistTargetType;
  targetCode: string;
  targetLabel?: string | null;
  isAuthenticated: boolean;
  variant?: "light" | "dark";
};

/**
 * Bouton ★ « Ajouter à ma watchlist ».
 * - Si non authentifié : redirige vers /connexion
 * - Si authentifié : ouvre un dropdown listant les watchlists existantes,
 *   plus un champ inline pour en créer une nouvelle
 */
export default function AddToWatchlistButton({
  targetType,
  targetCode,
  targetLabel,
  isAuthenticated,
  variant = "light",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<WatchlistOption[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function toggle() {
    if (!isAuthenticated) {
      const here = typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/connexion?redirect=${encodeURIComponent(here)}`);
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setError(null);
    setSuccess(null);
    if (options === null) {
      const list = await listMyWatchlistOptions();
      setOptions(list);
    }
  }

  function addToList(listId: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await addToWatchlistAction(
        listId,
        targetType,
        targetCode,
        targetLabel ?? null,
      );
      if (res.ok) {
        setSuccess("Ajouté à la liste");
        router.refresh();
        setTimeout(() => setOpen(false), 1200);
      } else {
        setError(res.error);
      }
    });
  }

  function createAndAdd() {
    setError(null);
    setSuccess(null);
    if (!newName.trim()) {
      setError("Nom requis.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", newName.trim());
      const created = await createWatchlistAction(fd);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const added = await addToWatchlistAction(
        created.data.id,
        targetType,
        targetCode,
        targetLabel ?? null,
      );
      if (!added.ok) {
        setError(added.error);
        return;
      }
      setSuccess(`Ajouté à « ${newName.trim()} »`);
      setNewName("");
      setCreating(false);
      // Recharge la liste pour la prochaine ouverture
      const list = await listMyWatchlistOptions();
      setOptions(list);
      router.refresh();
      setTimeout(() => setOpen(false), 1200);
    });
  }

  const isDark = variant === "dark";
  const baseBtn = isDark
    ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition ${baseBtn} disabled:opacity-60`}
        aria-label="Ajouter à ma watchlist"
      >
        <span aria-hidden>★</span>
        <span>Watchlist</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[260px] bg-white border border-slate-200 rounded-md shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-[11px] uppercase tracking-wide font-semibold text-slate-500">
            Ajouter à…
          </div>
          {options === null ? (
            <div className="px-4 py-3 text-xs text-slate-400 text-center">
              Chargement…
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">
              Aucune liste pour le moment.
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-blue-700 hover:underline ml-1"
              >
                Créer la première
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => addToList(o.id)}
                    disabled={pending}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {o.name}
                    {o.is_default && (
                      <span className="ml-2 text-[10px] uppercase font-semibold text-amber-700">
                        Défaut
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {creating ? (
            <div className="border-t border-slate-100 p-2.5 space-y-2 bg-slate-50/50">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                placeholder="Nom de la nouvelle liste"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setError(null);
                  }}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-white border border-slate-300 text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={createAndAdd}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {pending ? "…" : "Créer + ajouter"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={pending}
              className="w-full text-left px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 border-t border-slate-100"
            >
              + Nouvelle liste
            </button>
          )}

          {error && (
            <div className="px-3 py-2 text-xs text-rose-700 border-t border-rose-100 bg-rose-50">
              {error}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 text-xs text-emerald-700 border-t border-emerald-100 bg-emerald-50">
              ✓ {success}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
