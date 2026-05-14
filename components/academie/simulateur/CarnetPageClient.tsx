"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CarnetOrderForm from "./CarnetOrderForm";
import DepthChart from "./DepthChart";
import IntradayCandlesChart from "./IntradayCandlesChart";
import OrderBookLadder from "./OrderBookLadder";
import TradesTape from "./TradesTape";
import type { Candle, TradeTick } from "@/lib/simulator/queries";
import type {
  OrderBookSnapshot,
  OrderSide,
  Position,
} from "@/lib/simulator/types";

type StockOption = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string;
};

type Props = {
  seasonId: string;
  cash: number;
  positions: Position[];
  feePct: number;
  stocks: StockOption[];
  selectedCode: string;
  book: OrderBookSnapshot;
  trades: TradeTick[];
  candles: Candle[];
  bucketMinutes: number;
  refPrice: number | null;
};

export default function CarnetPageClient({
  seasonId,
  cash,
  positions,
  feePct,
  stocks,
  selectedCode,
  book,
  trades,
  candles,
  bucketMinutes,
  refPrice,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [preset, setPreset] = useState<{
    code: string;
    price: number;
    side: OrderSide;
  } | null>(null);

  // Auto-refresh du carnet toutes les 8s pour suivre l'évolution
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(id);
  }, [router]);

  const selectedStock = useMemo(
    () => stocks.find((s) => s.code === selectedCode) ?? null,
    [stocks, selectedCode],
  );

  function navigateTo(code: string, bucket?: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("code", code);
    if (bucket) params.set("tf", String(bucket));
    setPreset(null);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Cours BRVM scrappé (CSV) — c'est la SEULE source du cours d'un titre.
  const brvmPrice = selectedStock?.price ?? refPrice ?? null;
  // Dernier prix d'exécution simulateur (trades joueur ↔ joueur). Ne représente
  // pas le cours du titre — sert seulement à indiquer la valorisation du
  // dernier croisement dans le carnet.
  const lastSimTrade = trades[0]?.price ?? null;

  return (
    <div className="space-y-4">
      {/* Header : titre + sélecteur + KPIs */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Carnet d&apos;ordres
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h1 className="text-xl font-mono font-bold text-slate-900">
                {selectedCode || "—"}
              </h1>
              {selectedStock && (
                <span className="text-sm text-slate-600 truncate">
                  {selectedStock.name}
                </span>
              )}
            </div>
            {selectedStock && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                {selectedStock.sector} · dernier cours BRVM connu{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {selectedStock.price.toLocaleString("fr-FR")} FCFA
                </span>{" "}
                <span className="text-slate-400">({selectedStock.date})</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCode}
              onChange={(e) => navigateTo(e.target.value)}
              className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white min-w-[200px]"
            >
              {positions.length > 0 && (
                <optgroup label="Mes positions">
                  {positions.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} · {p.units.toLocaleString("fr-FR")} u.
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Tous les titres BRVM">
                {stocks.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* KPIs market */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-xs">
          <Kpi
            label="Cours BRVM"
            value={brvmPrice !== null ? brvmPrice.toLocaleString("fr-FR") : "—"}
            color="slate"
            hint="dernier scrape"
          />
          <Kpi
            label="Best Bid simu"
            value={book.bestBid !== null ? book.bestBid.toLocaleString("fr-FR") : "—"}
            color="emerald"
          />
          <Kpi
            label="Best Ask simu"
            value={book.bestAsk !== null ? book.bestAsk.toLocaleString("fr-FR") : "—"}
            color="rose"
          />
          <Kpi
            label="Spread simu"
            value={
              book.spread !== null ? book.spread.toLocaleString("fr-FR") : "—"
            }
          />
          <Kpi
            label="Dernier trade simu"
            value={
              lastSimTrade !== null ? lastSimTrade.toLocaleString("fr-FR") : "—"
            }
            hint={`${trades.length} trade${trades.length !== 1 ? "s" : ""}`}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IntradayCandlesChart
          candles={candles}
          bucketMinutes={bucketMinutes}
          onBucketChange={(b) => navigateTo(selectedCode, b)}
        />
        <DepthChart book={book} />
      </div>

      {/* Main row : ladder | tape | form */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_340px] gap-4">
        <OrderBookLadder
          book={book}
          lastPrice={lastSimTrade ?? brvmPrice}
          onPickPrice={(price, side) =>
            setPreset({ code: selectedCode, price, side })
          }
        />
        <TradesTape trades={trades} />
        <CarnetOrderForm
          key={
            preset
              ? `${preset.code}-${preset.price}-${preset.side}`
              : `default-${selectedCode}`
          }
          seasonId={seasonId}
          cash={cash}
          positions={positions}
          feePct={feePct}
          stocks={stocks}
          preset={preset ?? { code: selectedCode, price: 0, side: "BUY" }}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  color = "slate",
  hint,
}: {
  label: string;
  value: string;
  color?: "emerald" | "rose" | "slate";
  hint?: string;
}) {
  const cls =
    color === "emerald"
      ? "text-emerald-700"
      : color === "rose"
      ? "text-rose-700"
      : "text-slate-900";
  return (
    <div className="bg-slate-50 rounded border border-slate-200 px-2 py-1.5">
      <div className="text-[9px] uppercase font-semibold text-slate-500">
        {label}
      </div>
      <div className={`tabular-nums font-bold ${cls}`}>{value}</div>
      {hint && <div className="text-[9px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}
