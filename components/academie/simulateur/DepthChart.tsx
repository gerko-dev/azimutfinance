"use client";

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OrderBookSnapshot } from "@/lib/simulator/types";

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

/**
 * Depth chart cumulé : sur l'axe X le prix, sur Y la quantité cumulée
 * disponible à ce prix (côté bid: tout ce qui a un prix >= ; côté ask :
 * tout ce qui a un prix <=). Affiché en step area sur 2 séries.
 */
export default function DepthChart({ book }: { book: OrderBookSnapshot }) {
  const data = useMemo(() => {
    const bidsAsc = [...book.bids].sort((a, b) => a.price - b.price);
    const asksAsc = [...book.asks].sort((a, b) => a.price - b.price);

    // Cumul bid de droite à gauche (somme des bids à prix >= chaque point).
    // On part de la fin (best bid) avec un total cumulé qui s'additionne.
    const bidsDesc = [...bidsAsc].reverse();
    const cumBids = bidsDesc.reduce<
      Array<{ price: number; bidVol: number; askVol: number | null }>
    >((acc, b) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].bidVol : 0;
      acc.push({ price: b.price, bidVol: prev + b.units, askVol: null });
      return acc;
    }, []);
    const bidPoints = [...cumBids].reverse();

    // Cumul ask de gauche à droite.
    const askPoints = asksAsc.reduce<
      Array<{ price: number; bidVol: number | null; askVol: number }>
    >((acc, a) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].askVol : 0;
      acc.push({ price: a.price, bidVol: null, askVol: prev + a.units });
      return acc;
    }, []);

    return [...bidPoints, ...askPoints];
  }, [book]);

  const allEmpty = book.bids.length === 0 && book.asks.length === 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-bold text-slate-900">
          Profondeur du carnet simulateur
        </h3>
        <p className="text-[9px] text-slate-500">
          Ordres en attente des joueurs · indépendant du cours BRVM
        </p>
      </div>
      <div className="h-48">
        {allEmpty ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            Pas de liquidité dans le carnet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <XAxis
                dataKey="price"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => fmtNum(v)}
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
              />
              <YAxis
                tickFormatter={(v) => fmtNum(v)}
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                width={50}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  background: "rgba(255,255,255,0.95)",
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                }}
                labelFormatter={(v) => `Prix ${fmtNum(Number(v))}`}
                formatter={(value, name) => [
                  fmtNum(Number(value)),
                  name === "bidVol" ? "Cumul bids" : "Cumul asks",
                ]}
              />
              <Area
                type="stepAfter"
                dataKey="bidVol"
                stroke="#059669"
                fill="#10b981"
                fillOpacity={0.25}
                strokeWidth={1.5}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="stepBefore"
                dataKey="askVol"
                stroke="#dc2626"
                fill="#ef4444"
                fillOpacity={0.25}
                strokeWidth={1.5}
                isAnimationActive={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
