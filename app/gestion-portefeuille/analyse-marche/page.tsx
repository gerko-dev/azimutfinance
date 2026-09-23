import AnticipationPanel from "@/components/gestion-portefeuille/AnticipationPanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireAnticipations } from "../anticipation-data";

export const metadata = {
  title: "Analyse de marché — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Analyse du MARCHÉ, pas d'un portefeuille.
 *
 * Les anticipations de cours portent sur toute la cote : elles valorisent
 * chaque action de la BRVM par cinq méthodes, que le fonds la détienne ou non.
 * Les loger sous la fiche d'un fonds laissait croire l'inverse, et obligeait à
 * choisir un portefeuille pour consulter une vue de place.
 *
 * Le fonds ne sert donc qu'à ANNOTER : il dit ce qui est détenu, et combien.
 * C'est une lecture de plus sur le même tableau, pas un filtre.
 */
export default async function AnalyseMarchePage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;
  const tableau = choisi
    ? await construireAnticipations(choisi.id, choisi.objectifPerf)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Analyse de marché</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Les cours anticipés de toute la cote, par cinq méthodes de valorisation. Le
            fonds choisi sert de repère : il indique ce qui est détenu, et à quel poids.
          </p>
        </div>
        {options.length > 0 && (
          <SelecteurFonds
            fonds={options}
            valeur={choisi?.id ?? ""}
            /* Le tableau couvre le marché entier quel que soit le fonds : il
               n'y a pas de « consolidé » à proposer, seulement un repère. */
            valeurGlobale={choisi?.id ?? ""}
            libelleGlobal={choisi?.nom ?? "—"}
          />
        )}
      </div>

      {tableau ? (
        <AnticipationPanel tableau={tableau} />
      ) : (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
          Aucun fonds enregistré : les anticipations ont besoin d&apos;un portefeuille de
          référence pour situer les positions détenues.
        </p>
      )}
    </div>
  );
}
