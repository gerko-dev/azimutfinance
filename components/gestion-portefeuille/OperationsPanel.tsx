"use client";

// === Opérations à réaliser ===
//
// Propositions issues des allocations validées. Rien n'est exécuté ici : le
// gérant arbitre, le comité valide.

import { useState, useTransition } from "react";

import { chargerOperationsAction } from "@/app/gestion-portefeuille/operations-actions";
import type { PlanOperations } from "@/app/gestion-portefeuille/operations-types";

/** Les deux marchés ne se traitent pas de la même façon — carnet d'ordres d'un
 *  côté, adjudication de l'autre — et ne se lisent pas ensemble. */
const VUES = ["Actions", "Obligations"] as const;

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt0.format(Math.round(v));
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt2.format(v * 100) + " %";
const pctSigne = (v: number | null) =>
  v === null || !Number.isFinite(v)
    ? "—"
    : (v > 0 ? "+" : "") + fmt2.format(v * 100) + " %";

/**
 * Points de base signés, colorés par le SENS ÉCONOMIQUE : vert quand
 * l'opération relève le portage de la poche, rouge quand elle l'abaisse.
 * Un impact sous un point de base est affiché « ≈ 0 » — le signe n'y a plus de
 * contenu, et un « +0 pb » vert donnerait le change.
 */
const bp = (v: number | null) => {
  if (v === null || !Number.isFinite(v)) return <span className="text-slate-400">—</span>;
  if (Math.abs(v) < 1) return <span className="text-slate-400 tabular-nums">≈ 0 pb</span>;
  return (
    <span
      className={`tabular-nums font-semibold ${v > 0 ? "text-emerald-700" : "text-rose-700"}`}
    >
      {(v > 0 ? "+" : "−") + fmt0.format(Math.abs(Math.round(v)))} pb
    </span>
  );
};

