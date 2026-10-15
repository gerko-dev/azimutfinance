"use client";

// === Outils — le sommaire ==================================================
//
// UN ONGLET PAR OUTIL, et le premier est le rendement de réméré. Les suivants
// s'ajouteront à cette liste : un outil est un calcul sur ce qu'on détient,
// qui n'écrit rien.
//
// MONTÉS À L'OUVERTURE, jamais avant : chacun lit les inventaires de tous les
// fonds, et qui ouvre la page pour un autre outil n'a pas à les payer.

import { useState } from "react";

import RendementRemere from "./RendementRemere";

type Outil = "remere";

const OUTILS: { cle: Outil; libelle: string; aide: string }[] = [
  {
    cle: "remere",
    libelle: "Rendement de réméré",
    aide: "Ce qu'un réméré rapporterait à la contrepartie, OAT par OAT, sur la fenêtre choisie",
  },
];

export default function OutilsPanel({
  fonds,
}: {
  fonds: { id: string; nom: string }[];
}) {
  const [outil, setOutil] = useState<Outil>("remere");

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {OUTILS.map((o) => {
          const actif = outil === o.cle;
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOutil(o.cle)}
              title={o.aide}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
                actif
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {o.libelle}
            </button>
          );
        })}
      </nav>

      {outil === "remere" && <RendementRemere fonds={fonds} />}
    </div>
  );
}
