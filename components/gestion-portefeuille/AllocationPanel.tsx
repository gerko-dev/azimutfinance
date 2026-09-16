"use client";

// === Allocation validée ===
//
// Reprend la logique de la feuille « Allocations validées » du fichier de suivi
// NFD : la cible arrêtée en comité, confrontée au portefeuille réel, produit
// l'opération à réaliser et son montant.
//
// Le tableau arrive calculé du serveur ; ce composant n'est client que pour la
// saisie des cibles et le recalcul après enregistrement.

import { Fragment, useState, useTransition } from "react";

import {
  chargerAllocationAction,
  enregistrerCiblesAction,
} from "@/app/gestion-portefeuille/allocation-actions";
import {
  AXES,
  controlerGroupes,
  LIBELLE_AXE,
  TOLERANCE_ALLOCATION,
  type AxeAllocation,
  type TableauAllocation,
} from "@/app/gestion-portefeuille/allocation-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) => (v === null ? "—" : fmt0.format(Math.round(v)));
const pct = (v: number | null) => (v === null ? "—" : fmt2.format(v * 100) + " %");
const montantSigne = (v: number | null) =>
  v === null ? "—" : (v > 0 ? "+" : "") + fmt0.format(Math.round(v));

const couleur = (v: number | null) =>
  v === null || Math.abs(v) < 1e-9
    ? "text-slate-400"
    : v > 0
      ? "text-emerald-400"
      : "text-rose-400";

const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

