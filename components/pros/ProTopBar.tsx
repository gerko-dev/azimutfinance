"use client";

import { useEffect, useState } from "react";

/**
 * Statut BRVM : ouverte du lundi au vendredi, environ 9h00 - 15h25 GMT.
 * Calcul cote client a partir de l'heure UTC pour eviter le decalage SSR/client.
 */
function getMarketStatus(now: Date): { open: boolean; label: string } {
  const day = now.getUTCDay(); // 0 dim, 6 sam
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const opens = 9 * 60; // 09:00 UTC
  const closes = 15 * 60 + 25; // 15:25 UTC
  if (!isWeekday) return { open: false, label: "Fermée (week-end)" };
  if (minutes < opens) return { open: false, label: "Pré-ouverture" };
  if (minutes >= closes) return { open: false, label: "Clôturée" };
  return { open: true, label: "Ouverte" };
}

export default function ProTopBar({
  userInitials,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  userInitials: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // setTimeout 0 plutot que setNow synchrone, pour respecter
    // react-hooks/set-state-in-effect (evite un cascade render).
    const initId = setTimeout(() => setNow(new Date()), 0);
    const intervalId = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      clearTimeout(initId);
      clearInterval(intervalId);
    };
  }, []);

  const status = now ? getMarketStatus(now) : null;
  const timeStr = now
    ? now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "--:--";
  const dateStr = now
    ? now.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur border-b border-slate-800">
      <div className="flex items-center gap-3 px-4 md:px-6 h-12 lg:pl-6 pl-14">
        {/* Bouton de bascule sidebar (desktop). Affiche une icone differente
            selon que la sidebar est repliee ou ouverte. */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Ouvrir le menu" : "Replier le menu"}
          title={sidebarCollapsed ? "Ouvrir le menu" : "Replier le menu"}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          {sidebarCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l-6 6 6 6" />
            </svg>
          )}
        </button>

        {/* Recherche universelle (placeholder) */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
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
              type="text"
              placeholder="Rechercher un titre, ISIN, émetteur…"
              disabled
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800/60 border border-slate-700 rounded text-slate-300 placeholder-slate-500 focus:outline-none focus:border-slate-600 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Statut marche + heure */}
        <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status?.open ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span className="text-slate-300 font-medium">BRVM</span>
            <span>{status?.label ?? "..."}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <span>{timeStr}</span>
            <span className="text-slate-500">UTC</span>
          </div>
          <div className="capitalize">{dateStr}</div>
        </div>

        {/* Avatar utilisateur */}
        <div className="flex items-center">
          <div className="w-7 h-7 rounded-full bg-purple-600 text-white text-[11px] font-semibold flex items-center justify-center">
            {userInitials}
          </div>
        </div>
      </div>
    </header>
  );
}
