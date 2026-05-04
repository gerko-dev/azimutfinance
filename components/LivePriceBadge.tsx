"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  fetchedAt: string;
  sessionLabel: string | null;
  isClosed: boolean | null;
  /** Intervalle de rafraichissement en ms. Par defaut 5 min. */
  refreshIntervalMs?: number;
};

function formatAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec} s`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return `${h} h`;
}

export default function LivePriceBadge({
  fetchedAt,
  sessionLabel,
  isClosed,
  refreshIntervalMs = 5 * 60 * 1000,
}: Props) {
  const router = useRouter();
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick affichage "il y a X" toutes les 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Rafraichissement automatique des donnees (router.refresh) toutes les 5 min
  // — sauf si la seance est fermee : on met une cadence plus lente.
  useEffect(() => {
    const interval = isClosed ? 30 * 60 * 1000 : refreshIntervalMs;
    const id = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(id);
  }, [router, refreshIntervalMs, isClosed]);

  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span
          className={`relative inline-flex w-2 h-2 rounded-full ${
            isClosed === false ? "bg-emerald-500" : "bg-slate-400"
          }`}
        >
          {isClosed === false && (
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
          )}
        </span>
        <span className="font-medium text-slate-600">
          {isClosed === false
            ? "Cotation en cours"
            : isClosed === true
              ? "Séance fermée"
              : "Cours BRVM"}
        </span>
      </span>
      <span className="text-slate-400">·</span>
      <span>maj il y a {formatAgo(fetchedAt, now)}</span>
      {sessionLabel && (
        <>
          <span className="text-slate-400">·</span>
          <span className="hidden md:inline tabular-nums">{sessionLabel}</span>
        </>
      )}
    </div>
  );
}
