"use client";

import type { VentilationCompte } from "@/app/gestion-portefeuille/ventilation-reglement";
import { MAX_COMPTES } from "@/app/gestion-portefeuille/ventilation-reglement";

/**
 * Le ou les comptes sur lesquels une opération se règle.
 *
 * POURQUOI PLUSIEURS. Un rachat de parts à sept chiffres se paie sur ce qu'on
 * a, et ce qu'on a est réparti entre plusieurs banques ; une soumission au
 * marché primaire se verse de même. Tant qu'un seul compte était possible, le
 * gérant posait tout le montant sur une colonne du point de trésorerie, qui
 * annonçait alors un décaissement que le relevé ne portait pas.
 *
 * UN SEUL COMPTE RESTE LE CAS ORDINAIRE, et l'écran le montre : une ligne, une
 * liste déroulante, rien de plus — exactement ce qu'il y avait avant. La
 * colonne des montants n'apparaît qu'à partir du deuxième compte, quand il y a
 * enfin quelque chose à répartir.
 */
export default function ComptesReglement({
  valeur,
  onChange,
  options,
  etat,
  erreur,
  total,
  aideSimple,
  multiple = true,
}: {
  valeur: VentilationCompte[];
  onChange: (v: VentilationCompte[]) => void;
  options: { cle: string; nom: string; pays?: string; sens?: string }[];
  etat: "chargement" | "pret" | "erreur";
  erreur?: string | null;
  /**
   * Le montant à répartir, quand il est CONNU D'AVANCE — un rachat de parts.
   *
   * Il sert à deux choses : pré-remplir la ligne qu'on ajoute avec ce qui
   * reste, et dire l'écart quand la répartition ne tombe pas juste.
   *
   * Absent pour un ordre de marché : sa part non servie et chacune de ses
   * exécutions se règlent séparément, et leurs montants bougent à mesure que
   * l'ordre est servi. Les lignes y valent clef de répartition.
   */
  total?: number;
  /** Ce qui s'affiche sous la liste quand il n'y a qu'un compte. */
  aideSimple?: string;
  /**
   * Plusieurs comptes sont-ils permis sur cette opération ?
   *
   * Faux là où la question ne se pose pas — un achat de bourse se règle chez
   * le dépositaire du titre, et nulle part ailleurs. Le bouton disparaît
   * alors, et l'écran redevient ce qu'il était : une liste déroulante.
   */
  multiple?: boolean;
}) {
  // TOUJOURS UNE LIGNE A L'ECRAN, même quand rien n'est encore choisi : un
  // formulaire qui s'ouvre sur une liste vide oblige à cliquer « ajouter »
  // avant de pouvoir saisir le cas le plus courant.
  const lignes = valeur.length > 0 ? valeur : [{ compte: "", montant: 0 }];
  const plusieurs = lignes.length > 1;
  const somme = lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0);
  const ecart = total === undefined ? null : total - somme;

  const champ =
    "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";

  const poser = (i: number, modif: Partial<VentilationCompte>) =>
    onChange(lignes.map((l, j) => (i === j ? { ...l, ...modif } : l)));

  const ajouter = () => {
    // LA NOUVELLE LIGNE PREND CE QUI RESTE. Sur un montant connu, c'est la
    // seule valeur qui ait un sens : le gérant répartit ce qu'il doit payer,
    // il ne le recompte pas. Et la première ligne reçoit le total si elle est
    // encore à zéro, sans quoi ajouter un compte repartirait de rien.
    const base =
      total !== undefined && lignes.length === 1 && !(lignes[0].montant > 0)
        ? [{ ...lignes[0], montant: total }]
        : lignes;
    const reste = total === undefined ? 0 : Math.max(0, total - base.reduce((s, l) => s + (Number(l.montant) || 0), 0));
    onChange([...base, { compte: "", montant: reste }]);
  };

  const retirer = (i: number) => {
    const restantes = lignes.filter((_, j) => j !== i);
    // REVENU A UN SEUL COMPTE, le montant n'a plus à être saisi : il vaut le
    // tout. Le laisser à sa valeur partielle aurait rendu une répartition
    // incomplète sans que la colonne des montants soit encore affichée pour
    // le montrer.
    onChange(
      restantes.length === 1 && total !== undefined
        ? [{ ...restantes[0], montant: total }]
        : restantes,
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {lignes.map((l, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            value={l.compte}
            onChange={(e) => poser(i, { compte: e.target.value })}
            disabled={etat !== "pret"}
            className={`${champ} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="">
              {etat === "chargement"
                ? "Chargement des comptes…"
                : etat === "erreur"
                  ? "Comptes indisponibles"
                  : "— Choisir —"}
            </option>
            {options.map((c) => (
              <option key={c.cle} value={c.cle}>
                {c.nom}
                {c.pays ? ` · ${c.pays}` : ""}
                {c.sens ? ` · ${c.sens}` : ""}
              </option>
            ))}
            {/* UN COMPTE DISPARU DU REFERENTIEL NE DOIT PAS DISPARAITRE DE LA
                LIGNE : sans cette option, ouvrir une vieille opération en
                effaçait silencieusement le compte à la première sauvegarde. */}
            {l.compte && !options.some((c) => c.cle === l.compte) && (
              <option value={l.compte}>{l.compte} (hors liste)</option>
            )}
          </select>
          {plusieurs && (
            <input
              type="number"
              min={0}
              step={1}
              value={l.montant || ""}
              onChange={(e) => poser(i, { montant: Number(e.target.value) || 0 })}
              placeholder="Montant"
              className={`${champ} w-36 text-right tabular-nums`}
            />
          )}
          {plusieurs && (
            <button
              type="button"
              onClick={() => retirer(i)}
              title="Retirer ce compte"
              className="shrink-0 w-6 h-6 rounded border border-slate-300 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition text-xs leading-none"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {multiple && lignes.length < MAX_COMPTES && (
          <button
            type="button"
            onClick={ajouter}
            disabled={etat !== "pret"}
            className="text-[10px] font-medium text-blue-700 hover:text-blue-900 disabled:text-slate-300"
          >
            + Ajouter un compte
          </button>
        )}
        {plusieurs && (
          <span className="text-[9px] tabular-nums text-slate-500">
            {lignes.length} comptes · {Math.round(somme).toLocaleString("fr-FR")} F réparti(s)
          </span>
        )}
        {/* L'ECART SE DIT PENDANT LA SAISIE, pas au moment d'enregistrer.
            Découvrir au clic qu'il manque trois cent mille francs oblige à
            rouvrir le formulaire et à refaire l'addition de tête. */}
        {plusieurs && ecart !== null && Math.abs(ecart) > 1 && (
          <span className="text-[9px] font-semibold text-amber-700">
            {ecart > 0
              ? `il reste ${Math.round(ecart).toLocaleString("fr-FR")} F à répartir`
              : `${Math.round(-ecart).toLocaleString("fr-FR")} F de trop`}
          </span>
        )}
        {plusieurs && ecart !== null && Math.abs(ecart) <= 1 && (
          <span className="text-[9px] font-semibold text-emerald-700">répartition complète</span>
        )}
        {!plusieurs && aideSimple && <span className="text-[9px] text-slate-400">{aideSimple}</span>}
      </div>

      {erreur && <span className="text-[9px] text-amber-700">{erreur}</span>}
    </div>
  );
}
