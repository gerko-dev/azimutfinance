import "server-only";

import {
  loadAllActions,
  loadAllActionsEnriched,
  loadAverageVolumes,
  loadPriceHistory,
  loadIndexHistory,
} from "@/lib/dataLoader";
import { computeBeta } from "@/lib/stockStats";
import { computeFees } from "./engine";
import type {
  AccountPosition,
  BrokerageAccount,
  MarketFee,
  TpsRate,
  UemoaCountryCode,
} from "./types";

/**
 * Portefeuille optimal au sens de Markowitz, vente a decouvert interdite,
 * sous contrainte de liquidite du marche.
 *
 * POURQUOI LE RATIO DE SHARPE. « Maximiser la rentabilite ET minimiser la
 * volatilite » sont deux objectifs contradictoires : aucun portefeuille ne fait
 * les deux a la fois, il faut arbitrer. La VaR, elle, n'ajoute rien : c'est
 * 1,645 x sigma x montant, une fonction strictement croissante de la
 * volatilite — la minimiser revient exactement a minimiser sigma. Le probleme
 * se ramene donc a un moyenne-variance classique, dont la reponse canonique est
 * le portefeuille de Sharpe maximal : le meilleur rendement par unite de risque.
 *
 * PAS HEBDOMADAIRE, pas quotidien. Beaucoup de titres de la cote ne cotent pas
 * tous les jours. Sur un pas quotidien, la matrice de covariance se remplirait
 * de zeros correspondant a des seances sans echange : les correlations seraient
 * ecrasees et l'optimiseur croirait a une diversification qui n'existe pas. Le
 * pas hebdomadaire absorbe ces trous.
 *
 * RENDEMENTS ATTENDUS PAR LE MEDAF, pas par la moyenne historique. Une moyenne
 * historique sur trois ans est une estimation tres bruitee : l'optimiseur s'y
 * accroche et concentre tout sur le titre qui a le plus monte par hasard. Le
 * MEDAF ne retient que l'exposition au marche — la meme hypothese que l'onglet
 * Analyse, ce qui garde les deux ecrans coherents.
 *
 * VOLATILITES ANNUALISEES ici, alors que l'onglet Analyse les affiche par
 * seance : un portefeuille cible se juge sur un horizon d'un an, comme la VaR.
 * Les libelles de l'interface le disent a chaque colonne.
 *
 * TOUT EST INVESTI, A 5 % PRES. La tresorerie disponible entre dans le budget et
 * ne doit jamais depasser 5 % du portefeuille total : laisser du cash dormir a
 * une SGI, c'est accepter un rendement nul la ou le taux sans risque est deja
 * positif. Quand la liquidite du marche ne permet pas de tenir ce plafond en un
 * mois de bourse, on allonge l'horizon d'execution plutot que de renoncer.
 *
 * COURS DU MOMENT, pas cloture de la veille. Les positions detenues sont
 * revalorisees au cours live BRVM et les ordres chiffres au meme cours, faute
 * de quoi les poids actuels et les montants a passer ne parleraient pas du meme
 * marche.
 */

export type LigneOptimale = {
  code: string;
  nom: string;
  /** Poids dans le budget AVANT, en %. */
  poidsActuel: number;
  /** Poids cible, en %. */
  poidsCible: number;
  valeurActuelle: number;
  valeurCible: number;
  /** Positif = achat, negatif = vente. Montant brut en FCFA. */
  montantOrdre: number;
  /** Nombre de titres a acheter (>0) ou a vendre (<0). */
  quantite: number;
  cours: number;
  frais: number;
  /** Rendement attendu MEDAF, en % annuel. */
  rendementAttendu: number;
  /** Volatilite annualisee, en %. */
  volatilite: number;
  beta: number;
  /** Capitaux echangeables sans bousculer le marche, en FCFA. */
  capaciteMarche: number;
  /** Seances necessaires pour executer l'ordre au rythme retenu. */
  joursExecution: number;
  /** La contrainte de liquidite a limite la cible ou l'ordre. */
  plafonne: boolean;
  /** Visee par l'allocation, mais hors de portee du budget : zero titre. */
  nonAtteignable: boolean;
  /** Titre detenu mais hors univers optimisable : la cible est zero. */
  horsUnivers: boolean;
};

export type MetriquesPortefeuille = {
  /** % annuel, tresorerie comprise au taux sans risque. */
  rendement: number | null;
  /** % annualise. */
  volatilite: number | null;
  var95: number | null;
  sharpe: number | null;
  beta: number | null;
  /** Part non investie, en %. */
  partLiquide: number;
};

