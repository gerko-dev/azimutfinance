import type { LeaderboardEntry } from "@/lib/simulator/types";
import { fmtFCFA, fmtPct } from "./format";

export default function Leaderboard({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">
          Classement général ({entries.length})
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Trié par valeur totale du portefeuille (cash + valeur titres au dernier cours).
        </p>
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-slate-400 text-center px-3 py-6">
          Aucun joueur pour cette saison.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
          {entries.map((e) => {
            const isMe = e.userId === currentUserId;
            const display = e.username || e.fullName || `Joueur ${e.userId.slice(0, 6)}`;
            const medal =
              e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : null;
            return (
              <div
                key={e.userId}
                className={`flex items-center gap-3 px-4 py-2.5 ${
                  isMe ? "bg-blue-50/60 border-l-2 border-blue-600" : ""
                }`}
              >
                <div className="w-8 text-center">
                  {medal ? (
                    <span className="text-lg">{medal}</span>
                  ) : (
                    <span className="text-sm font-semibold text-slate-500 tabular-nums">
                      #{e.rank}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {display}
                    {isMe && (
                      <span className="ml-2 text-[10px] text-blue-700 font-semibold uppercase">
                        moi
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {e.txCount} transaction{e.txCount > 1 ? "s" : ""} · cash {fmtFCFA(e.cash)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {fmtFCFA(e.totalValue)}
                  </div>
                  <div
                    className={`text-[10px] tabular-nums font-semibold ${
                      e.totalReturn >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {fmtPct(e.totalReturn, 1)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
