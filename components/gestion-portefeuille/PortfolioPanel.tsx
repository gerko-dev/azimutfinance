"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reclassifyFundPortfoliosAction,
} from "@/app/gestion-portefeuille/portfolio-actions";
import {
  SECTION_LABELS,
  SLOT_LABELS,
  SLOT_ORDER,
  type PortfolioSlot,
  type PortfolioSnapshot,
} from "@/app/gestion-portefeuille/portfolio-types";
import { coursDe, type CoursSite } from "@/app/gestion-portefeuille/cours-types";
import {
  PositionRowView,
  SECTION_ORDER,
  SectionTable,
  fmt,
  subtotalOf,
} from "./ReferentielTitre";

export default function PortfolioPanel({
  fundId,
  initialPortfolios = [],
  cours = new Map(),
}: {
  fundId: string;
  initialPortfolios?: PortfolioSnapshot[];
  /** Derniers cours du site, indexés par désignation. Lus au SERVEUR et
   *  passés en props : un cours change à chaque séance, il ne se stocke pas
   *  au référentiel — et le lint interdit de le charger dans un effet. */
  cours?: Map<string, CoursSite>;
}) {
  const router = useRouter();

  // Inventaires enregistrés (0 à 3), indexés par slot.
  const bySlot = new Map(initialPortfolios.map((p) => [p.slot, p]));
  const firstAvailable = SLOT_ORDER.find((sl) => bySlot.has(sl)) ?? "fin";
  const [viewSlot, setViewSlot] = useState<PortfolioSlot>(firstAvailable);
  const viewed = bySlot.get(viewSlot) ?? null;

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reclassing, startReclass] = useTransition();

  const handleReclassify = () => {
    setError(null);
    setInfo(null);
    startReclass(async () => {
      const res = await reclassifyFundPortfoliosAction(fundId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { examinees, modifiees } = res.data;
      if (modifiees.length === 0) {
        // Dire « rien n'a changé » vaut mieux qu'un rafraîchissement muet, qui
        // se lit comme un échec.
        setInfo(`${examinees} ligne(s) réexaminée(s) : aucun changement de classe.`);
      } else {
        const detail = modifiees
          .slice(0, 6)
          .map(
            (m) =>
              `${m.code || m.libelle} : ${SECTION_LABELS[m.sectionAvant]} → ${SECTION_LABELS[m.sectionApres]}`,
          )
          .join(" · ");
        const reste = modifiees.length > 6 ? ` (+${modifiees.length - 6} autre(s))` : "";
        setInfo(
          `${modifiees.length} ligne(s) reclassée(s) sur ${examinees} — ${detail}${reste}`,
        );
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {/* L'IMPORT A QUITTE CET ECRAN.
          Il se fait desormais EN LOT, en tete de la page Importation : un
          arrete arrive en bloc — quinze inventaires le meme jour —, et le
          charger fonds par fonds demandait quatre-vingt-dix gestes pour une
          seule livraison. Le lot lit, rattache, montre ses lignes et ouvre les
          fiches ; cet ecran ne garde que ce qu'il sait faire seul : MONTRER ce
          qui est enregistre, et le reclasser quand le referentiel a bouge. */}
      {/* Inventaires enregistrés : navigation début / intermédiaire / fin */}
      {initialPortfolios.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-slate-500">
              Le classement des lignes suit le référentiel titres du fonds.
            </p>
            <button
              type="button"
              onClick={handleReclassify}
              disabled={reclassing}
              title="Re-classer les inventaires selon l'état actuel du référentiel"
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
            >
              {reclassing ? "Actualisation…" : "↻ Actualiser le classement"}
            </button>
          </div>
          {/* Compte rendu AU PIED DU BOUTON : le message de la zone d'import
              est trop loin pour qu'on fasse le lien avec le clic. */}
          {(info || error) && (
            <p
              className={`text-[11px] leading-relaxed ${
                error ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {error ? error : `✓ ${info}`}
            </p>
          )}
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {SLOT_ORDER.map((sl) => {
              const snap = bySlot.get(sl);
              const active = sl === viewSlot;
              return (
                <button
                  key={sl}
                  type="button"
                  disabled={!snap}
                  onClick={() => snap && setViewSlot(sl)}
                  className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                    active
                      ? "border-blue-500 text-slate-900"
                      : snap
                        ? "border-transparent text-slate-500 hover:text-slate-900"
                        : "border-transparent text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {SLOT_LABELS[sl]}
                  <span className="ml-1.5 text-[10px] text-slate-500">
                    {snap ? snap.asOfDate : "non importé"}
                  </span>
                </button>
              );
            })}
          </div>

          {viewed ? (
            <>
              <p className="text-[11px] text-slate-500">
                {viewed.positions.length} lignes · Total {fmt(viewed.totalValuation, 0)}
                {viewed.label ? ` · ${viewed.label}` : ""}
              </p>
              {SECTION_ORDER.filter((sec) => viewed.positions.some((p) => p.section === sec)).map(
                (sec) => (
                  <SectionTable key={sec} section={sec} subtotal={subtotalOf(viewed.positions, sec)}>
                    {viewed.positions.map((p) =>
                      p.section === sec ? (
                        <PositionRowView
                          key={p.id}
                          row={p}
                          cours={coursDe(cours, p.matchIsin, p.matchCode, p.rawCode)}
                        />
                      ) : null,
                    )}
                  </SectionTable>
                ),
              )}
            </>
          ) : (
            <p className="text-[12px] text-slate-500">Cet inventaire n&apos;a pas encore été importé.</p>
          )}
        </section>
      )}

      {/* État vide */}
      {initialPortfolios.length === 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucun inventaire pour ce fonds. Choisis le type (début / intermédiaire / fin), la date, puis
          importe un fichier.
        </section>
      )}
    </div>
  );
}
