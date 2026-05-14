import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import WatchlistStar from "@/components/academie/simulateur/WatchlistStar";
import PriceHistoryChart from "@/components/academie/simulateur/PriceHistoryChart";
import TradesTape from "@/components/academie/simulateur/TradesTape";
import { loadPriceHistory } from "@/lib/dataLoader";
import { getLatestPrice } from "@/lib/simulator/pricing";
import { getMyWatchlist, getRecentTrades } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return { title: `${code.toUpperCase()} — Ligue Azimut` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  const stock = getLatestPrice(code);
  if (!stock) notFound();

  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const history = loadPriceHistory(code).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const prev = history.length > 1 ? history[history.length - 2].value : null;
  const changeAbs = prev !== null ? stock.price - prev : null;
  const changePct =
    prev !== null && prev > 0 ? ((stock.price - prev) / prev) * 100 : null;

  const [watchedCodes, trades] = await Promise.all([
    getMyWatchlist(),
    getRecentTrades(ctx.season.id, code, 30),
  ]);
  const watched = watchedCodes.includes(code);
  const position = ctx.snapshot.positions.find((p) => p.code === code);

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
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-start gap-3">
            <WatchlistStar code={code} initialWatched={watched} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                {stock.sector || "Autres"}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-0.5 font-mono">
                {code}
              </h1>
              <p className="text-sm text-slate-600">{stock.name}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900 tabular-nums">
                {fmtFCFA(stock.price)}{" "}
                <span className="text-sm font-normal text-slate-500">FCFA</span>
              </div>
              {changePct !== null && changeAbs !== null && (
                <div
                  className={`text-sm tabular-nums font-semibold ${
                    changePct >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {changePct >= 0 ? "+" : ""}
                  {fmtFCFA(Math.round(changeAbs))} (
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2).replace(".", ",")} %)
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-0.5">
                au {stock.date}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            <Link
              href={`/academie/simulateur/carnet?code=${code}`}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded transition"
            >
              Passer un ordre →
            </Link>
            <Link
              href={`/titre/${code}`}
              className="text-xs border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium px-3 py-1.5 rounded transition"
            >
              Fiche détaillée
            </Link>
          </div>
        </div>

        {/* Grille 2 colonnes : chart + position / trades */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-4 min-w-0">
            <PriceHistoryChart history={history} />
          </div>

          <div className="space-y-4">
            {/* Ma position */}
            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Ma position</h3>
              </div>
              <div className="p-3 text-xs">
                {position ? (
                  <div className="space-y-1.5">
                    <Row label="Unités" value={position.units.toLocaleString("fr-FR")} />
                    <Row label="PRU" value={`${fmtFCFA(Math.round(position.avgCost))} FCFA`} />
                    <Row
                      label="Valorisation"
                      value={`${fmtFCFA(Math.round(position.marketValue))} FCFA`}
                      bold
                    />
                    <Row
                      label="P&L latent"
                      value={`${position.unrealizedPL >= 0 ? "+" : ""}${fmtFCFA(
                        Math.round(position.unrealizedPL),
                      )} FCFA`}
                      accent={
                        position.unrealizedPL >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }
                    />
                    <Row
                      label="Perf"
                      value={`${position.unrealizedPLPct >= 0 ? "+" : ""}${position.unrealizedPLPct
                        .toFixed(2)
                        .replace(".", ",")} %`}
                      accent={
                        position.unrealizedPLPct >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }
                      bold
                    />
                  </div>
                ) : (
                  <div className="text-center text-slate-500 py-4">
                    Tu ne détiens pas ce titre.
                  </div>
                )}
              </div>
            </section>

            {/* Tape */}
            <div className="h-[320px]">
              <TradesTape trades={trades} />
            </div>
          </div>
        </div>
      </div>
    </SimulatorShell>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase text-slate-500">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-bold" : ""} ${
          accent ?? "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
