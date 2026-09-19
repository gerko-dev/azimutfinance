"use client"; // Les error boundaries doivent être des Client Components

import { useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";

/**
 * Error boundary racine : capture toute exception non gérée survenue
 * pendant le rendu d'une page ou d'un layout enfant. Ne couvre PAS le
 * root layout lui-même (voir app/global-error.tsx).
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // En production le message est masqué ; le digest permet de retrouver
    // l'erreur correspondante dans les logs serveur.
    console.error(error);
  }, [error]);

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">
          Erreur
        </p>
        <h1 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">
          Une erreur inattendue s&apos;est produite
        </h1>
        <p className="mt-4 text-slate-600">
          Quelque chose s&apos;est mal passé lors du chargement de cette page.
          Vous pouvez réessayer ou revenir à l&apos;accueil.
        </p>

        {error.digest && (
          <p className="mt-4 text-xs text-slate-400">
            Référence : <span className="font-mono">{error.digest}</span>
          </p>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => unstable_retry()}
            className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    </>
  );
}