export type Optimisation = {
  lignes: LigneOptimale[];
  /** Budget optimisable : poche actions revalorisee + tresorerie. */
  budget: number;
  /** Valorisation de la poche actions au cours du moment. */
  montantActions: number;
  /** Tresorerie disponible, entierement mobilisee. */
  liquidites: number;
  /** Valorisation totale du portefeuille, poche obligataire comprise. */
  montantTotal: number;
  avant: MetriquesPortefeuille;
  apres: MetriquesPortefeuille;
  /** Frais de mise en oeuvre, deja deduits du budget cible. */
  fraisTotaux: number;
  /** Tresorerie restante apres execution : arrondis et plafonds de liquidite. */
  residuel: number;
  /** Capitaux echanges rapportes au budget, en %. */
  rotation: number;
  /** Seances necessaires pour executer le plan entier, ligne la plus lente. */
  joursExecution: number;
  /** Horizon retenu pour dimensionner les plafonds de liquidite, en seances. */
  horizonSeances: number;
  /** Valorisation de reference du plafond de tresorerie. */
  totalPortefeuille: number;
  /** Tresorerie maximale autorisee, en FCFA. */
  plafondTresorerie: number;
  /** Le residu depasse le plafond : la liquidite du marche n'a pas suffi. */
  tresorerieExcessive: boolean;
  /** Lignes dont la cible a ete limitee par la liquidite du marche. */
  plafonnees: number;
  /** Semaines de l'echantillon commun. */
  observations: number;
  /** Titres retenus dans l'univers optimisable. */
  universeTaille: number;
  /** Titres de la cote ecartes, faute de cotation ou de volume. */
  ecartes: number;
  /** Intensite du retrecissement de Ledoit-Wolf, de 0 a 1. */
  intensiteRetrecissement: number;
  /** Horodatage du calcul — les cours sont ceux de la derniere cotation connue. */
  calculeLe: string;
  tauxSansRisque: number;
  rendementMarche: number;
  /** L'optimiseur a bascule en variance minimale : aucune prime positive. */
  varianceMinimale: boolean;
  /** Le marche ne peut pas absorber la totalite du budget. */
  marcheSature: boolean;
};

const INDICE = "BRVMC";
const Z_95 = 1.645;
const SEMAINES_AN = 52;
const ANNEES = 3;
const MS_SEMAINE = 7 * 24 * 60 * 60 * 1000;
/** Part minimale de semaines reellement cotees pour entrer dans l'univers. */
const COUVERTURE_MIN = 0.6;
/** Rendements hebdomadaires necessaires pour une covariance exploitable. */
const MIN_OBS = 60;
/** Fenetre du volume moyen, en seances. */
const SEANCES_VOLUME = 90;
/**
 * Contrainte de liquidite : on ne prend qu'une part du flux quotidien, pendant
 * un nombre limite de seances.
 *
 * La BRVM est un marche etroit. Un ordre qui pese la moitie du flux d'une
 * valeur ne s'execute pas au dernier cours : il le deplace, et le gain de
 * diversification que l'optimiseur croyait capter part en impact de marche. On
 * ne prend donc qu'un quart du volume moyen par seance. Multiplie par l'horizon
 * d'execution retenu, ce rythme borne a la fois la TAILLE DE LA CIBLE, qu'il
 * faudra bien pouvoir deboucler un jour, et celle de CHAQUE ORDRE.
 */
const PART_VOLUME = 0.25;
/**
 * Horizon d'execution, en seances.
 *
 * Il n'est pas fixe : c'est le levier par lequel la contrainte de tresorerie et
 * celle de liquidite se reconcilient. Un marche etroit n'interdit pas
 * d'investir, il impose d'y mettre le temps. On part d'un mois de bourse et on
 * l'allonge juste ce qu'il faut pour que la tresorerie residuelle tienne sous
 * son plafond — jamais au-dela de six mois, au-dela desquels un plan d'ordres
 * calcule sur les cours du jour n'a plus de sens.
 */
const JOURS_EXECUTION_MIN = 20;
const JOURS_EXECUTION_MAX = 120;
/**
 * Plafond de tresorerie : 5 % du portefeuille total.
 *
 * Contrainte posee par le detenteur du compte, pas deduite d'un modele. Elle
 * prime sur le confort d'execution : quand la liquidite ne suffit pas a la
 * respecter en un mois, on allonge l'horizon plutot que de laisser dormir du
 * cash. Si meme six mois n'y suffisent pas, l'ecran le dit — mieux vaut une
 * contrainte affichee comme non tenue qu'un plan d'ordres inexecutable qui
 * pretendrait la tenir.
 */
const PART_TRESORERIE_MAX = 0.05;
/**
 * Bande de non-negociation, en points de poids.
 *
 * Sous ce seuil, l'ordre coute plus qu'il ne rapporte : le courtage minimum de
 * la SGI s'applique quelle que soit la taille, si bien qu'un ajustement de
 * deux dixiemes de point peut se payer plusieurs dizaines de milliers de
 * francs pour un effet nul sur le risque. La cible n'est pas atteinte au
 * centieme pres, et c'est voulu.
 */
const BANDE_MIN = 0.25;
/**
 * Poids cible minimal, en %, pour qu'une ligne non detenue figure au tableau de
 * l'allocation cible. En dessous, c'est du bruit d'optimiseur.
 */
const PART_MIN_AFFICHEE = 0.1;

// --- Algebre minimale ------------------------------------------------------

function produit(M: number[][], w: number[]): number[] {
  return M.map((ligne) => {
    let s = 0;
    for (let j = 0; j < w.length; j++) s += ligne[j] * w[j];
    return s;
  });
}

function variance(M: number[][], w: number[]): number {
  const Mw = produit(M, w);
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * Mw[i];
  return Math.max(0, s);
}

/**
 * Projection euclidienne sur le simplexe borne { 0 <= w <= plafond ; somme = 1 }.
 *
 * Sans plafonds, la projection admet une forme fermee par tri. Avec, il faut
 * chercher le seuil qui fait que les poids ecretes somment a un : la fonction
 * est continue et decroissante en ce seuil, une dichotomie la resout a la
 * precision machine en une centaine d'iterations.
 *
 * Si la somme des plafonds est inferieure a un, le marche ne peut tout
 * simplement pas absorber le budget : on investit le maximum possible et le
 * reste demeure en tresorerie. Forcer la somme a un reviendrait a simuler des
 * ordres inexecutables.
 */