const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default function OperationsPanel({
  fundId,
  initialPlan,
  tresorerie,
}: {
  fundId: string;
  initialPlan: PlanOperations;
  /** Portée par le parent, arrêtée dans l'allocation par classe d'actif. Ce
   *  panneau la consomme sans la modifier : elle se décide en un seul endroit. */
  tresorerie: string;
}) {
  const [vue, setVue] = useState<(typeof VUES)[number]>("Actions");
  const [plan, setPlan] = useState(initialPlan);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  const tresorerieNum = Number(tresorerie.replace(/\s/g, "").replace(",", ".")) || 0;
  /** Trésorerie sur laquelle le plan affiché a réellement été calculé. Sans
   *  elle, un montant saisi mais non appliqué se lirait comme pris en compte. */
  const [tresorerieAppliquee, setTresorerieAppliquee] = useState(0);

  const appliquer = () =>
    start(async () => {
      const r = await chargerOperationsAction(fundId, tresorerieNum);
      if (r.ok) {
        setPlan(r.data);
        setTresorerieAppliquee(tresorerieNum);
        setErreur(null);
      } else setErreur(r.error);
    });

  const totalAchats = plan.achatsActions.reduce((s, o) => s + o.montant, 0);
  const totalVentes = plan.ventesActions.reduce((s, o) => s + o.montant, 0);
  const actions = vue === "Actions";

  // Les avertissements portent sur l'un ou l'autre marché : on ne montre que
  // ceux de la vue courante, sinon un message obligataire brouille la lecture
  // des actions.
  const avertissementsVue = plan.avertissements.filter((a) =>
    actions
      ? /cours indisponible|Aucun inventaire/i.test(a)
      : !/cours indisponible/i.test(a),
  );

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Opérations à réaliser</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              {actions
                ? "Déduites de l'allocation validée par titre. Le montant à réaliser de chaque valeur se convertit en quantité au cours de marché."
                : "Déduites de l'allocation validée par émetteur. Les cessions financent les souscriptions aux prochaines adjudications."}{" "}
              Inventaire du {dateFr(plan.dateInventaire)}. Propositions à arbitrer, rien
              n&apos;est exécuté.
            </p>
          </div>
        </div>

        {/* Trésorerie à investir — même hypothèse que dans l'allocation. */}
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label
              htmlFor="ops-tresorerie"
              className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1"
            >
              Trésorerie à investir
            </label>
            {/* En lecture seule : la trésorerie à investir se decide une fois,
                dans l'allocation validée par classe d'actif. Deux champs
                modifiables pour un meme montant, c'est deux montants
                contradictoires selon l'onglet ouvert. */}
            <div className="flex gap-1.5">
              <div
                id="ops-tresorerie"
                className="w-44 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-600 text-sm tabular-nums"
              >
                {fmt0.format(tresorerieNum)}
              </div>
              {tresorerieAppliquee !== tresorerieNum && (
                <button
                  type="button"
                  disabled={enCours}
                  onClick={appliquer}
                  className="px-2.5 rounded border border-amber-300 text-amber-700 text-xs hover:bg-amber-100 transition disabled:opacity-40"
                >
                  {enCours ? "Calcul…" : "Recalculer"}
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 pb-2 max-w-md">
            {tresorerieAppliquee !== tresorerieNum
              ? `Le plan affiché repose sur ${fmt0.format(tresorerieAppliquee)} FCFA — recalculez pour tenir compte du montant arrêté.`
              : tresorerieAppliquee > 0
                ? `Plan calculé avec ${fmt0.format(tresorerieAppliquee)} FCFA de trésorerie à placer. Montant arrêté dans l'allocation par classe d'actif.`
                : "Le plan ci-dessous arbitre à actif net constant. Saisissez la trésorerie à investir dans l'allocation validée par classe d'actif pour que les achats proposés la consomment."}
          </p>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-2">
            {erreur}
          </p>
        )}

        <div className="flex gap-1.5 flex-wrap mt-3 items-center">
          {VUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition ${
                v === vue
                  ? "bg-blue-50 text-blue-700 border border-blue-300"
                  : "text-slate-500 border border-slate-200 hover:text-slate-900 hover:border-slate-400"
              }`}
            >
              {v}
            </button>
          ))}

          {/* Export courtier : un lien, pas un fetch. Le navigateur reçoit le
              classeur en pièce jointe et le téléchargement porte le nom donné
              par le serveur, sans passer par un blob intermédiaire. Les DEUX
              feuilles sont remplies quelle que soit la vue affichée : le
              courtier reçoit un seul fichier. */}
          <a
            href={`/api/gestion-portefeuille/propositions?fund=${encodeURIComponent(fundId)}${
              tresorerieAppliquee > 0 ? `&tresorerie=${tresorerieAppliquee}` : ""
            }`}
            className="ml-auto px-3 py-1 rounded text-[11px] font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition"
            title="Classeur au format du modèle courtier : feuille Actions et feuille Obligations, achats à gauche, ventes à droite."
          >
            Exporter pour le courtier (.xlsx)
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {actions ? (
            <>
              <Tuile
                libelle="Achats"
                valeur={montant(totalAchats)}
                detail={`${plan.achatsActions.length} ligne(s)`}
              />
              <Tuile
                libelle="Ventes"
                valeur={montant(totalVentes)}
                detail={`${plan.ventesActions.length} ligne(s)`}
              />
            </>
          ) : (
            <>
              <Tuile
                libelle="Produit des cessions"
                valeur={montant(plan.produitCessions)}
                detail={`${plan.cessionsObligations.length} obligation(s)`}
              />
              <Tuile
                libelle="Réemployé en adjudication"
                valeur={montant(plan.montantSouscrit)}
                detail={`${plan.souscriptions.length} soumission(s)`}
              />
            </>
          )}
        </div>
      </div>

      {/* Portage de la poche obligataire — la décote dit ce que l'aller-retour
          coûte, le portage dit ce qu'il rapporte ensuite. */}
      {!actions && plan.rendementNaturel.avant !== null && (
        (() => {
          const r = plan.rendementNaturel;
          const gagne = (r.deltaBp ?? 0) >= 0;
          return (
            <div
              className={`rounded-lg border p-3 ${
                gagne ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    gagne ? "text-emerald-800" : "text-rose-800"
                  }`}
                >
                  Rendement naturel de la poche obligataire
                </h3>
                <p className="text-xs tabular-nums text-slate-700">
                  {pct(r.avant)} <span className="text-slate-400">→</span> {pct(r.apres)}
                  <span className="ml-2">{bp(r.deltaBp)}</span>
                </p>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                Portage encaissé sans rien faire : moyenne des rendements actuariels,
                pondérée par la valeur de marché. {gagne
                  ? "Le plan le préserve ou l'améliore."
                  : "Le plan gagne en décote mais perd en revenu — à arbitrer."}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Assiette : {r.lignesValorisees} ligne(s) sur {r.lignesTotal}
                {r.couverture !== null && ` — ${(r.couverture * 100).toFixed(0)} % de la poche`}
                {" · "}
                {montant(r.valeurAvant)} <span className="text-slate-400">→</span>{" "}
                {montant(r.valeurApres)} F
                {r.residuSecondOrdreBp !== null &&
                  Math.abs(r.residuSecondOrdreBp) >= 1 && (
                    <>
                      {" · "}somme des colonnes {fmt0.format(Math.round(r.sommeImpactsBp))} pb,
                      écart de convexité {fmt0.format(Math.round(r.residuSecondOrdreBp))} pb
                    </>
                  )}
              </p>
            </div>
          );
        })()
      )}

      {/* Convergence vers l'allocation cible — la question que le plan doit
          trancher : ces opérations referment-elles l'écart ? */}
      {(() => {
        const axe = actions ? "action" : "obligation";
        const postes = plan.convergence.postes.filter((p) => p.axe === axe);
        if (postes.length === 0) return null;
        const besoin = postes.reduce((s, p) => s + Math.abs(p.vise), 0);
        const couvert = postes.reduce((s, p) => s + Math.abs(p.couvert), 0);
        const ouverts = postes.filter((p) => p.motif !== null);
        const taux = besoin > 0 ? couvert / besoin : null;
        const complet = ouverts.length === 0;
        return (
          <div
            className={`rounded-lg border p-3 ${
              complet ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3
                className={`text-xs font-semibold uppercase tracking-wider ${
                  complet ? "text-emerald-800" : "text-amber-800"
                }`}
              >
                Convergence vers l&apos;allocation cible
              </h3>
              <p className="text-xs text-slate-600 tabular-nums">
                {montant(couvert)} couverts sur {montant(besoin)}
                {taux !== null && ` — ${(taux * 100).toFixed(1)} %`}
              </p>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {complet
                ? "Toutes les lignes à bouger sont couvertes par les opérations proposées."
                : `${ouverts.length} poste(s) restent hors cible après application du plan.`}
            </p>
            {ouverts.length > 0 && (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-[11px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Poste</th>
                      <th className="text-right py-1 px-2 font-medium">Visé</th>
                      <th className="text-right py-1 px-2 font-medium">Couvert</th>
                      <th className="text-right py-1 px-2 font-medium">Résiduel</th>
                      <th className="text-left py-1 pl-2 font-medium">Motif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/60">
                    {ouverts.map((p) => (
                      <tr key={`${p.axe}-${p.poste}`}>
                        <td className="py-1 pr-3 text-slate-800 font-medium">{p.poste}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-slate-600">
                          {montant(p.vise)}
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums text-slate-600">
                          {montant(p.couvert)}
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums text-amber-800 font-semibold">
                          {montant(p.residuel)}
                        </td>
                        <td className="py-1 pl-2 text-slate-500">{p.motif}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Contrôle de décote — propre à l'arbitrage obligataire */}
      {!actions &&
        (plan.decoteCessionMoyenne !== null || plan.decoteAchatMoyenne !== null) && (
        <div
          className={`rounded-lg border p-3 ${
            plan.arbitrageValide
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <span className="font-semibold text-slate-800">Contrôle de décote</span>
            <span className="text-slate-600">
              Cession{" "}
              <b className="tabular-nums">{pct(plan.decoteCessionMoyenne)}</b>
            </span>
            <span className="text-slate-600">
              Achat <b className="tabular-nums">{pct(plan.decoteAchatMoyenne)}</b>
            </span>
            <span
              className={`font-semibold ${
                plan.arbitrageValide ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {plan.arbitrageValide
                ? "Décote d'achat supérieure : l'arbitrage crée de la valeur"
                : "Décote d'achat insuffisante : l'arbitrage détruit de la valeur"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            On cède au prix le plus proche du nominal possible, et on souscrit au prix
            le plus décoté possible. L&apos;écart entre les deux décotes est le gain
            de l&apos;opération ; s&apos;il s&apos;inverse, chaque rotation appauvrit
            le fonds.
          </p>
        </div>
      )}

      {avertissementsVue.length > 0 && (
        <div className="space-y-1.5">
          {avertissementsVue.map((a) => (
            <p
              key={a}
              className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
            >
              {a}
            </p>
          ))}
        </div>
      )}

      {actions && (
        <>
          <BlocActions
            titre="Achats"
            couleur="FF067A4B"
            operations={plan.achatsActions}
            vide="Aucun achat proposé : les allocations par titre sont respectées."
          />
          <BlocActions
            titre="Ventes"
            couleur="FFC0303B"
            operations={plan.ventesActions}
            vide="Aucune vente proposée."
          />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <span className="text-slate-500">Prix optimal</span> = dernier cours ± 1 %,
            vers le haut à l&apos;achat et vers le bas à la vente : le carnet BRVM est
            peu profond et un ordre au cours exact reste souvent non exécuté. Les
            quantités sont arrondies à la baisse et les ventes plafonnées à la quantité
            détenue.
          </p>
        </>
      )}

      {!actions && (
        <>
      {/* OBLIGATIONS — cessions */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Obligations — cessions
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Classées par rendement croissant : on cède d&apos;abord ce qui rapporte le
            moins, en conservant les signatures rémunératrices.
          </p>
        </div>
        {plan.cessionsObligations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">
            Aucune cession proposée : aucun émetteur n&apos;est en surpondération.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Titre</th>
                  <th className="text-left px-3 py-2 font-medium">Poste</th>
                  <th className="text-right px-3 py-2 font-medium">Rendement</th>
                  <th className="text-right px-3 py-2 font-medium">Coupon</th>
                  <th className="text-right px-3 py-2 font-medium">Maturité</th>
                  <th className="text-right px-3 py-2 font-medium">Détenu</th>
                  <th className="text-right px-3 py-2 font-medium">Quantité</th>
                  <th className="text-right px-3 py-2 font-medium">Prix cession</th>
                  <th className="text-right px-3 py-2 font-medium">Décote</th>
                  <th className="text-right px-3 py-2 font-medium">Produit</th>
                  <th className="text-right px-3 py-2 font-medium">Impact portage</th>
                  <th className="text-left px-3 py-2 font-medium">Réserve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {plan.cessionsObligations.map((c, i) => (
                  <tr key={`${c.code}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className="font-mono text-slate-800">{c.code}</span>
                      <span className="block text-[10px] text-slate-500">{c.libelle}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{c.poste}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-semibold">
                      {pct(c.rendement)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {pct(c.couponRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {c.maturiteResiduelle === null
                        ? "—"
                        : `${fmt2.format(c.maturiteResiduelle)} ans`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {fmt0.format(Math.round(c.quantiteDetenue))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">
                      {fmt0.format(c.quantite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {montant(c.prixCession)}
                      <span className="block text-[9px] text-slate-500">
                        {c.sourcePrix}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {pct(c.decoteCession)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700 font-semibold">
                      {montant(c.produitNet)}
                    </td>
                    <td className="px-3 py-2 text-right">{bp(c.impactRendementBp)}</td>
                    <td className="px-3 py-2 text-amber-600">{c.reserve ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* OBLIGATIONS — souscriptions */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Obligations — souscriptions en adjudication
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Emploi du produit des cessions sur les États à renforcer. Le prix proposé
            part du prix marginal observé et garantit une décote supérieure à celle
            des cessions.
          </p>
        </div>
        {plan.souscriptions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">
            Aucune souscription proposée : aucun État n&apos;est en sous-pondération.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">État</th>
                  <th className="text-right px-3 py-2 font-medium">Maturité</th>
                  <th className="text-right px-3 py-2 font-medium">Résiduel</th>
                  <th className="text-right px-3 py-2 font-medium">Prix de référence</th>
                  <th className="text-right px-3 py-2 font-medium">Prix proposé</th>
                  <th className="text-right px-3 py-2 font-medium">Décote achat</th>
                  <th className="text-right px-3 py-2 font-medium">Rendement attendu</th>
                  <th className="text-right px-3 py-2 font-medium">Quantité</th>
                  <th className="text-right px-3 py-2 font-medium">Montant</th>
                  <th className="text-right px-3 py-2 font-medium">Impact portage</th>
                  <th className="text-left px-3 py-2 font-medium">Méthode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {plan.souscriptions.map((s, i) => (
                  <tr key={`${s.etat}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800 font-medium">{s.etat}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {s.maturiteMois ? `${s.maturiteMois} mois` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {s.residuelMois > 0 ? `${s.residuelMois.toFixed(1)} mois` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {montant(s.prixMarginalObserve)}
                      {s.sourcePrixReference === "observe" ? (
                        <span className="block text-[10px] text-slate-400">
                          observé, {s.ageObservation} j
                        </span>
                      ) : (
                        <span
                          className="block text-[10px] text-amber-600"
                          title="Aucune adjudication de ce ténor depuis plus de 45 jours : prix reconstruit sur la courbe de l'État. Erreur médiane au backtest : 65 F contre 28 F pour une observation fraîche."
                          >
                          estimé (courbe)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">
                      {montant(s.prixPropose)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {pct(s.decoteAchat)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {pct(s.rendementAttendu)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">
                      {fmt0.format(s.quantite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">
                      {montant(s.montant)}
                    </td>
                    <td className="px-3 py-2 text-right">{bp(s.impactRendementBp)}</td>
                    <td className="px-3 py-2 text-slate-500 text-[10px] max-w-md">
                      {s.methode}
                      {s.reserve && (
                        <span className="block text-amber-600 mt-0.5">{s.reserve}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        <span className="text-slate-500">Rendement</span> = taux actuariel au prix de
        cession, calculé par bissection ; à défaut, coupon rapporté au prix.{" "}
        <span className="text-slate-500">Décote</span> = 1 − prix ÷ nominal en vigueur,
        amortissements déduits. Les quantités sont arrondies à la baisse et les
        cessions plafonnées à la quantité détenue.
      </p>
        </>
      )}
    </div>
  );
}

function BlocActions({
  titre,
  couleur,
  operations,
  vide,
}: {
  titre: string;
  couleur: string;
  operations: PlanOperations["achatsActions"];
  vide: string;
}) {
  const total = operations.reduce((s, o) => s + o.montant, 0);
  const achat = couleur === "FF067A4B";
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
        <h3
          className={`text-xs font-semibold uppercase tracking-wider ${
            achat ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {titre}
        </h3>
        {operations.length > 0 && (
          <span className="text-xs tabular-nums text-slate-600">
            {operations.length} ligne(s) · {montant(total)}
          </span>
        )}
      </div>
      {operations.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 text-center">{vide}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Titre</th>
                <th className="text-left px-3 py-2 font-medium">Secteur</th>
                <th className="text-right px-3 py-2 font-medium">Détenu</th>
                <th className="text-right px-3 py-2 font-medium">Dernier cours</th>
                <th className="text-right px-3 py-2 font-medium">Prix optimal</th>
                <th className="text-right px-3 py-2 font-medium">Quantité</th>
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-right px-3 py-2 font-medium">Écart d&apos;alloc.</th>
                <th className="text-left px-3 py-2 font-medium">Réserve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {operations.map((o, i) => (
                <tr key={`${o.code}-${i}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-mono text-slate-800">{o.code}</span>
                    <span className="block text-[10px] text-slate-500">{o.libelle}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{o.secteur}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {fmt0.format(Math.round(o.quantiteDetenue))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {montant(o.cours)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">
                    {montant(o.prixOptimal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold">
                    {fmt0.format(o.quantite)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      achat ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {montant(o.montant)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {pctSigne(o.ecart)}
                  </td>
                  <td className="px-3 py-2 text-amber-600">{o.reserve ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold text-slate-600">
              <tr>
                <td className="px-3 py-2" colSpan={6}>
                  Total
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    achat ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {montant(total)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
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
