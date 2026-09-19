import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getMemberSummary } from "@/lib/admin/queries";
import { ROLE_COLOR, ROLE_LABEL, type AppRole } from "@/lib/admin/types";
import { fmtDateTime, fmtFCFA, fmtNumber } from "@/components/admin/format";
import SanctionsPanel from "@/components/admin/SanctionsPanel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function shortAgent(ua: string | null): string {
  if (!ua) return "—";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  return "Autre";
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { level } = await requireAdmin(3);
  const { id } = await params;
  const summary = await getMemberSummary(id);
  if (!summary || !summary.profile) notFound();

  const { profile, presence, messagerie, portfolios, audit, sanctions } = summary;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: meUser },
  } = await supabase.auth.getUser();
  const isMe = meUser?.id === id;
  const targetIsAdmin =
    profile.role === "adminlevel1" ||
    profile.role === "adminlevel2" ||
    profile.role === "adminlevel3";
  const role = profile.role as AppRole;
  const initials = (profile.full_name || profile.username || profile.email || "?")
    .slice(0, 2)
    .toUpperCase();

  const totalTx = portfolios.reduce((s, p) => s + (p.transactions_count ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500">
        <Link href="/admin/membres" className="hover:text-slate-700">
          Membres
        </Link>{" "}
        &rsaquo; {profile.full_name || profile.username || profile.email}
      </div>

      {/* Hero profil */}
      <section className="bg-white rounded-lg border border-slate-200 p-5 md:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 relative"
            style={{ background: ROLE_COLOR[role] }}
          >
            {initials}
            {presence?.is_online && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                {profile.full_name || profile.username || profile.email}
              </h1>
              <span
                className="text-[11px] uppercase font-semibold px-2 py-0.5 rounded"
                style={{
                  background: ROLE_COLOR[role] + "15",
                  color: ROLE_COLOR[role],
                }}
              >
                {ROLE_LABEL[role]}
              </span>
            </div>
            {profile.username && (
              <div className="text-sm text-slate-500">@{profile.username}</div>
            )}
            <div className="text-sm text-slate-700 mt-1.5">{profile.email}</div>
            <div className="text-[11px] text-slate-500 mt-2 font-mono">
              ID : {profile.id}
            </div>
          </div>
          <div className="text-right shrink-0">
            {presence?.is_online ? (
              <>
                <div className="text-sm text-emerald-700 font-semibold">
                  ● En ligne
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  depuis {fmtDuration(presence.online_seconds)}
                </div>
              </>
            ) : presence ? (
              <>
                <div className="text-sm text-slate-700 font-medium">Hors ligne</div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  Vu il y a {fmtDuration(presence.offline_seconds)}
                </div>
                <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                  {fmtDateTime(presence.last_seen_at)}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">Jamais connecté</div>
            )}
          </div>
        </div>

        {/* Onboarding */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Detail label="Pays" value={profile.country?.toUpperCase() ?? "—"} />
          <Detail
            label="Niveau d'expérience"
            value={profile.experience_level ?? "—"}
          />
          <Detail
            label="Horizon d'investissement"
            value={profile.investment_horizon ?? "—"}
          />
          <Detail
            label="Secteur professionnel"
            value={profile.professional_sector ?? "—"}
          />
          <Detail label="Inscrit le" value={fmtDateTime(profile.created_at)} />
          <Detail
            label="Onboarding terminé"
            value={profile.onboarded_at ? fmtDateTime(profile.onboarded_at) : "Non"}
          />
          <Detail
            label="Dernière maj profil"
            value={fmtDateTime(profile.updated_at)}
          />
          <Detail
            label="Centres d'intérêt"
            value={
              profile.interests && profile.interests.length > 0
                ? profile.interests.join(", ")
                : "—"
            }
          />
        </div>
      </section>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Conversations" value={fmtNumber(messagerie.conversations_count)} />
        <StatCard label="Messages envoyés" value={fmtNumber(messagerie.messages_sent)} />
        <StatCard label="Messages reçus" value={fmtNumber(messagerie.messages_received)} />
        <StatCard label="Transactions sim." value={fmtNumber(totalTx)} />
      </div>

      {/* Sanctions */}
      <SanctionsPanel
        userId={profile.id}
        isMe={isMe}
        targetIsAdmin={targetIsAdmin}
        myLevel={level}
        sanctions={sanctions}
      />

      {/* Présence détaillée */}
      {presence && (
        <section className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Présence</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Detail
              label="Statut"
              value={presence.is_online ? "🟢 En ligne" : "Hors ligne"}
            />
            <Detail label="Dernier ping" value={fmtDateTime(presence.last_seen_at)} />
            <Detail
              label="Session démarrée"
              value={fmtDateTime(presence.session_start_at)}
            />
            <Detail label="Navigateur" value={shortAgent(presence.user_agent)} />
          </div>
        </section>
      )}

      {/* Portefeuilles simulateur */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-900">
            Portefeuilles simulateur ({portfolios.length})
          </h2>
        </div>
        {portfolios.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">
            Pas de participation à une saison.
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-2 pl-4 pr-2">Saison</th>
                <th className="text-left font-medium py-2 px-2">Statut</th>
                <th className="text-right font-medium py-2 px-2">Cash</th>
                <th className="text-right font-medium py-2 px-2">Capital initial</th>
                <th className="text-right font-medium py-2 px-2">Transactions</th>
                <th className="text-left font-medium py-2 pr-4 pl-2">Inscrit</th>
              </tr>
            </thead>
            <tbody>
              {portfolios.map((p) => (
                <tr key={p.portfolio_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pl-4 pr-2 font-medium text-slate-900">
                    {p.season_name}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        p.season_status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.season_status === "upcoming"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {p.season_status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-900 font-medium">
                    {fmtFCFA(p.cash)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {fmtFCFA(p.initial_capital)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    <span className="text-emerald-700">{p.buy_count}A</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-rose-700">{p.sell_count}V</span>
                    <span className="text-slate-400 ml-1">({p.transactions_count})</span>
                  </td>
                  <td className="py-2 pr-4 pl-2 text-slate-500 tabular-nums">
                    {fmtDateTime(p.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Audit log */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-900">
            10 dernières actions admin sur ce membre
          </h2>
        </div>
        {audit.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">
            Aucune action enregistrée.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="text-[10px] text-slate-400 w-32 shrink-0 tabular-nums">
                  {fmtDateTime(a.created_at)}
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-mono font-semibold text-slate-700">
                    {a.action}
                  </span>
                  {a.actor_role && (
                    <span className="text-slate-400"> · par {a.actor_role}</span>
                  )}
                  {a.reason && (
                    <span className="text-slate-500 italic"> — « {a.reason} »</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className="text-sm text-slate-900 mt-0.5 break-words">{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">
        {value}
      </div>
    </div>
  );
}
