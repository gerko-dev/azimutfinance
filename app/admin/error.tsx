"use client"; // Les error boundaries doivent être des Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary du segment /admin. Rendu à l'intérieur du layout admin
 * (Header + bandeau + sidebar restent visibles), il remplace uniquement
 * le contenu de <main>.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">
        Erreur
      </p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        Impossible d&apos;afficher cette section
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Une erreur est survenue dans la console d&apos;administration. Cela peut
        venir d&apos;un problème de droits ou de chargement des données.
      </p>

      {error.digest && (
        <p className="mt-3 text-xs text-slate-400">
          Référence : <span className="font-mono">{error.digest}</span>
        </p>
      )}

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => unstable_retry()}
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
        >
          Réessayer
        </button>
        <Link
          href="/admin"
          className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
        >
          Tableau de bord admin
        </Link>
      </div>
    </div>
  );
}
