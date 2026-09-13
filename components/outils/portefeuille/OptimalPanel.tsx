"use client";

import { useState } from "react";
import type { Optimisation } from "@/lib/comptetitre/optimisation";

type Props = { optimisation: Optimisation };

function fmtFcfa(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null, dec = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

function fmtNum(v: number | null, dec = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtJours(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v < 1) return "< 1 séance";
  return `${Math.ceil(v).toLocaleString("fr-FR")} séance${Math.ceil(v) > 1 ? "s" : ""}`;
}

function fmtHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sens de lecture d'un ecart : un rendement qui monte est une bonne nouvelle,
 * une volatilite qui monte non. La couleur suit ce sens, pas le signe.
 */
function Delta({
  avant,
  apres,
  format,
  mieux,
}: {
  avant: number | null;
  apres: number | null;
  format: (v: number | null) => string;
  mieux: "haut" | "bas";
}) {
  if (avant === null || apres === null) return <span className="text-slate-400">—</span>;
  const ecart = apres - avant;
  if (Math.abs(ecart) < 1e-9) return <span className="text-slate-400">inchangé</span>;
  const favorable = mieux === "haut" ? ecart > 0 : ecart < 0;
  return (
    <span className={favorable ? "text-emerald-700" : "text-rose-600"}>
      {ecart > 0 ? "+" : "−"}
      {format(Math.abs(ecart))}
    </span>
  );
}

/**
 * Deux lectures d'un meme plan, et non un filtre d'affichage.
 *
 * « Ordres » est le bordereau a transmettre a la SGI : seules les lignes qui
 * bougent. « Allocation cible » est le portefeuille vise une fois les ordres
 * passes, lignes conservees comprises — celles que la bande de non-negociation
 * laisse en place n'ont pas d'ordre, mais elles ont bien un poids, et sans elles
 * les parts affichees ne sommeraient pas a cent.
 */
type Vue = "ordres" | "cible";

export default function OptimalPanel({ optimisation: o }: Props) {
  const [vue, setVue] = useState<Vue>("ordres");

  const lignes = vue === "ordres" ? o.lignes.filter((l) => l.quantite !== 0) : o.lignes;
  const achats = o.lignes.filter((l) => l.quantite > 0);
  const ventes = o.lignes.filter((l) => l.quantite < 0);
  const totalAchats = achats.reduce((s, l) => s + l.montantOrdre, 0);
  const totalVentes = ventes.reduce((s, l) => s + Math.abs(l.montantOrdre), 0);
  // Le plafond se mesure sur le portefeuille TOTAL, poche obligataire comprise,
  // et non sur le seul budget optimise : c'est bien « 5 % de mon portefeuille ».
  const partTresorerie =
    o.totalPortefeuille > 0 ? (o.residuel / o.totalPortefeuille) * 100 : 0;

  if (o.budget <= 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
        Rien à optimiser : le compte ne porte ni action ni trésorerie
        disponible.
      </div>
    );
  }

  const comparaison = [
    {
      l: "Rentabilité espérée",
      avant: o.avant.rendement,
      apres: o.apres.rendement,
      f: (v: number | null) => fmtPct(v),
      mieux: "haut" as const,
    },
    {
      l: "Volatilité annualisée",
      avant: o.avant.volatilite,
      apres: o.apres.volatilite,
      f: (v: number | null) => fmtPct(v),
      mieux: "bas" as const,
    },
    {
      l: "VaR 95 % à 1 an",
      avant: o.avant.var95,
      apres: o.apres.var95,
      f: (v: number | null) => fmtFcfa(v),
      mieux: "bas" as const,
    },
    {
      l: "Ratio de Sharpe",
      avant: o.avant.sharpe,
      apres: o.apres.sharpe,
      f: (v: number | null) => fmtNum(v, 3),
      mieux: "haut" as const,
    },
    {
      l: "Bêta",
      avant: o.avant.beta,
      apres: o.apres.beta,
      f: (v: number | null) => fmtNum(v),
      mieux: "bas" as const,
    },
    {
      l: "Part non investie",
      avant: o.avant.partLiquide,
      apres: o.apres.partLiquide,
      f: (v: number | null) => fmtPct(v),
      mieux: "bas" as const,
    },
  ];

  return (
    <div className="space-y-4">
      {/* --- Budget ----------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <span className="text-[11px] text-slate-500">Budget optimisable </span>
          <span className="text-base font-semibold tabular-nums">
            {fmtFcfa(o.budget)} FCFA
          </span>
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          actions {fmtFcfa(o.montantActions)} + trésorerie{" "}
          <span className="text-slate-900 font-medium">{fmtFcfa(o.liquidites)}</span>
        </div>
        <div className="ml-auto text-[11px] text-slate-400">
          cours du {fmtHeure(o.calculeLe)}
        </div>
      </div>

      {/* --- Avant / après --------------------------------------------- */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <h3 className="px-4 py-2.5 text-sm font-semibold border-b border-slate-200 bg-slate-50">
          Portefeuille actuel · portefeuille optimal
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Indicateur</th>
                <th className="px-3 py-2 text-right font-medium">Actuel</th>
                <th className="px-3 py-2 text-right font-medium">Optimal</th>
                <th className="px-4 py-2 text-right font-medium">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparaison.map((c) => (
                <tr key={c.l}>
                  <td className="px-4 py-2 text-slate-700">{c.l}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {c.f(c.avant)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {c.f(c.apres)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    <Delta avant={c.avant} apres={c.apres} format={c.f} mieux={c.mieux} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Coût de mise en oeuvre ------------------------------------ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            l: "Achats à passer",
            v: fmtFcfa(totalAchats),
            s: `${achats.length} ligne${achats.length > 1 ? "s" : ""}`,
          },
          {
            l: "Ventes à passer",
            v: fmtFcfa(totalVentes),
            s: `${ventes.length} ligne${ventes.length > 1 ? "s" : ""}`,
          },
          {
            l: "Frais de mise en œuvre",
            v: fmtFcfa(o.fraisTotaux),
            s: `${fmtPct((o.fraisTotaux / o.budget) * 100, 2)} du budget`,
          },
          {
            l: "Trésorerie restante",
            v: fmtFcfa(o.residuel),
            s: `${fmtPct(partTresorerie, 2)} du portefeuille · plafond 5 %`,
            alerte: o.tresorerieExcessive,
          },
          {
            l: "Délai d'exécution",
            v: fmtJours(o.joursExecution),
            s: `ligne la plus lente · horizon ${o.horizonSeances} séances`,
          },
        ].map((k) => (
          <div
            key={k.l}
            className={`bg-white border rounded-lg px-3.5 py-3 ${
              "alerte" in k && k.alerte
                ? "border-amber-300 bg-amber-50/50"
                : "border-slate-200"
            }`}
          >
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="text-lg font-semibold tabular-nums mt-0.5">{k.v}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>

      {/* --- Ordres ----------------------------------------------------- */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {vue === "ordres" ? "Ordres à passer" : "Allocation cible"}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {vue === "ordres"
                ? "Le bordereau à transmettre : uniquement les lignes qui bougent."
                : "L'allocation complète, lignes conservées et lignes hors budget comprises."}
            </p>
          </div>
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs">
            {(
              [
                ["ordres", `Ordres (${o.lignes.filter((l) => l.quantite !== 0).length})`],
                ["cible", `Allocation cible (${o.lignes.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setVue(id)}
                aria-pressed={vue === id}
                className={`px-3 py-1.5 transition ${
                  vue === id
                    ? "bg-blue-600 text-white font-medium"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Actif</th>
                <th className="px-2 py-2 text-center font-medium">Sens</th>
                <th className="px-2 py-2 text-right font-medium">Quantité</th>
                <th className="px-2 py-2 text-right font-medium">Cours</th>
                <th className="px-2 py-2 text-right font-medium">Montant</th>
                <th className="px-2 py-2 text-right font-medium">Frais</th>
                <th className="px-2 py-2 text-right font-medium">Exécution</th>
                <th className="px-2 py-2 text-right font-medium">Part actuelle</th>
                <th className="px-2 py-2 text-right font-medium">Part cible</th>
                <th className="px-2 py-2 text-right font-medium">Valo cible</th>
                <th className="px-2 py-2 text-right font-medium">Rdt attendu</th>
                <th className="px-2 py-2 text-right font-medium">Volatilité</th>
                <th className="px-3 py-2 text-right font-medium">Bêta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.map((l) => (
                <tr key={l.code} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.code}</span>
                    {l.horsUnivers && (
                      <span className="ml-1.5 text-[9px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1 py-px rounded">
                        hors univers
                      </span>
                    )}
                    {l.nonAtteignable && (
                      <span
                        title="Visée par l'allocation, mais une seule action coûte déjà plus que la part à y consacrer"
                        className="ml-1.5 text-[9px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1 py-px rounded"
                      >
                        hors budget
                      </span>
                    )}
                    {l.plafonne && !l.horsUnivers && (
                      <span
                        title="Cible ou ordre limité par la liquidité du marché"
                        className="ml-1.5 text-[9px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1 py-px rounded"
                      >
                        liquidité
                      </span>
                    )}
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                      {l.nom}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {l.quantite > 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        Achat
                      </span>
                    )}
                    {l.quantite < 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">
                        Vente
                      </span>
                    )}
                    {l.quantite === 0 && <span className="text-slate-300">—</span>}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums font-medium ${
                      l.quantite > 0
                        ? "text-emerald-700"
                        : l.quantite < 0
                          ? "text-rose-600"
                          : "text-slate-400"
                    }`}
                  >
                    {l.quantite === 0 ? "—" : fmtFcfa(Math.abs(l.quantite))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.cours)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {l.quantite === 0 ? "—" : fmtFcfa(Math.abs(l.montantOrdre))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {l.quantite === 0 ? "—" : fmtFcfa(l.frais)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">
                    {l.quantite === 0 ? "—" : fmtJours(l.joursExecution)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {fmtPct(l.poidsActuel, 1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">
                    {fmtPct(l.poidsCible, 1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtFcfa(l.valeurCible)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {l.horsUnivers ? "—" : fmtPct(l.rendementAttendu)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {l.horsUnivers ? "—" : fmtPct(l.volatilite, 1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.horsUnivers ? "—" : fmtNum(l.beta)}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    {vue === "ordres"
                      ? "Le portefeuille est déjà à l'allocation optimale : aucun ordre à passer."
                      : "Aucune ligne à afficher."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs leading-relaxed text-slate-500 space-y-1.5">
        <p>
          Univers : {o.universeTaille} valeurs de la cote BRVM cotant assez
          régulièrement sur les trois dernières années et dotées d&apos;un volume
          moyen exploitable, soit {o.observations} observations hebdomadaires
          communes ({o.ecartes} valeurs écartées). Toute la trésorerie est
          investie ; seuls l&apos;arrondi au titre entier et la capacité du
          marché laissent un résidu. L&apos;optimisation porte sur la poche
          actions et la trésorerie, la poche obligataire n&apos;étant pas touchée.
        </p>
        {o.tresorerieExcessive && (
          <p className="text-amber-700">
            Trésorerie résiduelle à {fmtPct(partTresorerie, 1)} du portefeuille,
            au-delà des 5 % visés :{" "}
            {o.marcheSature
              ? "la cote n'absorbe pas davantage, même en étalant les achats sur " +
                `${o.horizonSeances} séances.`
              : "le minimum de courtage dépasse le montant restant, aucun ordre supplémentaire n'est finançable."}
          </p>
        )}
        {o.plafonnees > 0 && !o.tresorerieExcessive && (
          <p className="text-amber-700">
            {o.plafonnees} ligne{o.plafonnees > 1 ? "s ont" : " a"} été limitée
            {o.plafonnees > 1 ? "s" : ""} par la liquidité du marché : la cible
            théorique y serait plus élevée, mais inexécutable sans déplacer le
            cours.
          </p>
        )}
        {o.varianceMinimale && (
          <p className="text-amber-700">
            Aucune valeur n&apos;offre de prime de risque positive au taux sans
            risque en vigueur : la cible affichée est le portefeuille de
            volatilité minimale, et non celui de Sharpe maximal.
          </p>
        )}
        {o.lignes.some((l) => l.horsUnivers) && (
          <p className="text-amber-700">
            Les lignes marquées « hors univers » sont détenues mais ne cotent pas
            assez régulièrement pour entrer dans l&apos;optimisation : leur cible
            est nulle.
          </p>
        )}
      </div>
    </div>
  );
}
