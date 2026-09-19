import Link from "next/link";
import { redirect } from "next/navigation";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import MarketBrowser, {
  type MarketRow,
} from "@/components/academie/simulateur/MarketBrowser";
import { getLatestPrices } from "@/lib/simulator/pricing";
import { getMarketMovers, getMyWatchlist } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";
import { loadPriceHistory } from "@/lib/dataLoader";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marché — Ligue Azimut" };

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const [movers, watchedCodes] = await Promise.all([
    getMarketMovers(ctx.season.id, 5),
    getMyWatchlist(),
  ]);

  const rows: MarketRow[] = getLatestPrices().map((s) => {
    const h = loadPriceHistory(s.code).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const prev = h.length > 1 ? h[h.length - 2].value : null;
    const changePct =
      prev !== null && prev > 0 ? ((s.price - prev) / prev) * 100 : null;
    return {
      code: s.code,
      name: s.name,
      sector: s.sector || "Autres",
      price: s.price,
      date: s.date,
      changePct,
    };
  });

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
            Marché BRVM
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            {rows.length} titres cotés
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Filtre par secteur, recherche, et clique sur une ligne pour ouvrir
            le détail ou le carnet d&apos;ordres.
          </p>
        </div>

        {/* Top movers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MoverCard
            title="↑ Plus fortes hausses"
            tone="green"
            rows={movers.gainers}
            valueLabel="Var."
            formatValue={(r) =>
              r.changePct === null
                ? "—"
                : `${r.changePct >= 0 ? "+" : ""}${r.changePct
                    .toFixed(2)
                    .replace(".", ",")} %`
            }
          />
          <MoverCard
            title="↓ Plus fortes baisses"
            tone="red"
            rows={movers.losers}
            valueLabel="Var."
            formatValue={(r) =>
              r.changePct === null
                ? "—"
                : `${r.changePct >= 0 ? "+" : ""}${r.changePct
                    .toFixed(2)
                    .replace(".", ",")} %`
            }
          />
          <MoverCard
            title="⇄ Plus gros volumes (saison)"
            tone="amber"
            rows={movers.topVolume}
            valueLabel="Vol."
            formatValue={(r) => `${fmtFCFA(r.volume)} u.`}
          />
        </div>

        <MarketBrowser rows={rows} watchedCodes={watchedCodes} />
      </div>
    </SimulatorShell>
  );
}

type CardRow = {
  code: string;
  name: string;
  changePct: number | null;
  volume: number;
};

function MoverCard({
  title,
  tone,
  rows,
  valueLabel,
  formatValue,
}: {
  title: string;
  tone: "green" | "red" | "amber";
  rows: CardRow[];
  valueLabel: string;
  formatValue: (r: CardRow) => string;
}) {
  const toneCls =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
      ? "text-rose-700"
      : "text-amber-700";
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className={`px-3 py-1.5 border-b border-slate-200 text-[11px] uppercase tracking-wider font-bold ${toneCls}`}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="p-3 text-xs text-slate-400 text-center">Aucune donnée</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li
              key={r.code}
              className="px-3 py-1.5 flex items-center justify-between hover:bg-slate-50"
            >
              <Link
                href={`/academie/simulateur/titre/${r.code}`}
                className="flex-1 min-w-0 flex items-baseline gap-2 hover:underline"
              >
                <span className="font-mono font-semibold text-slate-900">
                  {r.code}
                </span>
                <span className="text-[11px] text-slate-500 truncate">
                  {r.name}
                </span>
              </Link>
              <span
                className={`text-[12px] tabular-nums font-semibold ml-2 ${
                  valueLabel === "Var." && r.changePct !== null
                    ? r.changePct >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                    : "text-slate-700"
                }`}
              >
                {formatValue(r)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
