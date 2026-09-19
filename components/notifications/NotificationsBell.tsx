"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type NotifKind = "alert" | "forum_reply";

type Notification = {
  kind: NotifKind;
  id: string;
  created_at: string;
  read_at: string | null;
  title: string;
  subtitle: string;
  href: string;
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

const KIND_LABEL: Record<NotifKind, string> = {
  alert: "Alerte",
  forum_reply: "Forum",
};

const KIND_BADGE_CLASS: Record<NotifKind, string> = {
  alert: "bg-amber-100 text-amber-800",
  forum_reply: "bg-blue-100 text-blue-700",
};

/**
 * Cloche unique agrégeant alertes + notifications forum.
 * - Compteur unifié
 * - Dropdown listant tout, triable par date desc
 * - Supprimer une notif (X) + Vider toute la liste
 * Visible uniquement pour les utilisateurs connectés.
 */
export default function NotificationsBell({ user }: { user: User | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [unread, setUnread] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchCount() {
      const { data } = await supabase.rpc("notifications_unread_count");
      if (!cancelled && typeof data === "number") setUnread(data);
    }
    fetchCount();

    function onVisible() {
      if (document.visibilityState === "visible") fetchCount();
    }
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);

    // Realtime : suit alert_triggers + forum_notifications
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`notifs-bell:${user.id}:${suffix}`)
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

  // Click outside ferme le dropdown
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

  async function loadList() {
    const { data } = await supabase.rpc("notifications_list", { p_limit: 25 });
    setItems((data as Notification[] | null) ?? []);
    setLoaded(true);
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded) await loadList();
    // Marque tout comme lu à l'ouverture (le badge tombe à 0)
    if (unread > 0) {
      await supabase.rpc("notifications_mark_all_read");
      setUnread(0);
    }
  }

  async function deleteOne(n: Notification) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("notifications_delete", {
      p_kind: n.kind,
      p_id: n.id,
    });
    setBusy(false);
    if (!error && data === true) {
      setItems((prev) => prev.filter((x) => !(x.kind === n.kind && x.id === n.id)));
    }
  }

  async function clearAll() {
    if (busy) return;
    if (items.length === 0) return;
    if (!confirm("Vider toute la liste des notifications ?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("notifications_clear_all");
    setBusy(false);
    if (!error) {
      setItems([]);
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
            ? `Notifications · ${unread} non lue${unread > 1 ? "s" : ""}`
            : "Notifications"
        }
        title={
          unread > 0
            ? `${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`
            : "Notifications"
        }
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
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[360px] max-w-[92vw] bg-white border border-slate-200 rounded-md shadow-lg z-40 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Notifications
            </div>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy || items.length === 0}
              className="text-[11px] text-rose-600 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Vider la liste
            </button>
          </div>
          <div className="max-h-[460px] overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                Chargement…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                Aucune notification.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={`${n.kind}:${n.id}`} className="group relative">
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className={`block px-3 py-2.5 pr-9 hover:bg-slate-50 transition ${
                        n.read_at ? "" : "bg-blue-50/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded ${KIND_BADGE_CLASS[n.kind]}`}
                        >
                          {KIND_LABEL[n.kind]}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          il y a {fmtRelative(n.created_at)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-900 font-medium line-clamp-2">
                        {n.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {n.subtitle}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteOne(n);
                      }}
                      disabled={busy}
                      aria-label="Supprimer cette notification"
                      title="Supprimer"
                      className="absolute top-2 right-2 w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-30"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
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
