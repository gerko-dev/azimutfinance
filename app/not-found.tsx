import Link from "next/link";
import Header from "@/components/Header";

export const metadata = {
  title: "Page introuvable — AzimutFinance",
  description: "La page demandée n'existe pas ou n'est plus disponible.",
};

/**
 * 404 racine : affiché par `notFound()` dans un segment de route ET pour
 * toute URL ne correspondant à aucune route de l'application.
 */
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Erreur 404
        </p>
        <h1 className="mt-3 text-2xl md:text-3xl font-semibold text-slate-900">
          Page introuvable
        </h1>
        <p className="mt-4 text-slate-600">
          La page que vous cherchez n&apos;existe pas, a été déplacée ou
          n&apos;est plus disponible.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/marches/actions"
            className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Actions BRVM
          </Link>
          <Link
            href="/academie/glossaire"
            className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Glossaire financier
          </Link>
        </div>
      </main>
    </>
  );
}
