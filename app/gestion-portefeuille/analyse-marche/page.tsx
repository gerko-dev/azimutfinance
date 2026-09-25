import Link from "next/link";

import AnticipationPanel from "@/components/gestion-portefeuille/AnticipationPanel";
import MarcheMonetairePanel from "@/components/gestion-portefeuille/MarcheMonetairePanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireAnticipations } from "../anticipation-data";
import { chargerAdjudications } from "../marche-monetaire-data";

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
 *
 * DEUX MARCHÉS, DEUX ONGLETS. Les actions cotées et les adjudications
 * souveraines ne se lisent pas ensemble : l'une se regarde titre par titre,
 * l'autre pays par pays et maturité par maturité. L'onglet est choisi dans
 * l'URL plutôt que dans un état client, pour que le serveur ne calcule que la
 * vue demandée — les anticipations valorisent toute la cote, ce n'est pas un
 * travail à faire pour rien.
 */

type Onglet = "actions" | "monetaire";

const ONGLETS: { cle: Onglet; libelle: string; aide: string }[] = [
  {
    cle: "actions",
    libelle: "Anticipations de cours",
    aide: "Toute la cote BRVM valorisée par cinq méthodes.",
  },
  {
    cle: "monetaire",
    libelle: "Marché monétaire",
    aide: "Adjudications UMOA-Titres : montants, taux, couverture, absorption.",
  },
];

export default async function AnalyseMarchePage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string; onglet?: string }>;
}) {
  const { fonds: choix, onglet: demande } = await searchParams;
  const onglet: Onglet = demande === "monetaire" ? "monetaire" : "actions";

  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));
  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;

  const tableau =
    onglet === "actions" && choisi
      ? await construireAnticipations(choisi.id, choisi.objectifPerf)
      : null;
  const adjudications = onglet === "monetaire" ? chargerAdjudications() : null;

  const lien = (cle: Onglet) => {
    const p = new URLSearchParams();
    if (choix) p.set("fonds", choix);
    if (cle !== "actions") p.set("onglet", cle);
    const q = p.toString();
    return q ? `/gestion-portefeuille/analyse-marche?${q}` : "/gestion-portefeuille/analyse-marche";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Analyse de marché</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {onglet === "actions"
              ? "Les cours anticipés de toute la cote, par cinq méthodes de valorisation. Le fonds choisi sert de repère : il indique ce qui est détenu, et à quel poids."
              : "Le marché primaire souverain de l'UMOA : ce que les États ont sollicité, ce que le marché a offert, ce qui a été retenu et à quel prix."}
          </p>
        </div>
        {onglet === "actions" && options.length > 0 && (
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

      <div className="flex gap-1 border-b border-slate-200">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={lien(o.cle)}
            title={o.aide}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
              onglet === o.cle
                ? "border-blue-700 text-blue-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.libelle}
          </Link>
        ))}
      </div>

      {onglet === "monetaire" ? (
        <MarcheMonetairePanel lignes={adjudications ?? []} />
      ) : tableau ? (
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
