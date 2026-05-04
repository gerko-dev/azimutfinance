"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteActualite } from "@/lib/actualites/actions";

export default function DeleteActualiteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function execute() {
    setError(null);
    start(async () => {
      const res = await deleteActualite(id);
      if (res.ok) {
        router.push("/admin/actualites");
        router.refresh();
      } else {
        setError(res.error);
        setConfirm(false);
      }
    });
  }

  return (
    <>
      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-2">
          {error}
        </div>
      )}
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="text-sm text-rose-700 hover:underline"
        >
          Supprimer cette actualité
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700">Confirmer ?</span>
          <button
            onClick={execute}
            disabled={pending}
            className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded disabled:opacity-50"
          >
            {pending ? "..." : "Supprimer"}
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            Annuler
          </button>
        </div>
      )}
    </>
  );
}
