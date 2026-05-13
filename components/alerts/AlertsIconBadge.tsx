"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Cloche alerte : badge compteur (alert_triggers non lus).
 * Visible uniquement pour les utilisateurs connectes.
 */
export default function AlertsIconBadge({ user }: { user: User | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let cancelled = false;

    async function fetchCount() {
      const { data } = await supabase.rpc("alerts_unread_count");
      if (!cancelled && typeof data === "number") setUnread(data);
    }
    fetchCount();

    function onVisible() {
      if (document.visibilityState === "visible") fetchCount();
    }
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);

    // Realtime : nouveau trigger insere par le cron
    const channelName = `alerts-notifs:${user.id}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alert_triggers",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", fetchCount);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  if (!user) return null;

  const display = unread > 99 ? "99+" : String(unread);

  return (
    <Link
      href="/outils/alertes"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-slate-100 transition text-slate-700"
      aria-label={
        unread > 0
          ? `Alertes · ${unread} non lue${unread > 1 ? "s" : ""}`
          : "Mes alertes"
      }
      title={unread > 0 ? `${unread} alerte${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}` : "Mes alertes"}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums shadow-sm border-2 border-white">
          {display}
        </span>
      )}
    </Link>
  );
}
