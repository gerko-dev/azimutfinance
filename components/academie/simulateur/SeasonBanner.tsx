import type { Season } from "@/lib/simulator/types";
import { daysBetween, fmtDateFr, fmtFCFA } from "./format";

export default function SeasonBanner({
  season,
  myRank,
  totalPlayers,
}: {
  season: Season;
  myRank?: number | null;
  totalPlayers?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const daysToEnd = daysBetween(today, season.ends_at);
  const daysSinceStart = daysBetween(season.starts_at, today);
  const totalDays = daysBetween(season.starts_at, season.ends_at);
  const progress = totalDays > 0 ? Math.min(100, Math.max(0, (daysSinceStart / totalDays) * 100)) : 0;

  const statusLabel =
    season.status === "active"
      ? daysToEnd > 0
        ? `Saison en cours · clôture dans ${daysToEnd} j`
        : "Dernier jour de la saison"
      : season.status === "upcoming"
      ? `Saison à venir · démarre le ${fmtDateFr(season.starts_at)}`
      : "Saison terminée";

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            {statusLabel}
          </div>
          <h2 className="text-xl md:text-2xl font-bold mt-1">{season.name}</h2>
          <div className="text-[11px] text-slate-300 mt-1">
            Du {fmtDateFr(season.starts_at)} au {fmtDateFr(season.ends_at)} · capital initial{" "}
            <span className="font-semibold text-white">{fmtFCFA(season.initial_capital)} FCFA</span>{" "}
            · frais {(season.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} % par
            transaction
          </div>
        </div>
        {myRank !== undefined && myRank !== null && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Mon classement
            </div>
            <div className="text-2xl md:text-3xl font-bold tabular-nums mt-1">
              #{myRank}
              {totalPlayers !== undefined && (
                <span className="text-base text-slate-400 font-normal"> / {totalPlayers}</span>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="h-1.5 bg-white/10 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-blue-400 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1.5 tabular-nums">
        <span>Jour {Math.max(0, daysSinceStart)}</span>
        <span>{Math.round(progress)} % de la saison</span>
        <span>Jour {totalDays}</span>
      </div>
    </div>
  );
}
