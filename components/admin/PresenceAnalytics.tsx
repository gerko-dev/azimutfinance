"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  PresenceLive,
  PresenceSnapshotRow,
} from "@/lib/admin/presenceAnalytics";

// Libellés / couleurs par rôle — superset de ROLE_LABEL/ROLE_COLOR avec
// "anonymous" (les visiteurs non connectés) en plus.
const ROLE_LABEL: Record<string, string> = {
  anonymous: "Visiteur anonyme",
  member: "Membre",
  premium: "Premium",
  pro: "Pro",
  adminlevel1: "Admin · N1",
  adminlevel2: "Admin · N2",
  adminlevel3: "Éditeur · N3",
};
const ROLE_COLOR: Record<string, string> = {
  anonymous: "#94a3b8",
  member: "#475569",
  premium: "#1d4ed8",
  pro: "#7c3aed",
  adminlevel1: "#dc2626",
  adminlevel2: "#b45309",
  adminlevel3: "#059669",
};
const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;
const roleColor = (r: string) => ROLE_COLOR[r] ?? "#64748b";

function fmtDuration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ${String(Math.round(seconds % 60)).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}

function fmtSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hh}h${mm}`;
}

/** Raccourcit un chemin pour l'affichage : "/marches/actions" tel quel. */
function prettyPage(page: string): string {
  if (!page || page === "(inconnue)") return "(page inconnue)";
  return page;
}

export default function PresenceAnalytics({
  live,
  snapshots,
}: {
  live: PresenceLive;
  snapshots: PresenceSnapshotRow[];
}) {
  const router = useRouter();

  // Rafraîchissement live toutes les 30 s (aligné sur le heartbeat client).
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  // Regroupe les snapshots par horodatage (la RPC les renvoie déjà triés desc).
  const snapshotGroups = useMemo(() => {
    const map = new Map<string, PresenceSnapshotRow[]>();
    for (const row of snapshots) {
      const arr = map.get(row.snapshot_at) ?? [];
      arr.push(row);
      map.set(row.snapshot_at, arr);
    }
    return Array.from(map.entries()).map(([at, rows]) => ({
      at,
      rows: [...rows].sort((a, b) => b.online_count - a.online_count),
      totalOnline: rows.reduce((s, r) => s + r.online_count, 0),
      totalSessions: rows.reduce((s, r) => s + r.sessions_count, 0),
    }));
  }, [snapshots]);

  const maxPageCount = Math.max(1, ...live.by_page.map((p) => p.count));

  return (
    <div className="space-y-5">
      {/* ---- Live : total en ligne ---- */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
            Personnes sur le site maintenant
          </div>
          <div className="text-4xl font-bold mt-1 tabular-nums">
            {live.total}
          </div>
          <div className="text-xs text-blue-100 mt-1">
            {live.authenticated} connecté{live.authenticated > 1 ? "s" : ""} ·{" "}
            {live.anonymous} anonyme{live.anonymous > 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <span className="text-xs text-blue-100">Live · maj 30 s</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ---- Live : dispatching par page ---- */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">
              Dispatching par page
            </h2>
            <span className="text-[11px] text-slate-500">
              Où se trouvent les visiteurs en ce moment
            </span>
          </div>
          {live.by_page.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Personne sur le site actuellement.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {live.by_page.map((p) => (
                <li key={p.page} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-slate-700 truncate">
                      {prettyPage(p.page)}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                      {p.count}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(p.count / maxPageCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Live : dispatching par rôle ---- */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">
              Répartition par rôle
            </h2>
            <span className="text-[11px] text-slate-500">
              Qui est en ligne en ce moment
            </span>
          </div>
          {live.by_role.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Aucune présence pour l'instant.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {live.by_role.map((r) => (
                <li
                  key={r.role}
                  className="px-4 py-2.5 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: roleColor(r.role) }}
                    />
                    <span className="text-sm text-slate-700">
                      {roleLabel(r.role)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Historique : snapshots 8 h ---- */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Historique · snapshots 8 h
          </h2>
          <span className="text-[11px] text-slate-500">
            Décompte par rôle + temps moyen par session
          </span>
        </div>
        {snapshotGroups.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun snapshot enregistré pour l'instant. Le premier sera créé au
            prochain passage du cron (toutes les 8 h).
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {snapshotGroups.map((g) => (
              <div key={g.at} className="px-4 py-3">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {fmtSnapshotTime(g.at)}
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {g.totalOnline} en ligne · {g.totalSessions} session
                    {g.totalSessions > 1 ? "s" : ""} sur la fenêtre
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase">
                      <th className="text-left font-medium py-1">Rôle</th>
                      <th className="text-right font-medium py-1">En ligne</th>
                      <th className="text-right font-medium py-1">Sessions (8 h)</th>
                      <th className="text-right font-medium py-1">Temps moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.role} className="border-t border-slate-50">
                        <td className="py-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: roleColor(r.role) }}
                            />
                            {roleLabel(r.role)}
                          </span>
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-700">
                          {r.online_count}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-500">
                          {r.sessions_count}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-700">
                          {fmtDuration(r.avg_session_seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
