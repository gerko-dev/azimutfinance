import Link from "next/link";
import { redirect } from "next/navigation";
import PositionsTable from "@/components/academie/simulateur/PositionsTable";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import { getLatestPrices } from "@/lib/simulator/pricing";
import { loadShellContext } from "@/lib/simulator/shellContext";

export const dynamic = "force-dynamic";
export const metadata = { title: "Positions — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const allPrices = getLatestPrices();
  const stockNames: Record<string, string> = {};
  for (const s of allPrices) stockNames[s.code] = s.name;

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
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Positions
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              {ctx.snapshot.positions.length} ligne(s)
            </h1>
          </div>
          <Link
            href="/academie/simulateur/carnet"
            className="text-sm text-amber-700 hover:underline font-medium"
          >
            Passer un ordre →
          </Link>
        </div>

        {ctx.snapshot.positions.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-500">
            Vous n&apos;avez aucune position ouverte. Direction le{" "}
            <Link
              href="/academie/simulateur/carnet"
              className="text-amber-700 hover:underline font-medium"
            >
              carnet d&apos;ordres
            </Link>{" "}
            pour commencer à trader.
          </div>
        ) : (
          <PositionsTable
            positions={ctx.snapshot.positions}
            stockNames={stockNames}
          />
        )}
      </div>
    </SimulatorShell>
  );
}
