"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWatchlistAction } from "@/lib/simulator/actions";

type Props = {
  code: string;
  initialWatched: boolean;
  size?: "sm" | "md";
};

/**
 * Bouton étoile pour ajouter/retirer un titre de la watchlist. Optimiste :
 * met à jour l'UI immédiatement, rollback si la RPC échoue.
 */
export default function WatchlistStar({
  code,
  initialWatched,
  size = "md",
}: Props) {
  const router = useRouter();
  const [watched, setWatched] = useState(initialWatched);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    const prev = watched;
    setWatched(!prev);
    startTransition(async () => {
      const res = await toggleWatchlistAction(code);
      if (!res.ok) {
        setWatched(prev); // rollback
        setError(res.error);
      } else {
        // Sync avec la valeur serveur (en cas de race)
        setWatched(res.data.added);
        router.refresh();
      }
    });
  }

  const cls = size === "sm" ? "text-base" : "text-lg";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={`${cls} leading-none transition disabled:opacity-50 ${
        watched ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-500"
      }`}
      title={
        error
          ? error
          : watched
          ? "Retirer de la watchlist"
          : "Ajouter à la watchlist"
      }
      aria-label={watched ? "Retirer de la watchlist" : "Ajouter à la watchlist"}
    >
      {watched ? "★" : "☆"}
    </button>
  );
}
