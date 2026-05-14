import { redirect } from "next/navigation";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import TransactionsLog from "@/components/academie/simulateur/TransactionsLog";
import { getTransactions } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const transactions = await getTransactions(ctx.snapshot.portfolio.id);

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
            Journal
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            {transactions.length} transaction(s)
          </h1>
        </div>
        <TransactionsLog transactions={transactions} />
      </div>
    </SimulatorShell>
  );
}
