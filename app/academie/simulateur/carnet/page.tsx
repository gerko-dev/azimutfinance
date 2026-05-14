import { redirect } from "next/navigation";
import CarnetPageClient from "@/components/academie/simulateur/CarnetPageClient";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import { getLatestPrices } from "@/lib/simulator/pricing";
import {
  getIntradayCandles,
  getOrderBook,
  getRecentTrades,
} from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carnet d'ordres — Ligue Azimut" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; tf?: string }>;
}) {
  const sp = await searchParams;
  const result = await loadShellContext();
  if (!result.ok) {
    redirect("/academie/simulateur");
  }
  const { ctx } = result;

  const stocks = getLatestPrices().sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const selectedCode =
    sp.code ??
    ctx.snapshot.positions[0]?.code ??
    stocks[0]?.code ??
    "";
  const bucketMinutes = Number(sp.tf) || 15;

  const [book, trades, candles] = await Promise.all([
    selectedCode
      ? getOrderBook(ctx.season.id, selectedCode, 25)
      : Promise.resolve({
          code: "",
          bids: [],
          asks: [],
          bestBid: null,
          bestAsk: null,
          spread: null,
        }),
    selectedCode ? getRecentTrades(ctx.season.id, selectedCode, 50) : Promise.resolve([]),
    selectedCode
      ? getIntradayCandles(ctx.season.id, selectedCode, bucketMinutes, 60)
      : Promise.resolve([]),
  ]);
  const refPrice =
    stocks.find((s) => s.code === selectedCode)?.price ?? null;

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
      <div className="p-4 md:p-6">
        <CarnetPageClient
          seasonId={ctx.season.id}
          cash={ctx.snapshot.cash}
          positions={ctx.snapshot.positions}
          feePct={ctx.season.transaction_fee_pct}
          stocks={stocks}
          selectedCode={selectedCode}
          book={book}
          trades={trades}
          candles={candles}
          bucketMinutes={bucketMinutes}
          refPrice={refPrice}
        />
      </div>
    </SimulatorShell>
  );
}
