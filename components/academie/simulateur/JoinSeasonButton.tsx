"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinSeason } from "@/lib/simulator/actions";

export default function JoinSeasonButton({
  seasonId,
  initialCapital,
}: {
  seasonId: string;
  initialCapital: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinSeason(seasonId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleJoin}
        disabled={isPending}
        className="w-full text-base bg-slate-900 hover:bg-slate-700 text-white font-medium py-3 rounded transition disabled:opacity-50"
      >
        {isPending ? "Inscription en cours…" : `Rejoindre la saison · ${formatFCFA(initialCapital)} FCFA virtuels`}
      </button>
      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

function formatFCFA(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} M`;
  if (Math.abs(v) >= 1_000) return Math.round(v).toLocaleString("fr-FR");
  return Math.round(v).toLocaleString("fr-FR");
}
