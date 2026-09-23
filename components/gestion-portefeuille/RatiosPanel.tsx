"use client";

// === Ratios — module interfonds ===
//
// La feuille « Ratios » du Fichier de suivi NFD, bloc par bloc et dans son
// ordre : réglementaires, contractuels, puis les diversifications par émetteur.
//
// DEUX PÉRIMÈTRES. Le consolidé répond à « ai-je un problème quelque part ? »
// et ne montre que les écarts ; la vue d'un fonds répond à « où exactement ».
// Le premier sert au comité, le second à celui qui doit corriger.
//
// CE QUI NE SE CALCULE PAS EST DIT, ligne par ligne, avec sa raison. Un ratio
// affiché à zéro parce que la donnée manque est un ratio qu'on croira conforme.

import { useState } from "react";

import type { BlocRatios, LigneRatio, TableauRatios } from "@/app/gestion-portefeuille/ratios-data";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));
const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

const TONS: Record<LigneRatio["statut"], string> = {
  conforme: "bg-emerald-100 text-emerald-800",
  sous_minimum: "bg-amber-100 text-amber-800",
  au_dessus_maximum: "bg-rose-100 text-rose-800",
  // Ni vert ni rouge : il n'y a rien à respecter, et rien n'est en défaut.
  non_borne: "bg-slate-100 text-slate-600",
  inconnu: "bg-slate-100 text-slate-500",
};
const LIBELLES: Record<LigneRatio["statut"], string> = {
  conforme: "Conforme",
  sous_minimum: "Sous le minimum",
  au_dessus_maximum: "Au-dessus du maximum",
  non_borne: "Aucune norme",
  inconnu: "Non calculable",
};

/** Norme lisible d'un coup : « ≥ 70 % », « ≤ 15 % », « 50 – 70 % ». */
function norme(l: LigneRatio): string {
  if (l.seuilMin != null && l.seuilMax != null) return `${l.seuilMin} – ${l.seuilMax} %`;
  if (l.seuilMin != null) return `≥ ${l.seuilMin} %`;
  if (l.seuilMax != null) return `≤ ${l.seuilMax} %`;
  return "—";
}

const estEcart = (l: LigneRatio) =>
  l.statut === "sous_minimum" || l.statut === "au_dessus_maximum";

/**
 * Largeurs des colonnes, partagées par les six blocs.
 *
 * Une seule table de référence : les faire diverger, c'était garantir qu'elles
 * divergent. L'ordre suit celui des en-têtes — désignation, situation, ratio,
 * norme, verdict, détail.
 *
 * Le verdict est large parce qu'il porte les raisons d'un « non calculable »,
 * qui sont des phrases ; la désignation l'est aussi, un nom d'émetteur pouvant
 * courir sur trois mots.
 */
const COLONNES = ["30%", "15%", "11%", "11%", "26%", "7%"];

