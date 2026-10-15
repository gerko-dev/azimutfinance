import OutilsPanel from "@/components/gestion-portefeuille/OutilsPanel";

import { loadMyFunds } from "../data";

export const metadata = {
  title: "Outils — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * LES OUTILS : ce qui se calcule sans rien enregistrer.
 *
 * Les autres modules suivent le cycle de gestion — on importe, on décide, on
 * exécute, on contrôle —, et chacun écrit quelque chose. Ici, rien n'est
 * persisté : on pose des conditions, on lit un résultat, on décide ailleurs.
 *
 * C'est pourquoi ils ne vivent pas sous un fonds : un outil travaille sur le
 * portefeuille entier de la maison, et le fonds n'y est qu'un filtre.
 */
export default async function OutilsPage() {
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Outils</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Des calculs sur ce que tu détiens. Rien ne s&apos;y enregistre : on pose
          des conditions, on lit un résultat.
        </p>
      </div>

      {options.length > 0 ? (
        <OutilsPanel fonds={options} />
      ) : (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
          Aucun fonds enregistré. Crée-le dans Paramètres › Fonds gérés.
        </p>
      )}
    </div>
  );
}
