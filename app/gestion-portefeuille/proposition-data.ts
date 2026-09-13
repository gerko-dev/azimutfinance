import "server-only";

// === Proposition d'allocation — moteur ===
//
// Trois étapes, dans cet ordre :
//   1. ESTIMER    — rendements hebdomadaires, bêta, matrice de covariance.
//   2. OPTIMISER  — maximiser le ratio de Sharpe sous contrainte de poids.
//   3. TRADUIRE   — poids en nombres de titres, puis en ordres d'achat/vente.
//
// POURQUOI L'HEBDOMADAIRE — sur la BRVM, une valeur peut rester plusieurs
// séances sans transaction. En rendements quotidiens, ces séances plates
// produisent des zéros qui écrasent la covariance avec l'indice : les bêtas
// tendent artificiellement vers zéro et les volatilités sont sous-estimées.
// Le pas hebdomadaire laisse le temps à une transaction de se produire.

import { loadIndexHistory, loadPriceHistory, loadStocks } from "@/lib/dataLoader";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type { CustomSecurity, SavedPosition } from "./portfolio-types";
import {
  PARAMETRES_DEFAUT,
  quantileNormal,
  SEMAINES_PAR_AN,
  type LigneProposition,
  type ParametresProposition,
  type TableauProposition,
} from "./proposition-types";

/** Indice de référence du marché actions. */
const INDICE_MARCHE = "BRVMC";

/** Profondeur d'estimation. Trois ans d'hebdomadaire ≈ 150 points : assez pour
 *  une covariance sur une quarantaine de valeurs, assez court pour que le
 *  régime de marché reste comparable. */
const SEMAINES_ESTIMATION = 156;

/**
 * Historique minimal exigé d'une valeur pour entrer dans l'optimisation.
 *
 * Deux ans. Ce n'est pas un confort statistique : avec une quarantaine
 * d'actifs, une matrice de covariance estimée sur moins de périodes qu'elle ne
 * compte d'actifs est SINGULIÈRE. L'optimisateur y trouve alors des
 * combinaisons de variance quasi nulle qui n'existent que dans l'échantillon,
 * et propose des poids extravagants.
 */
const OBSERVATIONS_MIN = 104;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Ramène une série de cours à un point par semaine : le dernier cours connu
 * de chaque semaine ISO. Une valeur qui n'a pas coté garde son dernier cours,
 * ce qui produit un rendement nul — c'est le comportement voulu, l'absence de
 * transaction n'est pas une absence de donnée.
 */
function serieHebdomadaire(
  serie: { date: string; value: number }[],
): Map<string, number> {
  const parSemaine = new Map<string, number>();
  for (const p of serie) {
    if (!(p.value > 0)) continue;
    parSemaine.set(cleSemaine(p.date), p.value);
  }
  return parSemaine;
}

/** Clé de semaine « AAAA-Sxx », calculée sans dépendre du fuseau. */
function cleSemaine(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(a, (m || 1) - 1, j || 1);
  // Jeudi de la semaine ISO : rattache décembre et janvier à la bonne année.
  const jour = new Date(t).getUTCDay() || 7;
  const jeudi = t + (4 - jour) * 86_400_000;
  const annee = new Date(jeudi).getUTCFullYear();
  const debut = Date.UTC(annee, 0, 1);
  const sem = Math.ceil(((jeudi - debut) / 86_400_000 + 1) / 7);
  return `${annee}-S${String(sem).padStart(2, "0")}`;
}

const moyenne = (v: number[]): number =>
  v.length === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length;

/**
 * Rendements d'une série sur une grille de semaines imposée, avec REPORT du
 * dernier cours connu.
 *
 * Une semaine sans transaction n'est pas une donnée manquante : le titre vaut
 * son dernier cours, et le portefeuille qui le détient affiche un rendement
 * nul. Sauter ces semaines — ce que fait un traitement naïf des trous —
 * décalerait les séries les unes par rapport aux autres et rendrait la matrice
 * de covariance fausse : on comparerait des semaines différentes.
 */
