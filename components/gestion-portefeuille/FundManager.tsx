"use client";

import { useState } from "react";
import Link from "next/link";
import { formatBenchmark, type FundRecord } from "@/app/gestion-portefeuille/types";
import type { PortfolioSnapshot } from "@/app/gestion-portefeuille/portfolio-types";
import type { NavPoint } from "@/app/gestion-portefeuille/nav-types";
import PerformancePanel from "./PerformancePanel";

/**
 * Onglets de la FICHE d'un fonds — ce qui lui est propre, et rien d'autre.
 *
 * Quatre volets sont partis vers des modules du menu de gauche, parce
 * qu'aucun n'était vraiment une affaire de fonds :
 *
 *   Inventaires, Valeur liquidative  → Importation : c'est le même geste,
 *                                      le même jour, pour tous les fonds.
 *   Allocation validée, Proposition,
 *   Opérations à réaliser            → Allocation : le comité les parcourt
 *                                      fonds après fonds, dans la même séance.
 *   Anticipations de cours           → Analyse de marché : elles portent sur
 *                                      toute la cote, pas sur un portefeuille.
 *   Référentiel titres               → Paramètres : un titre est commun à
 *                                      tous les fonds qui le détiennent.
 *
 * Reste ici ce qui ne se lit QUE fonds par fonds : son identité, et la
 * performance de sa VL.
 */
const MANAGE_TABS = [
  "Vue d'ensemble",
  "Analyse de performance",
  "Reporting",
] as const;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

export default function FundManager({
  fund,
  initialPortfolios = [],
  initialNav = [],
}: {
  fund: FundRecord;
  initialPortfolios?: PortfolioSnapshot[];
  initialNav?: NavPoint[];
}) {
  const [tab, setTab] = useState<(typeof MANAGE_TABS)[number]>("Vue d'ensemble");


  return (
    <div className="space-y-5">
      {/* Fil d'ariane + titre */}
      <div>
        <Link
          href="/gestion-portefeuille/fonds"
          className="text-[12px] text-slate-500 hover:text-slate-700 transition"
        >
          ← Tous les fonds
        </Link>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-900">{fund.nom}</h2>
          {fund.abreviation && (
            <span className="text-[11px] font-mono text-slate-500">{fund.abreviation}</span>
          )}
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {fund.type}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
            {fund.categorie}
          </span>
          <a
            href={`/gestion-portefeuille/rapport?fundId=${fund.id}`}
            className="ml-auto text-[11px] px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-slate-900 transition whitespace-nowrap"
            title="Générer le rapport du comité d'investissement (PowerPoint) à partir des analyses du fonds"
          >
            📊 Générer le rapport (PPTX)
          </a>
        </div>
      </div>

      {/* Onglets de gestion */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {MANAGE_TABS.map((t) => {
          const active = t === tab;
          const enabled =
            t === "Vue d'ensemble" || t === "Analyse de performance";
          if (!enabled) {
            return (
              <span
                key={t}
                title="Bientôt disponible"
                className="px-3 py-2 text-sm whitespace-nowrap border-b-2 border-transparent -mb-px text-slate-600 cursor-not-allowed flex items-center gap-1.5"
              >
                {t}
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  Bientôt
                </span>
              </span>
            );
          }
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                active
                  ? "border-blue-500 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Vue d'ensemble */}
      {tab === "Vue d'ensemble" && (
        <>
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Caractéristiques du fonds
              </h3>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <Fact label="Catégorie" value={fund.categorie} />
              <Fact label="Type d'OPC" value={fund.type} />
              <Fact label="Devise" value={fund.devise} />
              <Fact label="VL initiale" value={fund.vlInitiale || "—"} />
              <Fact label="Objectif de perf." value={fund.objectifPerf || "—"} />
              <Fact label="Benchmark" value={formatBenchmark(fund.benchmark)} />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Le pilotage opérationnel (souscriptions / rachats, valeur liquidative, reporting) sera
            disponible prochainement pour ce fonds.
          </section>
        </>
      )}

      {/* Portefeuille : inventaires détenus et allocation cible */}
      {/* Portefeuille, Anticipations, Référentiel et Valeur liquidative ont
          quitté cette fiche : cf. le commentaire de MANAGE_TABS. */}

      {tab === "Analyse de performance" && (
        <PerformancePanel
          fundId={fund.id}
          history={initialNav}
          periodStart={initialPortfolios.find((p) => p.slot === "intermediaire")?.asOfDate ?? null}
          periodEnd={initialPortfolios.find((p) => p.slot === "fin")?.asOfDate ?? null}
        />
      )}

      {/* La suppression d'un fonds se fait dans les Paramètres du module. */}
    </div>
  );
}
