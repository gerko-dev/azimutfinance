"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  sessionLabel: string | null;
  isClosed: boolean | null;
  /** Intervalle de rafraichissement en ms. Par defaut 5 min. */
  refreshIntervalMs?: number;
  /** "light" (defaut) pour fond clair ; "dark" pour fond sombre (hero slate-900). */
  variant?: "light" | "dark";
};

export default function LivePriceBadge({
  sessionLabel,
  isClosed,
  refreshIntervalMs = 5 * 60 * 1000,
  variant = "light",
}: Props) {
  const router = useRouter();

  // Rafraichissement automatique des donnees (router.refresh) toutes les 5 min
  // — sauf si la seance est fermee : on met une cadence plus lente.
  useEffect(() => {
    const interval = isClosed ? 30 * 60 * 1000 : refreshIntervalMs;
    const id = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(id);
  }, [router, refreshIntervalMs, isClosed]);

  const isDark = variant === "dark";
  const rootClass = isDark
    ? "inline-flex items-center gap-2 text-[11px] text-slate-300"
    : "inline-flex items-center gap-2 text-[11px] text-slate-500";
  const labelClass = isDark
    ? "font-medium text-slate-200"
    : "font-medium text-slate-600";
  const dotIdleClass = isDark ? "bg-slate-500" : "bg-slate-400";
  const sepClass = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <div className={rootClass}>
      <span className="inline-flex items-center gap-1">
        <span
          className={`relative inline-flex w-2 h-2 rounded-full ${
            isClosed === false ? "bg-emerald-500" : dotIdleClass
          }`}
        >
          {isClosed === false && (
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
          )}
        </span>
        <span className={labelClass}>
          {isClosed === false
            ? "Cotation en cours"
            : isClosed === true
              ? "Séance fermée"
              : "Cours BRVM"}
        </span>
      </span>
      {sessionLabel && (
        <>
          <span className={sepClass}>·</span>
          <span className="hidden md:inline tabular-nums">{sessionLabel}</span>
        </>
      )}
    </div>
  );
}
