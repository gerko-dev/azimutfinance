"use client";

import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import {
  SECURITY_TYPE_LABELS,
  type AccountSnapshot,
  type SecurityType,
} from "@/lib/comptetitre/types";
import { fmtFCFA } from "./format";

const TYPE_COLORS: Record<SecurityType | "cash", string> = {
  cash: "#94a3b8",
  stock: "#1d4ed8",
  bond: "#b45309",
  fcp: "#7c3aed",
  other: "#475569",
};

const SECTOR_PALETTE = [
  "#1d4ed8",
  "#059669",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0d9488",
  "#475569",
  "#dc2626",
  "#0891b2",
  "#a16207",
];

export default function AllocationCard({
  snapshot,
}: {
  snapshot: AccountSnapshot;
}) {
  const byType = snapshot.allocationByType.map((a) => ({
    name:
      a.type === "cash"
        ? "Cash"
        : SECURITY_TYPE_LABELS[a.type as SecurityType],
    value: a.value,
    pct: a.pct,
    color: TYPE_COLORS[a.type] ?? "#475569",
  }));

  const bySector = snapshot.allocationBySector.map((s, i) => ({
    name: s.sector,
    value: s.value,
    pct: s.pct,
    color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">
        Allocation
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Donut title="Par classe d'actif" data={byType} />
        <Donut
          title="Par secteur (actions)"
          data={bySector}
          empty="Pas de positions actions"
        />
      </div>
    </div>
  );
}

type Slice = { name: string; value: number; pct: number; color: string };

function Donut({
  title,
  data,
  empty,
}: {
  title: string;
  data: Slice[];
  empty?: string;
}) {
  if (data.length === 0) {
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
          {title}
        </div>
        <div className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded">
          {empty ?? "Aucune donnée"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
        {title}
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1">
        {data.map((d) => (
          <li
            key={d.name}
            className="flex items-center justify-between text-[11px] text-slate-700"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: d.color }}
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="tabular-nums text-slate-600">
              {d.pct.toFixed(1).replace(".", ",")} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TipPayload = { active?: boolean; payload?: Array<{ payload: Slice }> };

function CustomTip(props: TipPayload) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const p = props.payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm px-2 py-1.5 text-[11px]">
      <div className="font-semibold text-slate-900">{p.name}</div>
      <div className="tabular-nums text-slate-700">
        {fmtFCFA(p.value)} FCFA · {p.pct.toFixed(1).replace(".", ",")} %
      </div>
    </div>
  );
}
