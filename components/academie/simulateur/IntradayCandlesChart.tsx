"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { Candle } from "@/lib/simulator/queries";

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

type Props = {
  candles: Candle[];
  bucketMinutes: number;
  onBucketChange?: (b: number) => void;
};

// Recharts ne supporte pas nativement le candlestick, mais on peut dessiner
// chaque chandelle via une "shape" custom sur une Bar.
//
// Astuce : on rend 2 séries Bar superposées :
//   - "wickSeries"  : ligne H/L (mèche, fine)
//   - "bodySeries"  : rectangle O/C (corps de la bougie)
// Chacune a sa propre shape qui calcule sa géométrie depuis o/h/l/c.

type CandleShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Candle;
  yAxis?: {
    scale: (v: number) => number;
  };
};

function CandleBody(props: CandleShapeProps) {
  const { x = 0, width = 0, payload, yAxis } = props;
  if (!payload || !yAxis) return null;
  const isUp = payload.c >= payload.o;
  const color = isUp ? "#059669" : "#dc2626";
  const yOpen = yAxis.scale(payload.o);
  const yClose = yAxis.scale(payload.c);
  const top = Math.min(yOpen, yClose);
  const h = Math.max(1, Math.abs(yClose - yOpen));
  const bodyWidth = Math.max(2, width * 0.7);
  const bodyX = x + (width - bodyWidth) / 2;
  return <rect x={bodyX} y={top} width={bodyWidth} height={h} fill={color} />;
}

function CandleWick(props: CandleShapeProps) {
  const { x = 0, width = 0, payload, yAxis } = props;
  if (!payload || !yAxis) return null;
  const isUp = payload.c >= payload.o;
  const color = isUp ? "#059669" : "#dc2626";
  const yHigh = yAxis.scale(payload.h);
  const yLow = yAxis.scale(payload.l);
  const cx = x + width / 2;
  return (
    <line
      x1={cx}
      x2={cx}
      y1={yHigh}
      y2={yLow}
      stroke={color}
      strokeWidth={1}
    />
  );
}

export default function IntradayCandlesChart({
  candles,
  bucketMinutes,
  onBucketChange,
}: Props) {
  const [hovered, setHovered] = useState<Candle | null>(null);

  const yMin = useMemo(() => {
    if (candles.length === 0) return 0;
    const m = Math.min(...candles.map((c) => c.l));
    return Math.floor(m * 0.995);
  }, [candles]);
  const yMax = useMemo(() => {
    if (candles.length === 0) return 1;
    const m = Math.max(...candles.map((c) => c.h));
    return Math.ceil(m * 1.005);
  }, [candles]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Trades simulateur</h3>
          <p className="text-[9px] text-slate-500">
            Croisements joueur ↔ joueur · ne reflète pas le cours BRVM
          </p>
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded p-0.5">
          {[5, 15, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onBucketChange?.(m)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition ${
                bucketMinutes === m
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {m === 60 ? "1h" : `${m}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Bar de stats hover */}
      {hovered ? (
        <div className="px-3 py-1 border-b border-slate-100 bg-slate-50 text-[10px] flex items-center gap-3 font-mono">
          <span className="text-slate-500">
            {new Date(hovered.t).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span>
            O <strong className="text-slate-900">{fmtNum(hovered.o)}</strong>
          </span>
          <span>
            H <strong className="text-emerald-700">{fmtNum(hovered.h)}</strong>
          </span>
          <span>
            L <strong className="text-rose-700">{fmtNum(hovered.l)}</strong>
          </span>
          <span>
            C <strong className="text-slate-900">{fmtNum(hovered.c)}</strong>
          </span>
          <span className="text-slate-500">
            V <strong className="text-slate-700">{fmtNum(hovered.v)}</strong>
          </span>
        </div>
      ) : (
        <div className="px-3 py-1 border-b border-slate-100 bg-slate-50 text-[10px] text-slate-400">
          Passe le curseur sur une chandelle…
        </div>
      )}

      <div className="h-48">
        {candles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            Pas encore de transaction pour construire le chandelier.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={candles}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              barCategoryGap={2}
              onMouseMove={(e) => {
                const p = (e as unknown as { activePayload?: Array<{ payload: Candle }> })
                  .activePayload;
                if (p && p[0]) setHovered(p[0].payload);
              }}
              onMouseLeave={() => setHovered(null)}
            >
              <XAxis
                dataKey="t"
                tick={{ fontSize: 9 }}
                stroke="#94a3b8"
                tickFormatter={(v) =>
                  new Date(v).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9 }}
                stroke="#94a3b8"
                tickFormatter={(v) => fmtNum(v)}
                width={50}
              />
              <Tooltip
                content={() => null}
                cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
              />
              {/* Wick d'abord (en dessous), puis body */}
              <Bar dataKey="h" shape={(p: object) => <CandleWick {...(p as CandleShapeProps)} />} fill="transparent" />
              <Bar dataKey="c" shape={(p: object) => <CandleBody {...(p as CandleShapeProps)} />} fill="transparent" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
