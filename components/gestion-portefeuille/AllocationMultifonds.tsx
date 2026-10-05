"use client";

// === Allocation — le cycle de décision, pour un fonds ===
//
// Trois onglets qui se lisent DANS CET ORDRE : ce qui a été arrêté, ce que le
// modèle propose, ce qu'il faut passer. Le modèle PROPOSE, l'allocation validée
// DÉCIDE, et l'écart entre les deux est précisément ce qui se discute en
// comité — d'où trois écrans voisins plutôt qu'un tableau qui les mélangerait.
//
// LA TRÉSORERIE À INVESTIR EST PORTÉE ICI, au-dessus des trois onglets.
// Elle élargit l'assiette des cibles ET finance les achats proposés : la
// laisser dans un onglet ferait saisir 2 Md d'un côté pendant que l'autre
// calcule sur zéro. C'était déjà la règle sur la fiche du fonds, elle vaut
// autant ici.

import { useState } from "react";

import type { TableauAllocation } from "@/app/gestion-portefeuille/allocation-types";
import type { PlanOperations } from "@/app/gestion-portefeuille/operations-types";
import type { TableauProposition } from "@/app/gestion-portefeuille/proposition-types";
import AllocationPanel from "./AllocationPanel";
import PropositionPanel from "./PropositionPanel";
import OperationsPanel from "./OperationsPanel";
import InterfondsPanel from "./InterfondsPanel";

type Onglet = "validee" | "proposition" | "operations" | "interfonds";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "validee", libelle: "Allocation validée" },
  { cle: "proposition", libelle: "Proposition d'allocation" },
  { cle: "operations", libelle: "Opérations à réaliser" },
  // QUATRIEME ECRAN, ET DERNIER DU CYCLE : une fois su ce qu'il faut passer,
  // reste a savoir si la contrepartie est dehors ou dans la maison.
  { cle: "interfonds", libelle: "Entre fonds" },
];

function Indisponible({ quoi }: { quoi: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
      {quoi} indisponible pour ce fonds — il lui faut un inventaire importé.
    </div>
  );
}

export default function AllocationMultifonds({
  fondsId,
  allocation,
  proposition,
  operations,
}: {
  fondsId: string;
  allocation: TableauAllocation | null;
  proposition: TableauProposition | null;
  operations: PlanOperations | null;
}) {
  const [onglet, setOnglet] = useState<Onglet>("validee");
  // TEXTE, et non nombre : le champ est saisi, et « 2 000 000 » à moitié tapé
  // n'est pas encore un nombre. La conversion vit dans les panneaux.
  const [tresorerie, setTresorerie] = useState("");

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {ONGLETS.map((t) => {
          const actif = onglet === t.cle;
          return (
            <button
              key={t.cle}
              type="button"
              onClick={() => setOnglet(t.cle)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
                actif
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.libelle}
            </button>
          );
        })}
      </nav>

      {/* Le `key` sur le fonds REMONTE les panneaux quand on change de
          portefeuille : ils portent des saisies en cours — cibles modifiées,
          quantités ajustées — qui n'ont aucun sens transportées d'un fonds à
          l'autre. */}
      {onglet === "validee" &&
        (allocation ? (
          <AllocationPanel
            key={`alloc-${fondsId}`}
            fundId={fondsId}
            initialAllocation={allocation}
            tresorerie={tresorerie}
            onTresorerie={setTresorerie}
          />
        ) : (
          <Indisponible quoi="Allocation" />
        ))}

      {onglet === "proposition" &&
        (proposition ? (
          <PropositionPanel
            key={`prop-${fondsId}`}
            fundId={fondsId}
            initial={proposition}
            tresorerie={tresorerie}
          />
        ) : (
          <Indisponible quoi="Proposition" />
        ))}

      {onglet === "operations" &&
        (operations ? (
          <OperationsPanel
            key={`ops-${fondsId}`}
            fundId={fondsId}
            initialPlan={operations}
            tresorerie={tresorerie}
          />
        ) : (
          <Indisponible quoi="Plan d'opérations" />
        ))}

      {/* PAS DE `key` SUR LE FONDS, et c'est voulu : ce panneau lit TOUS les
          portefeuilles, et son calcul ne dépend pas de celui qu'on regarde.
          Le remonter à chaque changement de fonds relancerait quinze lectures
          d'inventaire pour afficher la même chose. Il surligne simplement le
          fonds courant dans ses lignes. */}
      {onglet === "interfonds" && <InterfondsPanel fondsId={fondsId} />}
    </div>
  );
}
