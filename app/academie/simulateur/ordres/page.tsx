import Link from "next/link";
import { redirect } from "next/navigation";
import MyOrdersTable from "@/components/academie/simulateur/MyOrdersTable";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import { getMyOrders } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes ordres — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const orders = await getMyOrders(ctx.season.id);

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
              Mes ordres
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              {orders.open.length} ouvert(s) · {orders.history.length} historique
            </h1>
          </div>
          <Link
            href="/academie/simulateur/carnet"
            className="text-sm text-amber-700 hover:underline font-medium"
          >
            Passer un nouvel ordre →
          </Link>
        </div>
        <MyOrdersTable openOrders={orders.open} history={orders.history} />
      </div>
    </SimulatorShell>
  );
}
