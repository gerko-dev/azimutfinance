"use client";

import Link from "next/link";
import { DEFAULT_PERIOD, PERIOD_OPTIONS, type PeriodId } from "./macroPeriod";

export default function MacroPeriodSelector({
  selected,
  basePath,
  preserveParams,
}: {
  selected: PeriodId;
  basePath: string;
  preserveParams: Record<string, string | undefined>;
}) {
  function buildHref(periodId: PeriodId): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preserveParams)) {
      if (k !== "period" && v) params.set(k, v);
    }
    if (periodId !== DEFAULT_PERIOD) params.set("period", periodId);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="text-slate-500 mr-1">Période :</span>
      {PERIOD_OPTIONS.map((p) => {
        const active = p.id === selected;
        return (
          <Link
            key={p.id}
            href={buildHref(p.id)}
            scroll={false}
            className={`px-2 py-1 rounded transition tabular-nums ${
              active
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