function projeterSimplexeBorne(v: number[], plafond: number[]): number[] {
  const n = v.length;
  if (n === 0) return [];
  const sommePlafonds = plafond.reduce((s, x) => s + x, 0);
  if (sommePlafonds <= 1) return [...plafond];

  const f = (t: number) =>
    v.reduce((s, vi, i) => s + Math.min(plafond[i], Math.max(0, vi - t)), 0);

  // f(bas) = somme des plafonds > 1 ; f(haut) = 0 < 1. L'encadrement est acquis.
  let bas = Math.min(...v) - 1;
  let haut = Math.max(...v);
  for (let k = 0; k < 100; k++) {
    const milieu = (bas + haut) / 2;
    if (f(milieu) > 1) bas = milieu;
    else haut = milieu;
  }
  const seuil = (bas + haut) / 2;
  return v.map((vi, i) => Math.min(plafond[i], Math.max(0, vi - seuil)));
}

/**
 * Montee de gradient projetee.
 *
 * Pas de forme fermee : les contraintes de positivite et de liquidite privent
 * des solutions analytiques de Markowitz. On part de plusieurs points pour ne
 * pas rester coince dans un optimum local, et on garde le meilleur. Les departs
 * sont choisis, jamais tires au sort : un portefeuille optimal qui changerait a
 * chaque rafraichissement de la page ne serait pas exploitable.
 */
function optimiser(
  n: number,
  departs: number[][],
  plafond: number[],
  objectif: (w: number[]) => number,
  gradient: (w: number[]) => number[],
): number[] {
  let meilleur = projeterSimplexeBorne(new Array(n).fill(1 / n), plafond);
  let score = objectif(meilleur);

  for (const depart of departs) {
    let w = projeterSimplexeBorne(depart, plafond);
    let courant = objectif(w);
    let pas = 1;
    for (let iter = 0; iter < 600; iter++) {
      const g = gradient(w);
      if (!g.every(Number.isFinite)) break;
      const candidat = projeterSimplexeBorne(
        w.map((wi, i) => wi + pas * g[i]),
        plafond,
      );
      const valeur = objectif(candidat);
      if (valeur > courant) {
        w = candidat;
        courant = valeur;
      } else {
        pas *= 0.6;
        if (pas < 1e-8) break;
      }
    }
    if (courant > score) {
      score = courant;
      meilleur = w;
    }
  }
  return meilleur;
}

/** Departs : equiponderation, meilleurs rendements, plus faibles variances. */
function pointsDeDepart(mu: number[], cov: number[][]): number[][] {
  const n = mu.length;
  const out: number[][] = [new Array(n).fill(1 / n)];
  const parMu = mu.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const parVar = cov.map((l, i) => [l[i], i] as const).sort((a, b) => a[0] - b[0]);
  for (const liste of [parMu, parVar]) {
    for (const k of [3, 8]) {
      const taille = Math.max(1, Math.min(k, n));
      const w = new Array(n).fill(0);
      for (let i = 0; i < taille; i++) w[liste[i][1]] = 1 / taille;
      out.push(w);
    }
  }
  return out;
}

/**
 * Covariance retrecie de Ledoit-Wolf, cible a correlation constante.
 *
 * POURQUOI. Une quarantaine de titres pour cent-cinquante semaines, c'est huit
 * cents covariances estimees sur un echantillon a peine quatre fois plus long
 * que large. La matrice empirique est alors dominee par le bruit, et un
 * optimiseur moyenne-variance en fait un usage pervers : il repere les couples
 * dont la correlation a ETE faible par accident et les charge, croyant avoir
 * trouve une diversification gratuite. C'est la « maximisation de l'erreur
 * d'estimation » classique de Markowitz applique tel quel.
 *
 * Le retrecissement tire la matrice vers une cible structuree — ici, toutes les
 * correlations egales a leur moyenne — d'une intensite calculee, pas choisie :
 * elle vaut le rapport entre le bruit d'estimation et le biais de la cible. Plus
 * l'echantillon est court, plus la cible pese.
 *
 * L'entree est CENTREE et la normalisation est 1/T, comme dans la demonstration
 * de Ledoit et Wolf (2004) : le 1/(T-1) sans biais rendrait l'intensite
 * legerement incoherente avec la matrice qu'elle pondere, pour un ecart de
 * l'ordre du demi pour cent sur les variances.
 */
