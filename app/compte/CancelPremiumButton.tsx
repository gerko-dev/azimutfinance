"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyPremiumAction } from "./actions";

export default function CancelPremiumButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmAndCancel() {
    setError(null);
    const ok = confirm(
      "Annuler ton abonnement Premium ?\n\nTon accès sera coupé immédiatement et tu redeviendras membre standard. Cette action est irréversible — il faudra resouscrire pour retrouver l'accès Premium.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelMyPremiumAction();
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={confirmAndCancel}
        disabled={pending}
        className="text-[11px] text-slate-500 hover:text-rose-700 underline underline-offset-2 disabled:opacity-50"
      >
        {pending ? "Annulation…" : "Annuler mon abonnement"}
      </button>
      {error && (
        <div className="text-[11px] text-rose-700 mt-1.5">{error}</div>
      )}
    </div>
  );
}
