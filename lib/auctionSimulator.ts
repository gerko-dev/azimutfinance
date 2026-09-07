/**
 * REPERE DE SOUMISSION AUX ADJUDICATIONS UMOA-TITRES
 *
 * UMOA-Titres adjuge « a la francaise » : les soumissions competitives sont
 * servies de la plus offrante a la moins offrante jusqu'a epuisement du montant
 * retenu par le Tresor, et la derniere servie fixe le TAUX MARGINAL. Etre
 * retenu tient donc a une seule condition :
 *
 *     rendement soumissionne <= taux marginal de la seance
 *
 * L'outil se cale sur les CINQ dernieres emissions comparables du meme
 * emetteur et retient deux reperes :
 *
 *   - la moyenne de leurs TAUX MARGINAUX : le seuil au-dela duquel on n'etait
 *     pas servi. C'est le niveau a ne pas depasser pour esperer l'etre.
 *   - la moyenne de leurs RENDEMENTS MOYENS PONDERES : ce qu'a paye en moyenne
 *     l'ensemble des servis. Soumissionner la, c'est se placer au milieu du
 *     carnet plutot qu'a sa limite.
 *
 * Une conversion reste indispensable, et n'a rien d'un raffinement : les OAT
 * publient un PRIX marginal, les BAT un TAUX marginal precompte. Deux
 * adjudications ne se comparent qu'une fois ramenees au meme rendement
 * actuariel post-compte, ce que fait `marginalRealise`.
 */

import type { EmissionUMOA } from "./listedBondsTypes";
import { classifyOperation } from "./listedBondsTypes";

/** Nominal d'un BAT UMOA-Titres, en FCFA. */
export const NOMINAL_BAT = 1_000_000;
/** Nominal d'une OAT UMOA-Titres, en FCFA. */
export const NOMINAL_OAT = 10_000;

/** Nombre d'emissions comparables retenues. */
export const NB_COMPARABLES = 5;

/** Au-dela, une adjudication ne dit plus rien du marche du jour. */
const ANCIENNETE_MAX_JOURS = 1095;

// =============================================================================
// ACTUARIEL
// =============================================================================

/**
 * Taux post-compte equivalent a un taux precompte (note UMOA-Titres, IV.b).
 * Un BAT verse ses interets a l'avance : le capital reellement immobilise est
 * inferieur au nominal, et le rendement vrai superieur au taux facial.
 */
export function tauxPostCompte(tauxPrecompte: number, annees: number): number {
  const d = 1 - annees * tauxPrecompte;
  return d > 0 ? tauxPrecompte / d : tauxPrecompte;
}

/** Reciproque : taux precompte a inscrire pour viser un rendement donne. */
export function tauxPreCompte(rendement: number, annees: number): number {
  const d = 1 + annees * rendement;
  return d > 0 ? rendement / d : rendement;
}

/** Prix d'un BAT, par coupure de 1 000 000, pour un rendement post-compte. */
export function prixBAT(rendement: number, annees: number): number {
  return NOMINAL_BAT / (1 + annees * rendement);
}

/**
 * Echeancier d'une OAT, par coupure de 10 000.
 *
 * Meme convention que le reste du site (cf. buildSovereignEvents) : coupon
 * annuel sur capital restant du, amortissement lineaire en tranches egales des
 * annees D+1 a M, ou in fine.
 */
export function fluxOAT(
  couponRate: number,
  maturiteAnnees: number,
  amortissement: "Linéaire" | "In Fine",
  differeAnnees: number,
): Array<{ t: number; flux: number }> {
  const n = Math.max(1, Math.round(maturiteAnnees));
  const lineaire = amortissement === "Linéaire";
  const differe = lineaire
    ? Math.min(Math.max(0, Math.round(differeAnnees)), n - 1)
    : n - 1;
  const amort = lineaire ? NOMINAL_OAT / (n - differe) : NOMINAL_OAT;

  const out: Array<{ t: number; flux: number }> = [];
  let restant = NOMINAL_OAT;
  for (let i = 1; i <= n; i++) {
    const capital = lineaire
      ? i > differe
        ? amort
        : 0
      : i === n
        ? NOMINAL_OAT
        : 0;
    out.push({ t: i, flux: restant * couponRate + capital });
    restant -= capital;
  }
  return out;
}

/** Prix d'une OAT, par coupure de 10 000, pour un rendement actuariel. */
export function prixOAT(
  rendement: number,
  couponRate: number,
  maturiteAnnees: number,
  amortissement: "Linéaire" | "In Fine",
  differeAnnees: number,
): number {
  const flux = fluxOAT(couponRate, maturiteAnnees, amortissement, differeAnnees);
  let v = 0;
  for (const f of flux) v += f.flux / Math.pow(1 + rendement, f.t);
  return v;
}

