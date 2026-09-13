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

const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default function OperationsPanel({
  fundId,
  initialPlan,
  tresorerie,
  onTresorerie,
}: {
  fundId: string;
  initialPlan: PlanOperations;
  /** Portée par le parent, partagée avec l'onglet Allocation validée. */
  tresorerie: string;
  onTresorerie: (v: string) => void;
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
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Opérations à réaliser</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
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
            <div className="flex gap-1.5">
              <input
                id="ops-tresorerie"
                value={tresorerie}
                onChange={(e) => onTresorerie(e.target.value)}
                inputMode="decimal"
                className="w-44 px-2 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-100 text-sm"
              />
              <button
                type="button"
                disabled={enCours}
                onClick={appliquer}
                className="px-2.5 rounded border border-slate-600 text-slate-300 text-xs hover:bg-slate-700 transition disabled:opacity-40"
              >
                {enCours ? "Calcul…" : "Appliquer"}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 pb-2 max-w-md">
            {tresorerieAppliquee > 0
              ? `Plan calculé avec ${fmt0.format(tresorerieAppliquee)} FCFA de trésorerie à placer.`
              : "Le plan ci-dessous arbitre à actif net constant. Saisissez un montant et appliquez pour que les achats proposés le consomment."}
          </p>
        </div>

        {erreur && (
          <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded px-3 py-2 mt-2">
            {erreur}
          </p>
        )}

        <div className="flex gap-1.5 flex-wrap mt-3">
          {VUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition ${
                v === vue
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "text-slate-400 border border-slate-700 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {v}
            </button>
          ))}
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

      {/* Contrôle de décote — propre à l'arbitrage obligataire */}
      {!actions &&
        (plan.decoteCessionMoyenne !== null || plan.decoteAchatMoyenne !== null) && (
        <div
          className={`rounded-lg border p-3 ${
            plan.arbitrageValide
              ? "border-emerald-800/60 bg-emerald-950/30"
              : "border-rose-800/60 bg-rose-950/30"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <span className="font-semibold text-slate-200">Contrôle de décote</span>
            <span className="text-slate-300">
              Cession{" "}
              <b className="tabular-nums">{pct(plan.decoteCessionMoyenne)}</b>
            </span>
            <span className="text-slate-300">
              Achat <b className="tabular-nums">{pct(plan.decoteAchatMoyenne)}</b>
            </span>
            <span
              className={`font-semibold ${
                plan.arbitrageValide ? "text-emerald-400" : "text-rose-400"
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
              className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2"
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
            <span className="text-slate-400">Prix optimal</span> = dernier cours ± 1 %,
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
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300">
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
              <thead className="bg-slate-900/60 text-slate-400">
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
                  <th className="text-left px-3 py-2 font-medium">Réserve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {plan.cessionsObligations.map((c, i) => (
                  <tr key={`${c.code}-${i}`} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <span className="font-mono text-slate-200">{c.code}</span>
                      <span className="block text-[10px] text-slate-500">{c.libelle}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{c.poste}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300 font-semibold">
                      {pct(c.rendement)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {pct(c.couponRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {c.maturiteResiduelle === null
                        ? "—"
                        : `${fmt2.format(c.maturiteResiduelle)} ans`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {fmt0.format(Math.round(c.quantiteDetenue))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white font-semibold">
                      {fmt0.format(c.quantite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                      {montant(c.prixCession)}
                      <span className="block text-[9px] text-slate-500">
                        {c.sourcePrix}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {pct(c.decoteCession)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300 font-semibold">
                      {montant(c.produitNet)}
                    </td>
                    <td className="px-3 py-2 text-amber-400/80">{c.reserve ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* OBLIGATIONS — souscriptions */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
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
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">État</th>
                  <th className="text-right px-3 py-2 font-medium">Maturité</th>
                  <th className="text-right px-3 py-2 font-medium">Prix marginal observé</th>
                  <th className="text-right px-3 py-2 font-medium">Prix proposé</th>
                  <th className="text-right px-3 py-2 font-medium">Décote achat</th>
                  <th className="text-right px-3 py-2 font-medium">Rendement attendu</th>
                  <th className="text-right px-3 py-2 font-medium">Quantité</th>
                  <th className="text-right px-3 py-2 font-medium">Montant</th>
                  <th className="text-left px-3 py-2 font-medium">Méthode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {plan.souscriptions.map((s, i) => (
                  <tr key={`${s.etat}-${i}`} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-200 font-medium">{s.etat}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {s.maturiteMois ? `${s.maturiteMois} mois` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {montant(s.prixMarginalObserve)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white font-semibold">
                      {montant(s.prixPropose)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {pct(s.decoteAchat)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {pct(s.rendementAttendu)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white font-semibold">
                      {fmt0.format(s.quantite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300 font-semibold">
                      {montant(s.montant)}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-[10px] max-w-md">
                      {s.methode}
                      {s.reserve && (
                        <span className="block text-amber-400/80 mt-0.5">{s.reserve}</span>
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
        <span className="text-slate-400">Rendement</span> = taux actuariel au prix de
        cession, calculé par bissection ; à défaut, coupon rapporté au prix.{" "}
        <span className="text-slate-400">Décote</span> = 1 − prix ÷ nominal en vigueur,
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
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between gap-3">
        <h3
          className={`text-xs font-semibold uppercase tracking-wider ${
            achat ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {titre}
        </h3>
        {operations.length > 0 && (
          <span className="text-xs tabular-nums text-slate-300">
            {operations.length} ligne(s) · {montant(total)}
          </span>
        )}
      </div>
      {operations.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 text-center">{vide}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 text-slate-400">
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
            <tbody className="divide-y divide-slate-700/60">
              {operations.map((o, i) => (
                <tr key={`${o.code}-${i}`} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <span className="font-mono text-slate-200">{o.code}</span>
                    <span className="block text-[10px] text-slate-500">{o.libelle}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{o.secteur}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {fmt0.format(Math.round(o.quantiteDetenue))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {montant(o.cours)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white font-semibold">
                    {montant(o.prixOptimal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white font-semibold">
                    {fmt0.format(o.quantite)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      achat ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {montant(o.montant)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {pctSigne(o.ecart)}
                  </td>
                  <td className="px-3 py-2 text-amber-400/80">{o.reserve ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900/60 font-semibold text-slate-300">
              <tr>
                <td className="px-3 py-2" colSpan={6}>
                  Total
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    achat ? "text-emerald-300" : "text-rose-300"
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
    <div className="bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{libelle}</div>
      <div className="text-sm text-slate-200 mt-0.5 tabular-nums">{valeur}</div>
      {detail && <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>}
    </div>
  );
}
