"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ForumNotif = {
  id: string;
  topic_id: string;
  reply_id: string | null;
  topic_title: string;
  topic_slug: string;
  replier_id: string | null;
  replier_username: string | null;
  replier_full_name: string | null;
  read_at: string | null;
  created_at: string;
};

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function replierName(n: ForumNotif): string {
  return n.replier_full_name || n.replier_username || "Quelqu'un";
}

/**
 * Cloche forum : badge compteur + dropdown des notifs recentes.
 * Visible uniquement pour les utilisateurs connectes.
 */
export default function ForumIconBadge({ user }: { user: User | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [unread, setUnread] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ForumNotif[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let cancelled = false;

    async function fetchCount() {
      const { data } = await supabase.rpc("forum_unread_count");
      if (!cancelled && typeof data === "number") setUnread(data);
    }
    fetchCount();

    function onVisible() {
      if (document.visibilityState === "visible") fetchCount();
    }
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);

    // Realtime : nouvelle notif inseree par le trigger forum_replies_after_insert
    const channelName = `forum-notifs:${user.id}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "forum_notifications",
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

  // Click outside : ferme le dropdown
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
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded) {
      const { data } = await supabase.rpc("forum_list_notifications", { p_limit: 15 });
      setItems((data as ForumNotif[] | null) ?? []);
      setLoaded(true);
    }
    // Marque toutes les notifs comme lues a l'ouverture
    if (unread > 0) {
      await supabase.rpc("forum_mark_all_read");
      setUnread(0);
    }
  }

  if (!user) return null;

  const display = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-slate-100 transition text-slate-700"
        aria-label={
          unread > 0
            ? `Forum · ${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`
            : "Forum · notifications"
        }
        title={unread > 0 ? `${unread} notification${unread > 1 ? "s" : ""}` : "Notifications forum"}
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
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums shadow-sm border-2 border-white">
            {display}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] max-w-[90vw] bg-white border border-slate-200 rounded-md shadow-lg z-40 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Forum · notifications
            </div>
            <Link
              href="/communaute/forum"
              onClick={() => setOpen(false)}
              className="text-[11px] text-blue-700 hover:underline"
            >
              Voir le forum
            </Link>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                Chargement…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                Aucune notification pour le moment.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/communaute/forum/t/${n.topic_id}`}
                      onClick={() => setOpen(false)}
                      className={`block px-3 py-2.5 hover:bg-slate-50 transition ${
                        n.read_at ? "" : "bg-blue-50/40"
                      }`}
                    >
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {replierName(n)}
                        </span>{" "}
                        a répondu à
                      </div>
                      <div className="text-sm text-slate-800 font-medium line-clamp-2 mt-0.5">
                        {n.topic_title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        il y a {fmtRelative(n.created_at)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
