// === Lecture du compartiment actions BRVM pour l'analyse de place ===
//
// SERVEUR UNIQUEMENT : les chargeurs lisent le disque. L'historique des cours
// — 144 000 points, toutes valeurs confondues — ne part JAMAIS au navigateur :
// on n'en transmet que ce qu'il produit, cinq performances et une volatilité
// par valeur, soit une cinquantaine de lignes.

import { loadAllActions, loadPriceHistoryWithVolume } from "@/lib/dataLoader";

import type { LigneAction, Performances } from "./analyse-actions-types";

/** Séances retenues pour mesurer la liquidité. Un mois de bourse. */
const SEANCES_LIQUIDITE = 30;

/** Séances retenues pour la volatilité. Un an de bourse. */
const SEANCES_VOLATILITE = 252;

type Point = { date: string; value: number; volume: number | null };

const enArriere = (iso: string, mois: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString().slice(0, 10);
};

/**
 * Performance entre la dernière clôture connue et la DERNIÈRE CLÔTURE AVANT
 * la date de départ.
 *
 * « Avant », et non « la plus proche » : prendre le point suivant ferait
 * commencer la mesure après la période, et une valeur qui a bondi le 2 janvier
 * afficherait une performance annuelle amputée de son premier mouvement.
 *
 * Null quand la valeur ne cotait pas encore : une société introduite en mars
 * n'a pas de performance à un an, et lui en calculer une depuis sa première
 * cotation la comparerait à ses aînées sur une durée plus courte.
 */
function performance(serie: Point[], depuis: string): number | null {
  if (serie.length === 0) return null;
  const fin = serie[serie.length - 1];
  if (!(fin.value > 0)) return null;
  let base: Point | null = null;
  for (const p of serie) {
    if (p.date > depuis) break;
    base = p;
  }
  if (!base || !(base.value > 0) || base.date === fin.date) return null;
  return (fin.value / base.value - 1) * 100;
}

/**
 * Volatilité annualisée des rendements quotidiens, en %.
 *
 * On la RECALCULE plutôt que de lire la colonne de `titres.csv` : cette
 * colonne est figée à la date où le référentiel a été écrit, alors que
 * l'historique, lui, se met à jour tous les soirs. Deux chiffres vieillissant
 * à des rythmes différents finissent par se contredire dans le même tableau.
 *
 * Les séances sans variation sont conservées — une valeur qui ne bouge pas
 * pendant vingt séances EST peu volatile, et les écarter la ferait passer pour
 * agitée.
 */
function volatilite(serie: Point[]): number | null {
  const fenetre = serie.slice(-SEANCES_VOLATILITE);
  const rendements: number[] = [];
  for (let i = 1; i < fenetre.length; i++) {
    const a = fenetre[i - 1].value;
    const b = fenetre[i].value;
    if (a > 0 && b > 0) rendements.push(Math.log(b / a));
  }
  if (rendements.length < 20) return null;
  const moyenne = rendements.reduce((t, r) => t + r, 0) / rendements.length;
  const variance =
    rendements.reduce((t, r) => t + (r - moyenne) ** 2, 0) / (rendements.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

let _cache: { lignes: LigneAction[]; dateReference: string } | null = null;

/**
 * Le compartiment actions, une ligne par valeur.
 *
 * LA DATE DE RÉFÉRENCE EST CELLE DU MARCHÉ, pas celle de l'horloge : c'est la
 * dernière clôture connue, toutes valeurs confondues. Les fenêtres de
 * performance s'y calent, si bien qu'un écran ouvert un dimanche mesure la
 * même chose qu'un écran ouvert le vendredi soir.
 *
 * Mémoïsé au niveau du module, comme les chargeurs de CSV : la source ne
 * change pas dans la vie d'un processus.
 */
export function chargerActions(): { lignes: LigneAction[]; dateReference: string } {
  if (_cache !== null) return _cache;

  const actions = loadAllActions();
  const historiques = new Map<string, Point[]>();
  let dateReference = "";
  for (const a of actions) {
    const h = loadPriceHistoryWithVolume(a.code);
    historiques.set(a.code, h);
    const derniere = h[h.length - 1]?.date ?? "";
    if (derniere > dateReference) dateReference = derniere;
  }
  if (!dateReference) dateReference = new Date().toISOString().slice(0, 10);

  const bornes = {
    m1: enArriere(dateReference, 1),
    m3: enArriere(dateReference, 3),
    m6: enArriere(dateReference, 6),
    ytd: `${Number(dateReference.slice(0, 4)) - 1}-12-31`,
    a1: enArriere(dateReference, 12),
    a3: enArriere(dateReference, 36),
  };

  const lignes: LigneAction[] = actions.map((a) => {
    const serie = historiques.get(a.code) ?? [];
    const recentes = serie.slice(-SEANCES_LIQUIDITE);
    // Les séances sans volume publié ne sont pas des séances à volume nul :
    // on les exclut du dénominateur plutôt que de diluer la moyenne.
    const avecVolume = recentes.filter((p) => p.volume !== null);
    const traitees = avecVolume.filter((p) => (p.volume ?? 0) > 0);
    const volumeMoyen =
      avecVolume.length > 0
        ? avecVolume.reduce((t, p) => t + (p.volume ?? 0), 0) / avecVolume.length
        : 0;
    const capitauxMoyens =
      avecVolume.length > 0
        ? avecVolume.reduce((t, p) => t + (p.volume ?? 0) * p.value, 0) / avecVolume.length
        : 0;

    const perf: Performances = {
      m1: performance(serie, bornes.m1),
      m3: performance(serie, bornes.m3),
      m6: performance(serie, bornes.m6),
      ytd: performance(serie, bornes.ytd),
      a1: performance(serie, bornes.a1),
      a3: performance(serie, bornes.a3),
    };

    return {
      code: a.code,
      nom: a.name,
      secteur: a.sector || "Non classé",
      pays: a.country || "Non renseigné",
      isin: a.isin,
      cours: a.price,
      varJour: a.changePercent,
      capitalisation: a.capitalization,
      // `hasPer` et `hasYield` ne disent pas « la donnée existe » mais « elle
      // est représentative » : un rendement de 80 % sur cession d'actifs est
      // exact et n'a rien à faire dans une moyenne de place.
      per: a.hasPer ? a.per : null,
      rendement: a.hasYield ? a.yieldPct : null,
      dpa: a.dpa,
      volumeMoyen,
      capitauxMoyens,
      seancesTraitees: traitees.length,
      perf,
      volatilite: volatilite(serie),
    };
  });

  _cache = { lignes, dateReference };
  return _cache;
}
