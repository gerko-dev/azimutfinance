import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import FundManagementNav from "@/components/gestion-portefeuille/FundManagementNav";

// === Gestion de portefeuille — coque pleine page ===
//
// Module de gestion pour societe de gestion, migre depuis l'ancienne route
// /pros/fund-management (Pro Terminal).
// Route de PREMIER NIVEAU et coque autonome, deliberement : ni la barre laterale
// de /admin, ni celle du Pro Terminal. Un gerant travaille sur la largeur de son
// ecran.
//
// THEME SOMBRE ET `.pro-tool` — les composants du module sont ecrits en classes
// Tailwind CLAIRES (bg-white, border-slate-200) et ne s'affichaient sombres que
// parce que leur ancien layout les enveloppait dans `.pro-tool`, l'inverseur de
// theme defini dans app/globals.css:94. On garde l'enveloppe et un fond sombre :
// sans elle, 5 000 lignes de composants changeraient d'apparence. Le jour ou le
// module doit passer en clair, c'est cette classe qu'on retire — pas les
// composants qu'on reecrit.
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
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Barre de titre du module : son identite, et rien de la navigation du
          site. La page doit se lire comme un poste de travail. */}
      <header className="border-b border-slate-800 bg-slate-950/60">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/gestion-portefeuille"
              className="font-semibold tracking-tight text-white"
            >
              Gestion de portefeuille
            </Link>
            <span className="text-xs text-slate-400">
              Société de gestion · marché BRVM / UEMOA
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
              Accès niveau {level}
            </span>
            <Link
              href="/admin"
              className="text-slate-400 hover:text-white transition"
            >
              Administration
            </Link>
            <Link href="/" className="text-slate-400 hover:text-white transition">
              Portail
            </Link>
          </div>
        </div>
      </header>

      {/* Pleine largeur : les tableaux de positions, le journal et les panneaux
          de performance ont besoin de place. */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-2">
        <FundManagementNav />
        <div className="pro-tool">{children}</div>
      </div>
    </div>
  );
}
