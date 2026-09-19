"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Icone messagerie avec badge compteur de non-lus.
 * - Refetch a l'ouverture du tab (focus) et a chaque nouveau message
 * - Refetch quand l'utilisateur marque une conversation comme lue
 * - Ne s'affiche que si l'utilisateur est connecte
 */
export default function MessagerieIconBadge({ user }: { user: User | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let cancelled = false;

    async function fetchCount() {
      const { data } = await supabase.rpc("get_unread_count");
      if (!cancelled && typeof data === "number") {
        setUnread(data);
      }
    }
    fetchCount();

    function onVisible() {
      if (document.visibilityState === "visible") fetchCount();
    }
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);

    // Realtime : nouveau message reçu OU UPDATE de mes participants (lu sur autre tab).
    // Nom unique par mount pour eviter le conflit StrictMode (double useEffect).
    const channelName = `unread-badge:${user.id}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { sender_id: string } | null;
          if (msg && msg.sender_id !== user.id) {
            fetchCount();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchCount();
        },
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
      href="/messagerie"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-slate-100 transition text-slate-700"
      aria-label={
        unread > 0 ? `Messagerie · ${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : "Messagerie"
      }
      title={unread > 0 ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : "Messagerie"}
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
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums shadow-sm border-2 border-white"
        >
          {display}
        </span>
      )}
    </Link>
  );
}
