"use client";

import { useState } from "react";
import Link from "next/link";
import { formatBenchmark, type FundRecord } from "@/app/gestion-portefeuille/types";
import type { PortfolioSnapshot } from "@/app/gestion-portefeuille/portfolio-types";
import type { NavPoint } from "@/app/gestion-portefeuille/nav-types";
import PortfolioPanel from "./PortfolioPanel";
import SecuritiesReferential from "./SecuritiesReferential";
import NavPanel from "./NavPanel";
import PerformancePanel from "./PerformancePanel";
import AllocationPanel from "./AllocationPanel";
import PropositionPanel from "./PropositionPanel";
import OperationsPanel from "./OperationsPanel";
import AnticipationPanel from "./AnticipationPanel";
import type { TableauAllocation } from "@/app/gestion-portefeuille/allocation-types";
import type { PlanOperations } from "@/app/gestion-portefeuille/operations-types";
import type { TableauProposition } from "@/app/gestion-portefeuille/proposition-types";
import type { TableauAnticipation } from "@/app/gestion-portefeuille/anticipation-types";

// Sous-onglets de Portefeuille. Les inventaires decrivent ce qui EST detenu,
// l'allocation validee ce qui DOIT l'etre : deux lectures du meme portefeuille,
// d'ou le regroupement.
const SOUS_ONGLETS_PORTEFEUILLE = [
  "Inventaires",
  "Allocation validée",
  "Proposition d'allocation",
  "Opérations à réaliser",
] as const;

// Onglets de gestion d'un fonds. Vue d'ensemble, Portefeuille, Référentiel
// titres et Valeur liquidative sont actifs ; les autres volets viendront.
const MANAGE_TABS = [
  "Vue d'ensemble",
  "Portefeuille",
  "Anticipations de cours",
  "Référentiel titres",
  "Valeur liquidative",
  "Analyse de performance",
  "Reporting",
] as const;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}

export default function FundManager({
  fund,
  initialPortfolios = [],
  initialNav = [],
  initialAllocation,
  initialOperations,
  initialAnticipations,
  initialProposition,
}: {
  fund: FundRecord;
  initialPortfolios?: PortfolioSnapshot[];
  initialNav?: NavPoint[];
  initialAllocation?: TableauAllocation;
  initialOperations?: PlanOperations;
  initialAnticipations?: TableauAnticipation;
  initialProposition?: TableauProposition;
}) {
  const [tab, setTab] = useState<(typeof MANAGE_TABS)[number]>("Vue d'ensemble");
  const [sousOnglet, setSousOnglet] =
    useState<(typeof SOUS_ONGLETS_PORTEFEUILLE)[number]>("Inventaires");
  // La tresorerie a investir est une hypothese de PILOTAGE, pas une donnee de
  // l'onglet Allocation : elle elargit l'assiette des cibles ET finance les
  // achats proposes. Portee ici, elle survit au changement de sous-onglet et
  // les deux panneaux raisonnent sur le meme montant — sinon le gerant saisit
  // 2 Md dans un onglet et lit des operations calculees sur zero.
  const [tresorerie, setTresorerie] = useState("0");

  return (
    <div className="space-y-5">
      {/* Fil d'ariane + titre */}
      <div>
        <Link
          href="/gestion-portefeuille/fonds"
          className="text-[12px] text-slate-500 hover:text-slate-300 transition"
        >
          ← Tous les fonds
        </Link>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-white">{fund.nom}</h2>
          {fund.abreviation && (
            <span className="text-[11px] font-mono text-slate-500">{fund.abreviation}</span>
          )}
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
            {fund.type}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
            {fund.categorie}
          </span>
          <a
            href={`/gestion-portefeuille/rapport?fundId=${fund.id}`}
            className="ml-auto text-[11px] px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition whitespace-nowrap"
            title="Générer le rapport du comité d'investissement (PowerPoint) à partir des analyses du fonds"
          >
            📊 Générer le rapport (PPTX)
          </a>
        </div>
      </div>

      {/* Onglets de gestion */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {MANAGE_TABS.map((t) => {
          const active = t === tab;
          const enabled =
            t === "Vue d'ensemble" ||
            t === "Portefeuille" ||
            t === "Anticipations de cours" ||
            t === "Référentiel titres" ||
            t === "Valeur liquidative" ||
            t === "Analyse de performance";
          if (!enabled) {
            return (
              <span
                key={t}
                title="Bientôt disponible"
                className="px-3 py-2 text-sm whitespace-nowrap border-b-2 border-transparent -mb-px text-slate-600 cursor-not-allowed flex items-center gap-1.5"
              >
                {t}
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
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
                  ? "border-blue-400 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
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
          <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-700">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
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

          <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
            Le pilotage opérationnel (souscriptions / rachats, valeur liquidative, reporting) sera
            disponible prochainement pour ce fonds.
          </section>
        </>
      )}

      {/* Portefeuille : inventaires détenus et allocation cible */}
      {tab === "Portefeuille" && (
        <div className="space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {SOUS_ONGLETS_PORTEFEUILLE.map((s) => {
              const actif = s === sousOnglet;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSousOnglet(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    actif
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {sousOnglet === "Inventaires" && (
            <PortfolioPanel fundId={fund.id} initialPortfolios={initialPortfolios} />
          )}

          {sousOnglet === "Allocation validée" &&
            (initialAllocation ? (
              <AllocationPanel
                fundId={fund.id}
                initialAllocation={initialAllocation}
                tresorerie={tresorerie}
                onTresorerie={setTresorerie}
              />
            ) : (
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
                Allocation indisponible pour ce fonds.
              </div>
            ))}

          {/* Le modèle PROPOSE, l'allocation validée DÉCIDE. L'écart entre les
              deux est ce qui se discute en comité — d'où deux onglets voisins
              plutôt qu'un seul tableau qui les mélangerait. */}
          {sousOnglet === "Proposition d'allocation" &&
            (initialProposition ? (
              <PropositionPanel fundId={fund.id} initial={initialProposition} />
            ) : (
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
                Proposition indisponible pour ce fonds.
              </div>
            ))}

          {sousOnglet === "Opérations à réaliser" &&
            (initialOperations ? (
              <OperationsPanel
                fundId={fund.id}
                initialPlan={initialOperations}
                tresorerie={tresorerie}
                onTresorerie={setTresorerie}
              />
            ) : (
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
                Opérations indisponibles pour ce fonds.
              </div>
            ))}
        </div>
      )}

      {/* Anticipations de cours : cinq méthodes de valorisation */}
      {tab === "Anticipations de cours" &&
        (initialAnticipations ? (
          <AnticipationPanel tableau={initialAnticipations} />
        ) : (
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
            Anticipations indisponibles pour ce fonds.
          </div>
        ))}

      {/* Référentiel titres (propre à ce fonds) */}
      {tab === "Référentiel titres" && <SecuritiesReferential fundId={fund.id} />}

      {/* Historique de valeur liquidative / actif net */}
      {tab === "Valeur liquidative" && <NavPanel fundId={fund.id} initialHistory={initialNav} />}

      {/* Analyse de performance (calculée depuis l'historique VL) */}
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
