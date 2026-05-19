"use client"; // Les error boundaries doivent être des Client Components

import { useEffect } from "react";
// Ce fichier remplace le root layout quand il est actif : il doit donc
// définir ses propres balises <html>/<body> et importer les styles globaux.
import "./globals.css";

/**
 * Error boundary de dernier recours : capture les erreurs survenues dans le
 * root layout lui-même (app/layout.tsx), que app/error.tsx ne peut pas
 * intercepter. Volontairement autonome — aucun composant du site n'est
 * importé ici, car leur rendu pourrait être la cause de l'erreur.
 */
export default function GlobalError({
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
    <html lang="fr">
      <head>
        {/* global-error remplace le root layout : la metadata definie dans
            app/layout.tsx n'est PAS heritee ici. Sans <title> explicite,
            le navigateur et Google fallback sur le titre par defaut, ce
            qui peut faire apparaitre l'ancien titre Next.js dans les
            crawls. On le pose donc explicitement. */}
        <title>Erreur — AzimutFinance</title>
        <meta name="robots" content="noindex" />
      </head>
      <body className="min-h-screen flex items-center justify-center bg-white">
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">
            Erreur critique
          </p>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">
            Le site a rencontré un problème
          </h1>
          <p className="mt-4 text-slate-600">
            Une erreur inattendue empêche l&apos;affichage de la page. Veuillez
            réessayer dans un instant.
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
            {/* Lien <a> volontaire : un rechargement complet réinitialise
                l'application, plus sûr ici qu'une navigation client. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Retour à l&apos;accueil
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
