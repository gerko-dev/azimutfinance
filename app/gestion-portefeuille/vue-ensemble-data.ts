import "server-only";

// === Vue d'ensemble : tous les fonds, sur la même règle ===
//
// La page d'accueil du module affichait quatre tirets. Le gérant qui ouvre son
// poste de travail veut d'abord savoir une chose : où en sont ses fonds par
// rapport à ce à quoi ils se comparent.
//
// DEUX FENETRES, ET ELLES NE SE MELANGENT PAS.
//
//   LA PERFORMANCE SE LIT DEPUIS LE 1ᵉʳ JANVIER, du 31 décembre précédent à la
//   dernière valeur liquidative publiée. C'est la seule fenêtre commune à tous
//   les fonds, donc la seule sur laquelle ils se comparent entre eux. La
//   performance vient de la VL — pas de la valorisation des lignes : la VL
//   porte le passif du fonds et les régularisations du dépositaire, et c'est
//   elle que le porteur touche.
//
//   L'ATTRIBUTION SE LIT SUR LA FENETRE D'INVENTAIRE du fonds, parce qu'elle a
//   besoin des poids par classe d'actif au début ET à la fin, et que ces poids
//   n'existent qu'aux dates où un inventaire a été importé. Cette fenêtre
//   diffère d'un fonds à l'autre : elle est donc AFFICHEE à côté de chaque
//   décomposition, et jamais additionnée d'un fonds sur l'autre.
//
// Mélanger les deux — décomposer une performance annuelle avec des poids de
// quinzaine — donnerait des effets qui ne somment pas à l'écart constaté. On
// préfère deux tableaux honnêtes à un seul qui ment.

import { computeAttributionAction, type AttributionRow } from "./attribution-actions";
import { computeBenchmarkAction } from "./benchmark-actions";
import { loadMyFunds } from "./data";
import { loadNavHistory } from "./nav-data";

/** Décomposition de Brinson–Fachler d'un écart au benchmark. */
export type Brinson = {
  /** Fenêtre sur laquelle elle est calculée — elle n'est pas celle du YTD. */
  debut: string | null;
  fin: string;
  /**
   * EFFET D'ALLOCATION : ce que rapporte le choix des POIDS.
   *
   * Σ (wᵢ − Wᵢ) × (Bᵢ − B) — surpondérer une classe qui bat le benchmark
   * d'ensemble rapporte, la sous-pondérer coûte. On retranche B, la
   * performance du benchmark total : sans cela, surpondérer une classe qui
   * monte moins que le reste du marché serait compté comme un bon choix.
   */
  allocation: number | null;
  /**
   * EFFET DE SELECTION : ce que rapporte le choix des TITRES.
   *
   * Σ Wᵢ × (Rᵢ − Bᵢ) — au poids du benchmark, pour ne pas compter deux fois
   * ce que l'allocation explique déjà.
   */
  selection: number | null;
  /** INTERACTION : Σ (wᵢ − Wᵢ) × (Rᵢ − Bᵢ). Surpondérer là où l'on sélectionne
   *  bien. Petit en général, et il doit figurer : l'écarter ferait un total
   *  qui ne tombe pas juste. */
  interaction: number | null;
  /** La somme des trois — égale à la performance moins le benchmark. */
  total: number | null;
  /** Performance du portefeuille sur cette fenêtre, et son benchmark. */
  perf: number | null;
  bench: number | null;
  /** Part des classes d'actif dont la performance ET le benchmark sont connus. */
  couverture: number;
};

export type LigneFonds = {
  fondsId: string;
  fondsNom: string;
  /** Dernier actif net publié, en francs. */
  encours: number | null;
  /** Date de la dernière VL retenue. */
  dateVl: string | null;
  /** Performance depuis le 1ᵉʳ janvier, en %. */
  perfYtd: number | null;
  /** Benchmark composite du fonds sur la même fenêtre, en %. */
  benchYtd: number | null;
  /** perfYtd − benchYtd. */
  alpha: number | null;
  /** Part du benchmark réellement résolue (0 à 1) : une couverture partielle
   *  compare le fonds à un benchmark amputé, et il faut le voir. */
  couvertureBench: number;
  /** Composantes du benchmark qu'aucune série ne permet de calculer. */
  benchIrresolu: string[];
  attribution: Brinson | null;
  classes: AttributionRow[];
  /** Ce qui empêche de dire quelque chose de ce fonds, ou null. */
  souci: string | null;
};

export type VueEnsemble = {
  /** Dernier 31 décembre : l'origine de toutes les performances annuelles. */
  origine: string;
  lignes: LigneFonds[];
  /** Somme des encours connus. */
  encoursTotal: number;
  /** Performances pondérées par l'encours — la performance de la MAISON. */
  perfPonderee: number | null;
  benchPondere: number | null;
  alphaPondere: number | null;
};

/** La valeur de la série à la date donnée, ou la dernière qui la précède. */
function vlAuPlusTard(points: { date: string; vl: number | null }[], d: string): number | null {
  let retenue: number | null = null;
  for (const p of points) {
    if (p.date > d) break;
    if (p.vl != null && p.vl > 0) retenue = p.vl;
  }
  return retenue;
}

/**
 * Décompose l'écart au benchmark en effets d'allocation et de sélection.
 *
 * LES CLASSES INCOMPLETES SONT ECARTEES, ET COMPTEES. Une classe dont on ne
 * connaît ni la performance ni son benchmark ne peut rien expliquer ; la
 * compter pour zéro aurait fait porter son écart aux autres. La part du
 * portefeuille réellement décomposée est rendue avec le résultat.
 */
