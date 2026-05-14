import { redirect } from "next/navigation";
import Leaderboard from "@/components/academie/simulateur/Leaderboard";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import { getLeaderboard } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classement — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const leaderboard = await getLeaderboard(ctx.season.id);

  return (
    <SimulatorShell
      season={ctx.season}
      cash={ctx.snapshot.cash}
      marketValue={ctx.snapshot.marketValue}
      totalValue={ctx.snapshot.totalValue}
      initialCapital={ctx.snapshot.initialCapital}
      myRank={ctx.myRank}
      totalPlayers={ctx.totalPlayers}
      openOrdersCount={ctx.openOrdersCount}
      realizedPL={ctx.snapshot.realizedPL}
      unrealizedPL={ctx.snapshot.unrealizedPL}
    >
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Classement
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            {leaderboard.length} joueurs · Saison {ctx.season.name}
          </h1>
        </div>
        <Leaderboard entries={leaderboard} currentUserId={ctx.userId} />
      </div>
    </SimulatorShell>
  );
}