function rendementsSurGrille(
  hebdo: Map<string, number>,
  semaines: string[],
): number[] {
  const r: number[] = [];
  let precedent: number | null = null;
  let commence = false;
  for (const sem of semaines) {
    const v = hebdo.get(sem);
    if (v !== undefined) commence = true;
    // Avant la première cotation connue, le titre n'existe pas encore pour
    // nous : on n'invente pas de rendement.
    if (!commence) continue;
    const cours: number | null = v ?? precedent;
    if (cours === null || !(cours > 0)) continue;
    if (precedent !== null && precedent > 0) r.push(cours / precedent - 1);
    precedent = cours;
  }
  return r;
}

/** Covariance d'échantillon (dénominateur n−1). */
function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = moyenne(a.slice(0, n));
  const mb = moyenne(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

/**
 * Projection sur { w : Σw = 1, 0 ≤ wᵢ ≤ u }.
 *
 * Sans plafond, la projection sur le simplexe est classique ; avec plafond, on
 * cherche par dichotomie le décalage θ tel que Σ clamp(vᵢ − θ, 0, u) = 1. La
 * somme est décroissante en θ, donc la dichotomie converge toujours.
 *
 * C'est ce qui garantit qu'aucun poids ne sort des bornes — un optimisateur
 * qui « rattrape » les dépassements après coup produit des poids qui ne
 * somment plus à 1.
 */
function projeter(v: number[], plafond: number): number[] {
  const n = v.length;
  if (n === 0) return [];
  // Faisabilité : sans assez de lignes, le plafond interdit d'atteindre 100 %.
  if (n * plafond < 1) return v.map(() => 1 / n);

  const somme = (theta: number) =>
    v.reduce((s, x) => s + Math.min(plafond, Math.max(0, x - theta)), 0);

  let bas = Math.min(...v) - 1;
  let haut = Math.max(...v);
  for (let k = 0; k < 200; k++) {
    const mid = (bas + haut) / 2;
    if (somme(mid) > 1) bas = mid;
    else haut = mid;
  }
  const theta = (bas + haut) / 2;
  return v.map((x) => Math.min(plafond, Math.max(0, x - theta)));
}

/**
 * Maximise le ratio de Sharpe sous contrainte de poids, par gradient projeté.
 *
 * Objectif : (w'µ − rf) / √(w'Σw). À chaque pas, on remonte le gradient puis
 * on reprojette sur l'ensemble admissible. Le pas décroît pour que la fin de
 * course se stabilise au lieu d'osciller autour de l'optimum.
 */
function optimiser(
  mu: number[],
  sigma: number[][],
  rf: number,
  plafond: number,
): number[] {
  const n = mu.length;
  if (n === 0) return [];
  let w = projeter(
    mu.map(() => 1 / n),
    plafond,
  );

  const produit = (m: number[][], x: number[]) =>
    m.map((ligne) => ligne.reduce((s, v, j) => s + v * x[j], 0));

  let meilleur = w.slice();
  let meilleurScore = -Infinity;

  for (let k = 0; k < 400; k++) {
    const sw = produit(sigma, w);
    const variance = Math.max(1e-12, w.reduce((s, x, i) => s + x * sw[i], 0));
    const ecart = Math.sqrt(variance);
    const exces = w.reduce((s, x, i) => s + x * mu[i], 0) - rf;
    const score = exces / ecart;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = w.slice();
    }
    // ∇[(w'µ − rf)/σ] = µ/σ − (w'µ − rf)·Σw/σ³
    const grad = mu.map((m, i) => m / ecart - (exces * sw[i]) / (ecart * variance));
    const pas = (0.5 * ecart) / (1 + k / 40);
    w = projeter(
      w.map((x, i) => x + pas * grad[i]),
      plafond,
    );
  }
  return meilleur;
}

