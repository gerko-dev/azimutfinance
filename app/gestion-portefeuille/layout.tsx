import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import FundManagementSidebar from "@/components/gestion-portefeuille/FundManagementSidebar";

// === Gestion de portefeuille — coque pleine page ===
//
// Module de gestion pour societe de gestion, migre depuis l'ancienne route
// /pros/fund-management (Pro Terminal).
// Route de PREMIER NIVEAU et coque autonome, deliberement : ni la barre laterale
// de /admin, ni celle du Pro Terminal. Un gerant travaille sur la largeur de son
// ecran.
//
// THEME CLAIR. Le module s'affichait sombre par l'enveloppe `.pro-tool`, un
// inverseur de theme qui repeignait des composants ecrits en classes claires.
// L'enveloppe est retiree. Ce qui ne suffisait pas : plusieurs panneaux, ecrits
// apres la migration, codaient le sombre EN DUR et seraient devenus illisibles —
// ils ont ete convertis en meme temps. Le module suit desormais le meme parti
// que le reste du portail : page slate-50, cartes blanches, texte slate-900.
//
// PORTEE — la garde `requireAdmin(1)` est ici : elle couvre donc toute page
// ajoutee sous cette route, sans risque d'en oublier une. Les actions serveur
// ont la leur, car une action serveur est un point d'entree HTTP que le layout
// ne protege pas.

export const metadata = {
  title: "Gestion de portefeuille — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function GestionPortefeuilleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { level } = await requireAdmin(1, "/gestion-portefeuille");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Barre de titre du module : son identite, et rien de la navigation du
          site. La page doit se lire comme un poste de travail. */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/gestion-portefeuille"
              className="font-semibold tracking-tight text-slate-900"
            >
              Gestion de portefeuille
            </Link>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Société de gestion · marché BRVM / UEMOA
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              Accès niveau {level}
            </span>
            <Link href="/admin" className="text-slate-500 hover:text-slate-900 transition">
              Administration
            </Link>
            <Link href="/" className="text-slate-500 hover:text-slate-900 transition">
              Portail
            </Link>
          </div>
        </div>
      </header>

      {/* Menu a gauche, donnee a droite. Pas de largeur maximale : les tableaux
          de positions, le journal et l'attribution de performance prennent tout
          ce qu'on leur laisse, et c'est le menu repliable qui sert de reglage. */}
      <div className="flex items-stretch min-h-[calc(100vh-53px)]">
        <FundManagementSidebar />
        <main className="flex-1 min-w-0 px-4 md:px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
