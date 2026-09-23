"use client";

// === Importation — inventaires et valeur liquidative ===
//
// DEUX SOURCES, UN SEUL GESTE. L'inventaire dit ce que le fonds DÉTIENT, la VL
// ce qu'il VAUT : les deux arrivent le même jour, du même dépositaire, et se
// chargent l'un après l'autre. Les tenir sur deux onglets distants de la fiche
// du fonds obligeait à traverser l'écran entre deux fichiers du même envoi.
//
// Les panneaux eux-mêmes sont inchangés — ce module les rassemble, il ne les
// réécrit pas.

import { useState } from "react";

import type { PortfolioSnapshot } from "@/app/gestion-portefeuille/portfolio-types";
import type { NavPoint } from "@/app/gestion-portefeuille/nav-types";
import type { CoursSite } from "@/app/gestion-portefeuille/cours-types";
import PortfolioPanel from "./PortfolioPanel";
import NavPanel from "./NavPanel";

type Onglet = "inventaires" | "vl";

const ONGLETS: { cle: Onglet; libelle: string; aide: string }[] = [
  {
    cle: "inventaires",
    libelle: "Inventaires",
    aide: "Ce que le fonds détient, ligne à ligne",
  },
  {
    cle: "vl",
    libelle: "Valeur liquidative",
    aide: "VL, nombre de parts et actif net, par date",
  },
];

export default function ImportationPanel({
  fondsId,
  fondsNom,
  inventaires,
  vl,
  cours,
}: {
  fondsId: string;
  fondsNom: string;
  inventaires: PortfolioSnapshot[];
  vl: NavPoint[];
  /** Derniers cours du site — lus au serveur, jamais stockés. */
  cours: Map<string, CoursSite>;
}) {
  const [onglet, setOnglet] = useState<Onglet>("inventaires");

  return (
    <div className="space-y-4">
      {/* Ce qui est DÉJÀ chargé, avant de charger autre chose : un import
          silencieux par-dessus un autre est la meilleure façon d'écraser un
          arrêté sans s'en apercevoir. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Fonds</div>
          <div className="text-sm font-semibold text-slate-900">{fondsNom}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Inventaires chargés
          </div>
          <div className="text-sm font-semibold text-slate-900 tabular-nums">
            {inventaires.length}
          </div>
          <div className="text-[10px] text-slate-400">
            {inventaires.length > 0
              ? inventaires
                  .map((s) => `${s.slot} ${s.asOfDate}`)
                  .sort()
                  .join(" · ")
              : "aucun"}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Points de VL
          </div>
          <div className="text-sm font-semibold text-slate-900 tabular-nums">
            {vl.length}
          </div>
          <div className="text-[10px] text-slate-400">
            {vl.length > 0
              ? `du ${vl[0].date} au ${vl[vl.length - 1].date}`
              : "aucun"}
          </div>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {ONGLETS.map((t) => {
          const actif = onglet === t.cle;
          return (
            <button
              key={t.cle}
              type="button"
              onClick={() => setOnglet(t.cle)}
              title={t.aide}
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

      {/* MASQUÉS, PAS DÉMONTÉS : les deux panneaux portent un fichier
          sélectionné et un aperçu d'import en cours. Les démonter en changeant
          d'onglet jetterait un import à moitié préparé. */}
      <div className={onglet === "inventaires" ? "" : "hidden"}>
        <PortfolioPanel
          key={`inv-${fondsId}`}
          fundId={fondsId}
          initialPortfolios={inventaires}
          cours={cours}
        />
      </div>
      <div className={onglet === "vl" ? "" : "hidden"}>
        <NavPanel key={`vl-${fondsId}`} fundId={fondsId} initialHistory={vl} />
      </div>
    </div>
  );
}
