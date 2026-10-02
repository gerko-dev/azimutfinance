import Link from "next/link";

import VueEnsemblePanel from "@/components/gestion-portefeuille/VueEnsemblePanel";

import { chargerVueEnsemble } from "./vue-ensemble-data";

// === Vue d'ensemble du module ===
//
// Elle affichait quatre tirets et deux encarts vides, écrits en gris sombre
// sur une coque devenue claire — donc illisibles par-dessus le marché. Le
// gérant qui ouvre son poste de travail veut savoir une chose avant toutes les
// autres : où en sont ses fonds par rapport à ce à quoi ils se comparent.
//
// TOUT EST CALCULE ICI, AU RENDU. Aucun état, aucun bouton : la page est une
// restitution. Ce qu'elle montre vient des mêmes sources que les écrans de
// détail — l'historique de VL pour la performance, le benchmark composite du
// fonds pour la référence, les inventaires pour l'attribution — et elle ne
// recalcule rien à sa façon.

export const metadata = {
  title: "Fund management — Vue d'ensemble",
};

export default async function FundManagementOverviewPage() {
  const vue = await chargerVueEnsemble();

  if (vue.lignes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-6 py-12 text-center">
        <h1 className="text-sm font-semibold text-slate-900">Aucun fonds géré</h1>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
          La vue d&apos;ensemble compare chaque fonds à son benchmark. Déclare un premier
          fonds dans les paramètres, puis importe son historique de valeur liquidative.
        </p>
        <Link
          href="/gestion-portefeuille/parametres"
          className="inline-block mt-4 px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 rounded hover:bg-blue-50"
        >
          Paramètres des fonds
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vue d&apos;ensemble</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {vue.lignes.length} fonds · performances arrêtées au dernier cours publié
          </p>
        </div>
      </div>

      <VueEnsemblePanel vue={vue} />
    </div>
  );
}
