import Link from "next/link";
import { redirect } from "next/navigation";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import WatchlistStar from "@/components/academie/simulateur/WatchlistStar";
import { getLatestPrices } from "@/lib/simulator/pricing";
import { getMyWatchlist } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";
import { loadPriceHistory } from "@/lib/dataLoader";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watchlist — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const [watchlistCodes, allPrices] = await Promise.all([
    getMyWatchlist(),
    Promise.resolve(getLatestPrices()),
  ]);
  const priceByCode = new Map(allPrices.map((s) => [s.code, s]));

  const rows = watchlistCodes
    .map((code) => {
      const p = priceByCode.get(code);
      if (!p) return null;
      const history = loadPriceHistory(code).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const prev = history.length > 1 ? history[history.length - 2].value : null;
      const changePct =
        prev !== null && prev > 0 ? ((p.price - prev) / prev) * 100 : null;
      const position = ctx.snapshot.positions.find((pos) => pos.code === code);
      return { ...p, changePct, position };
    })
    .filter(Boolean) as Array<{
      code: string;
      name: string;
      sector: string;
      price: number;
      date: string;
      changePct: number | null;
      position: (typeof ctx.snapshot.positions)[number] | undefined;
    }>;

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
            Watchlist
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            {rows.length} titre{rows.length > 1 ? "s" : ""} suivi{rows.length > 1 ? "s" : ""}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Tes favoris pour garder l&apos;œil dessus avant de passer un ordre.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-500">
            Ta watchlist est vide. Clique sur l&apos;étoile{" "}
            <span className="text-amber-500 text-base">☆</span> sur la page{" "}
            <Link
              href="/academie/simulateur/marche"
              className="text-amber-700 hover:underline font-medium"
            >
              Marché
            </Link>{" "}
            pour ajouter des titres.
          </div>
        ) : (
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 bg-slate-50">
                  <th className="text-left font-semibold px-3 py-2 w-8"></th>
                  <th className="text-left font-semibold px-3 py-2">Code</th>
                  <th className="text-left font-semibold px-3 py-2">Nom</th>
                  <th className="text-right font-semibold px-3 py-2">Cours</th>
                  <th className="text-right font-semibold px-3 py-2">Variation</th>
                  <th className="text-right font-semibold px-3 py-2">Ma position</th>
                  <th className="text-right font-semibold px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <WatchlistStar code={r.code} initialWatched={true} size="sm" />
                    </td>
                    <td className="px-3 py-1.5 font-mono font-semibold text-slate-900">
                      <Link
                        href={`/academie/simulateur/titre/${r.code}`}
                        className="hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-slate-700 truncate max-w-[280px]">
                      {r.name}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">
                      {fmtFCFA(r.price)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.changePct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            r.changePct >= 0 ? "text-emerald-700" : "text-rose-700"
                          }
                        >
                          {r.changePct >= 0 ? "+" : ""}
                          {r.changePct.toFixed(2).replace(".", ",")} %
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                      {r.position ? (
                        <>
                          {r.position.units.toLocaleString("fr-FR")} u.
                          <span
                            className={`ml-1 text-[10px] ${
                              r.position.unrealizedPL >= 0
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            ({r.position.unrealizedPL >= 0 ? "+" : ""}
                            {fmtFCFA(Math.round(r.position.unrealizedPL))})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right space-x-2">
                      <Link
                        href={`/academie/simulateur/titre/${r.code}`}
                        className="text-[11px] text-slate-600 hover:underline"
                      >
                        Détail
                      </Link>
                      <Link
                        href={`/academie/simulateur/carnet?code=${r.code}`}
                        className="text-[11px] text-amber-700 hover:underline font-medium"
                      >
                        Carnet
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </SimulatorShell>
  );
}
