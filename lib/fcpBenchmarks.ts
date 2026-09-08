// === REFERENCES DE MARCHE POUR LES FONDS ===
//
// Une VL ne dit pas si le gerant a bien travaille : +12 % est excellent pour un
// obligataire, mediocre pour un fonds actions dans une annee ou la BRVM a fait
// +30 %. Ce module construit, pour chaque categorie, l'indice de reference
// auquel comparer la courbe du fonds.
//
// UNE MEME UNITE. Un indice boursier est un NIVEAU, un rendement souverain est
// un TAUX : on ne trace pas les deux sur le meme axe, et on ne peut pas en
// faire la moyenne pour un fonds diversifie. Les rendements sont donc convertis
// en INDICE DE PORTAGE, base 100, qui capitalise le taux en vigueur jour apres
// jour. Toutes les references parlent alors la meme langue que la VL rebasee.
//
// CE QUE L'INDICE DE PORTAGE N'EST PAS. Il ne porte que le portage, pas l'effet
// prix : quand les taux montent, un vrai portefeuille obligataire encaisse une
// moins-value que cet indice ignore. Il sous-estime donc la volatilite d'un
// fonds obligataire et lisse ses creux. C'est une reference de RENDEMENT
// ATTENDU, pas un indice total return — la fiche le dit au lecteur.

import { loadIndexHistory, loadUmoaEmissions } from "./dataLoader";

const MS_JOUR = 24 * 60 * 60 * 1000;

function ms(dateISO: string): number {
  return new Date(dateISO + "T00:00:00Z").getTime();
}

export type BenchPoint = { date: string; value: number | null };

export type Benchmark = {
  cle: string;
  /** Nom court, affiche sur le bouton et dans la legende. */
  label: string;
  /** Une phrase de methode, affichee sous le graphe. */
  note: string;
  /** Indice base 100 au premier point, aligne sur les dates demandees. */
  serie: BenchPoint[];
};

// Bandes de maturite, en duree de vie moyenne et en annees.
//
// « 5 ans » s'entend au sens du pilier de la courbe UMOA : les adjudications ne
// tombent pas pile sur cinq ans, il faut une bande pour en avoir assez. « Moins
// de 2 ans » recouvre les BAT et les OAT courtes, c'est-a-dire ce dans quoi un
// fonds monetaire de la zone place effectivement.
const BANDE_5A: [number, number] = [4.0, 6.5];
const BANDE_COURT: [number, number] = [0, 2.0];

// Fenetre glissante de collecte des adjudications. 90 jours donnent en general
// une quinzaine d'operations sur la bande 5 ans ; on elargit quand le guichet
// s'est tu, plutot que de laisser un trou dans la serie.
const FENETRE_JOURS = 90;
const FENETRE_ELARGIE = 270;

/** Durée de vie moyenne d'une émission.
 *
 *  Le capital d'un titre amortissable est remboursé par tranches : sa durée
 *  d'immobilisation moyenne est inférieure à sa maturité, et c'est elle qui
 *  situe l'émission sur la courbe. Même convention que
 *  scripts/build_umoa_yield_curves.py, pour que les deux ne divergent pas.
 */
function dureeVieMoyenne(
  maturite: number,
  differe: number,
  amortissement: string | null,
): number {
  if (maturite <= 0) return 0;
  if (amortissement !== "Linéaire") return maturite;
  const d = differe > 0 ? differe : 0;
  if (d >= maturite) return maturite;
  return (d + 1 + maturite) / 2;
}

/** Une adjudication en numéraire, réduite à ce qui sert ici. */
type Adjudication = { date: string; dvm: number; taux: number; poids: number };

let _adjudicationsCache: Adjudication[] | null = null;