function covarianceRetrecie(X: number[][]): { cov: number[][]; intensite: number } {
  const n = X.length;
  if (n === 0) return { cov: [], intensite: 0 };
  const T = X[0].length;
  if (T < 2) {
    return { cov: Array.from({ length: n }, () => new Array(n).fill(0)), intensite: 0 };
  }

  const S = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += X[i][t] * X[j][t];
      S[i][j] = S[j][i] = s / T;
    }
  }

  const ec = S.map((l, i) => Math.sqrt(Math.max(Number.MIN_VALUE, l[i])));
  let sommeCorr = 0;
  let paires = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sommeCorr += S[i][j] / (ec[i] * ec[j]);
      paires++;
    }
  }
  const rBarre = paires > 0 ? sommeCorr / paires : 0;

  const F = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? S[i][i] : rBarre * ec[i] * ec[j])),
  );

  // pi : variance d'echantillonnage de chaque covariance.
  let pi = 0;
  const piM = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) {
        const d = X[i][t] * X[j][t] - S[i][j];
        s += d * d;
      }
      const v = s / T;
      piM[i][j] = piM[j][i] = v;
      pi += i === j ? v : 2 * v;
    }
  }

  // rho : covariance entre les erreurs de la matrice et celles de la cible.
  const theta = (i: number, j: number): number => {
    let s = 0;
    for (let t = 0; t < T; t++) {
      s += (X[i][t] * X[i][t] - S[i][i]) * (X[i][t] * X[j][t] - S[i][j]);
    }
    return s / T;
  };
  let rho = 0;
  for (let i = 0; i < n; i++) rho += piM[i][i];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      rho +=
        (rBarre / 2) *
        (Math.sqrt(S[j][j] / S[i][i]) * theta(i, j) +
          Math.sqrt(S[i][i] / S[j][j]) * theta(j, i));
    }
  }

  // gamma : distance entre la cible et la matrice empirique, soit le biais paye.
  let gamma = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) gamma += (F[i][j] - S[i][j]) ** 2;
  }

  const intensite =
    gamma > 0 ? Math.max(0, Math.min(1, (pi - rho) / gamma / T)) : 0;
  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => intensite * F[i][j] + (1 - intensite) * S[i][j]),
  );
  return { cov, intensite };
}

// --- Univers -----------------------------------------------------------------

type Actif = {
  code: string;
  nom: string;
  /** Volatilite annualisee, en %. */
  vol: number;
  beta: number;
  /** Volume moyen quotidien, en titres. */
  volumeMoyen: number;
};

/**
 * Univers investissable : la cote BRVM, ses volatilites, sa covariance et ses
 * volumes.
 *
 * MEMOISE PAR JOUR, comme les chargeurs de `lib/dataLoader`. Ce calcul ne
 * depend d'aucun compte : c'est la meme cote pour tout le monde, et il coute
 * une demi-seconde entre les quarante-sept historiques a projeter, les betas et
 * la matrice retrecie. Le recommencer a chaque affichage ferait payer a chaque
 * utilisateur un resultat identique.
 *
 * Ce qui est memoise ici, c'est de l'HISTORIQUE — rendements, correlations,
 * volumes — qui ne bouge qu'a la cloture. Les cours, eux, sont relus a chaque
 * appel : ce sont eux qui font bouger le portefeuille en cours de seance.
 */
let _universCache: {
  jour: string;
  actifs: Actif[];
  cov: number[][];
  observations: number;
  ecartes: number;
  intensite: number;
} | null = null;

function chargerUnivers() {
  const jour = new Date().toISOString().slice(0, 10);
  if (_universCache && _universCache.jour === jour) return _universCache;

  const indice = loadIndexHistory(INDICE);
  const volumes = loadAverageVolumes(SEANCES_VOLUME);

  // --- Grille hebdomadaire commune ---------------------------------------
  const fin = Date.now();
  const grille: string[] = [];
  for (let k = ANNEES * 52; k >= 0; k--) {
    grille.push(new Date(fin - k * MS_SEMAINE).toISOString().slice(0, 10));
  }

  const retenus: { actif: Actif; serie: (number | null)[] }[] = [];
  let ecartes = 0;

  for (const a of loadAllActions()) {
    const hist = loadPriceHistory(a.code);
    const volume = volumes.get(a.code) ?? null;
    // Sans volume moyen, aucune taille d'ordre n'est defendable : le titre est
    // ecarte plutot que dimensionne au hasard.
    if (a.price <= 0 || hist.length === 0 || !volume || volume <= 0) {
      ecartes++;
      continue;
    }
    // Projection sur la grille : dernier cours connu a chaque semaine.
    const serie: (number | null)[] = [];
    let i = 0;
    let dernier: number | null = null;
    let cotees = 0;
    for (const d of grille) {
      let vue = false;
      while (i < hist.length && hist[i].date <= d) {
        if (hist[i].value > 0) dernier = hist[i].value;
        vue = true;
        i++;
      }
      if (vue) cotees++;
      serie.push(dernier);
    }
    if (cotees / grille.length < COUVERTURE_MIN) {
      ecartes++;
      continue;
    }
    const beta = computeBeta(hist, indice);
    if (beta === null) {
      ecartes++;
      continue;
    }
    retenus.push({
      actif: { code: a.code, nom: a.name, vol: 0, beta, volumeMoyen: volume },
      serie,
    });
  }

  // --- Fenetre commune ----------------------------------------------------
  // On demarre la ou TOUS les titres retenus ont deja un cours. Une matrice de
  // covariance assemblee de couples de longueurs differentes ne serait pas
  // semi-definie positive, et l'optimiseur y trouverait des variances
  // negatives — donc un Sharpe infini sur un portefeuille absurde.
  let debut = 0;
  for (const r of retenus) {
    const premier = r.serie.findIndex((v) => v !== null && v > 0);
    if (premier > debut) debut = premier;
  }

  const univers: Actif[] = [];
  const R: number[][] = [];
  for (const r of retenus) {
    const px = r.serie.slice(debut);
    const rend: number[] = [];
    for (let k = 1; k < px.length; k++) {
      const p0 = px[k - 1];
      const p1 = px[k];
      if (!p0 || !p1 || p0 <= 0 || p1 <= 0) {
        rend.push(0);
        continue;
      }
      const x = Math.log(p1 / p0);
      // Un saut de plus de 30 % en une semaine est un fractionnement ou une
      // reprise de cotation, pas un rendement. On le neutralise au lieu de le
      // retirer : retirer la semaine desalignerait cette serie de toutes les
      // autres, et la covariance n'aurait plus de sens.
      rend.push(Math.abs(x) > 0.3 ? 0 : x);
    }
    if (rend.length < MIN_OBS) {
      ecartes++;
      continue;
    }
    univers.push(r.actif);
    R.push(rend);
  }

  const n = univers.length;
  const L = n > 0 ? R[0].length : 0;

  // --- Covariance retrecie, annualisee, en points de pourcentage ----------
  const moyennes = R.map((x) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length));
  const X = R.map((x, i) => x.map((v) => v - moyennes[i]));
  const { cov: covHebdo, intensite } = covarianceRetrecie(X);
  const cov = covHebdo.map((ligne) => ligne.map((v) => v * SEMAINES_AN * 10000));
  for (let a = 0; a < n; a++) univers[a].vol = Math.sqrt(Math.max(0, cov[a][a]));

  _universCache = { jour, actifs: univers, cov, observations: L, ecartes, intensite };
  return _universCache;
}