/** Rendement actuariel d'une OAT deduit de son prix, par bisection. */
export function rendementOATdepuisPrix(
  prix: number,
  couponRate: number,
  maturiteAnnees: number,
  amortissement: "Linéaire" | "In Fine",
  differeAnnees: number,
): number | null {
  if (!(prix > 0)) return null;
  const f = (y: number) =>
    prixOAT(y, couponRate, maturiteAnnees, amortissement, differeAnnees) - prix;
  let bas = 0.0001;
  let haut = 0.6;
  if (f(bas) < 0 || f(haut) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const m = (bas + haut) / 2;
    if (f(m) > 0) bas = m;
    else haut = m;
  }
  return (bas + haut) / 2;
}

/** Prix a soumissionner pour un rendement donne, quel que soit l'instrument. */
export function prixPourRendement(
  cible: CibleAdjudication,
  rendement: number,
): number {
  const annees = cible.maturiteMois / 12;
  if (cible.instrument === "BAT") return prixBAT(rendement, annees);
  return prixOAT(
    rendement,
    cible.couponRate ?? 0,
    annees,
    cible.amortissement,
    cible.differeAnnees,
  );
}

// =============================================================================
// TYPES
// =============================================================================

export type CibleAdjudication = {
  /** Code pays a deux lettres. */
  pays: string;
  instrument: "BAT" | "OAT";
  maturiteMois: number;
  /** Taux de coupon en decimal. Null ou 0 pour un BAT. */
  couponRate: number | null;
  amortissement: "Linéaire" | "In Fine";
  differeAnnees: number;
};

export type EmissionComparable = {
  date: string;
  maturiteMois: number;
  /** Rendement marginal, converti en actuariel post-compte. */
  marginal: number;
  /** Rendement moyen pondere publie. */
  moyenPondere: number;
  /** Soumis / recherche, au niveau de la SEANCE (pays + date). */
  couverture: number | null;
  /** Retenu / soumis sur cette ligne. */
  absorption: number;
  url: string;
};

export type Repere = {
  /** Rendement du repere. */
  rendement: number;
  /** Prix correspondant, par coupure. */
  prix: number;
  /** Taux precompte a inscrire sur le bulletin — BAT uniquement. */
  tauxPrecompte: number | null;
};

export type ResultatSimulation = {
  comparables: EmissionComparable[];
  /** Bande de maturite retenue, en mois. */
  bandeMois: [number, number];
  /** Moyenne des taux marginaux : le seuil de service. */
  repereMarginal: Repere | null;
  /** Moyenne des rendements moyens ponderes : le milieu du carnet. */
  repereMoyen: Repere | null;
  /** Couverture moyenne des seances retenues. */
  couvertureMoyenne: number | null;
  avertissements: string[];
};

// =============================================================================
// MOTEUR
// =============================================================================

function joursEntre(a: string, b: string): number {
  return (
    (new Date(b + "T00:00:00Z").getTime() -
      new Date(a + "T00:00:00Z").getTime()) /
    86_400_000
  );
}

/**
 * Rendement marginal effectivement sorti d'une adjudication passee.
 *
 * Les OAT publient un PRIX marginal, les BAT un TAUX marginal precompte : deux
 * grandeurs a ramener au meme rendement actuariel post-compte avant toute
 * comparaison.
 */
export function marginalRealise(e: EmissionUMOA): number | null {
  const annees = e.maturityMonths / 12;
  if (!(annees > 0)) return null;
  let y: number | null = null;
  if (e.type === "BAT") {
    if (e.marginalYield !== null && e.marginalYield > 0) {
      y = tauxPostCompte(e.marginalYield, annees);
    }
  } else if (e.marginalPrice !== null && e.marginalPrice > 0) {
    y = rendementOATdepuisPrix(
      e.marginalPrice,
      e.couponRate ?? 0,
      annees,
      e.amortizationType === "Linéaire" ? "Linéaire" : "In Fine",
      e.graceYears,
    );
  }
  return y !== null && y > 0 && y <= 0.4 ? y : null;
}

/** Indexe les montants soumis et recherches par SEANCE (pays + date).
 *
 *  Le montant recherche du CSV vaut pour l'emission simultanee entiere, pas par
 *  ligne : le rapporter ligne a ligne diviserait la couverture par le nombre de
 *  titres de la seance. */
function indexerSeances(emissions: EmissionUMOA[]): {
  soumis: Map<string, number>;
  recherche: Map<string, number>;
} {
  const soumis = new Map<string, number>();
  const recherche = new Map<string, number>();
  for (const e of emissions) {
    const cle = `${e.country}|${e.tradeDate}`;
    soumis.set(cle, (soumis.get(cle) ?? 0) + e.amountSubmitted);
    if (e.amountIssued > 0) recherche.set(cle, e.amountIssued);
  }
  return { soumis, recherche };
}

