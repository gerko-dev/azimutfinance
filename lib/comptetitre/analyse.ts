import "server-only";

import { loadPriceHistory, loadIndexHistory } from "@/lib/dataLoader";
import { computeBeta } from "@/lib/stockStats";
import { getLatest, preloadTauxData } from "@/lib/tauxLoader";
import type { AccountPosition } from "./types";

/**
 * Analyse de portefeuille selon le MEDAF.
 *
 * CONVENTIONS RETENUES, parce qu'elles changent les chiffres du simple au
 * decuple et qu'aucune n'est « la » bonne dans l'absolu :
 *
 *  - Volatilite QUOTIDIENNE, ecart-type des rendements logarithmiques
 *    journaliers, NON annualisee. Le reste du portail annualise (x racine de
 *    252) ; ici non, et l'interface le dit a chaque colonne.
 *  - VaR a 95 % sur UN AN : la volatilite quotidienne est d'abord annualisee
 *    (x racine de 252), puis VaR = 1,645 x volatilite annuelle x montant. Les
 *    volatilites AFFICHEES restent quotidiennes ; seule la VaR change
 *    d'horizon, et son libelle le dit.
 *  - Beta calcule contre le BRVM Composite, sur l'historique aligne commun.
 *
 * La volatilite du portefeuille n'est PAS la moyenne ponderee des volatilites.
 * On reconstruit la serie de rendements du portefeuille aux poids actuels, puis
 * on en prend l'ecart-type : c'est la seule facon de tenir compte des
 * correlations. Une moyenne ponderee ignorerait la diversification et
 * surestimerait systematiquement le risque.
 */

export type LigneAnalyse = {
  code: string;
  nom: string;
  /** Volatilite quotidienne en %, null si l'historique est trop court. */
  volatilite: number | null;
  beta: number | null;
  /** Rendement attendu MEDAF en %, null sans beta. */
  rendementAttendu: number | null;
  pru: number;
  cours: number;
  quantite: number;
  prixRevient: number;
  partRevient: number;
  valorisation: number;
  partValorisation: number;
  difference: number;
};

export type AnalysePortefeuille = {
  lignes: LigneAnalyse[];
  montant: number;
  tauxSansRisque: number;
  rendementMarche: number;
  betaPortefeuille: number | null;
  volatilitePortefeuille: number | null;
  /** Volatilite du portefeuille annualisee, base de la VaR. */
  volatiliteAnnuelle: number | null;
  rentabiliteEsperee: number | null;
  var95: number | null;
  /** Positions ecartees du calcul de risque, faute d'historique. */
  sansHistorique: string[];
};

const INDICE = "BRVMC";
/** Fenetre du rendement de marche, en annees. */
const ANNEES_MARCHE = 5;
const Z_95 = 1.645;
/** Seances de bourse par an — sert a annualiser la volatilite pour la VaR. */
const SEANCES_AN = 252;
const MIN_POINTS = 30;

function rendementsLog(valeurs: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i - 1] <= 0 || valeurs[i] <= 0) continue;
    const r = Math.log(valeurs[i] / valeurs[i - 1]);
    // Un saut de plus de 30 % en une seance est un fractionnement ou une
    // reprise de cotation, pas un rendement : l'inclure ferait exploser la
    // volatilite et fausserait tout le reste.
    if (Math.abs(r) > 0.3) continue;
    out.push(r);
  }
  return out;
}

function ecartType(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const moy = xs.reduce((s, v) => s + v, 0) / xs.length;
  const varc = xs.reduce((s, v) => s + (v - moy) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varc);
}

/**
 * Taux sans risque : taux minimum des appels d'offres de la BCEAO, le taux
 * directeur que le portail publie deja sur /marche-monetaire.
 *
 * C'est le taux court sans risque de credit de la zone — le choix canonique
 * pour un MEDAF en UEMOA. Renvoie null si la serie est indisponible : mieux
 * vaut une hypothese vide qu'un chiffre invente que l'utilisateur prendrait
 * pour une mesure.
 */
export async function tauxSansRisqueBceao(): Promise<number | null> {
  await preloadTauxData();
  const p = getLatest(
    "1_Taux_directeurs_BCEAO",
    "Taux minimum appels offres",
    "UEMOA",
  );
  return p && Number.isFinite(p.value) ? p.value : null;
}

/**
 * Rendement du marche : performance annualisee du BRVM Composite sur les cinq
 * dernieres annees.
 *
 * ANNUALISEE, pas cumulee : le MEDAF raisonne en taux annuel, et comparer une
 * performance quinquennale cumulee a un taux directeur annuel produirait une
 * prime de risque absurde. On prend donc le taux de croissance annuel moyen
 * entre le cours d'il y a cinq ans et le dernier.
 */
export function rendementMarche5Ans(): number | null {
  const hist = loadIndexHistory(INDICE).filter((p) => p.value > 0);
  if (hist.length < 2) return null;
  const fin = hist[hist.length - 1];
  const cible = new Date(fin.date);
  cible.setFullYear(cible.getFullYear() - ANNEES_MARCHE);
  const cibleIso = cible.toISOString().slice(0, 10);

  // Premier point A PARTIR de la date cible : si l'historique commence apres,
  // on annualise sur la duree reellement couverte plutot que de pretendre
  // cinq ans.
  const debut = hist.find((p) => p.date >= cibleIso) ?? hist[0];
  if (debut.value <= 0 || debut.date >= fin.date) return null;
  const annees =
    (Date.parse(fin.date) - Date.parse(debut.date)) /
    (365.25 * 24 * 60 * 60 * 1000);
  if (annees < 1) return null;
  return ((fin.value / debut.value) ** (1 / annees) - 1) * 100;
}