function brinson(
  classes: AttributionRow[],
  alloc: { classe: string; poids: number; rbClass: number | null; wb: number }[],
  rbTotal: number | null,
  debut: string | null,
  fin: string,
): Brinson | null {
  if (rbTotal == null || classes.length === 0) return null;

  const perfParClasse = new Map(classes.map((c) => [c.classe, c.performance]));
  let allocation = 0;
  let selection = 0;
  let interaction = 0;
  let perf = 0;
  let poidsCouvert = 0;
  let poidsTotal = 0;
  let utilisable = false;

  for (const a of alloc) {
    const wi = a.poids / 100;
    const wb = a.wb / 100;
    poidsTotal += wi;
    const ri = perfParClasse.get(a.classe) ?? null;
    const bi = a.rbClass;
    if (ri == null || bi == null) continue;
    utilisable = true;
    poidsCouvert += wi;
    allocation += (wi - wb) * (bi - rbTotal);
    selection += wb * (ri - bi);
    interaction += (wi - wb) * (ri - bi);
    perf += wi * ri;
  }
  if (!utilisable) return null;

  return {
    debut,
    fin,
    allocation,
    selection,
    interaction,
    total: allocation + selection + interaction,
    perf,
    bench: rbTotal,
    couverture: poidsTotal > 0 ? poidsCouvert / poidsTotal : 0,
  };
}

/**
 * Tout ce que la vue d'ensemble affiche, fonds par fonds.
 *
 * UN FONDS QUI NE SE CALCULE PAS RESTE DANS LE TABLEAU, avec la raison. Le
 * faire disparaître laisserait croire qu'il n'existe pas, et c'est justement
 * celui-là qu'il faut aller corriger — un benchmark non renseigné, un
 * historique de VL pas encore importé.
 */
export async function chargerVueEnsemble(): Promise<VueEnsemble> {
  const fonds = await loadMyFunds();
  const anneeEnCours = new Date().getFullYear();
  const origine = `${anneeEnCours - 1}-12-31`;

  const lignes = await Promise.all(
    fonds.map(async (f): Promise<LigneFonds> => {
      const base: LigneFonds = {
        fondsId: f.id,
        fondsNom: f.nom,
        encours: null,
        dateVl: null,
        perfYtd: null,
        benchYtd: null,
        alpha: null,
        couvertureBench: 0,
        benchIrresolu: [],
        attribution: null,
        classes: [],
        souci: null,
      };

      const vls = await loadNavHistory(f.id);
      const derniere = [...vls].reverse().find((p) => p.vl != null && p.vl > 0) ?? null;
      if (!derniere) {
        return { ...base, souci: "Aucune valeur liquidative importée." };
      }
      base.dateVl = derniere.date;
      base.encours = derniere.actifNet ?? null;

      const vlOrigine = vlAuPlusTard(vls, origine);
      if (vlOrigine != null && derniere.vl != null) {
        base.perfYtd = (derniere.vl / vlOrigine - 1) * 100;
      }

      // Le benchmark et l'attribution sont lus en parallèle : ils interrogent
      // des tables disjointes, et les enchaîner doublait l'attente sur un
      // écran qui en affiche six.
      const [bench, attr] = await Promise.all([
        computeBenchmarkAction(f.id, origine, derniere.date, origine),
        computeAttributionAction(f.id),
      ]);

      if (bench.ok) {
        base.benchYtd = bench.data.ytd;
        base.couvertureBench = bench.data.coverageYtd;
        base.benchIrresolu = bench.data.unresolved;
        if (base.perfYtd != null && base.benchYtd != null) {
          base.alpha = base.perfYtd - base.benchYtd;
        }
      }

      if (attr.ok) {
        base.classes = attr.data.rows;
        base.attribution = brinson(
          attr.data.rows,
          attr.data.alloc,
          attr.data.rbTotal,
          attr.data.dateDebut,
          attr.data.dateFin,
        );
      }

      // UN SOUCI A LA FOIS, LE PLUS BLOQUANT D'ABORD : empiler trois reproches
      // sur une ligne de tableau ne se lit pas, et le premier suffit à savoir
      // où aller.
      base.souci =
        base.perfYtd == null
          ? `Aucune VL au ${origine} : la performance annuelle ne peut pas être calculée.`
          : !bench.ok
            ? bench.error
            : base.benchYtd == null
              ? "Benchmark non calculable sur la période."
              : base.attribution == null
                ? "Attribution indisponible : il faut deux inventaires importés."
                : null;

      return base;
    }),
  );

  // LA MAISON SE LIT PONDEREE PAR LES ENCOURS, jamais en moyenne simple : un
  // fonds de cinquante millions ne pèse pas autant qu'un fonds de trente
  // milliards, et la moyenne simple donnait une performance que personne n'a
  // réalisée.
  let encoursTotal = 0;
  let perfPond = 0;
  let benchPond = 0;
  let poidsPerf = 0;
  let poidsBench = 0;
  for (const l of lignes) {
    const e = l.encours ?? 0;
    if (e <= 0) continue;
    encoursTotal += e;
    if (l.perfYtd != null) {
      perfPond += e * l.perfYtd;
      poidsPerf += e;
    }
    if (l.benchYtd != null) {
      benchPond += e * l.benchYtd;
      poidsBench += e;
    }
  }

  const perfPonderee = poidsPerf > 0 ? perfPond / poidsPerf : null;
  const benchPondere = poidsBench > 0 ? benchPond / poidsBench : null;

  return {
    origine,
    lignes,
    encoursTotal,
    perfPonderee,
    benchPondere,
    alphaPondere:
      perfPonderee != null && benchPondere != null ? perfPonderee - benchPondere : null,
  };
}
