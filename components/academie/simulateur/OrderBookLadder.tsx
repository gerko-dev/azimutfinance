"use client";

import type { OrderBookSnapshot, OrderSide } from "@/lib/simulator/types";

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

type Props = {
  book: OrderBookSnapshot;
  lastPrice: number | null;
  onPickPrice: (price: number, side: OrderSide) => void;
};

/**
 * Ladder à la TradingView/Saxo : ASKS triés ASC en haut (rouge), BIDS triés
 * DESC en bas (vert), séparateur "mid" au milieu. Barres horizontales
 * proportionnelles à la taille agrégée par niveau. Click → pré-remplit le
 * formulaire d'ordre (opposite side : clic sur ASK = je BUY ; clic sur BID = je SELL).
 */
export default function OrderBookLadder({ book, lastPrice, onPickPrice }: Props) {
  const maxUnits = Math.max(
    0,
    ...book.bids.map((b) => b.units),
    ...book.asks.map((a) => a.units),
    1,
  );

  // ASKS du plus bas au plus haut, mais on affiche du haut (cher) vers le bas (proche du mid)
  const asksDisplayed = [...book.asks].sort((a, b) => b.price - a.price);
  const bidsDisplayed = [...book.bids].sort((a, b) => b.price - a.price);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden font-mono text-[11px]">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight font-sans">
          Ladder simulateur
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-sans">
          {book.bestBid !== null && (
            <span className="text-emerald-700">
              Bid <span className="font-bold">{fmtNum(book.bestBid)}</span>
            </span>
          )}
          {book.bestAsk !== null && (
            <span className="text-rose-700">
              Ask <span className="font-bold">{fmtNum(book.bestAsk)}</span>
            </span>
          )}
          {book.spread !== null && (
            <span className="text-slate-500">
              Spread <span className="font-bold">{fmtNum(book.spread)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[50px_70px_1fr_70px_50px] gap-0 bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-semibold text-slate-500 px-2 py-1 font-sans">
        <div className="text-right">Bid#</div>
        <div className="text-right">Bid qté</div>
        <div className="text-center">Prix</div>
        <div className="text-left">Ask qté</div>
        <div className="text-left">Ask#</div>
      </div>

      {/* ASKS — haut (chers) vers bas (proches mid). Cliquables → BUY */}
      <div>
        {asksDisplayed.length === 0 ? (
          <div className="text-center py-3 text-slate-400">Aucune offre de vente</div>
        ) : (
          asksDisplayed.map((a) => (
            <button
              key={`ask-${a.price}`}
              type="button"
              onClick={() => onPickPrice(a.price, "BUY")}
              className="w-full grid grid-cols-[50px_70px_1fr_70px_50px] gap-0 relative hover:bg-rose-50/60 transition text-left"
              title="Cliquer pour acheter à ce prix"
            >
              <div className="text-right text-slate-400 px-2 py-1 relative">—</div>
              <div className="text-right text-slate-400 px-2 py-1 relative">—</div>
              <div className="text-center tabular-nums text-rose-800 font-bold px-2 py-1 relative">
                {fmtNum(a.price)}
              </div>
              <div className="text-left tabular-nums text-slate-700 px-2 py-1 relative">
                {/* Barre de volume vers la droite */}
                <div
                  className="absolute inset-y-0 left-0 bg-rose-100"
                  style={{ width: `${(a.units / maxUnits) * 100}%` }}
                />
                <span className="relative">{fmtNum(a.units)}</span>
              </div>
              <div className="text-left text-slate-500 px-2 py-1 relative">
                {a.orders}
              </div>
            </button>
          ))
        )}
      </div>

      {/* SEPARATOR mid */}
      <div className="grid grid-cols-[50px_70px_1fr_70px_50px] gap-0 bg-amber-50 border-y border-amber-200 px-2 py-1 font-sans">
        <div />
        <div />
        <div className="text-center text-[10px] uppercase font-semibold text-amber-800">
          {lastPrice !== null ? (
            <span className="tabular-nums">Réf {fmtNum(lastPrice)}</span>
          ) : (
            "—"
          )}
        </div>
        <div />
        <div />
      </div>

      {/* BIDS — haut (proches mid) vers bas (loin). Cliquables → SELL */}
      <div>
        {bidsDisplayed.length === 0 ? (
          <div className="text-center py-3 text-slate-400">Aucune offre d&apos;achat</div>
        ) : (
          bidsDisplayed.map((b) => (
            <button
              key={`bid-${b.price}`}
              type="button"
              onClick={() => onPickPrice(b.price, "SELL")}
              className="w-full grid grid-cols-[50px_70px_1fr_70px_50px] gap-0 relative hover:bg-emerald-50/60 transition text-left"
              title="Cliquer pour vendre à ce prix"
            >
              <div className="text-right text-slate-500 px-2 py-1 relative">
                {b.orders}
              </div>
              <div className="text-right tabular-nums text-slate-700 px-2 py-1 relative">
                {/* Barre de volume vers la gauche */}
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-100"
                  style={{ width: `${(b.units / maxUnits) * 100}%` }}
                />
                <span className="relative">{fmtNum(b.units)}</span>
              </div>
              <div className="text-center tabular-nums text-emerald-800 font-bold px-2 py-1 relative">
                {fmtNum(b.price)}
              </div>
              <div className="text-left text-slate-400 px-2 py-1 relative">—</div>
              <div className="text-left text-slate-400 px-2 py-1 relative">—</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
