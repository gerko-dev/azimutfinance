import Link from "next/link";

import AnalyseActionsPanel from "@/components/gestion-portefeuille/AnalyseActionsPanel";
import AnalyseFcpPanel from "@/components/gestion-portefeuille/AnalyseFcpPanel";
import AnalyseObligationsPanel from "@/components/gestion-portefeuille/AnalyseObligationsPanel";
import AnticipationPanel from "@/components/gestion-portefeuille/AnticipationPanel";
import MarcheMonetairePanel from "@/components/gestion-portefeuille/MarcheMonetairePanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireAnticipations } from "../anticipation-data";
import { chargerActions } from "../analyse-actions-data";
import { chargerFcp } from "../analyse-fcp-data";
import { chargerObligations } from "../analyse-obligations-data";
import { chargerAdjudications } from "../marche-monetaire-data";

export const metadata = {
  title: "Analyse de marché — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Analyse du MARCHÉ, pas d'un portefeuille.
 *
 * Un onglet par compartiment, parce qu'ils ne se lisent pas ensemble : les
 * actions se rangent par secteur, les obligations par maturité, les
 * adjudications par pays et par tranche, les OPCVM par maison. Vouloir les
 * réunir dans un seul écran donnerait un tableau dont aucune colonne ne
 * vaudrait pour tout le monde.
 *
 * L'ONGLET EST DANS L'URL, et non dans un état client, pour que le serveur ne
 * calcule QUE la vue demandée. Chacune coûte : les anticipations valorisent
 * toute la cote par cinq méthodes, le compartiment actions rejoue 144 000
 * points de cours, l'obligataire reconstruit deux cents échéanciers. Les
 * calculer toutes pour n'en montrer qu'une serait quatre fois le travail pour
 * le même écran.
 *
 * Le fonds choisi ne sert qu'aux anticipations, où il ANNOTE : il dit ce qui
 * est détenu, et à quel poids. Les trois autres onglets décrivent la place
 * entière, sans référence à un portefeuille.
 */

type Onglet = "actions" | "obligations" | "monetaire" | "fcp" | "anticipations";

const ONGLETS: { cle: Onglet; libelle: string; aide: string }[] = [
  {
    cle: "actions",
    libelle: "Actions BRVM",
    aide: "Capitalisation, liquidité, valorisation et performance du compartiment actions.",
  },
  {
    cle: "obligations",
    libelle: "Obligations BRVM",
    aide: "Encours, rendements, duration et échéancier du compartiment obligataire.",
  },
  {
    cle: "monetaire",
    libelle: "Marché monétaire",
    aide: "Adjudications UMOA-Titres : montants, taux, couverture, absorption.",
  },
  {
    cle: "fcp",
    libelle: "FCP",
    aide: "Le marché des OPCVM de l'UMOA : encours, parts de marché, performances.",
  },
  {
    cle: "anticipations",
    libelle: "Anticipations de cours",
    aide: "Toute la cote BRVM valorisée par cinq méthodes.",
  },
];

const DEFAUT: Onglet = "actions";

export default async function AnalyseMarchePage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string; onglet?: string }>;
}) {
  const { fonds: choix, onglet: demande } = await searchParams;
  const onglet: Onglet =
    ONGLETS.find((o) => o.cle === demande)?.cle ?? DEFAUT;

  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));
  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;

  const tableau =
    onglet === "anticipations" && choisi
      ? await construireAnticipations(choisi.id, choisi.objectifPerf)
      : null;

  const lien = (cle: Onglet) => {
    const p = new URLSearchParams();
    if (choix) p.set("fonds", choix);
    if (cle !== DEFAUT) p.set("onglet", cle);
    const q = p.toString();
    return q ? `/gestion-portefeuille/analyse-marche?${q}` : "/gestion-portefeuille/analyse-marche";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Analyse de marché</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {ONGLETS.find((o) => o.cle === onglet)?.aide}
          </p>
        </div>
        {onglet === "anticipations" && options.length > 0 && (
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

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
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

      {onglet === "actions" && <PanneauActions />}
      {onglet === "obligations" && <PanneauObligations />}
      {onglet === "monetaire" && <MarcheMonetairePanel lignes={chargerAdjudications()} />}
      {onglet === "fcp" && <PanneauFcp />}
      {onglet === "anticipations" &&
        (tableau ? (
          <AnticipationPanel tableau={tableau} />
        ) : (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
            Aucun fonds enregistré : les anticipations ont besoin d&apos;un portefeuille de
            référence pour situer les positions détenues.
          </p>
        ))}
    </div>
  );
}

function PanneauActions() {
  const { lignes, dateReference } = chargerActions();
  return <AnalyseActionsPanel lignes={lignes} dateReference={dateReference} />;
}

function PanneauObligations() {
  const { lignes, dateCours } = chargerObligations();
  return <AnalyseObligationsPanel lignes={lignes} dateCours={dateCours} />;
}

function PanneauFcp() {
  const { lignes, trimestreReference, derniereVl } = chargerFcp();
  return (
    <AnalyseFcpPanel
      lignes={lignes}
      trimestreReference={trimestreReference}
      derniereVl={derniereVl}
    />
  );
}
