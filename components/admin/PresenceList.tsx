"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPresenceEntry } from "@/lib/admin/types";
import { ROLE_COLOR, ROLE_LABEL } from "@/lib/admin/types";

function fmtDuration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return `${h} h ${String(mm).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d} j ${String(hh).padStart(2, "0")} h`;
}

function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function shortAgent(ua: string | null): string {
  if (!ua) return "—";
  // Best-effort detection
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  return "Autre";
}

export default function PresenceList({
  entries: initialEntries,
}: {
  entries: AdminPresenceEntry[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [showOffline, setShowOffline] = useState(true);

  // Auto-refresh toutes les 30 s pour les durees recalculees + nouveaux pings
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  // Refresh entries quand initialEntries change (apres router.refresh)
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const online = entries.filter((e) => e.is_online);
  const offline = entries.filter((e) => !e.is_online);

  return (
    <div className="space-y-5">
      {/* Live count */}
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-100 font-semibold">
            En ligne maintenant
          </div>
          <div className="text-4xl font-bold mt-1 tabular-nums">{online.length}</div>
          <div className="text-xs text-emerald-100 mt-1">
            sur {entries.length} comptes ayant déjà été actifs
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <span className="text-xs text-emerald-100">Live</span>
        </div>
      </div>

      {/* Online list */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-emerald-50/50 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Connectés ({online.length})
          </h2>
          <span className="text-[11px] text-slate-500">
            Pings reçus dans les 90 dernières secondes
          </span>
        </div>
        {online.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Personne en ligne actuellement.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {online.map((e) => (
              <PresenceRow key={e.user_id} entry={e} />
            ))}
          </ul>
        )}
      </section>

      {/* Offline list */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <button
            onClick={() => setShowOffline(!showOffline)}
            className="text-base font-semibold text-slate-900 hover:text-blue-700 flex items-center gap-2"
          >
            Déconnectés ({offline.length})
            <span className="text-xs text-slate-400">{showOffline ? "▾" : "▸"}</span>
          </button>
          <span className="text-[11px] text-slate-500">
            Triés du plus récemment vu au plus ancien
          </span>
        </div>
        {showOffline && (
          offline.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Aucun utilisateur hors ligne enregistré.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {offline.map((e) => (
                <PresenceRow key={e.user_id} entry={e} />
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}

function PresenceRow({ entry }: { entry: AdminPresenceEntry }) {
  const display =
    entry.full_name || entry.username || entry.email || `User ${entry.user_id.slice(0, 6)}`;
  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
      <div className="relative shrink-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs"
          style={{ background: ROLE_COLOR[entry.role] }}
        >
          {(entry.full_name?.[0] ?? entry.username?.[0] ?? entry.email?.[0] ?? "?").toUpperCase()}
        </div>
        {entry.is_online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900 truncate">{display}</span>
          <span
            className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
            style={{
              background: ROLE_COLOR[entry.role] + "15",
              color: ROLE_COLOR[entry.role],
            }}
          >
            {ROLE_LABEL[entry.role]}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {entry.email || "—"} · {shortAgent(entry.user_agent)}
        </div>
      </div>
      <div className="text-right shrink-0">
        {entry.is_online ? (
          <>
            <div className="text-xs text-emerald-700 font-semibold tabular-nums">
              ● En ligne · {fmtDuration(entry.online_seconds)}
            </div>
            <div className="text-[10px] text-slate-400 tabular-nums">
              session démarrée à {fmtDateTime(entry.session_start_at)}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-slate-600 tabular-nums">
              Vu il y a {fmtDuration(entry.offline_seconds)}
            </div>
            <div className="text-[10px] text-slate-400 tabular-nums">
              dernier ping : {fmtDateTime(entry.last_seen_at)}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
