"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateTpsRate } from "@/lib/comptetitre/actions";
import {
  UEMOA_COUNTRY_LABELS,
  type TpsRate,
  type UemoaCountryCode,
} from "@/lib/comptetitre/types";

export default function TpsRatesEditor({ rates }: { rates: TpsRate[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Pays UEMOA</th>
              <th className="text-right font-medium py-2 px-2 w-32">Taux TPS (%)</th>
              <th className="text-left font-medium py-2 px-2">Description</th>
              <th className="text-left font-medium py-2 px-2 w-44">Mise à jour</th>
              <th className="text-right font-medium py-2 pr-4 pl-2 w-28">Action</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <Row
                key={r.country}
                rate={r}
                onSave={(p) => {
                  setFeedback(null);
                  startTransition(async () => {
                    const res = await adminUpdateTpsRate(
                      r.country,
                      p.rate,
                      p.description,
                    );
                    if (res.ok) {
                      setFeedback({
                        ok: true,
                        msg: `TPS ${UEMOA_COUNTRY_LABELS[r.country]} mise à jour.`,
                      });
                      router.refresh();
                    } else {
                      setFeedback({ ok: false, msg: res.error });
                    }
                  });
                }}
                isPending={isPending}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  rate,
  onSave,
  isPending,
}: {
  rate: TpsRate;
  onSave: (p: { rate: number; description: string }) => void;
  isPending: boolean;
}) {
  const [pct, setPct] = useState((rate.rate * 100).toString());
  const [description, setDescription] = useState(rate.description);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="py-2 pl-4 pr-2 font-semibold text-slate-900">
        <div className="flex items-center gap-2">
          <CountryFlag country={rate.country} />
          {UEMOA_COUNTRY_LABELS[rate.country]}
        </div>
      </td>
      <td className="py-2 px-2 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          max="50"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="w-24 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums text-right"
        />
      </td>
      <td className="py-2 px-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"
        />
      </td>
      <td className="py-2 px-2 text-[11px] text-slate-500 tabular-nums">
        {rate.updatedAt.slice(0, 16).replace("T", " ")}
      </td>
      <td className="py-2 pr-4 pl-2 text-right">
        <button
          type="button"
          onClick={() =>
            onSave({
              rate: (parseFloat(pct) || 0) / 100,
              description,
            })
          }
          disabled={isPending}
          className="text-xs bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded disabled:opacity-50"
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function CountryFlag({ country }: { country: UemoaCountryCode }) {
  const colors: Record<UemoaCountryCode, string> = {
    ci: "#FF8200",
    sn: "#00853F",
    bj: "#FCD116",
    bf: "#EF2B2D",
    ml: "#14B53A",
    ne: "#FF6F00",
    tg: "#006A4E",
    gw: "#CE1126",
  };
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-slate-200 shrink-0"
      style={{ background: colors[country] }}
    />
  );
}