/** Saisie en pourcentage (35,5) convertie en décimal (0,355). */
function versDecimal(saisie: string): number | null {
  const s = saisie.trim().replace(/\s/g, "").replace(",", ".").replace("%", "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : null;
}

export default function AllocationPanel({
  fundId,
  initialAllocation,
  tresorerie,
  onTresorerie,
}: {
  fundId: string;
  initialAllocation: TableauAllocation;
  /** Portée par le parent : l'onglet Opérations raisonne sur le même montant. */
  tresorerie: string;
  onTresorerie: (v: string) => void;
}) {
  const [tableau, setTableau] = useState(initialAllocation);
  const [axe, setAxe] = useState<AxeAllocation>(initialAllocation.dimension);
  const [edition, setEdition] = useState(false);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, start] = useTransition();
  /** N'afficher que les postes décidés ou détenus : l'univers complet des
   *  actions cotées dépasse la quarantaine de lignes. */
  const [filtrer, setFiltrer] = useState(true);
  /** Poste dont on affiche les positions : « ce montant, il vient d'où ? ». */
  const [deplie, setDeplie] = useState<string | null>(null);

  const tresorerieNum = () =>
    Number(tresorerie.replace(/\s/g, "").replace(",", ".")) || 0;

  const changerAxe = (a: AxeAllocation) =>
    start(async () => {
      const r = await chargerAllocationAction(fundId, a, tresorerieNum());
      if (r.ok) {
        setTableau(r.data);
        setAxe(a);
        setEdition(false);
        setMessage(null);
      } else setMessage({ type: "erreur", texte: r.error });
    });

  const ouvrirEdition = () => {
    const init: Record<string, string> = {};
    for (const l of tableau.lignes) {
      init[l.bucket] =
        l.allocationValidee === null ? "" : fmt2.format(l.allocationValidee * 100);
    }
    setSaisies(init);
    setMessage(null);
    setEdition(true);
  };

  const sommeSaisie = Object.values(saisies).reduce(
    (s, v) => s + (versDecimal(v) ?? 0),
    0,
  );

  const recharger = (tresorerieDecimal: number) =>
    start(async () => {
      const r = await chargerAllocationAction(fundId, axe, tresorerieDecimal);
      if (r.ok) setTableau(r.data);
      else setMessage({ type: "erreur", texte: r.error });
    });

  const enregistrer = () =>
    start(async () => {
      const cibles = Object.entries(saisies)
        .map(([bucket, v]) => ({ bucket, cible: versDecimal(v) }))
        .filter((c): c is { bucket: string; cible: number } => c.cible !== null);

      const r = await enregistrerCiblesAction(fundId, cibles, { dimension: axe });
      if (!r.ok) {
        setMessage({ type: "erreur", texte: r.error });
        return;
      }
      const t = await chargerAllocationAction(fundId, axe, tresorerieNum());
      if (t.ok) setTableau(t.data);
      setEdition(false);
      setMessage({ type: "ok", texte: "Allocation validée enregistrée." });
    });

  // Contrôle de conformité avec l'axe supérieur, recalculé à chaque frappe :
  // le gérant voit l'écart se résorber au lieu de le découvrir au refus.
  const controles = (() => {
    if (!tableau.axeGroupe || Object.keys(tableau.ciblesGroupe).length === 0) return [];
    const groupeDuBucket = new Map(
      tableau.lignes.filter((l) => l.groupe).map((l) => [l.bucket, l.groupe as string]),
    );
    const saisiesOuEnregistre = edition
      ? Object.entries(saisies)
          .map(([bucket, v]) => ({ bucket, cible: versDecimal(v) }))
          .filter((c): c is { bucket: string; cible: number } => c.cible !== null)
      : tableau.lignes
          .filter((l) => l.allocationValidee !== null)
          .map((l) => ({ bucket: l.bucket, cible: l.allocationValidee as number }));
    return controlerGroupes(saisiesOuEnregistre, groupeDuBucket, tableau.ciblesGroupe);
  })();
  const nonConformes = controles.filter((c) => !c.conforme);

  const aDesCibles = tableau.lignes.some((l) => l.allocationValidee !== null);
  const parControle = new Map(controles.map((c) => [c.groupe, c]));
  /** Nombre de colonnes du tableau, pour les lignes de regroupement. */
  const nbColonnes = 10 + (tableau.classeParente ? 1 : 0);
  // En édition, tout l'univers est visible : on ne peut pas cibler un titre
  // qu'on ne voit pas.
  const lignesVisibles =
    edition || !filtrer
      ? tableau.lignes
      : tableau.lignes.filter((l) => l.allocationValidee !== null || l.detenu);
  const masquees = tableau.lignes.length - lignesVisibles.length;

  /** Lignes regroupées par secteur sur l'axe des titres : c'est au niveau du
   *  secteur que se fait la vérification, le regroupement doit donc être
   *  visible et pas seulement calculé. Un seul groupe anonyme sur les autres
   *  axes, où il n'y a rien à regrouper. */
  const groupes: { cle: string | null; lignes: typeof lignesVisibles }[] = (() => {
    if (tableau.dimension !== "action_titre") {
      return [{ cle: null, lignes: lignesVisibles }];
    }
    const m = new Map<string, typeof lignesVisibles>();
    for (const l of lignesVisibles) {
      const g = l.groupe ?? "Non classé";
      const arr = m.get(g);
      if (arr) arr.push(l);
      else m.set(g, [l]);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "fr"))
      .map(([cle, lignes]) => ({
        cle,
        // À l'intérieur d'un secteur, le plus gros d'abord.
        lignes: [...lignes].sort(
          (x, y) =>
            (y.allocationValidee ?? 0) - (x.allocationValidee ?? 0) ||
            y.valeurActuelle - x.valeurActuelle ||
            x.libelle.localeCompare(y.libelle, "fr"),
        ),
      }));
  })();

  return (
    <div className="space-y-4">
      {/* Bandeau de contexte */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Allocation validée</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              La cible arrêtée en comité, confrontée au portefeuille réel. L&apos;écart
              produit l&apos;opération à réaliser et son montant.{" "}
              {tableau.classeParente
                ? "Les allocations de cet axe se lisent en part de leur poche, pas de l'actif net."
                : "Les allocations se lisent en part de l'actif net."}
            </p>
          </div>
          {!edition && (
            <button
              type="button"
              onClick={ouvrirEdition}
              className="px-3 py-1.5 rounded-md bg-blue-500 text-white text-xs font-semibold hover:bg-blue-400 transition"
            >
              {aDesCibles ? "Modifier les cibles" : "Saisir les cibles"}
            </button>
          )}
        </div>

        {/* Axes d'allocation */}
        <div className="flex gap-1.5 flex-wrap mt-3">
          {AXES.map((a) => {
            const actif = a === axe;
            return (
              <button
                key={a}
                type="button"
                disabled={enCours}
                onClick={() => changerAxe(a)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition disabled:opacity-50 ${
                  actif
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-slate-400 border border-slate-700 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                {LIBELLE_AXE[a]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Tuile
            libelle={tableau.classeParente ? "Poche allouée" : "Actif net"}
            valeur={montant(tableau.assiette)}
            detail={
              tableau.classeParente
                ? `${pct(tableau.actifNet > 0 ? tableau.assiette / tableau.actifNet : 0)} de l'actif net`
                : undefined
            }
          />
          <Tuile
            libelle="Inventaire courant"
            valeur={dateFr(tableau.dateActuelle)}
            detail={
              tableau.datePrecedente
                ? `précédent : ${dateFr(tableau.datePrecedente)}`
                : "aucun inventaire antérieur"
            }
          />
          <Tuile
            libelle="Somme des cibles"
            valeur={aDesCibles ? pct(tableau.sommeCibles) : "—"}
            alerte={aDesCibles && Math.abs(tableau.sommeCibles - 1) > 0.0001}
          />
          {/* La trésorerie à investir ne se saisit QUE sur l'axe des classes
              d'actif. C'est là qu'elle se décide : le comité arrête d'abord
              combien va aux actions, aux obligations, aux OPC, et cette
              répartition dimensionne ensuite chaque sous-axe — un sous-axe
              alloue l'intérieur de sa poche, il n'a pas à redire combien
              d'argent frais entre dans le fonds. La laisser modifiable partout
              invitait à saisir deux montants contradictoires selon l'onglet
              ouvert. */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Trésorerie à investir
            </label>
            {axe === "classe" ? (
              <>
                <div className="flex gap-1.5">
                  <input
                    value={tresorerie}
                    onChange={(e) => onTresorerie(e.target.value)}
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-100 text-sm"
                  />
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      recharger(Number(tresorerie.replace(/\s/g, "").replace(",", ".")) || 0)
                    }
                    className="px-2.5 rounded border border-slate-600 text-slate-300 text-xs hover:bg-slate-700 transition disabled:opacity-40"
                  >
                    Appliquer
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  S&apos;ajoute à l&apos;actif net pour les valeurs cibles, et
                  irrigue les autres axes au prorata des cibles arrêtées ici.
                </p>
              </>
            ) : (
              <>
                <div className="px-2 py-1.5 rounded border border-slate-700 bg-slate-900/60 text-slate-300 text-sm tabular-nums">
                  {montant(tableau.tresorerieAInvestir)}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Se saisit dans l&apos;allocation{" "}
                  <span className="text-slate-400">par classe d&apos;actif</span>.
                  Cet axe en reçoit la part correspondant à la cible de sa classe.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {tableau.avertissements.length > 0 && (
        <div className="space-y-1.5">
          {tableau.avertissements.map((a) => (
            <p
              key={a}
              className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2"
            >
              {a}
            </p>
          ))}
        </div>
      )}

      {message && (
        <p
          aria-live="polite"
          className={`text-xs rounded px-3 py-2 border ${
            message.type === "ok"
              ? "text-emerald-300 bg-emerald-950/40 border-emerald-800/60"
              : "text-rose-300 bg-rose-950/40 border-rose-800/60"
          }`}
        >
          {message.texte}
        </p>
      )}

      {/* Conformité avec l'allocation sectorielle */}
      {controles.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Conformité à l&apos;allocation sectorielle
            </h3>
            <span
              className={`text-[11px] font-semibold ${
                nonConformes.length === 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {nonConformes.length === 0
                ? "Conforme"
                : `${nonConformes.length} secteur(s) en écart`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Secteur</th>
                  <th className="text-right px-3 py-2 font-medium">Somme des titres</th>
                  <th className="text-right px-3 py-2 font-medium">Allocation secteur</th>
                  <th className="text-right px-3 py-2 font-medium">Écart</th>
                  <th className="text-left px-3 py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {controles.map((c) => (
                  <tr key={c.groupe}>
                    <td className="px-3 py-1.5 text-slate-300">{c.groupe}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
                      {pct(c.sommeTitres)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
                      {c.cibleGroupe === null ? "—" : pct(c.cibleGroupe)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        c.ecart === null
                          ? "text-slate-500"
                          : Math.abs(c.ecart) <= TOLERANCE_ALLOCATION
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }`}
                    >
                      {c.ecart === null
                        ? "—"
                        : (c.ecart > 0 ? "+" : "") + fmt2.format(c.ecart * 100) + " pt"}
                    </td>
                    <td className="px-3 py-1.5">
                      {c.cibleGroupe === null ? (
                        <span className="text-slate-500">
                          secteur non alloué — la somme des titres n&apos;est pas contrainte
                        </span>
                      ) : c.conforme ? (
                        <span className="text-emerald-400">conforme</span>
                      ) : (
                        <span className="text-rose-400">
                          {(c.ecart ?? 0) > 0 ? "dépassement" : "manque"} à corriger
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        {masquees > 0 && !edition && (
          <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              {masquees} poste(s) de l&apos;univers masqué(s) : ni cible ni position.
            </span>
            <button
              type="button"
              onClick={() => setFiltrer((f) => !f)}
              className="text-[11px] text-blue-300 hover:text-blue-200 transition"
            >
              {filtrer ? "Afficher tout l'univers" : "Masquer les postes vides"}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">
                  {LIBELLE_AXE[tableau.dimension]}
                </th>
                <th className="text-right px-3 py-2.5 font-medium">Valeur précédente</th>
                <th className="text-right px-3 py-2.5 font-medium">Alloc. précédente</th>
                <th className="text-right px-3 py-2.5 font-medium">Valeur actuelle</th>
                <th className="text-right px-3 py-2.5 font-medium">
                  Alloc. actuelle
                  {tableau.classeParente && (
                    <span className="block text-[9px] font-normal text-slate-500">
                      de la poche
                    </span>
                  )}
                </th>
                {tableau.classeParente && (
                  <th className="text-right px-3 py-2.5 font-medium">
                    % actif net
                  </th>
                )}
                <th className="text-right px-3 py-2.5 font-medium">Alloc. validée</th>
                <th className="text-right px-3 py-2.5 font-medium">TRO</th>
                <th className="text-left px-3 py-2.5 font-medium">Opération à réaliser</th>
                <th className="text-right px-3 py-2.5 font-medium">Valeur cible</th>
                <th className="text-right px-3 py-2.5 font-medium">
                  Montant à réaliser
                  <span className="block text-[9px] font-normal text-slate-500">
                    + achat / − vente
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {groupes.map((g) => (
                <Fragment key={g.cle ?? "__tout__"}>
                  {g.cle !== null && (
                    <GroupeSecteur
                      secteur={g.cle}
                      controle={parControle.get(g.cle) ?? null}
                      nbTitres={g.lignes.length}
                      nbColonnes={nbColonnes}
                    />
                  )}
                  {g.lignes.map((l) => (
                <Fragment key={l.bucket}>
                <tr
                  className={`hover:bg-slate-800/40 ${l.detenu ? "" : "opacity-70"}`}
                >
                  <td className="px-3 py-2">
                    {l.positions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDeplie(deplie === l.bucket ? null : l.bucket)}
                        title={`Voir les ${l.positions.length} ligne(s) de ce poste`}
                        className="text-slate-200 hover:text-white transition text-left"
                      >
                        <span className="text-slate-500 mr-1.5 inline-block w-2">
                          {deplie === l.bucket ? "▾" : "▸"}
                        </span>
                        {l.libelle}
                        <span className="text-slate-500 ml-1.5">
                          ({l.positions.length})
                        </span>
                      </button>
                    ) : (
                      <span className="text-slate-200">{l.libelle}</span>
                    )}
                    {/* « Non détenu » qualifie un poste de l'univers de marché
                        que le fonds n'a pas en portefeuille. La liquidité n'est
                        pas de cette nature : c'est le solde du fonds, qui existe
                        toujours — un fonds sans espèces en a zéro, il ne « ne
                        détient pas » de la trésorerie. Le badge y était un
                        contresens. */}
                    {!l.detenu && l.bucket !== "tresorerie" && (
                      <span
                        title="Poste de l'univers de marché non détenu par le fonds"
                        className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-400"
                      >
                        non détenu
                      </span>
                    )}
                    {l.detail && (
                      <span className="block text-[10px] text-slate-500">{l.detail}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {montant(l.valeurPrecedente)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {pct(l.allocationPrecedente)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                    {montant(l.valeurActuelle)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                    {pct(l.allocationActuelle)}
                  </td>
                  {tableau.classeParente && (
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {pct(l.allocationActifNet)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {edition ? (
                      <input
                        value={saisies[l.bucket] ?? ""}
                        onChange={(e) =>
                          setSaisies((s) => ({ ...s, [l.bucket]: e.target.value }))
                        }
                        placeholder="—"
                        inputMode="decimal"
                        className="w-20 px-1.5 py-1 rounded border border-slate-600 bg-slate-900 text-slate-100 text-right text-xs"
                      />
                    ) : (
                      <span className="text-white font-semibold">
                        {pct(l.allocationValidee)}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${couleur(l.tro)}`}>
                    {l.tro === null ? "—" : pct(l.tro)}
                  </td>
                  <td className={`px-3 py-2 ${couleur(l.ecart)}`}>{l.operation ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {montant(l.valeurCible)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${couleur(l.montantARealiser)}`}
                  >
                    {montantSigne(l.montantARealiser)}
                  </td>
                </tr>
                {deplie === l.bucket && (
                  <tr className="bg-slate-900/50">
                    <td colSpan={nbColonnes} className="px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
                        {l.positions.length} ligne(s) d&apos;inventaire sous ce poste
                      </div>
                      <ul className="space-y-0.5">
                        {l.positions.map((p, j) => (
                          <li
                            key={`${p.code}-${j}`}
                            className="flex items-baseline justify-between gap-4 text-[11px]"
                          >
                            <span>
                              <span className="font-mono text-slate-300">{p.code}</span>
                              {p.libelle && (
                                <span className="text-slate-500 ml-2">{p.libelle}</span>
                              )}
                            </span>
                            <span className="tabular-nums text-slate-300 shrink-0">
                              {montant(p.valorisation)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
                </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-slate-900/60 text-slate-300 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {montant(tableau.assiettePrecedente)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {tableau.assiettePrecedente ? "100,00 %" : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {montant(tableau.assiette)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {tableau.assiette > 0 ? "100,00 %" : "—"}
                </td>
                {tableau.classeParente && (
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {pct(tableau.actifNet > 0 ? tableau.assiette / tableau.actifNet : 0)}
                  </td>
                )}
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    edition
                      ? Math.abs(sommeSaisie - 1) > 0.001
                        ? "text-rose-400"
                        : "text-emerald-400"
                      : ""
                  }`}
                >
                  {edition ? pct(sommeSaisie) : aDesCibles ? pct(tableau.sommeCibles) : "—"}
                </td>
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums">
                  {montant(
                    tableau.lignes.reduce((s, l) => s + (l.valeurCible ?? 0), 0) || null,
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {montantSigne(
                    tableau.lignes.some((l) => l.montantARealiser !== null)
                      ? tableau.lignes.reduce((s, l) => s + (l.montantARealiser ?? 0), 0)
                      : null,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {edition && (
          <div className="px-3 py-3 border-t border-slate-700 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={
                enCours || Math.abs(sommeSaisie - 1) > 0.001 || nonConformes.length > 0
              }
              onClick={enregistrer}
              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enCours ? "Enregistrement…" : "Enregistrer l'allocation"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEdition(false);
                setMessage(null);
              }}
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-700 transition"
            >
              Annuler
            </button>
            <span
              className={`text-xs ${
                Math.abs(sommeSaisie - 1) > 0.001 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              Somme : {pct(sommeSaisie)}
              {Math.abs(sommeSaisie - 1) > 0.001 &&
                " — l'enregistrement exige 100 %, sinon toutes les valeurs cibles seraient fausses."}
            </span>
            {nonConformes.length > 0 && (
              <span className="text-xs text-rose-400">
                {nonConformes.length} secteur(s) en écart avec l&apos;allocation
                sectorielle : {nonConformes.map((c) => c.groupe).join(", ")}.
                L&apos;enregistrement est bloqué tant que les deux axes se
                contredisent.
              </span>
            )}
          </div>
        )}
      </div>


      {/* Détail des lignes non rattachées : un montant agrégé ne dit pas quoi
          corriger, la liste et le motif si. */}
      {tableau.nonRapprochees.length > 0 && (
        <div className="bg-slate-800/40 border border-amber-800/50 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Lignes non rattachées à cet axe — {tableau.nonRapprochees.length}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Elles sont valorisées et comptent dans l&apos;actif net, mais échappent à
              la ventilation. Tant qu&apos;elles subsistent, les pourcentages de cet axe
              portent sur une assiette incomplète.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Libellé</th>
                  <th className="text-right px-3 py-2 font-medium">Valorisation</th>
                  <th className="text-left px-3 py-2 font-medium">Reconnaissance</th>
                  <th className="text-left px-3 py-2 font-medium">Ce qui manque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {tableau.nonRapprochees.map((l, i) => (
                  <tr key={`${l.code}-${i}`} className="hover:bg-slate-800/40">
                    <td className="px-3 py-1.5 font-mono text-slate-200">{l.code}</td>
                    <td className="px-3 py-1.5 text-slate-400">{l.libelle || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
                      {montant(l.valorisation)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300">
                        {l.matchKind}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-amber-400/90">{l.motif}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        <span className="text-slate-400">Valeur cible</span> = allocation validée ×
        (actif net + trésorerie à investir). <span className="text-slate-400">Montant à
        réaliser</span> = valeur cible − valeur actuelle.{" "}
        <span className="text-slate-400">TRO</span> (taux de réalisation des opérations) =
        (valeur actuelle − valeur précédente) ÷ (valeur cible − valeur précédente) : la
        part du chemin déjà parcourue depuis l&apos;inventaire précédent. Il reste vide
        quand la cible coïncide avec le point de départ — il n&apos;y avait rien à
        réaliser, et afficher 100 % laisserait croire à un mouvement accompli.
      </p>
    </div>
  );
}

/** Ligne de tête d'un secteur, sur l'axe des titres.
 *
 *  Elle porte le sous-total et l'écart à l'allocation sectorielle : c'est à ce
 *  niveau que la vérification se fait, il doit donc se lire sans quitter le
 *  tableau ni recomposer l'addition de tête. */
function GroupeSecteur({
  secteur,
  controle,
  nbTitres,
  nbColonnes,
}: {
  secteur: string;
  controle: {
    sommeTitres: number;
    cibleGroupe: number | null;
    ecart: number | null;
    conforme: boolean;
  } | null;
  nbTitres: number;
  nbColonnes: number;
}) {
  const enEcart = controle !== null && controle.cibleGroupe !== null && !controle.conforme;
  return (
    <tr className={enEcart ? "bg-rose-950/30" : "bg-slate-900/40"}>
      <td colSpan={nbColonnes} className="px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            {secteur}
          </span>
          <span className="text-[10px] text-slate-500">{nbTitres} valeur(s)</span>
          {controle && (
            <>
              <span className="text-[11px] text-slate-400">
                Somme des titres{" "}
                <b className="text-slate-200 tabular-nums">{pct(controle.sommeTitres)}</b>
              </span>
              <span className="text-[11px] text-slate-400">
                Allocation secteur{" "}
                <b className="text-slate-200 tabular-nums">
                  {controle.cibleGroupe === null ? "non allouée" : pct(controle.cibleGroupe)}
                </b>
              </span>
              {controle.cibleGroupe !== null && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    controle.conforme ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {controle.conforme
                    ? "conforme"
                    : `écart ${(controle.ecart ?? 0) > 0 ? "+" : ""}${fmt2.format((controle.ecart ?? 0) * 100)} pt`}
                </span>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function Tuile({
  libelle,
  valeur,
  detail,
  alerte,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
  alerte?: boolean;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{libelle}</div>
      <div
        className={`text-sm mt-0.5 tabular-nums ${alerte ? "text-amber-400 font-semibold" : "text-slate-200"}`}
      >
        {valeur}
      </div>
      {detail && <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>}
    </div>
  );
}
