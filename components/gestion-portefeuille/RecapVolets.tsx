"use client";

// === Récapitulatifs des rémérés et des prêts de titres ===
//
// DES VUES, PAS DES SAISIES. Un réméré et un prêt ne sont pas des objets à
// part : ce sont des ordres MTP augmentés, et ils se saisissent comme tels
// dans le formulaire, cases cochées. Ces deux onglets ne font que les
// rassembler — le classeur a ses feuilles « Rémérés » et « Titres prêtés »
// pour la même raison : on veut les voir ensemble, pas les tenir ailleurs.
//
// Tout ce qui se corrige se corrige donc sur l'ordre, dans l'onglet
// Opérations. D'où le bouton unique de chaque ligne.

import {
  LIBELLES_SENS_REMERE,
  LIBELLES_STATUT_PRET,
  LIBELLES_STATUT_REMERE,
  montantRemere,
  remereNoue,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

const th = "text-left px-3 py-2 font-medium";
const thNum = "text-right px-3 py-2 font-medium";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-right tabular-nums";

function Pastille({ actif, libelle }: { actif: boolean; libelle: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
        actif ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
      }`}
    >
      {libelle}
    </span>
  );
}

function Cadre({
  titre,
  explication,
  vide,
  videAide,
  enTetes,
  children,
}: {
  titre: string;
  explication: string;
  vide: boolean;
  videAide: string;
  enTetes: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">{explication}</p>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>{enTetes}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vide ? (
                <tr>
                  <td colSpan={20} className="px-3 py-6 text-center text-slate-400">
                    Aucun {titre} en cours. {videAide}
                  </td>
                </tr>
              ) : (
                children
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function RecapRemeres({
  operations,
  onModifier,
  onDenouer,
}: {
  operations: OperationAvecFonds[];
  onModifier: (o: OperationAvecFonds) => void;
  /** Ouvre l'opération MTP de sens inverse qui soldera le réméré. */
  onDenouer: (o: OperationAvecFonds) => void;
}) {
  // UN RÉMÉRÉ N'ENTRE DANS LA LISTE QU'UNE FOIS SON ORDRE EXÉCUTÉ : tant
  // qu'il n'est pas servi, rien n'a été cédé et la cession temporaire n'a pas
  // eu lieu. L'ordre reste visible dans l'onglet Opérations, où il s'exécute.
  const lignes = operations.filter(remereNoue);

  return (
    <Cadre
      titre="réméré"
      videAide="Coche la case sur une opération MTP, puis exécute l'ordre : un réméré ne se noue qu'une fois les titres cédés."
      explication="Une cession temporaire : le titre part, il reviendra au prix de sortie à la date de fin. Au point de trésorerie, l'ordre pèse dans « achats / ventes à réméré validés » tant qu'il n'est pas servi, puis dans les achats et ventes réalisés. Le dénouement se comporte, lui, comme une opération MTP ordinaire."
      vide={lignes.length === 0}
      enTetes={
        <>
          <th className={th}>Date</th>
          <th className={th}>Fonds</th>
          <th className={th}>Contrepartie</th>
          <th className={th}>Titre</th>
          <th className={thNum}>Quantité</th>
          <th className={thNum}>Entrée</th>
          <th className={thNum}>Sortie</th>
          <th className={th}>Sens</th>
          <th className={th}>Fin</th>
          <th className={thNum}>Montant</th>
          <th className={th}>État</th>
          <th className={th}>Dénouement</th>
          <th className="px-3 py-2" />
        </>
      }
    >
      {lignes.map((o) => {
        const r = o.remere!;
        return (
          <tr key={o.id} className="hover:bg-slate-50">
            <td className={td}>{dateFr(o.dateOperation)}</td>
            <td className={td}>{o.fondsNom}</td>
            <td className={td}>{r.contrepartie || "—"}</td>
            <td className={td}>
              <div className="font-medium text-slate-800">{o.libelle}</div>
              {o.code && <div className="text-[10px] text-slate-400">{o.code}</div>}
            </td>
            <td className={tdNum}>{fmt0.format(o.quantite)}</td>
            <td className={tdNum}>{montantFr(o.prix)}</td>
            <td className={tdNum}>{montantFr(r.prixSortie)}</td>
            <td className={td}>
              <Pastille actif={r.sens === "cash_in"} libelle={LIBELLES_SENS_REMERE[r.sens]} />
            </td>
            <td className={td}>{dateFr(r.dateFin)}</td>
            <td className={`${tdNum} font-medium`}>{montantFr(montantRemere(o, r))}</td>
            {/* TROIS ÉTATS, et aucun ne se saisit : le réméré court, son
                dénouement est saisi mais pas encore exécuté — donc rien n'est
                réglé et il pèse toujours — ou il est soldé. */}
            <td className={td}>
              {r.denouementEnAttente ? (
                <Pastille actif libelle="Dénouement saisi" />
              ) : (
                <Pastille
                  actif={r.statut === "en_cours"}
                  libelle={LIBELLES_STATUT_REMERE[r.statut]}
                />
              )}
            </td>
            <td className={td}>{dateFr(r.dateDenouement)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {r.statut === "en_cours" && !r.denouementEnAttente && (
                <button
                  type="button"
                  onClick={() => onDenouer(o)}
                  className="text-[11px] font-medium text-blue-700 hover:underline mr-3"
                >
                  Dénouer
                </button>
              )}
              <button
                type="button"
                onClick={() => onModifier(o)}
                className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
              >
                Modifier
              </button>
            </td>
          </tr>
        );
      })}
    </Cadre>
  );
}

export function RecapPrets({
  operations,
  onModifier,
  onReprendre,
}: {
  operations: OperationAvecFonds[];
  onModifier: (o: OperationAvecFonds) => void;
  /** Pose — ou retire — la date de reprise. C'est elle qui fait le statut. */
  onReprendre: (o: OperationAvecFonds, date: string | null) => void;
}) {
  const lignes = operations.filter((o) => o.pret !== null);

  return (
    <Cadre
      titre="prêt de titres"
      videAide="Coche la case sur une opération MTP, dans l'onglet « Saisir un ordre »."
      explication="Un registre, pas un flux : prêter des titres ne déplace pas de cash, et le point de trésorerie n'en porte donc aucun poste. L'intérêt à recevoir est calculé sur la valeur des titres prêtés, au taux du prêt, en base 360 — de la date du prêt à sa fin, ou à la reprise quand elle a eu lieu."
      vide={lignes.length === 0}
      enTetes={
        <>
          <th className={th}>Date</th>
          <th className={th}>Fonds</th>
          <th className={th}>Contrepartie</th>
          <th className={th}>Titre</th>
          <th className={thNum}>Quantité</th>
          <th className={thNum}>Taux prêt</th>
          <th className={th}>Fin</th>
          <th className={th}>Statut</th>
          <th className={thNum}>Intérêt à recevoir</th>
          <th className={th}>Reprise</th>
          <th className="px-3 py-2" />
        </>
      }
    >
      {lignes.map((o) => {
        const p = o.pret!;
        return (
          <tr key={o.id} className="hover:bg-slate-50">
            <td className={td}>{dateFr(o.dateOperation)}</td>
            <td className={td}>{o.fondsNom}</td>
            <td className={td}>{p.contrepartie || "—"}</td>
            <td className={td}>
              <div className="font-medium text-slate-800">{o.libelle}</div>
              {o.code && <div className="text-[10px] text-slate-400">{o.code}</div>}
            </td>
            <td className={tdNum}>{fmt0.format(o.quantite)}</td>
            <td className={tdNum}>
              {(p.tauxCommission * 100).toLocaleString("fr-FR", {
                maximumFractionDigits: 4,
              })}
              &nbsp;%
            </td>
            <td className={td}>{dateFr(p.dateFin)}</td>
            <td className={td}>
              <Pastille
                actif={p.statut === "en_cours"}
                libelle={LIBELLES_STATUT_PRET[p.statut]}
              />
            </td>
            <td className={tdNum}>{montantFr(p.interetARecevoir)}</td>
            <td className={td}>{dateFr(p.dateReprise)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {/* LA REPRISE SE FAIT ICI, pas au formulaire : la date est celle
                  du jour où les titres reviennent. « Rouvrir » la retire, pour
                  corriger une fausse manœuvre. */}
              {p.statut === "en_cours" ? (
                <button
                  type="button"
                  onClick={() => onReprendre(o, new Date().toISOString().slice(0, 10))}
                  className="text-[11px] font-medium text-blue-700 hover:underline mr-3"
                >
                  Reprendre
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onReprendre(o, null)}
                  className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline mr-3"
                >
                  Rouvrir
                </button>
              )}
              <button
                type="button"
                onClick={() => onModifier(o)}
                className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
              >
                Modifier
              </button>
            </td>
          </tr>
        );
      })}
    </Cadre>
  );
}
