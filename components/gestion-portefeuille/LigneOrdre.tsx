"use client";

// === Une ligne d'ordre, et son formulaire d'exécution ===
//
// LA QUANTITÉ SERVIE SE SAISIT SUR LA LIGNE DE L'ORDRE, pas dans le formulaire
// du haut. Exécuter n'est pas corriger : on ne rouvre pas la saisie d'un ordre
// pour dire qu'il a été servi, on l'enregistre en face de lui, avec sa date.
//
// Chaque exécution porte SA date, donc SA date de dénouement : un ordre servi
// en trois fois se règle en trois fois, à trois dates.

import { useState } from "react";

import {
  DESCRIPTIONS,
  LIBELLES_ETAT,
  dateDenouement,
  dateLimiteOrdre,
  montantExecution,
  type EtatOrdre,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import {
  conventionDe,
  type ParametresMarche,
} from "@/app/gestion-portefeuille/parametres-marche-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

export default function LigneOrdre({
  o,
  servie,
  reste,
  etat,
  ouvert,
  enCours,
  parametres,
  onBasculer,
  onModifier,
  onSupprimer,
  onExecuter,
  onSupprimerExecution,
}: {
  o: OperationAvecFonds;
  servie: number;
  reste: number;
  etat: EtatOrdre;
  ouvert: boolean;
  enCours: boolean;
  parametres: ParametresMarche;
  onBasculer: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
  onExecuter: (s: {
    dateExecution: string;
    dateDenouement: string;
    quantite: number;
    prix: number;
  }) => void;
  onSupprimerExecution: (id: string) => void;
}) {
  const [dateExecution, setDateExecution] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  // Sur les titres publics, un ordre est servi en totalité : la quantité est
  // proposée d'office plutôt que laissée à retaper.
  const [quantite, setQuantite] = useState(o.instrument === "mtp" ? String(reste) : "");
  const [denouementManuel, setDenouementManuel] = useState<string | null>(null);
  // Pré-rempli au prix de l'ordre, qui est le cas le plus fréquent sur un
  // ordre au marché. Il reste modifiable : un ordre à cours limité est rarement
  // servi au centime près à sa limite.
  const [prix, setPrix] = useState(String(o.prix));

  const calcule = dateDenouement(dateExecution, conventionDe(parametres, o.instrument));
  const denouement = denouementManuel ?? calcule;
  const q = Number(quantite.replace(/\s/g, "").replace(",", ".")) || 0;
  const p = Number(prix.replace(/\s/g, "").replace(",", ".")) || 0;
  const montantSaisi = montantExecution(o, { quantite: q, prix: p });

  const couleurEtat =
    etat === "realise"
      ? "text-emerald-700"
      : etat === "perime"
        ? "text-slate-400"
        : etat === "partiel"
          ? "text-amber-700"
          : "text-slate-700";

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{o.dateOperation}</td>
        <td className="px-3 py-1.5">{o.fondsNom}</td>
        <td className="px-3 py-1.5 whitespace-nowrap">
          {DESCRIPTIONS.find((d) => d.valeur === o.description)?.libelle ?? o.description}
        </td>
        <td className="px-3 py-1.5">
          {o.libelle || o.code || "—"}
          {o.code && o.libelle && <span className="text-slate-400 ml-1">({o.code})</span>}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">{fmt0.format(o.quantite)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {/* LE COMPTEUR. Il s'actualise avec les exécutions et c'est lui, et
              lui seul, qui définit l'état : un statut saisi à la main aurait
              fini par dire l'inverse des quantités. */}
          {fmt0.format(servie)} / {fmt0.format(o.quantite)}
          {reste > 0 && servie > 0 && (
            <span className="block text-[9px] text-amber-700">
              reste {fmt0.format(reste)}
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap">
          <span className={couleurEtat}>{LIBELLES_ETAT[etat]}</span>
          {/* La date de péremption d'un ordre encore vivant : c'est elle qui
              décide de sa sortie du point de trésorerie. */}
          {reste > 0 && etat !== "perime" && (
            <span className="block text-[9px] text-slate-400">
              jusqu&apos;au {dateLimiteOrdre(o)}
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
          {montantFr(o.montant)}
        </td>
        <td className="px-3 py-1.5 text-slate-600">{o.compteReglement}</td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">
          {reste > 0 && (
            <button
              onClick={onBasculer}
              disabled={enCours}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 disabled:opacity-50 mr-3"
            >
              {ouvert ? "Fermer" : "Exécuter"}
            </button>
          )}
          <button
            onClick={onModifier}
            disabled={enCours}
            className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-3"
          >
            Modifier
          </button>
          <button
            onClick={onSupprimer}
            disabled={enCours}
            className="text-[10px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            Supprimer
          </button>
        </td>
      </tr>

      {/* Les exécutions déjà enregistrées, avec leur date de règlement. */}
      {o.executions.length > 0 && (
        <tr className="bg-slate-50/60">
          <td colSpan={10} className="px-3 py-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
              {o.executions.map((e) => (
                <span key={e.id} className="tabular-nums">
                  {fmt0.format(e.quantite)} servis à{" "}
                  {fmt0.format(e.prix > 0 ? e.prix : o.prix)} le {e.dateExecution} ·
                  règlement{" "}
                  {e.dateDenouement} · {montantFr(montantExecution(o, e))} F
                  <button
                    onClick={() => onSupprimerExecution(e.id)}
                    disabled={enCours}
                    className="ml-1.5 text-rose-600 hover:text-rose-800 disabled:opacity-50"
                    title="Retirer cette exécution"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}

      {ouvert && (
        <tr className="bg-emerald-50/50">
          <td colSpan={10} className="px-3 py-2">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className={etiquette}>Quantité servie</span>
                <input
                  value={quantite}
                  onChange={(e) => setQuantite(e.target.value)}
                  inputMode="numeric"
                  disabled={o.instrument === "mtp"}
                  className={`${champ} w-32 text-right tabular-nums disabled:bg-slate-100`}
                />
                <span className={aide}>
                  {o.instrument === "mtp"
                    ? "Servi en totalité ou pas du tout"
                    : `Maximum ${fmt0.format(reste)}`}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Prix d&apos;exécution</span>
                <input
                  value={prix}
                  onChange={(e) => setPrix(e.target.value)}
                  inputMode="numeric"
                  className={`${champ} w-32 text-right tabular-nums`}
                />
                <span className={aide}>
                  {p !== o.prix
                    ? `ordonné à ${fmt0.format(o.prix)}`
                    : "prix de l'ordre"}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Date d&apos;exécution</span>
                <input
                  type="date"
                  value={dateExecution}
                  onChange={(e) => {
                    setDateExecution(e.target.value);
                    setDenouementManuel(null);
                  }}
                  className={`${champ} w-40`}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Dénouement</span>
                <input
                  type="date"
                  value={denouement}
                  onChange={(e) => setDenouementManuel(e.target.value)}
                  className={`${champ} w-40`}
                />
                <span className={aide}>
                  calculé depuis la date d&apos;exécution
                  {denouementManuel && denouementManuel !== calcule && " · forcé"}
                </span>
              </label>

              <div className="text-[11px] text-slate-600 mb-1.5">
                Montant{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {montantFr(montantSaisi)} F
                </span>
              </div>

              <button
                onClick={() =>
                  onExecuter({
                    dateExecution,
                    dateDenouement: denouement,
                    quantite: q,
                    prix: p,
                  })
                }
                disabled={enCours || q <= 0 || p <= 0}
                className="mb-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-50"
              >
                Enregistrer l&apos;exécution
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