/** Identifiants portés par une position, pour retrouver son symbole. */
function identifiantsDe(
  p: SavedPosition,
  customParId: Map<string, CustomSecurity>,
): string[] {
  const c = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
  return [c?.code, c?.isin, c?.attributes?.isin, p.matchId, p.rawCode]
    .map((x) => (x ?? "").trim().toUpperCase())
    .filter((x) => x !== "");
}

export async function construireProposition(
  fundId: string,
  parametres: Partial<ParametresProposition> = {},
): Promise<TableauProposition> {
  const avertissements: string[] = [];

  const [snapshots, customs] = await Promise.all([
    loadFundPortfolios(fundId),
    loadCustomSecurities(),
  ]);
  const actuel =
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ?? null;
  const dateReference = actuel?.asOfDate ?? null;
  const customParId = new Map(customs.map((c) => [c.id, c]));

  // ── Détention actuelle, par symbole ─────────────────────────────────────
  const detenuParCode = new Map<string, { quantite: number; valorisation: number }>();
  const codesConnus = new Map<string, string>();
  for (const s of loadStocks()) {
    const code = (s.code || "").trim().toUpperCase();
    if (!code) continue;
    codesConnus.set(code, code);
    const isin = (s.isin || "").trim().toUpperCase();
    if (isin && isin !== "0") codesConnus.set(isin, code);
  }
  for (const p of actuel?.positions ?? []) {
    if (p.section !== "action") continue;
    const code = identifiantsDe(p, customParId)
      .map((i) => codesConnus.get(i))
      .find(Boolean);
    if (!code) continue;
    const e = detenuParCode.get(code) ?? { quantite: 0, valorisation: 0 };
    e.quantite += num(p.quantity);
    e.valorisation += num(p.valuation);
    detenuParCode.set(code, e);
  }
  const valorisationActuelle = [...detenuParCode.values()].reduce(
    (s, e) => s + e.valorisation,
    0,
  );

  // ── Estimation ──────────────────────────────────────────────────────────
  const indice = serieHebdomadaire(loadIndexHistory(INDICE_MARCHE));
  if (indice.size === 0) {
    avertissements.push(
      `Historique de l'indice ${INDICE_MARCHE} indisponible : aucune bêta ne peut être estimée.`,
    );
  }

  type Candidat = {
    code: string;
    libelle: string;
    secteur: string;
    cours: number;
    rendements: number[];
  };

  // Semaines communes : on n'estime une covariance que sur des périodes où
  // TOUTES les séries observées existent, sinon les corrélations comparent des
  // fenêtres différentes.
  const semainesIndice = [...indice.keys()].sort().slice(-SEMAINES_ESTIMATION - 1);

  const candidats: Candidat[] = [];
  /** Valeurs trop jeunes ou trop peu cotées pour être estimées. On les nomme :
   *  une valeur absente de la proposition sans explication passe pour un
   *  rejet du modèle alors qu'elle n'a jamais été examinée. */
  const ecartees: string[] = [];
  for (const s of loadStocks()) {
    const code = (s.code || "").trim().toUpperCase();
    const cours = num(s.price);
    if (!code || !(cours > 0)) continue;
    const hebdo = serieHebdomadaire(loadPriceHistory(code));
    const rendements = rendementsSurGrille(hebdo, semainesIndice);
    if (rendements.length < OBSERVATIONS_MIN) {
      ecartees.push(`${code} (${rendements.length} sem.)`);
      continue;
    }
    candidats.push({
      code,
      libelle: (s.name || code).trim(),
      secteur: (s.sector || "Non classé").trim(),
      cours,
      rendements,
    });
  }

  // Rendements de l'indice sur la même grille.
  const rendementsMarche = rendementsSurGrille(indice, semainesIndice);

  // Toutes les séries sont tronquées à la plus courte : une matrice de
  // covariance bâtie sur des longueurs inégales n'est pas une matrice de
  // covariance.
  const longueur = Math.min(
    rendementsMarche.length,
    ...candidats.map((c) => c.rendements.length),
  );
  const periodes = Number.isFinite(longueur) ? longueur : 0;
  const rm = rendementsMarche.slice(-periodes);
  for (const c of candidats) c.rendements = c.rendements.slice(-periodes);

  const varianceMarche = covariance(rm, rm);
  const p: ParametresProposition = {
    ...PARAMETRES_DEFAUT,
    // Le rendement du marché est ESTIMÉ par défaut, pas supposé.
    rendementMarche: moyenne(rm),
    montant: valorisationActuelle,
    ...parametres,
  };

  if (candidats.length === 0 || periodes < OBSERVATIONS_MIN) {
    avertissements.push(
      "Historique insuffisant pour estimer les risques : aucune proposition n'est calculable.",
    );
    return {
      parametres: p,
      lignes: [],
      rentabiliteEsperee: 0,
      betaPortefeuille: 0,
      volatilitePortefeuille: 0,
      varPortefeuille: 0,
      montantAlloue: 0,
      rentabiliteAnnualisee: 0,
      valorisationActuelle,
      dateReference,
      periodes,
      avertissements,
    };
  }

  const betas = candidats.map((c) =>
    varianceMarche > 0 ? covariance(c.rendements, rm) / varianceMarche : 0,
  );
  // MEDAF : le rendement attendu ne vient PAS du rendement passé du titre —
  // trop bruité sur une quarantaine de points — mais de sa sensibilité au
  // marché. C'est la seule grandeur qu'on estime avec un peu de confiance.
  const mu = betas.map((b) => p.tauxSansRisque + b * (p.rendementMarche - p.tauxSansRisque));

  const n = candidats.length;
  const sigma: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(candidats[i].rendements, candidats[j].rendements);
      sigma[i][j] = c;
      sigma[j][i] = c;
    }
  }

  // RÉTRÉCISSEMENT vers la diagonale.
  //
  // Une covariance d'échantillon estimée sur T périodes pour n actifs est
  // d'autant plus bruitée que n approche T. Ses plus petites valeurs propres
  // sont sous-estimées, et l'optimisateur — qui cherche précisément les
  // directions de faible variance — se précipite dessus : il produit des
  // poids extrêmes fondés sur des corrélations qui n'existent que dans
  // l'échantillon.
  //
  // On mélange donc la covariance observée avec sa seule diagonale (les
  // variances, bien mieux estimées que les corrélations), d'un poids qui
  // grandit avec n/T. Sur 40 actifs et 156 semaines : environ 20 %.
  const delta = n / (n + periodes);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) sigma[i][j] *= 1 - delta;
    }
  }

  if (p.rendementMarche <= p.tauxSansRisque) {
    avertissements.push(
      `Prime de marché négative (marché ${(p.rendementMarche * 100).toFixed(2)} % contre sans risque ${(p.tauxSansRisque * 100).toFixed(2)} % par semaine) : le MEDAF récompense alors les bêtas FAIBLES, et l'optimisateur fuit les valeurs sensibles au marché. Vérifiez que les deux taux portent bien sur la même période.`,
    );
  }

  // ── Optimisation ────────────────────────────────────────────────────────
  const poids = optimiser(mu, sigma, p.tauxSansRisque, p.partMax);

  const rentabiliteEsperee = poids.reduce((s, w, i) => s + w * mu[i], 0);
  const betaPortefeuille = poids.reduce((s, w, i) => s + w * betas[i], 0);
  const variance = poids.reduce(
    (s, w, i) => s + w * sigma[i].reduce((t, v, j) => t + v * poids[j], 0),
    0,
  );
  const volatilitePortefeuille = Math.sqrt(Math.max(0, variance));

  // VaR paramétrique : σ de la période × √horizon × quantile. L'horizon est en
  // JOURS de bourse, la volatilité en semaines — d'où la conversion.
  const volJournaliere = volatilitePortefeuille / Math.sqrt(5);
  const varPortefeuille =
    quantileNormal(p.confianceVaR) *
    volJournaliere *
    Math.sqrt(p.horizonVaR) *
    p.montant;

  // ── Traduction en ordres ────────────────────────────────────────────────
  const lignes: LigneProposition[] = candidats.map((c, i) => {
    const part = poids[i];
    const montant = part * p.montant;
    const nombre = c.cours > 0 ? Math.round(montant / c.cours) : 0;
    const detenu = detenuParCode.get(c.code) ?? { quantite: 0, valorisation: 0 };
    return {
      code: c.code,
      libelle: c.libelle,
      secteur: c.secteur,
      beta: betas[i],
      rendementAttendu: mu[i],
      volatilite: Math.sqrt(Math.max(0, sigma[i][i])),
      observations: periodes,
      part,
      cours: c.cours,
      montant,
      nombre,
      nombreDetenu: detenu.quantite,
      valorisationDetenue: detenu.valorisation,
      ecartNombre: nombre - detenu.quantite,
      ecartMontant: montant - detenu.valorisation,
    };
  });

  // Les lignes qui portent une décision d'abord : poids proposé, puis
  // détention. Une valeur ni proposée ni détenue n'intéresse personne.
  lignes.sort(
    (a, b) =>
      b.part - a.part ||
      b.valorisationDetenue - a.valorisationDetenue ||
      a.code.localeCompare(b.code),
  );

  const montantAlloue = lignes.reduce((s, l) => s + l.montant, 0);
  const rentabiliteAnnualisee = Math.pow(1 + rentabiliteEsperee, SEMAINES_PAR_AN) - 1;

  if (rentabiliteAnnualisee < p.rentabiliteMinimale) {
    avertissements.push(
      `L'optimum atteint ${(rentabiliteAnnualisee * 100).toFixed(2)} % annualisés, sous l'objectif de ${(p.rentabiliteMinimale * 100).toFixed(2)} %. Aucune combinaison d'actions cotées ne comble l'écart : il faut le chercher ailleurs — obligations, ou révision de l'objectif.`,
    );
  }
  if (!actuel) {
    avertissements.push(
      "Aucun inventaire : la colonne de recommandation compare à une détention nulle, donc tout apparaît en achat.",
    );
  }
  if (ecartees.length > 0) {
    avertissements.push(
      `${ecartees.length} valeur(s) écartée(s), faute de ${OBSERVATIONS_MIN} semaines de cotation : ${ecartees.slice(0, 8).join(", ")}${ecartees.length > 8 ? "…" : ""}. Elles ne sont pas rejetées par le modèle — elles n'ont pas pu être estimées.`,
    );
  }
  // Un rendement hebdomadaire moyen composé sur 52 semaines s'emballe vite :
  // une année de marché haussier suffit à produire un chiffre annualisé qui
  // n'engage personne. On le dit plutôt que de le laisser impressionner.
  if (rentabiliteAnnualisee > 0.35) {
    avertissements.push(
      `Rentabilité annualisée de ${(rentabiliteAnnualisee * 100).toFixed(0)} % : c'est la moyenne hebdomadaire de la fenêtre d'estimation composée sur un an, pas une prévision. Une phase de marché exceptionnelle la gonfle mécaniquement — ajustez « Rendement du marché » sur une hypothèse tenable.`,
    );
  }

  return {
    parametres: p,
    lignes,
    rentabiliteEsperee,
    betaPortefeuille,
    volatilitePortefeuille,
    varPortefeuille,
    montantAlloue,
    rentabiliteAnnualisee,
    valorisationActuelle,
    dateReference,
    periodes,
    avertissements,
  };
}
