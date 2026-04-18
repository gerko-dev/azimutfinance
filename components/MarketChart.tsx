"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { intradayData } from "@/lib/mockData";

export default function MarketChart() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="text-base font-medium">BRVM Composite — séance du jour</h3>
        <span className="text-xs text-slate-400">Mis à jour 14:32 GMT</span>
      </div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-3xl font-semibold">298,45</span>
        <span className="text-sm text-green-600 font-medium">+3,65 (+1,24%)</span>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={intradayData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} domain={["dataMin - 1", "dataMax + 0.5"]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 mt-3 text-xs">
        <button className="px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">1J</button>
        <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">5J</button>
        <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">1M</button>
        <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">6M</button>
        <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">1A</button>
        <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Max</button>
      </div>
    </div>
  );
}