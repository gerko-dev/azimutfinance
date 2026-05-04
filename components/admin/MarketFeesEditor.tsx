"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateMarketFee } from "@/lib/comptetitre/actions";
import type { MarketFee } from "@/lib/comptetitre/types";

export default function MarketFeesEditor({ fees }: { fees: MarketFee[] }) {
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
      {fees.map((f) => (
        <FeeRow
          key={f.code}
          fee={f}
          onSave={(p) => {
            setFeedback(null);
            startTransition(async () => {
              const res = await adminUpdateMarketFee(
                f.code,
                p.feePct,
                p.minAmount,
                p.description,
              );
              if (res.ok) {
                setFeedback({
                  ok: true,
                  msg: `${f.code} mis à jour.`,
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
    </div>
  );
}

function FeeRow({
  fee,
  onSave,
  isPending,
}: {
  fee: MarketFee;
  onSave: (p: { feePct: number; minAmount: number; description: string }) => void;
  isPending: boolean;
}) {
  const [feePct, setFeePct] = useState((fee.feePct * 100).toString());
  const [minAmount, setMinAmount] = useState(fee.minAmount.toString());
  const [description, setDescription] = useState(fee.description);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="text-base font-semibold text-slate-900">
            {fee.code} — {fee.label}
          </div>
          <div className="text-[11px] text-slate-400">
            Dernière mise à jour : {fee.updatedAt.slice(0, 19).replace("T", " ")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Taux (%)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            max="50"
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
          <div className="text-[10px] text-slate-400 mt-0.5">
            Ex : 0,85 % = 0,0085 du montant brut
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Minimum (FCFA)
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() =>
              onSave({
                feePct: (parseFloat(feePct) || 0) / 100,
                minAmount: parseFloat(minAmount) || 0,
                description,
              })
            }
            disabled={isPending}
            className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50 w-full"
          >
            {isPending ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>
    </div>
  );
}
