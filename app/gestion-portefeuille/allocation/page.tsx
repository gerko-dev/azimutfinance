import AllocationMultifonds from "@/components/gestion-portefeuille/AllocationMultifonds";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireTableauAllocation } from "../allocation-data";
import { construirePlanOperations } from "../operations-data";
import { construireProposition } from "../proposition-data";

export const metadata = {
  title: "Allocation — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Le CYCLE DE DÉCISION d'allocation, pour tous les fonds.
 *
 * Trois écrans qui se lisent ensemble et dans cet ordre :
 *
 *   ALLOCATION VALIDÉE       ce qui a été arrêté, et l'écart au réel
 *   PROPOSITION D'ALLOCATION ce que le modèle suggère
 *   OPÉRATIONS À RÉALISER    ce qu'il faut passer pour y parvenir
 *
 * Le comité les parcourt fonds après fonds, dans la même séance. Les loger
 * sous la fiche de chaque fonds imposait de ressortir de l'écran entre deux
 * portefeuilles, et de refaire trois clics pour retrouver son onglet.
 *
 * Le fonds devient donc un sélecteur, dans l'URL : la vue est partageable, et
 * l'onglet survit au changement de portefeuille.
 */
export default async function AllocationPage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;

  // TOUT DE FRONT : les trois calculs lisent le même inventaire, mémoïsé par
  // requête, et aucun n'attend le résultat des autres.
  const [allocation, operations, proposition] = choisi
    ? await Promise.all([
        construireTableauAllocation(choisi.id, "classe"),
        construirePlanOperations(choisi.id),
        construireProposition(choisi.id, {}, { ratios: choisi.ratios }),
      ])
    : [null, null, null];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Allocation</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ce qui a été arrêté, ce que le modèle propose, et les ordres qui mènent de
            l&apos;un à l&apos;autre.
          </p>
        </div>
        {options.length > 0 && (
          <SelecteurFonds
            fonds={options}
            valeur={choisi?.id ?? ""}
            /* Une allocation s'arrête PAR FONDS : il n'y a pas de consolidé à
               proposer, chaque portefeuille a ses cibles et ses contraintes. */
            valeurGlobale={choisi?.id ?? ""}
            libelleGlobal={choisi?.nom ?? "—"}
          />
        )}
      </div>

      {choisi ? (
        <AllocationMultifonds
          fondsId={choisi.id}
          allocation={allocation}
          proposition={proposition}
          operations={operations}
        />
      ) : (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
          Aucun fonds enregistré. Crée-le dans Paramètres › Fonds gérés.
        </p>
      )}
    </div>
  );
}