export function analyserPortefeuille(
  positions: AccountPosition[],
  tauxSansRisque: number,
  rendementMarche: number,
): AnalysePortefeuille {
  const indice = loadIndexHistory(INDICE);

  const totalRevient = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalValo = positions.reduce((s, p) => s + p.marketValue, 0);

  const sansHistorique: string[] = [];
  // Series de rendements par code, pour reconstruire celle du portefeuille.
  const rendementsParCode = new Map<string, { dates: string[]; r: number[] }>();

  const lignes: LigneAnalyse[] = positions.map((p) => {
    const hist = loadPriceHistory(p.code);
    const valeurs = hist.map((h) => h.value);
    const r = rendementsLog(valeurs);

    let volatilite: number | null = null;
    if (r.length >= MIN_POINTS) {
      const sd = ecartType(r);
      volatilite = sd === null ? null : sd * 100;
      rendementsParCode.set(p.code, {
        dates: hist.slice(1).map((h) => h.date),
        r,
      });
    } else {
      sansHistorique.push(p.code);
    }

    const beta = computeBeta(hist, indice);
    const rendementAttendu =
      beta === null
        ? null
        : tauxSansRisque + beta * (rendementMarche - tauxSansRisque);

    return {
      code: p.code,
      nom: p.name,
      volatilite,
      beta,
      rendementAttendu,
      pru: p.avgCost,
      cours: p.currentPrice,
      quantite: p.units,
      prixRevient: p.costBasis,
      partRevient: totalRevient > 0 ? (p.costBasis / totalRevient) * 100 : 0,
      valorisation: p.marketValue,
      partValorisation: totalValo > 0 ? (p.marketValue / totalValo) * 100 : 0,
      difference: p.unrealizedPL,
    };
  });

  // --- Beta du portefeuille : SOMMEPROD(beta ; part valorisation) ---------
  //
  // Produit scalaire du beta de chaque ligne par sa part dans la valorisation
  // TOTALE — la colonne « Part » telle qu'elle s'affiche, sans renormalisation.
  //
  // Consequence a connaitre : une ligne sans beta calculable compte pour ZERO,
  // comme une cellule vide dans un tableur. Elle tire donc le beta du
  // portefeuille vers le bas, exactement comme le ferait de la tresorerie. Une
  // renormalisation sur les seules lignes betaisees supposerait au contraire
  // qu'elles se comportent comme la moyenne des autres — hypothese plus forte,
  // et fausse pour une obligation.
  //
  // Le beta EST lineaire en les poids, contrairement a la volatilite : cette
  // somme ponderee est donc exacte, la ou la meme operation sur les
  // volatilites serait fausse.
  let betaPortefeuille: number | null = null;
  if (totalValo > 0 && lignes.some((l) => l.beta !== null)) {
    betaPortefeuille = lignes.reduce(
      (s, l) => s + (l.beta ?? 0) * (l.valorisation / totalValo),
      0,
    );
  }

  // --- Volatilite du portefeuille : serie reconstruite, pas moyenne --------
  let volatilitePortefeuille: number | null = null;
  const contributives = lignes.filter(
    (l) => rendementsParCode.has(l.code) && l.valorisation > 0,
  );
  if (contributives.length > 0) {
    const poidsTotal = contributives.reduce((s, l) => s + l.valorisation, 0);
    // Axe commun : les dates ou TOUTES les lignes contributives ont cote. Une
    // union laisserait des trous que l'on comblerait par zero, ce qui
    // inventerait des seances sans mouvement et diluerait la volatilite.
    const parDate = contributives.map((l) => {
      const s = rendementsParCode.get(l.code)!;
      const m = new Map<string, number>();
      s.dates.forEach((d, i) => m.set(d, s.r[i]));
      return { poids: l.valorisation / poidsTotal, m };
    });
    const communes = parDate
      .reduce<string[]>(
        (acc, s, i) =>
          i === 0 ? Array.from(s.m.keys()) : acc.filter((d) => s.m.has(d)),
        [],
      )
      .sort();

    if (communes.length >= MIN_POINTS) {
      const serie = communes.map((d) =>
        parDate.reduce((s, x) => s + x.poids * (x.m.get(d) as number), 0),
      );
      const sd = ecartType(serie);
      volatilitePortefeuille = sd === null ? null : sd * 100;
    }
  }

  const rentabiliteEsperee =
    betaPortefeuille === null
      ? null
      : tauxSansRisque + betaPortefeuille * (rendementMarche - tauxSansRisque);

  // VaR annuelle : la volatilite quotidienne est annualisee avant d'etre
  // convertie en perte potentielle. Passer par la volatilite quotidienne sans
  // l'annualiser donnerait la perte d'UNE seance, soit environ seize fois
  // moins — l'ecart entre les deux lectures n'est pas un detail de presentation.
  const volatiliteAnnuelle =
    volatilitePortefeuille === null
      ? null
      : volatilitePortefeuille * Math.sqrt(SEANCES_AN);

  const var95 =
    volatiliteAnnuelle === null
      ? null
      : (Z_95 * volatiliteAnnuelle * totalValo) / 100;

  return {
    lignes,
    montant: totalValo,
    tauxSansRisque,
    rendementMarche,
    betaPortefeuille,
    volatilitePortefeuille,
    volatiliteAnnuelle,
    rentabiliteEsperee,
    var95,
    sansHistorique,
  };
}