// --- Optimisation ----------------------------------------------------------

export async function optimiserPortefeuille(
  positions: AccountPosition[],
  liquidites: number,
  account: BrokerageAccount,
  marketFees: Map<string, MarketFee>,
  tpsRates: Map<UemoaCountryCode, TpsRate>,
  tauxSansRisque: number,
  rendementMarche: number,
): Promise<Optimisation> {
  const montantTotal = positions.reduce((s, p) => s + p.marketValue, 0);
  const tresorerie = Math.max(0, liquidites);
  // Seule la poche actions est optimisee. Une obligation portee jusqu'a
  // l'echeance n'a rien a faire dans un moyenne-variance sur actions, et
  // produire un ordre de vente dessus serait une recommandation deguisee que
  // personne n'a demandee.
  const pocheActions = positions.filter((p) => p.securityType === "stock");

  const { actifs: univers, cov, observations: L, ecartes, intensite } = chargerUnivers();
  const n = univers.length;

  // Cours du moment : cotation live BRVM quand elle existe, derniere cloture
  // sinon. La meme valeur sert a revaloriser l'existant et a chiffrer les
  // ordres — sans quoi les poids « avant » decriraient un autre marche que les
  // montants a passer.
  const enrichies = await loadAllActionsEnriched();
  const coursParCode = new Map(enrichies.map((a) => [a.code, a.price]));
  const cours = univers.map((u) => coursParCode.get(u.code) ?? 0);

  // --- Positions actuelles -------------------------------------------------
  const indexParCode = new Map(univers.map((u, i) => [u.code, i]));
  const detenu = new Array(n).fill(0);
  const horsUnivers: AccountPosition[] = [];
  for (const p of pocheActions) {
    const i = indexParCode.get(p.code);
    if (i === undefined) {
      if (p.units > 0) horsUnivers.push(p);
      continue;
    }
    detenu[i] += p.units;
  }
  const valeurActuelle = detenu.map((q, i) => q * cours[i]);
  const valeurAutres = horsUnivers.reduce((s, p) => s + p.marketValue, 0);
  const montantActions =
    valeurActuelle.reduce((s, v) => s + v, 0) + valeurAutres;
  const budget = montantActions + tresorerie;
  // La poche non optimisee — obligations et assimiles — ne finance aucun ordre
  // mais compte dans le total sur lequel se mesure le plafond de tresorerie :
  // c'est bien « 5 % du portefeuille », pas 5 % de la poche actions.
  const valeurObligataire = positions
    .filter((p) => p.securityType !== "stock")
    .reduce((s, p) => s + p.marketValue, 0);

  // Le MEDAF, recalcule a chaque appel : seul morceau qui depende des
  // hypotheses de taux, et le seul qui ne coute rien.
  const mu = univers.map(
    (u) => tauxSansRisque + u.beta * (rendementMarche - tauxSansRisque),
  );

  // --- Contraintes de tresorerie et de liquidite ---------------------------
  //
  // Les deux se tiennent : le plafond de tresorerie dit COMBIEN il faut
  // investir, la liquidite dit a quelle vitesse le marche l'absorbe. L'horizon
  // d'execution est la variable d'ajustement — on l'allonge jusqu'a ce que la
  // capacite de la cote couvre le budget moins le residu tolere.
  const totalPortefeuille = montantActions + valeurObligataire + tresorerie;
  const plafondTresorerie = totalPortefeuille * PART_TRESORERIE_MAX;
  const capaciteSeance = univers.map(
    (u, i) => u.volumeMoyen * cours[i] * PART_VOLUME,
  );
  const capaciteTotaleSeance = capaciteSeance.reduce((s, c) => s + c, 0);
  // On ne vise pas le plafond, on vise la moitie du plafond. Dimensionner
  // l'horizon au ras des 5 % ferait franchir la limite par le seul arrondi au
  // titre entier : le plan respecterait la contrainte en theorie et la
  // violerait de quelques centiemes a l'execution. La marge coute quelques
  // seances d'horizon, et seulement pour les portefeuilles assez gros pour
  // saturer la cote.
  const aInvestir = Math.max(0, budget - plafondTresorerie * 0.5);
  const horizonSeances =
    capaciteTotaleSeance > 0
      ? Math.min(
          JOURS_EXECUTION_MAX,
          Math.max(JOURS_EXECUTION_MIN, Math.ceil(aInvestir / capaciteTotaleSeance)),
        )
      : JOURS_EXECUTION_MIN;
  const capaciteMarche = capaciteSeance.map((c) => c * horizonSeances);
  const plafond = capaciteMarche.map((c) =>
    budget > 0 ? Math.min(1, c / budget) : 0,
  );
  const marcheSature = plafond.reduce((s, x) => s + x, 0) <= 1;

  // --- Poids cibles --------------------------------------------------------
  // Si aucun titre n'offre de prime positive, maximiser un Sharpe negatif
  // reviendrait a CHERCHER la volatilite la plus forte : le ratio croit quand
  // le denominateur d'un numerateur negatif augmente. On bascule alors sur la
  // variance minimale, seul objectif qui garde un sens dans ce cas.
  const varianceMinimale = n > 0 && Math.max(...mu) <= tauxSansRisque;
  let poidsCible: number[] = new Array(n).fill(0);
  if (n > 0 && budget > 0) {
    const departs = pointsDeDepart(mu, cov);
    poidsCible = varianceMinimale
      ? optimiser(
          n,
          departs,
          plafond,
          (w) => -variance(cov, w),
          (w) => produit(cov, w).map((x) => -2 * x),
        )
      : optimiser(
          n,
          departs,
          plafond,
          (w) => {
            const sd = Math.sqrt(variance(cov, w));
            if (sd <= 1e-9) return -Infinity;
            return (w.reduce((s, wi, i) => s + wi * mu[i], 0) - tauxSansRisque) / sd;
          },
          (w) => {
            const sd = Math.sqrt(variance(cov, w));
            if (sd <= 1e-9) return new Array(n).fill(0);
            const exces = w.reduce((s, wi, i) => s + wi * mu[i], 0) - tauxSansRisque;
            const covW = produit(cov, w);
            // d/dw [ (mu'w - rf) / sd ] = mu/sd - exces x (cov w) / sd^3
            return mu.map((m, i) => m / sd - (exces * covW[i]) / sd ** 3);
          },
        );
  }

  /**
   * Metriques d'un portefeuille decrit en FCFA.
   *
   * La tresorerie n'est pas un trou : elle rapporte le taux sans risque et ne
   * porte aucun risque. La compter a zero ferait paraitre un portefeuille
   * partiellement liquide plus mauvais qu'il n'est, et donc l'optimisation plus
   * flatteuse qu'elle n'est. Les titres detenus hors univers, eux, sont bien
   * comptes a zero faute de statistiques — meme convention que l'onglet Analyse.
   */
  const metriques = (
    valeurs: number[],
    liquide: number,
    autres: number,
  ): MetriquesPortefeuille => {
    const base = valeurs.reduce((s, v) => s + v, 0) + liquide + autres;
    if (n === 0 || base <= 0) {
      return {
        rendement: null,
        volatilite: null,
        var95: null,
        sharpe: null,
        beta: null,
        partLiquide: 0,
      };
    }
    const w = valeurs.map((v) => v / base);
    const partLiquide = (liquide / base) * 100;
    const rendement =
      w.reduce((s, wi, i) => s + wi * mu[i], 0) + (liquide / base) * tauxSansRisque;
    const volatilite = Math.sqrt(variance(cov, w));
    return {
      rendement,
      volatilite,
      var95: (Z_95 * volatilite * base) / 100,
      sharpe: volatilite > 0 ? (rendement - tauxSansRisque) / volatilite : null,
      beta: w.reduce((s, wi, i) => s + wi * univers[i].beta, 0),
      partLiquide,
    };
  };

  // --- Ordres et frais -----------------------------------------------------
  // Les frais sont payes par le portefeuille : viser exactement le budget
  // laisserait le plan sous-finance du montant des commissions. On chiffre donc
  // une premiere fois a budget plein, puis on rejoue en retranchant les frais
  // obtenus. Deux passes suffisent, la correction du second tour portant sur
  // quelques pour mille.
  const construire = (budgetCible: number) => {
    const lignes: LigneOptimale[] = [];
    // Valeurs REELLEMENT obtenues apres arrondi au titre entier, bande de
    // non-negociation et plafond de liquidite. C'est sur elles que sont
    // calculees les metriques « apres » : afficher celles de la cible
    // theorique promettrait un portefeuille que la liste d'ordres ne construit
    // pas.
    const realise = [...valeurActuelle];
    const quantites = new Array(n).fill(0);
    const plafonneLigne: boolean[] = new Array(n).fill(false);
    let fraisHors = 0;
    let echangeHors = 0;
    let plafonnees = 0;

    for (const p of horsUnivers) {
      fraisHors += computeFees(p.marketValue, account, marketFees, tpsRates).total;
      echangeHors += p.marketValue;
    }

    // --- Dimensionnement de chaque ligne ------------------------------------
    for (let i = 0; i < n; i++) {
      const prix = cours[i];
      const cible = poidsCible[i] * budgetCible;
      const derive =
        budget > 0 ? Math.abs((cible - valeurActuelle[i]) / budget) * 100 : 0;
      // Troncature, pas arrondi. Arrondir au plus proche fait acheter un titre
      // de trop : le plan reclame alors plus de liquidites qu'il n'en existe et
      // devient infinancable. On sous-investit d'abord, le balayage ci-dessous
      // replace le reste.
      let q =
        prix > 0 && derive >= BANDE_MIN
          ? Math.trunc((cible - valeurActuelle[i]) / prix)
          : 0;

      // Plafond de liquidite sur l'ORDRE lui-meme : une position heritee plus
      // grosse que ce que le marche absorbe se deboucle en plusieurs mois, pas
      // en une seance.
      const maxTitres = prix > 0 ? Math.floor(capaciteMarche[i] / prix) : 0;
      if (Math.abs(q) > maxTitres) {
        q = Math.sign(q) * maxTitres;
        plafonneLigne[i] = true;
      }
      // On ne vend jamais plus que ce qui est detenu : l'arrondi pourrait
      // sinon creer une position courte, interdite a la BRVM.
      if (q < -detenu[i]) q = -detenu[i];

      quantites[i] = q;
      realise[i] = valeurActuelle[i] + q * prix;
    }

    const fraisDe = (i: number) =>
      quantites[i] !== 0
        ? computeFees(
            Math.abs(quantites[i]) * cours[i],
            account,
            marketFees,
            tpsRates,
          ).total
        : 0;
    const fraisLigne = quantites.map((_, i) => fraisDe(i));
    const total = () =>
      fraisHors +
      fraisLigne.reduce((s, v) => s + v, 0) +
      realise.reduce((s, v) => s + v, 0);

    const tresorerieRestante = () => budget - total();
    const bouger = (i: number, pas: number) => {
      quantites[i] += pas;
      realise[i] = valeurActuelle[i] + quantites[i] * cours[i];
      fraisLigne[i] = fraisDe(i);
    };

    // --- Financement : le plan ne peut pas coûter plus que le compte ---------
    //
    // Les cibles sont calculees en valeur, sans savoir qu'un titre est
    // indivisible. Quand une vente ne peut pas se faire — il faudrait ceder
    // six dixiemes d'action — les achats qu'elle devait financer restent, eux,
    // parfaitement possibles, et le plan reclame alors plus de liquidites qu'il
    // n'en existe. On rabote donc les achats, en commencant par celui qui
    // depasse le plus sa cible, jusqu'a ce que le plan se finance.
    for (let garde = 0; garde < 200 && tresorerieRestante() < 0; garde++) {
      let choix = -1;
      let pireExces = -Infinity;
      for (let i = 0; i < n; i++) {
        if (quantites[i] <= 0) continue;
        const exces = realise[i] - poidsCible[i] * budgetCible;
        if (exces > pireExces) {
          pireExces = exces;
          choix = i;
        }
      }
      if (choix < 0) break;
      const manque = -tresorerieRestante();
      const pas = Math.min(
        quantites[choix],
        Math.max(1, Math.ceil(manque / cours[choix])),
      );
      bouger(choix, -pas);
    }

    // --- Balayage de la tresorerie residuelle -------------------------------
    //
    // La troncature au titre entier laisse forcement du cash : sur un petit
    // portefeuille, une seule action a seize mille francs suffit a faire dix
    // pour cent du total. On replace ce residu tant que la tresorerie depasse
    // son plafond, en servant a chaque tour la ligne la plus en retard.
    //
    // Les lignes qui portent DEJA un ordre passent en premier : y ajouter un
    // titre ne coute que le courtage proportionnel, alors qu'ouvrir un nouvel
    // ordre declenche le minimum de courtage de la SGI pour une seule action.
    //
    // Deuxieme tour, si le premier ne suffit pas : on autorise le DEPASSEMENT
    // des cibles. Le plafond de tresorerie est une contrainte posee par le
    // detenteur du compte, la ponderation optimale n'est qu'un objectif — quand
    // les deux s'opposent, c'est la contrainte qui l'emporte, au prix d'un
    // ecart a l'allocation ideale.
    for (const depassementAutorise of [false, true]) {
      for (let garde = 0; garde < 500; garde++) {
        const dispo = tresorerieRestante();
        if (dispo <= plafondTresorerie) break;

        let choix = -1;
        let meilleur = 0;
        let choixNeuf = -1;
        let meilleurNeuf = 0;
        for (let i = 0; i < n; i++) {
          const prix = cours[i];
          if (prix <= 0) continue;
          const retard = poidsCible[i] * budgetCible - realise[i];
          if (retard <= 0 && !depassementAutorise) continue;
          // Le titre supplementaire doit rester dans la capacite du marche...
          if (Math.abs(quantites[i] + 1) * prix > capaciteMarche[i]) continue;
          // ...et etre finance par la tresorerie disponible, frais compris.
          quantites[i] += 1;
          const surcout = fraisDe(i) - fraisLigne[i] + prix;
          quantites[i] -= 1;
          if (surcout > dispo) continue;

          // Au premier tour on comble le retard ; au second, faute de retard a
          // combler, on renforce la ligne dont la cible est la plus lourde.
          const score = depassementAutorise && retard <= 0 ? poidsCible[i] : retard;
          if (quantites[i] !== 0) {
            if (score > meilleur) {
              meilleur = score;
              choix = i;
            }
          } else if (score > meilleurNeuf) {
            meilleurNeuf = score;
            choixNeuf = i;
          }
        }
        if (choix < 0) choix = choixNeuf;
        if (choix < 0) break;

        // Par paquets : un residu de plusieurs centaines de millions replace
        // action par action a soixante-dix francs ne convergerait jamais.
        const prix = cours[choix];
        const retard = poidsCible[choix] * budgetCible - realise[choix];
        const parLaCapacite =
          Math.floor(capaciteMarche[choix] / prix) - Math.abs(quantites[choix]);
        const parLaCible = retard > 0 ? Math.ceil(retard / prix) : Infinity;
        const pas = Math.max(
          1,
          Math.min(Math.floor(dispo / prix), parLaCible, parLaCapacite),
        );
        bouger(choix, pas);
        // Les frais du paquet peuvent avoir mordu au-dela du disponible : on
        // recule d'un titre a la fois, ce qui converge en quelques tours.
        for (let recul = 0; recul < 50 && tresorerieRestante() < 0; recul++) {
          if (quantites[choix] <= 0) break;
          bouger(choix, -1);
        }
      }
    }

    // --- Emission des lignes ------------------------------------------------
    let frais = fraisHors;
    let echange = echangeHors;
    let joursMax = 0;

    for (const p of horsUnivers) {
      const brut = p.marketValue;
      const f = computeFees(brut, account, marketFees, tpsRates).total;
      lignes.push({
        code: p.code,
        nom: p.name,
        poidsActuel: budget > 0 ? (p.marketValue / budget) * 100 : 0,
        poidsCible: 0,
        valeurActuelle: p.marketValue,
        valeurCible: 0,
        montantOrdre: -brut,
        quantite: -p.units,
        cours: p.currentPrice,
        frais: f,
        rendementAttendu: 0,
        volatilite: 0,
        beta: 0,
        capaciteMarche: 0,
        joursExecution: 0,
        plafonne: false,
        nonAtteignable: false,
        horsUnivers: true,
      });
    }

    for (let i = 0; i < n; i++) {
      const u = univers[i];
      const prix = cours[i];
      const cible = poidsCible[i] * budgetCible;
      const quantite = quantites[i];
      const brut = Math.abs(quantite) * prix;
      const f = fraisLigne[i];
      const jours =
        capaciteSeance[i] > 0 ? brut / capaciteSeance[i] : 0;
      frais += f;
      echange += brut;
      if (jours > joursMax) joursMax = jours;
      // Le plafond a mordu sur la cible elle-meme, pas seulement sur l'ordre.
      const cibleEcretee = poidsCible[i] >= plafond[i] - 1e-9 && plafond[i] < 1;
      if (cibleEcretee || plafonneLigne[i]) plafonnees++;
      // Une ligne ni detenue, ni negociee, ni visee n'a rien a faire au
      // tableau. Les lignes VISEES mais hors de portee du budget, elles, y
      // figurent : c'est precisement ce qui explique qu'un petit portefeuille
      // n'atteigne pas l'allocation ideale, et le masquer laisserait le lecteur
      // devant une somme de parts cibles qui ne fait pas cent.
      const viseeSignificative = poidsCible[i] * 100 >= PART_MIN_AFFICHEE;
      if (valeurActuelle[i] === 0 && quantite === 0 && !viseeSignificative) continue;
      lignes.push({
        code: u.code,
        nom: u.nom,
        poidsActuel: budget > 0 ? (valeurActuelle[i] / budget) * 100 : 0,
        poidsCible: poidsCible[i] * 100,
        valeurActuelle: valeurActuelle[i],
        valeurCible: cible,
        montantOrdre: quantite * prix,
        quantite,
        cours: prix,
        frais: f,
        rendementAttendu: mu[i],
        volatilite: u.vol,
        beta: u.beta,
        capaciteMarche: capaciteMarche[i],
        joursExecution: jours,
        plafonne: cibleEcretee || plafonneLigne[i],
        nonAtteignable: realise[i] <= 0 && viseeSignificative,
        horsUnivers: false,
      });
    }

    const investi = realise.reduce((s, v) => s + v, 0);
    return { lignes, frais, echange, realise, investi, plafonnees, joursMax };
  };

  const premierePasse = construire(budget);
  const plan = construire(Math.max(0, budget - premierePasse.frais));
  plan.lignes.sort(
    (a, b) => b.poidsCible - a.poidsCible || b.valeurActuelle - a.valeurActuelle,
  );

  // Ce qui reste en tresorerie apres balayage. Le plan garantit ce montant sous
  // le plafond des 5 %, sauf quand aucun titre supplementaire n'est finançable
  // — parce que le marche ne l'absorbe plus, ou parce que la moindre action
  // cotee vaut deja plus que le residu autorise.
  const residuel = Math.max(0, budget - plan.frais - plan.investi);

  return {
    lignes: plan.lignes,
    budget,
    montantActions,
    liquidites: tresorerie,
    montantTotal,
    avant: metriques(valeurActuelle, tresorerie, valeurAutres),
    apres: metriques(plan.realise, residuel, 0),
    fraisTotaux: plan.frais,
    residuel,
    rotation: budget > 0 ? (plan.echange / budget) * 100 : 0,
    joursExecution: plan.joursMax,
    horizonSeances,
    totalPortefeuille,
    plafondTresorerie,
    tresorerieExcessive: residuel > plafondTresorerie + 1,
    plafonnees: plan.plafonnees,
    observations: L,
    universeTaille: n,
    ecartes,
    intensiteRetrecissement: intensite,
    calculeLe: new Date().toISOString(),
    tauxSansRisque,
    rendementMarche,
    varianceMinimale,
    marcheSature,
  };
}