function adjudications(): Adjudication[] {
  if (_adjudicationsCache !== null) return _adjudicationsCache;
  // Échanges et rachats écartés : leur taux est un taux de SORTIE négocié dans
  // un contexte particulier, pas une observation du marché primaire.
  const horsCash = ["echange", "échange", "rachat"];
  _adjudicationsCache = loadUmoaEmissions()
    .filter((e) => {
      const p = (e.precisions || "").toLowerCase();
      return (
        e.tradeDate &&
        e.maturity > 0 &&
        e.weightedAvgYield > 0 &&
        e.weightedAvgYield < 0.5 &&
        !horsCash.some((m) => p.includes(m))
      );
    })
    .map((e) => ({
      date: e.tradeDate,
      dvm: dureeVieMoyenne(e.maturity, e.graceYears, e.amortizationType),
      taux: e.weightedAvgYield,
      // Une adjudication de 200 milliards renseigne mieux le marché qu'une de
      // 5 : la moyenne est pondérée par le montant retenu.
      poids: e.amount > 0 ? e.amount : 1,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return _adjudicationsCache;
}

/** Rendement souverain moyen d'une bande de maturité, à chaque date demandée. */
function rendementsSouverains(
  bande: [number, number],
  dates: string[],
): Array<number | null> {
  const adj = adjudications().filter(
    (a) => a.dvm >= bande[0] && a.dvm < bande[1],
  );
  // Sommes cumulées : une fiche demande jusqu'à neuf cents dates et la liste
  // porte trois mille adjudications. Balayer la liste à chaque date coûterait
  // des millions de comparaisons par page, pour un résultat identique.
  const instants = adj.map((a) => ms(a.date));
  const cumTaux = new Float64Array(adj.length + 1);
  const cumPoids = new Float64Array(adj.length + 1);
  for (let i = 0; i < adj.length; i++) {
    cumTaux[i + 1] = cumTaux[i] + adj[i].taux * adj[i].poids;
    cumPoids[i + 1] = cumPoids[i] + adj[i].poids;
  }
  /** Nombre d'adjudications dont l'instant est <= t. */
  const jusqua = (t: number): number => {
    let lo = 0;
    let hi = instants.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (instants[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  let dernier: number | null = null;
  return dates.map((d) => {
    const fin = ms(d);
    const hi = jusqua(fin);
    for (const fenetre of [FENETRE_JOURS, FENETRE_ELARGIE]) {
      const lo = jusqua(fin - fenetre * MS_JOUR);
      const poids = cumPoids[hi] - cumPoids[lo];
      if (poids > 0) {
        dernier = (cumTaux[hi] - cumTaux[lo]) / poids;
        return dernier;
      }
    }
    // Avant la première adjudication de la bande, on n'invente rien.
    return dernier;
  });
}

/** Rendements pas à pas d'un indice de portage capitalisant le taux en vigueur. */
function pasDePortage(dates: string[], taux: Array<number | null>): Array<number | null> {
  return dates.map((d, i) => {
    if (i === 0) return 0;
    const y = taux[i - 1] ?? taux[i];
    if (y === null) return null;
    const jours = (ms(d) - ms(dates[i - 1])) / MS_JOUR;
    return jours > 0 ? (y * jours) / 365 : 0;
  });
}

/** Rendements pas à pas d'un indice boursier, au dernier cours connu. */
function pasDIndice(code: string, dates: string[]): Array<number | null> {
  const hist = loadIndexHistory(code);
  if (hist.length === 0) return dates.map(() => null);
  // Dernier cours coté à la date, ou avant : la BRVM ne cote pas tous les jours
  // où un fonds publie sa VL, et inversement.
  const niveaux: Array<number | null> = [];
  let j = 0;
  let courant: number | null = null;
  for (const d of dates) {
    while (j < hist.length && hist[j].date <= d) {
      courant = hist[j].value;
      j++;
    }
    niveaux.push(courant);
  }
  return niveaux.map((v, i) => {
    if (i === 0) return 0;
    const prec = niveaux[i - 1];
    return v !== null && prec !== null && prec > 0 ? v / prec - 1 : null;
  });
}

/** Chaîne une suite de rendements en indice base 100. Un pas inconnu casse la
 *  série : on rend null plutôt que de reporter le niveau précédent, ce qui
 *  ferait passer un trou pour une performance nulle. */
function chainer(dates: string[], pas: Array<number | null>): BenchPoint[] {
  let niveau: number | null = 100;
  return dates.map((date, i) => {
    if (i === 0) return { date, value: 100 };
    const r = pas[i];
    niveau = niveau !== null && r !== null ? niveau * (1 + r) : null;
    return { date, value: niveau };
  });
}

/** Moyenne pondérée de deux suites de rendements, pas à pas. */
function melanger(
  a: Array<number | null>,
  b: Array<number | null>,
  poidsA: number,
): Array<number | null> {
  return a.map((x, i) => {
    const y = b[i];
    return x !== null && y !== null ? poidsA * x + (1 - poidsA) * y : null;
  });
}

const BRVMC = "BRVMC";

/**
 * Référence de marché d'une catégorie de fonds, alignée sur les dates données.
 *
 * Retourne null pour les catégories sans référence défendable — « Actifs non
 * cotés » n'a pas d'indice, et lui en coller un serait pire que de s'abstenir.
 */
export function benchmarkPourCategorie(
  categorie: string,
  dates: string[],
): Benchmark | null {
  if (dates.length < 2) return null;

  const actions = () => pasDIndice(BRVMC, dates);
  const souverains = (bande: [number, number]) =>
    pasDePortage(dates, rendementsSouverains(bande, dates));

  let cle: string;
  let label: string;
  let note: string;
  let pas: Array<number | null>;

  switch (categorie) {
    case "Actions":
      cle = "brvmc";
      label = "BRVM Composite";
      note = "Indice BRVM Composite, hors dividendes.";
      pas = actions();
      break;
    case "Obligataire":
      cle = "souv5a";
      label = "Souverains 5 ans";
      note =
        "Rendement moyen pondéré des adjudications UMOA-Titres de durée de vie moyenne 4 à 6,5 ans, capitalisé jour après jour. Portage seul : l'effet prix d'une variation de taux n'y figure pas.";
      pas = souverains(BANDE_5A);
      break;
    case "Monétaire":
      cle = "souvcourt";
      label = "Souverains < 2 ans";
      note =
        "Rendement moyen pondéré des adjudications UMOA-Titres de durée de vie moyenne inférieure à 2 ans, capitalisé jour après jour.";
      pas = souverains(BANDE_COURT);
      break;
    case "Diversifié":
      cle = "mixte";
      label = "50 % BRVMC + 50 % souverains 5 ans";
      note =
        "Moitié BRVM Composite, moitié rendement des adjudications UMOA-Titres 4 à 6,5 ans capitalisé. Rééquilibré à chaque relevé de VL, donc en continu.";
      pas = melanger(actions(), souverains(BANDE_5A), 0.5);
      break;
    default:
      return null;
  }

  const serie = chainer(dates, pas);
  // Une référence qui ne couvre presque aucune date n'aide personne.
  if (serie.filter((p) => p.value !== null).length < dates.length / 2) return null;
  return { cle, label, note, serie };
}
