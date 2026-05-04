import { getDashboardStats, getOpenReportsCount, listAudit } from "@/lib/admin/queries";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { ROLE_COLOR, ROLE_LABEL } from "@/lib/admin/types";

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();
  const recentAudit = await listAudit({ limit: 8 });
  const openReports = await getOpenReportsCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vue d&apos;ensemble de la plateforme et activité administrative récente.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Membres" value={fmtNumber(stats.total_users)} />
          <StatCard label="Admins" value={fmtNumber(stats.total_admins)} accent="text-rose-700" />
          <StatCard label="Conversations" value={fmtNumber(stats.total_conversations)} />
          <StatCard label="Messages" value={fmtNumber(stats.total_messages)} />
          <StatCard
            label="Signalements ouverts"
            value={fmtNumber(openReports)}
            accent={openReports > 0 ? "text-rose-700" : "text-slate-900"}
          />
          <StatCard label="Saisons actives" value={fmtNumber(stats.active_seasons)} />
          <StatCard label="Transactions sim." value={fmtNumber(stats.total_transactions)} />
          <StatCard
            label="Audit · 24 h"
            value={fmtNumber(stats.audit_last_24h)}
            accent={stats.audit_last_24h > 0 ? "text-amber-700" : "text-slate-900"}
          />
        </div>
      )}

      {/* Activité récente */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Activité admin récente</h2>
          <span className="text-[11px] text-slate-400">8 dernières actions</span>
        </div>
        {recentAudit.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucune action enregistrée.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentAudit.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="text-[10px] text-slate-400 w-32 shrink-0 tabular-nums">
                  {fmtDateTime(e.created_at)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-900">
                    <span className="font-semibold">
                      {e.actor_username
                        ? `@${e.actor_username}`
                        : e.actor_email ?? "Système"}
                    </span>
                    {e.actor_role && (
                      <span
                        className="ml-2 text-[9px] uppercase font-semibold px-1 py-0.5 rounded"
                        style={{
                          background: ROLE_COLOR[e.actor_role] + "15",
                          color: ROLE_COLOR[e.actor_role],
                        }}
                      >
                        {ROLE_LABEL[e.actor_role]}
                      </span>
                    )}
                    <span className="text-slate-600"> · </span>
                    <span className="font-mono text-slate-700">{e.action}</span>
                    {e.target_type && e.target_id && (
                      <span className="text-slate-500">
                        {" "}
                        sur {e.target_type}{" "}
                        <span className="font-mono text-[10px]">
                          {e.target_id.slice(0, 8)}
                        </span>
                      </span>
                    )}
                  </div>
                  {e.reason && (
                    <div className="text-[10px] text-slate-500 italic mt-0.5">
                      « {e.reason} »
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Aide niveaux */}
      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Hiérarchie des rôles</h3>
        <ul className="text-xs text-slate-600 space-y-1.5">
          <li>
            <span
              className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded mr-2"
              style={{ background: "#dc262615", color: "#dc2626" }}
            >
              Niveau 1
            </span>
            Super-admin : toutes les habilitations (changer les rôles, supprimer un compte,
            modérer, gérer les saisons, audit).
          </li>
          <li>
            <span
              className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded mr-2"
              style={{ background: "#b4530915", color: "#b45309" }}
            >
              Niveau 2
            </span>
            Admin opérationnel : modération avancée (supprimer une conversation), gestion des
            saisons, accès au journal d&apos;audit.
          </li>
          <li>
            <span
              className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded mr-2"
              style={{ background: "#05966915", color: "#059669" }}
            >
              Niveau 3
            </span>
            Modérateur : lecture des membres et messages, suppression d&apos;un message
            individuel.
          </li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className={`text-xl font-bold tabular-nums mt-1 ${accent ?? "text-slate-900"}`}
      >
        {value}
      </div>
    </div>
  );
}