function Ligne({ l }: { l: LigneRatio }) {
  const [ouvert, setOuvert] = useState(false);
  const ecart = estEcart(l);

  return (
    <>
      <tr className={`hover:bg-slate-50 ${ecart ? "bg-rose-50/40" : ""}`}>
        <td className="px-3 py-1.5">
          <div className="font-medium text-slate-800">{l.libelle}</div>
          {l.detail && <div className="text-[10px] text-slate-400">{l.detail}</div>}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {l.valeur == null ? "—" : montantFr(l.valeur)}
        </td>
        <td
          className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
            ecart ? "text-rose-700" : ""
          }`}
        >
          {pct(l.taux)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{norme(l)}</td>
        <td className="px-3 py-1.5">
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${TONS[l.statut]}`}
          >
            {LIBELLES[l.statut]}
          </span>
          {/* LA RAISON, PAS SEULEMENT LE CONSTAT : un « non calculable » sans
              explication se lit comme une panne. */}
          {l.obstacle && (
            <div className="text-[10px] text-slate-400 mt-0.5">{l.obstacle}</div>
          )}
          {l.statut === "non_borne" && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              À poser dans Paramètres › Fonds, bloc Ratios.
            </div>
          )}
        </td>
        <td className="px-3 py-1.5 text-right">
          {l.composition.length > 1 && (
            <button
              type="button"
              onClick={() => setOuvert((o) => !o)}
              className="text-[10px] text-blue-700 hover:underline"
            >
              {ouvert ? "Masquer" : `${l.composition.length} lignes`}
            </button>
          )}
        </td>
      </tr>
      {/* UN MONTANT AGRÉGÉ NE DIT PAS CE QU'IL CONTIENT, et un dépassement
          qu'on ne peut pas décomposer ne se corrige pas. */}
      {ouvert && (
        <tr className="bg-slate-50/60">
          <td colSpan={6} className="px-3 py-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-600">
              {l.composition.map((c) => (
                <span key={c.libelle} className="tabular-nums">
                  {c.libelle} · {montantFr(c.valorisation)}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Bloc({ b }: { b: BlocRatios }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 bg-slate-100">
        <div className="text-[11px] font-semibold text-slate-700">{b.titre}</div>
        {b.explication && (
          <div className="text-[10px] text-slate-500 mt-0.5">{b.explication}</div>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* LES SIX BLOCS DOIVENT S'ALIGNER. Sans largeurs imposées, chaque
            tableau dimensionne ses colonnes sur SON contenu : un bloc à trois
            lignes courtes et un autre à quinze noms d'émetteurs ne tombaient
            jamais aux mêmes abscisses, et l'œil devait se réorienter à chaque
            section.

            `table-fixed` seul ne suffit pas — le navigateur redistribue tant
            qu'aucune largeur n'est posée. D'où le `colgroup`, et une largeur
            minimale qui fait défiler plutôt que d'écraser les colonnes sur un
            écran étroit. */}
        <table className="w-full table-fixed min-w-[860px] text-[11px] border-collapse">
          <colgroup>
            {COLONNES.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">{b.entete}</th>
              <th className="text-right px-3 py-1.5 font-medium">Situation</th>
              <th className="text-right px-3 py-1.5 font-medium">
                {b.noteAssiette ? "Part" : "% actif net"}
              </th>
              <th className="text-right px-3 py-1.5 font-medium">Norme</th>
              <th className="text-left px-3 py-1.5 font-medium">Verdict</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {b.lignes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                  Aucune position de cette nature.
                </td>
              </tr>
            ) : (
              b.lignes.map((l) => <Ligne key={l.libelle} l={l} />)
            )}
          </tbody>
        </table>
      </div>
      {b.noteAssiette && (
        <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
          {b.noteAssiette}
        </div>
      )}
    </div>
  );
}

function Tableau({ t }: { t: TableauRatios }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[
          // L'ACTIF NET ET LE TOTAL DE L'INVENTAIRE SONT DEUX CHIFFRES. Les
          // afficher côte à côte évite qu'on prenne l'un pour l'autre : le
          // premier est le dénominateur des ratios, le second ce que
          // l'inventaire couvre.
          {
            l: "Actif net",
            v: `${montantFr(t.actifNet)} F`,
            s: t.dateActifNet ? `VL du ${dateFr(t.dateActifNet)}` : "somme des positions",
          },
          {
            l: "Inventaire",
            v: `${montantFr(t.totalActif)} F`,
            s: dateFr(t.dateInventaire),
          },
          { l: "Dont liquidités", v: `${montantFr(t.liquidites)} F`, s: null },
          { l: "Catégorie", v: t.categorie || "—", s: null },
        ].map((b) => (
          <div key={b.l} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{b.l}</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{b.v}</div>
            {b.s && <div className="text-[10px] text-slate-400">{b.s}</div>}
          </div>
        ))}
      </div>

      {t.avertissements.map((a) => (
        <p
          key={a}
          className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2"
        >
          {a}
        </p>
      ))}

      {t.blocs.map((b) => (
        <Bloc key={b.titre} b={b} />
      ))}
    </div>
  );
}

export default function RatiosPanel({
  tableaux,
  global,
}: {
  tableaux: TableauRatios[];
  /** Vrai sur la vue consolidée : on ne montre alors que les écarts. */
  global: boolean;
}) {
  if (tableaux.length === 0) {
    return (
      <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
        Aucun fonds à afficher.
      </p>
    );
  }

  if (!global) return <Tableau t={tableaux[0]} />;

  // ── Consolidé : les écarts, et eux seuls ────────────────────────────────
  //
  // Un tableau de tous les ratios de tous les fonds ne se lit pas. Ce qu'on
  // cherche ici, c'est la liste de ce qui cloche — le détail se regarde fonds
  // par fonds, en changeant de périmètre.
  const anomalies = tableaux.flatMap((t) =>
    t.blocs.flatMap((b) =>
      b.lignes.filter(estEcart).map((l) => ({ fonds: t.fondsNom, bloc: b.titre, l })),
    ),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { l: "Fonds suivis", v: String(tableaux.length) },
          {
            l: "Fonds en écart",
            v: String(
              tableaux.filter((t) => t.blocs.some((b) => b.lignes.some(estEcart))).length,
            ),
          },
          { l: "Ratios en écart", v: String(anomalies.length) },
        ].map((b) => (
          <div key={b.l} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{b.l}</div>
            <div className="text-lg font-semibold text-slate-900 tabular-nums">{b.v}</div>
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          {/* Le consolidé n'a pas les mêmes colonnes que le détail — il nomme
              le fonds et le bloc — mais il obéit à la même règle : largeurs
              posées, et défilement plutôt qu'écrasement. */}
          <table className="w-full table-fixed min-w-[860px] text-[11px] border-collapse">
            <colgroup>
              {["20%", "24%", "24%", "11%", "11%", "10%"].map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Fonds</th>
                <th className="text-left px-3 py-2 font-medium">Bloc</th>
                <th className="text-left px-3 py-2 font-medium">Ligne</th>
                <th className="text-right px-3 py-2 font-medium">% actif net</th>
                <th className="text-right px-3 py-2 font-medium">Norme</th>
                <th className="text-left px-3 py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {anomalies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-emerald-700">
                    Aucun écart : tous les ratios mesurables sont dans leurs normes.
                  </td>
                </tr>
              ) : (
                anomalies.map(({ fonds, bloc, l }) => (
                  <tr key={`${fonds}|${bloc}|${l.libelle}`} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{fonds}</td>
                    <td className="px-3 py-1.5 text-slate-500">{bloc}</td>
                    <td className="px-3 py-1.5">{l.libelle}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-rose-700">
                      {pct(l.taux)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {norme(l)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${TONS[l.statut]}`}
                      >
                        {LIBELLES[l.statut]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
