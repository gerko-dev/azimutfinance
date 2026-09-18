"use client";

// === Proposition d'allocation ===
//
// Le modèle propose, le comité dispose. Rien n'est exécuté ici, et rien n'est
// enregistré : les paramètres se règlent, la proposition se recalcule.

import { useState, useTransition } from "react";

import { chargerPropositionAction } from "@/app/gestion-portefeuille/proposition-actions";
import {
  LIBELLE_METHODE,
  METHODES,
  type MethodeCible,
} from "@/app/gestion-portefeuille/anticipation-types";
import {
  EXPLICATION_OPTIMISATION,
  LIBELLE_OPTIMISATION,
  METHODES_OPTIMISATION,
  SEMAINES_PAR_AN,
  type MethodeOptimisation,
  type LigneProposition,
  type Origine,
  type TableauProposition,
} from "@/app/gestion-portefeuille/proposition-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montantFr = (v: number) =>
  Number.isFinite(v) ? fmt0.format(Math.round(v)) : "—";
const pct = (v: number, d = 2) =>
  Number.isFinite(v) ? `${fmt2.format(v * 100)} %`.replace(/,00 %/, d === 0 ? " %" : ",00 %") : "—";
const pctSigne = (v: number) =>
  !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${fmt2.format(v * 100)} %`;
const nb2 = (v: number) => (Number.isFinite(v) ? fmt2.format(v) : "—");

const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

/** Saisie d'un pourcentage ANNUEL, convertie en taux hebdomadaire.
 *
 *  Le modèle raisonne en semaines ; le gérant raisonne en années. Mélanger les
 *  deux — un taux sans risque annuel face à un rendement de marché
 *  hebdomadaire — produit une prime de marché négative et inverse tout le
 *  classement. La conversion se fait donc ici, une fois. */
const hebdoVersAnnuel = (taux: number) =>
  (Math.pow(1 + taux, SEMAINES_PAR_AN) - 1) * 100;

const versNombre = (s: string) =>
  Number(s.replace(/\s/g, "").replace(/ /g, "").replace(",", ".")) || 0;

export default function PropositionPanel({
  fundId,
  tresorerie,
  initial,
}: {
  fundId: string;
  initial: TableauProposition;
  /** Arrêtée dans l'allocation validée par classe d'actif : elle entre dans
   *  l'actif net sur lequel la cible de la poche actions s'applique. */
  tresorerie: string;
}) {
  const [tableau, setTableau] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  // Quatre hypotheses sur cinq ne se saisissent plus : elles sont DEDUITES, et
  // se lisent dans `tableau.parametres`. Les garder dans un etat local aurait
  // laisse l'ecran afficher une valeur que le calcul n'utilise pas.
  const [objectif, setObjectif] = useState(
    fmt2.format(initial.parametres.rentabiliteMinimale * 100),
  );
  const [methode, setMethode] = useState<MethodeOptimisation>(initial.parametres.methode);
  const [valorisation, setValorisation] = useState<MethodeCible>(
    initial.parametres.methodeValorisation,
  );

  const [recherche, setRecherche] = useState("");
  const [secteur, setSecteur] = useState("");
  const [retenuesSeules, setRetenuesSeules] = useState(false);

  const recalculer = () =>
    start(async () => {
      const r = await chargerPropositionAction(
        fundId,
        {
          rentabiliteMinimale: versNombre(objectif) / 100,
          methode,
          methodeValorisation: valorisation,
        },
        versNombre(tresorerie),
      );
      if (r.ok) {
        setTableau(r.data);
        setErreur(null);
      } else setErreur(r.error);
    });

  const secteurs = [...new Set(tableau.lignes.map((l) => l.secteur))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  const q = recherche.trim().toLowerCase();
  const lignes = tableau.lignes.filter((l) => {
    if (retenuesSeules && l.part <= 0.0001) return false;
    if (secteur && l.secteur !== secteur) return false;
    if (q && !`${l.code} ${l.libelle}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const achats = tableau.lignes.filter((l) => l.ecartMontant > 0);
  const ventes = tableau.lignes.filter((l) => l.ecartMontant < 0);
  const totalAchats = achats.reduce((s, l) => s + l.ecartMontant, 0);
  const totalVentes = ventes.reduce((s, l) => s + l.ecartMontant, 0);

  return (
    <div className="space-y-4">
      {/* Paramètres */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900">Proposition d&apos;allocation</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-4xl">
          Optimisation moyenne-variance de la poche actions : le modèle cherche la
          combinaison qui maximise la rentabilité espérée par unité de risque, sans
          qu&apos;aucune ligne dépasse le plafond fixé. Rendements attendus par le MEDAF,
          risques estimés sur {tableau.periodes} semaines de cotation. Cours et détention
          au {dateFr(tableau.dateReference)}.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
          <Lecture
            label="Montant à investir"
            valeur={`${fmt0.format(Math.round(tableau.parametres.montant))} FCFA`}
            origine={tableau.origines.montant}
          />
          <Lecture
            label="Taux sans risque"
            valeur={`${fmt2.format(hebdoVersAnnuel(tableau.parametres.tauxSansRisque))} % / an`}
            origine={tableau.origines.tauxSansRisque}
          />
          <Lecture
            label="Rendement du marché"
            valeur={`${fmt2.format(hebdoVersAnnuel(tableau.parametres.rendementMarche))} % / an`}
            origine={tableau.origines.rendementMarche}
          />
          <Lecture
            label="Part maximale par action"
            valeur={`${fmt2.format(tableau.parametres.partMax * 100)} %`}
            origine={tableau.origines.partMax}
          />
          <Champ label="Rentabilité minimale" suffixe="% / an" value={objectif} onChange={setObjectif} />
        </div>

        {/* Choix du modèle. Placé au-dessus des hypothèses : il décide de ce
            que signifient les rendements attendus, donc de tout le reste. */}
        <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-slate-200">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Rendements attendus
            </span>
            <select
              value={methode}
              onChange={(e) => setMethode(e.target.value as MethodeOptimisation)}
              className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm"
            >
              {METHODES_OPTIMISATION.map((m) => (
                <option key={m} value={m}>
                  {LIBELLE_OPTIMISATION[m]}
                </option>
              ))}
            </select>
          </label>

          {methode !== "medaf" && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Méthode de valorisation
              </span>
              <select
                value={valorisation}
                onChange={(e) => setValorisation(e.target.value as MethodeCible)}
                className="px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm"
              >
                {METHODES.map((m) => (
                  <option key={m} value={m}>
                    {LIBELLE_METHODE[m]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="text-[11px] text-slate-500 pb-1.5 max-w-xl leading-relaxed">
            {EXPLICATION_OPTIMISATION[methode]}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={recalculer}
            disabled={enCours}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-slate-900 text-xs transition disabled:opacity-40"
          >
            {enCours ? "Optimisation…" : "Recalculer"}
          </button>
          <span className="text-[11px] text-slate-500">
            Seule la rentabilité minimale se saisit : les quatre autres hypothèses
            viennent de l&apos;allocation validée, de la BCEAO, du BRVM Composite et
            des paramètres du fonds. Elles se corrigent à leur source.
          </span>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          <Tuile
            libelle="Rentabilité espérée"
            valeur={pct(tableau.rentabiliteEsperee)}
            detail={`${fmt2.format(tableau.rentabiliteAnnualisee * 100)} % annualisés`}
          />
          <Tuile libelle="Bêta du portefeuille" valeur={nb2(tableau.betaPortefeuille)} />
          <Tuile
            libelle="Volatilité"
            valeur={pct(tableau.volatilitePortefeuille)}
            detail="par semaine"
          />
          <Tuile
            libelle={`VaR ${tableau.parametres.horizonVaR} j`}
            valeur={montantFr(tableau.varPortefeuille)}
            detail={`${fmt2.format(tableau.parametres.confianceVaR * 100)} % de confiance`}
          />
          <Tuile
            libelle="Lignes retenues"
            valeur={`${tableau.lignes.filter((l) => l.part > 0.0001).length} / ${tableau.lignes.length}`}
            detail={`plafond ${fmt2.format(tableau.parametres.partMax * 100)} %`}
          />
        </div>
      </div>

      {tableau.avertissements.length > 0 && (
        <div className="space-y-1.5">
          {tableau.avertissements.map((a) => (
            <p
              key={a}
              className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
            >
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Bilan des ordres */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tuile
          libelle="Achats proposés"
          valeur={montantFr(totalAchats)}
          detail={`${achats.length} ligne(s)`}
        />
        <Tuile
          libelle="Ventes proposées"
          valeur={montantFr(Math.abs(totalVentes))}
          detail={`${ventes.length} ligne(s)`}
        />
        <Tuile
          libelle="Poche actions actuelle"
          valeur={montantFr(tableau.valorisationActuelle)}
          detail={`cible ${montantFr(tableau.montantAlloue)}`}
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="prop-recherche"
            className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1"
          >
            Rechercher
          </label>
          <input
            id="prop-recherche"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Code ou nom"
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs w-44"
          />
        </div>
        <div>
          <label
            htmlFor="prop-secteur"
            className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1"
          >
            Secteur
          </label>
          <select
            id="prop-secteur"
            value={secteur}
            onChange={(e) => setSecteur(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs w-56"
          >
            <option value="">Tous les secteurs</option>
            {secteurs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-500 pb-1.5">
          <input
            type="checkbox"
            checked={retenuesSeules}
            onChange={(e) => setRetenuesSeules(e.target.checked)}
            className="accent-blue-500"
          />
          Lignes retenues seulement
        </label>
        <span className="text-[11px] text-slate-500 pb-1.5">
          {lignes.length} / {tableau.lignes.length} valeur(s)
        </span>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium">Symbole</th>
                <th className="px-3 py-2 text-left font-medium">Titre</th>
                <th className="px-3 py-2 text-left font-medium">Secteur</th>
                <th className="px-3 py-2 text-right font-medium">Bêta</th>
                <th className="px-3 py-2 text-right font-medium">Rendement attendu</th>
                <th className="px-3 py-2 text-right font-medium">Volatilité</th>
                <th className="px-3 py-2 text-right font-medium">Part</th>
                <th className="px-3 py-2 text-right font-medium">Cours</th>
                <th className="px-3 py-2 text-right font-medium">Montant</th>
                <th className="px-3 py-2 text-right font-medium">Nombre</th>
                <th className="px-3 py-2 text-right font-medium">Détenu</th>
                <th className="px-3 py-2 text-right font-medium">Achat (+) / Vente (−)</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <Ligne key={l.code} l={l} />
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                    Aucune valeur ne correspond aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed max-w-4xl">
        Une proposition n&apos;est pas une prévision : elle dit quelle répartition aurait
        été la meilleure SI les rendements et les risques futurs ressemblaient à ceux de
        la fenêtre d&apos;estimation. Le plafond par ligne n&apos;est pas un détail — sans
        lui, l&apos;optimisateur concentre l&apos;essentiel sur deux ou trois valeurs et le
        portefeuille devient intenable à la revente.
      </p>
    </div>
  );
}

function Ligne({ l }: { l: LigneProposition }) {
  const retenue = l.part > 0.0001;
  return (
    <tr
      className={`border-b border-slate-200 last:border-0 ${
        retenue ? "" : "opacity-50"
      }`}
    >
      <td className="px-3 py-2 font-mono text-slate-800">{l.code}</td>
      <td className="px-3 py-2 text-slate-600">{l.libelle}</td>
      <td className="px-3 py-2 text-slate-500 text-[11px]">{l.secteur}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{nb2(l.beta)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
        {pct(l.rendementAttendu)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(l.volatilite)}</td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${
          retenue ? "text-blue-700 font-medium" : "text-slate-600"
        }`}
      >
        {pct(l.part)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{montantFr(l.cours)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-800">{montantFr(l.montant)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{montantFr(l.nombre)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
        {montantFr(l.nombreDetenu)}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums font-medium ${
          l.ecartNombre > 0
            ? "text-emerald-600"
            : l.ecartNombre < 0
              ? "text-rose-600"
              : "text-slate-600"
        }`}
        title={`${pctSigne(l.ecartMontant / (l.valorisationDetenue || l.montant || 1))} en montant`}
      >
        {l.ecartNombre === 0 ? "—" : `${l.ecartNombre > 0 ? "+" : ""}${fmt0.format(l.ecartNombre)}`}
      </td>
    </tr>
  );
}

/**
 * Hypothèse déduite : la valeur, et d'où elle vient.
 *
 * Grisée et non saisissable. La provenance n'est pas décorative — sans elle, un
 * montant qui tombe du ciel invite à le corriger ici, ce qui est précisément ce
 * qu'on cherche à empêcher : il se corrige à sa source, sinon deux écrans
 * finissent par ne plus dire la même chose.
 */
function Lecture({
  label,
  valeur,
  origine,
}: {
  label: string;
  valeur: string;
  origine: Origine;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div
        className={`px-2 py-1.5 rounded border text-sm tabular-nums ${
          origine.manquante
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
        title={origine.detail ? `${origine.source} — ${origine.detail}` : origine.source}
      >
        {valeur}
      </div>
      <span
        className={`text-[10px] leading-tight ${
          origine.manquante ? "text-amber-700" : "text-slate-400"
        }`}
      >
        {origine.source}
        {origine.detail ? ` · ${origine.detail}` : ""}
      </span>
    </div>
  );
}

function Champ({
  label,
  suffixe,
  value,
  onChange,
}: {
  label: string;
  suffixe: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm tabular-nums"
        />
        <span className="text-[10px] text-slate-500 whitespace-nowrap">{suffixe}</span>
      </div>
    </label>
  );
}

function Tuile({
  libelle,
  valeur,
  detail,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{libelle}</div>
      <div className="text-sm text-slate-800 mt-0.5 tabular-nums">{valeur}</div>
      {detail && <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>}
    </div>
  );
}