export function simulerAdjudication(
  emissions: EmissionUMOA[],
  cible: CibleAdjudication,
  aujourdhui: string,
): ResultatSimulation {
  const avertissements: string[] = [];
  const maturiteCible = cible.maturiteMois / 12;
  const seances = indexerSeances(emissions);

  // Univers : meme emetteur, meme instrument, adjudications cash seules. Un
  // echange ou un rachat porte un taux de sortie negocie, sans soumission
  // competitive : son « marginal » ne dit rien du seuil de service.
  const univers = emissions.filter((e) => {
    if (e.country !== cible.pays || e.type !== cible.instrument) return false;
    if (classifyOperation(e.precisions) !== "cash_auction") return false;
    if (!e.tradeDate || e.maturityMonths <= 0) return false;
    const age = joursEntre(e.tradeDate, aujourdhui);
    return age > 0 && age <= ANCIENNETE_MAX_JOURS;
  });

  // Bande de maturite : on part serre, on n'elargit que s'il n'y a pas cinq
  // emissions a montrer.
  const bandes: Array<[number, number]> = [
    [0.75, 1.35],
    [0.5, 2],
    [0, 99],
  ];
  let retenus: EmissionUMOA[] = [];
  let bandeMois: [number, number] = [cible.maturiteMois, cible.maturiteMois];
  let rang = 0;
  for (let i = 0; i < bandes.length; i++) {
    const [lo, hi] = bandes[i];
    const min = cible.maturiteMois * lo;
    const max = cible.maturiteMois * hi;
    retenus = univers.filter(
      (e) => e.maturityMonths >= min && e.maturityMonths <= max,
    );
    bandeMois = [Math.round(min), Math.round(max)];
    rang = i;
    if (retenus.length >= NB_COMPARABLES) break;
  }

  const comparables: EmissionComparable[] = [];
  for (const e of [...retenus].sort((a, b) =>
    b.tradeDate.localeCompare(a.tradeDate),
  )) {
    if (comparables.length >= NB_COMPARABLES) break;
    const marginal = marginalRealise(e);
    if (marginal === null || !(e.weightedAvgYield > 0)) continue;

    const cle = `${e.country}|${e.tradeDate}`;
    const rech = seances.recherche.get(cle) ?? 0;
    const soum = seances.soumis.get(cle) ?? 0;

    comparables.push({
      date: e.tradeDate,
      maturiteMois: e.maturityMonths,
      marginal,
      moyenPondere: e.weightedAvgYield,
      couverture: rech > 0 ? soum / rech : null,
      absorption: e.amountSubmitted > 0 ? e.amount / e.amountSubmitted : 0,
      url: e.url,
    });
  }

  if (comparables.length === 0) {
    return {
      comparables: [],
      bandeMois,
      repereMarginal: null,
      repereMoyen: null,
      couvertureMoyenne: null,
      avertissements: [
        "Aucune émission comparable sur trois ans pour cet émetteur et cet instrument.",
      ],
    };
  }

  const moyenne = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const repere = (rendement: number): Repere => ({
    rendement,
    prix: prixPourRendement(cible, rendement),
    tauxPrecompte:
      cible.instrument === "BAT"
        ? tauxPreCompte(rendement, maturiteCible)
        : null,
  });

  const couvertures = comparables
    .map((c) => c.couverture)
    .filter((v): v is number => v !== null);

  if (comparables.length < NB_COMPARABLES) {
    avertissements.push(
      `Seulement ${comparables.length} émission${comparables.length > 1 ? "s" : ""} comparable${comparables.length > 1 ? "s" : ""} au lieu de ${NB_COMPARABLES}.`,
    );
  }
  if (rang >= 1) {
    avertissements.push(
      `Faute d'émissions assez proches, la bande de maturité a été élargie à ${bandeMois[0]}–${bandeMois[1]} mois.`,
    );
  }

  // Sur un compartiment peu frequente, « les cinq dernieres » peuvent remonter
  // loin. Une moyenne qui melange deux regimes de taux ne situe plus le niveau
  // du jour : il faut que cela se voie.
  const anciennete = joursEntre(
    comparables[comparables.length - 1].date,
    aujourdhui,
  );
  if (anciennete > 365) {
    avertissements.push(
      `L'émetteur n'a pas émis souvent sur ce compartiment : la plus ancienne des ${comparables.length} séances retenues remonte au ${comparables[comparables.length - 1].date.split("-").reverse().join("/")}, soit ${Math.round(anciennete / 30)} mois. La moyenne mélange des régimes de taux différents.`,
    );
  }

  return {
    comparables,
    bandeMois,
    repereMarginal: repere(moyenne(comparables.map((c) => c.marginal))),
    repereMoyen: repere(moyenne(comparables.map((c) => c.moyenPondere))),
    couvertureMoyenne: couvertures.length > 0 ? moyenne(couvertures) : null,
    avertissements,
  };
}
