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

import { Fragment, useMemo, useState } from "react";

import {
  LIBELLES_SENS_REMERE,
  LIBELLES_STATUT_PRET,
  LIBELLES_STATUT_REMERE,
  interetPret,
  montantRemere,
  remereNoue,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import EnTeteTri, { type Tri } from "./EnTeteTri";

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

/** Les colonnes sur lesquelles le registre des prêts se trie. */
type ColonnePret =
  | "date"
  | "fonds"
  | "contrepartie"
  | "titre"
  | "quantite"
  | "taux"
  | "fin"
  | "statut"
  | "interet"
  | "reprise";

export function RecapPrets({
  operations,
  enCours,
  onModifier,
  onReprendre,
  onRapprocherInteret,
  onSupprimer,
}: {
  operations: OperationAvecFonds[];
  enCours: boolean;
  onModifier: (o: OperationAvecFonds) => void;
  /** Pose — ou retire — la date de reprise. C'est elle qui fait le statut. */
  onReprendre: (o: OperationAvecFonds, date: string | null) => void;
  /** Lettre — ou délettre — l'intérêt constaté sur le relevé bancaire. */
  onRapprocherInteret: (o: OperationAvecFonds, date: string | null) => void;
  /** SUPPRIME L'ORDRE ENTIER. Un prêt n'est pas un objet à part : c'est un
   *  ordre MTP augmenté, et le détacher de son ordre n'aurait aucun sens. */
  onSupprimer: (o: OperationAvecFonds) => void;
}) {
  const [tri, setTri] = useState<Tri<ColonnePret>>({ col: "date", desc: true });
  // DEUX CLICS POUR SUPPRIMER : il n'y a ici ni sélection ni corbeille, et le
  // geste emporte l'ordre MTP tout entier.
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  // LA REPRISE SE DATE. Les titres reviennent le jour où ils reviennent, et
  // c'est rarement celui où on le saisit : une reprise au 12 enregistrée le 20
  // faisait payer huit jours de prêt qui n'ont pas eu lieu. Le volet ne tient
  // qu'un prêt à la fois — on reprend l'un, puis l'autre.
  const [reprise, setReprise] = useState<{ id: string; date: string } | null>(null);

  const lignes = useMemo(() => {
    const prets = operations.filter((o) => o.pret !== null);
    const valeur = (o: OperationAvecFonds): string | number => {
      const p = o.pret!;
      switch (tri.col) {
        case "fonds":
          return o.fondsNom ?? "";
        case "contrepartie":
          return p.contrepartie ?? "";
        case "titre":
          return o.libelle || o.code || "";
        case "quantite":
          return o.quantite;
        case "taux":
          return p.tauxCommission;
        case "fin":
          return p.dateFin ?? "";
        case "statut":
          // EN COURS D'ABORD : c'est ce qui demande une action.
          return p.statut === "en_cours" ? 0 : 1;
        case "interet":
          return p.interetARecevoir;
        case "reprise":
          return p.dateReprise ?? "";
        default:
          return o.dateOperation;
      }
    };
    const signe = tri.desc ? -1 : 1;
    return [...prets].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "fr");
      // À valeur égale, la date départage, et toujours dans le même sens :
      // sans cela deux prêts du même fonds s'échangeraient à chaque rendu.
      return c !== 0 ? c * signe : -a.dateOperation.localeCompare(b.dateOperation);
    });
  }, [operations, tri]);

  const trierPar = (col: ColonnePret) =>
    setTri((p) => (p.col === col ? { col, desc: !p.desc } : { col, desc: col === "date" }));

  return (
    <Cadre
      titre="prêt de titres"
      videAide="Coche la case sur une opération MTP, dans l'onglet « Saisir un ordre »."
      explication="Un registre, pas un flux : prêter des titres ne déplace pas de cash au moment où le prêt se noue. L'INTÉRÊT, lui, rentre : calculé sur la valeur des titres prêtés, au taux du prêt, en base 360 — de la date du prêt à sa fin, ou à la reprise quand elle a eu lieu —, il se loge dans « Autres flux entrants » au point de trésorerie, et n'en sort qu'une fois constaté sur le relevé."
      vide={lignes.length === 0}
      enTetes={
        <>
          <EnTeteTri col="date" tri={tri} onTrier={trierPar}>
            Date
          </EnTeteTri>
          <EnTeteTri col="fonds" tri={tri} onTrier={trierPar}>
            Fonds
          </EnTeteTri>
          <EnTeteTri col="contrepartie" tri={tri} onTrier={trierPar}>
            Contrepartie
          </EnTeteTri>
          <EnTeteTri col="titre" tri={tri} onTrier={trierPar}>
            Titre
          </EnTeteTri>
          <EnTeteTri col="quantite" tri={tri} onTrier={trierPar} aDroite>
            Quantité
          </EnTeteTri>
          <EnTeteTri col="taux" tri={tri} onTrier={trierPar} aDroite>
            Taux prêt
          </EnTeteTri>
          <EnTeteTri col="fin" tri={tri} onTrier={trierPar}>
            Fin
          </EnTeteTri>
          <EnTeteTri col="statut" tri={tri} onTrier={trierPar}>
            Statut
          </EnTeteTri>
          <EnTeteTri col="interet" tri={tri} onTrier={trierPar} aDroite>
            Intérêt à recevoir
          </EnTeteTri>
          <EnTeteTri col="reprise" tri={tri} onTrier={trierPar}>
            Reprise
          </EnTeteTri>
          <th className="px-3 py-2" />
        </>
      }
    >
      {lignes.map((o) => {
        const p = o.pret!;
        const ouverte = reprise?.id === o.id;
        return (
          <Fragment key={o.id}>
          <tr className="hover:bg-slate-50">
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
            <td className={tdNum}>
              {montantFr(p.interetARecevoir)}
              {/* OU VA CET ARGENT, ET QUAND IL EN SORT. Tant qu'il n'est pas
                  constaté sur le relevé, l'intérêt pèse dans « Autres flux
                  entrants » au point de trésorerie. Une fois lettré, le solde
                  bancaire saisi le contient déjà : l'y laisser le compterait
                  deux fois. C'est un lettrage, pas une annulation — il se
                  défait. */}
              {p.interetARecevoir > 0 &&
                (p.interetRapprocheLe ? (
                  <button
                    type="button"
                    onClick={() => onRapprocherInteret(o, null)}
                    disabled={enCours}
                    className="block ml-auto text-[9px] text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                    title={`Intérêt constaté le ${p.interetRapprocheLe} — défaire`}
                  >
                    ✓ reçu le {dateFr(p.interetRapprocheLe)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onRapprocherInteret(o, new Date().toISOString().slice(0, 10))
                    }
                    disabled={enCours}
                    className="block ml-auto text-[9px] text-blue-700 hover:text-blue-900 disabled:opacity-50"
                    title="Constaté sur le relevé : sort des flux théoriques, le solde le contient déjà"
                  >
                    rapprocher
                  </button>
                ))}
            </td>
            <td className={td}>{dateFr(p.dateReprise)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {/* LA REPRISE SE FAIT ICI, pas au formulaire : la date est celle
                  du jour où les titres reviennent. « Rouvrir » la retire, pour
                  corriger une fausse manœuvre. */}
              {/* REPRENDRE OUVRE UN VOLET, il n'écrit plus tout seul : la
                  date de retour des titres se saisit, et l'intérêt la suit.
                  « Corriger » rouvre le même volet sur un prêt déjà repris —
                  une date fausse se rattrape sans avoir à tout défaire. */}
              <button
                type="button"
                onClick={() =>
                  setReprise(
                    ouverte
                      ? null
                      : {
                          id: o.id,
                          // Reprise déjà saisie : on la reprend telle quelle.
                          // Sinon le jour même, qui reste le cas courant.
                          date: p.dateReprise ?? new Date().toISOString().slice(0, 10),
                        },
                  )
                }
                disabled={enCours}
                className={`text-[11px] hover:underline disabled:opacity-50 mr-3 ${
                  p.statut === "en_cours"
                    ? "font-medium text-blue-700"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {ouverte
                  ? "Fermer"
                  : p.statut === "en_cours"
                    ? "Reprendre"
                    : "Corriger"}
              </button>
              {p.statut !== "en_cours" && (
                <button
                  type="button"
                  onClick={() => {
                    setReprise(null);
                    onReprendre(o, null);
                  }}
                  disabled={enCours}
                  className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-50 mr-3"
                  title="Retirer la reprise : le prêt redevient en cours"
                >
                  Rouvrir
                </button>
              )}
              <button
                type="button"
                onClick={() => onModifier(o)}
                disabled={enCours}
                className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-50 mr-3"
              >
                Modifier
              </button>
              {/* SUPPRIMER EMPORTE L'ORDRE, et avec lui le prêt : les deux ne
                  font qu'un. Pour garder la trace du mouvement de titres et
                  n'effacer que le prêt, c'est la case qu'il faut décocher au
                  formulaire. */}
              {aSupprimer === o.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setASupprimer(null);
                      onSupprimer(o);
                    }}
                    disabled={enCours}
                    className="text-[11px] font-medium text-rose-700 hover:underline disabled:opacity-50 mr-2"
                    title="Supprimer l'ordre et le prêt qu'il porte"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setASupprimer(null)}
                    disabled={enCours}
                    className="text-[11px] text-slate-500 hover:underline disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setASupprimer(o.id)}
                  disabled={enCours}
                  className="text-[11px] text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50"
                >
                  Supprimer
                </button>
              )}
            </td>
          </tr>

          {/* LE VOLET DE REPRISE. L'intérêt affiché est celui que la base
              recalculera : même fonction, mêmes jours, même base 360 — le
              gérant voit avant d'écrire ce que sa date coûte ou économise. */}
          {ouverte && reprise && (
            <tr className="bg-blue-50/50">
              <td colSpan={11} className="px-3 py-2">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      Date de reprise
                    </span>
                    <input
                      type="date"
                      value={reprise.date}
                      onChange={(ev) =>
                        setReprise({ id: o.id, date: ev.target.value })
                      }
                      className="text-xs border border-slate-300 rounded px-2 py-1.5 w-40 focus:border-blue-400 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">
                      prêté le {dateFr(o.dateOperation)} · fin prévue{" "}
                      {dateFr(p.dateFin)}
                    </span>
                  </label>

                  <div className="text-[11px] text-slate-600 mb-1.5">
                    Intérêt à recevoir{" "}
                    <span className="font-semibold tabular-nums text-slate-900">
                      {montantFr(
                        interetPret(o, { ...p, dateReprise: reprise.date }),
                      )}{" "}
                      F
                    </span>
                    {/* CE QUE LA DATE CHANGE, dit en clair : au terme prévu,
                        le prêt rapporte ceci ; repris plus tôt, cela. */}
                    <span className="block text-[9px] text-slate-400">
                      au terme prévu {montantFr(
                        interetPret(o, { ...p, dateReprise: null }),
                      )}{" "}
                      F
                    </span>
                  </div>

                  {/* UNE REPRISE AVANT LE PRET N'EN EST PAS UNE : l'intérêt
                      tomberait à zéro sans rien dire. On refuse d'écrire. */}
                  {reprise.date < o.dateOperation ? (
                    <p className="text-[11px] text-rose-700 mb-1.5">
                      Les titres ne peuvent pas revenir avant d&apos;être partis :
                      le prêt date du {dateFr(o.dateOperation)}.
                    </p>
                  ) : (
                    p.dateFin &&
                    reprise.date > p.dateFin && (
                      <p className="text-[11px] text-amber-700 mb-1.5">
                        Reprise après la fin prévue du {dateFr(p.dateFin)} :
                        l&apos;intérêt court jusqu&apos;à cette date.
                      </p>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const date = reprise.date;
                      setReprise(null);
                      onReprendre(o, date);
                    }}
                    disabled={
                      enCours || !reprise.date || reprise.date < o.dateOperation
                    }
                    className="mb-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
                  >
                    {p.statut === "en_cours"
                      ? "Enregistrer la reprise"
                      : "Corriger la reprise"}
                  </button>
                </div>
              </td>
            </tr>
          )}
          </Fragment>
        );
      })}
    </Cadre>
  );
}
