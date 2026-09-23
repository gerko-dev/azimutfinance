import ImportationPanel from "@/components/gestion-portefeuille/ImportationPanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { loadFundPortfolios } from "../portfolio-data";
import { loadNavHistory } from "../nav-data";
import { indexerCoursSite } from "../cours-data";

export const metadata = {
  title: "Importation — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Point d'entrée des DONNÉES DU FONDS : inventaires et historique de VL.
 *
 * Ces deux imports vivaient sur la fiche de chaque fonds, à deux onglets
 * distants l'un de l'autre. Or c'est le même geste, fait le même jour, pour
 * tous les portefeuilles à la fois : le gérant reçoit ses états, il les charge.
 * Les rassembler sous un seul module suit ce geste plutôt que l'arborescence.
 *
 * Le fonds est un SÉLECTEUR, pas un contexte de page — et il vit dans l'URL,
 * ce qui rend la vue partageable et rechargeable.
 */
export default async function ImportationPage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  // À défaut de choix, le premier fonds : un écran d'import vide n'apprend
  // rien, et il y a toujours un portefeuille à charger.
  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;

  const [inventaires, vl, cours] = choisi
    ? await Promise.all([
        loadFundPortfolios(choisi.id),
        loadNavHistory(choisi.id),
        // Les cours du site : la même source que /marches/actions.
        indexerCoursSite(),
      ])
    : [[], [], new Map()];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Importation</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Les inventaires et l&apos;historique de valeur liquidative, fonds par fonds.
            C&apos;est d&apos;ici que partent tous les calculs du module.
          </p>
        </div>
        {options.length > 0 && (
          <SelecteurFonds
            fonds={options}
            valeur={choisi?.id ?? ""}
            /* Pas de vue consolidée : on importe POUR un fonds, jamais pour
               tous à la fois — un inventaire appartient à un portefeuille. */
            valeurGlobale={choisi?.id ?? ""}
            libelleGlobal={choisi?.nom ?? "—"}
          />
        )}
      </div>

      {choisi ? (
        <ImportationPanel
          fondsId={choisi.id}
          fondsNom={choisi.nom}
          inventaires={inventaires}
          vl={vl}
          cours={cours}
        />
      ) : (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
          Aucun fonds enregistré. Crée-le dans Paramètres › Fonds gérés.
        </p>
      )}
    </div>
  );
}
