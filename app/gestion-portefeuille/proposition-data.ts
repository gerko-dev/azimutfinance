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

import {
  loadAllActionsEnriched,
  loadIndexHistory,
  loadPriceHistory,
} from "@/lib/dataLoader";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type { CustomSecurity, SavedPosition } from "./portfolio-types";
import type { TableauAnticipation } from "./anticipation-types";
import type { OriginesProposition } from "./proposition-types";
import {
  annuelVersHebdo,
  partMaxDuFonds,
  plafondCumule,
  plafondsParLigne,
  poidsIndiciels,
  SEUIL_LIGNE_CUMULEE,
  pocheActionsCible,
  rendementMoyenComposite,
  tauxDirecteurBceao,
} from "./proposition-hypotheses";
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
function projeter(v: number[], plafonds: number[]): number[] {
  const n = v.length;
  if (n === 0) return [];
  // Faisabilité : si la somme des plafonds n'atteint pas 100 %, aucune
  // allocation admissible n'existe. Le plafond n'est plus unique depuis que la
  // dérogation de l'Art. 41.3 relève celui des titres à forte pondération
  // indicielle : c'est bien leur SOMME qu'il faut tester, pas n x plafond.
  const capacite = plafonds.reduce((s, p) => s + p, 0);
  if (capacite < 1) return plafonds.slice();

  const somme = (theta: number) =>
    v.reduce((s, x, i) => s + Math.min(plafonds[i], Math.max(0, x - theta)), 0);

  let bas = Math.min(...v) - 1;
  let haut = Math.max(...v);
  for (let k = 0; k < 200; k++) {
    const mid = (bas + haut) / 2;
    if (somme(mid) > 1) bas = mid;
    else haut = mid;
  }
  const theta = (bas + haut) / 2;
  return v.map((x, i) => Math.min(plafonds[i], Math.max(0, x - theta)));
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
  plafonds: number[],
): number[] {
  const n = mu.length;
  if (n === 0) return [];
  let w = projeter(
    mu.map(() => 1 / n),
    plafonds,
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
      plafonds,
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

const LIBELLE_HYPOTHESE: Record<keyof OriginesProposition, string> = {
  montant: "Montant à investir",
  tauxSansRisque: "Taux sans risque",
  rendementMarche: "Rendement du marché",
  partMax: "Part maximale par action",
};

const fmtPctCourt = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export async function construireProposition(
  fundId: string,
  parametres: Partial<ParametresProposition> = {},
  contexte: {
    ratios?: Parameters<typeof partMaxDuFonds>[0];
    tresorerieAInvestir?: number;
    /** Cours cibles, pour les méthodes qui s'en servent. */
    anticipations?: TableauAnticipation | null;
  } = {},
): Promise<TableauProposition> {
  const avertissements: string[] = [];

  // Les quatre hypotheses deduites partent DE FRONT avec l'inventaire : aucune
  // ne depend d'une autre, et les enchainer ferait payer quatre latences.
  // COURS LIVE, et non la colonne `price` de titres.csv.
  //
  // Cette colonne n'est plus rafraichie : les quarante-sept titres s'en
  // ecartent, parfois du simple au double — ETIT y vaut 29 contre 71 a la
  // derniere cloture. Le commentaire de lib/dataLoader l'ecrit d'ailleurs en
  // toutes lettres : « price / changePercent / volume : derniere cloture de
  // l'historique Sika — JAMAIS les colonnes de titres.csv ». Avec un cours
  // deux fois trop bas, `montant / cours` proposait deux fois trop d'actions,
  // et la comparaison aux positions detenues — valorisees, elles, au cours
  // reel — mettait face a face deux echelles differentes.
  const [snapshots, customs, tauxBceao, poche, actions] = await Promise.all([
    loadFundPortfolios(fundId),
    loadCustomSecurities(),
    tauxDirecteurBceao(),
    pocheActionsCible(fundId, contexte.tresorerieAInvestir ?? 0),
    loadAllActionsEnriched(),
  ]);
  const marche = rendementMoyenComposite();
  const plafond = partMaxDuFonds(contexte.ratios);
  const actuel =
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ?? null;
  const dateReference = actuel?.asOfDate ?? null;
  const customParId = new Map(customs.map((c) => [c.id, c]));

  // ── Détention actuelle, par symbole ─────────────────────────────────────
  const detenuParCode = new Map<string, { quantite: number; valorisation: number }>();
  const codesConnus = new Map<string, string>();
  for (const a of actions) {
    const code = (a.code || "").trim().toUpperCase();
    if (!code) continue;
    codesConnus.set(code, code);
    const isin = (a.isin || "").trim().toUpperCase();
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
  for (const a of actions) {
    const code = (a.code || "").trim().toUpperCase();
    const cours = a.price;
    if (!code || !(cours > 0)) continue;
    const hebdo = serieHebdomadaire(loadPriceHistory(code));
    const rendements = rendementsSurGrille(hebdo, semainesIndice);
    if (rendements.length < OBSERVATIONS_MIN) {
      ecartees.push(`${code} (${rendements.length} sem.)`);
      continue;
    }
    candidats.push({
      code,
      libelle: (a.name || code).trim(),
      secteur: (a.sector || "Non classé").trim(),
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

  // ── Hypothèses : déduites d'abord, saisies ensuite ──────────────────────
  //
  // `parametres` ne peut plus porter que la rentabilité minimale : les quatre
  // autres valeurs sont écrasées par leur source. Le paramètre reste accepté
  // pour les scripts et les tests, mais l'écran ne l'envoie plus.
  const origines: OriginesProposition = {
    montant:
      poche.montant !== null
        ? {
            source: "allocation validée par classe d'actif",
            detail: `poche actions cible ${fmtPctCourt(poche.cible)}`,
          }
        : {
            source: "allocation validée par classe d'actif",
            detail: "aucune cible arrêtée pour la classe Actions",
            manquante: true,
          },
    tauxSansRisque:
      tauxBceao !== null
        ? { source: "BCEAO", detail: "taux minimum des appels d'offres" }
        : { source: "BCEAO", detail: "bulletin indisponible", manquante: true },
    rendementMarche:
      marche !== null
        ? {
            source: "BRVM Composite",
            detail: `moyenne de ${marche.annees.length} exercices (${marche.annees[0].annee}–${marche.annees[marche.annees.length - 1].annee})`,
          }
        : {
            source: "BRVM Composite",
            detail: "historique insuffisant",
            manquante: true,
          },
    partMax:
      plafond.part !== null
        ? { source: "paramètres du fonds", detail: plafond.libelle ?? "" }
        : {
            source: "paramètres du fonds",
            detail: "aucun ratio de division des risques saisi",
            manquante: true,
          },
  };

  const p: ParametresProposition = {
    ...PARAMETRES_DEFAUT,
    // Faute de source, on retombe sur l'estimation historique plutôt que sur
    // rien : le modèle a besoin d'un rendement de marché pour exister.
    rendementMarche:
      marche !== null ? annuelVersHebdo(marche.moyenne) : moyenne(rm),
    tauxSansRisque:
      tauxBceao !== null ? annuelVersHebdo(tauxBceao) : PARAMETRES_DEFAUT.tauxSansRisque,
    partMax: plafond.part ?? PARAMETRES_DEFAUT.partMax,
    montant: poche.montant ?? valorisationActuelle,
    ...parametres,
  };

  for (const [cle, o] of Object.entries(origines)) {
    if (o.manquante) {
      avertissements.push(
        `${LIBELLE_HYPOTHESE[cle as keyof OriginesProposition]} : ${o.detail}. Valeur de repli appliquée.`,
      );
    }
  }

  if (candidats.length === 0 || periodes < OBSERVATIONS_MIN) {
    avertissements.push(
      "Historique insuffisant pour estimer les risques : aucune proposition n'est calculable.",
    );
    return {
      parametres: p,
      origines,
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
  const muMedaf = betas.map(
    (b) => p.tauxSansRisque + b * (p.rendementMarche - p.tauxSansRisque),
  );

  // ── Rendements attendus selon la méthode retenue ────────────────────────
  //
  // Seul μ change d'une méthode à l'autre. La covariance, les plafonds et
  // l'optimisateur sont identiques : deux méthodes qui divergeraient aussi sur
  // le risque ne seraient plus comparables, et l'écart entre leurs allocations
  // ne dirait plus d'où il vient.
  //
  // UN POTENTIEL N'EST PAS UN RENDEMENT HEBDOMADAIRE. Une cible dit « ce titre
  // vaut 30 % de plus », sans dire quand. On pose l'horizon à UN AN et on
  // ramène le potentiel à la semaine en composé — l'hypothèse est forte, elle
  // est écrite ici plutôt que cachée dans un facteur.
  const potentielsAnnuels = new Map<string, number>();
  for (const t of contexte.anticipations?.titres ?? []) {
    const c = t.cibles?.[p.methodeValorisation];
    if (c && c.potentiel !== null && Number.isFinite(c.potentiel) && c.potentiel > -0.99) {
      potentielsAnnuels.set(t.code.toUpperCase(), c.potentiel);
    }
  }
  let sansCible = 0;
  const muCibles = candidats.map((c, i) => {
    const pot = potentielsAnnuels.get(c.code.toUpperCase());
    if (pot === undefined) {
      // Sans cible exploitable, on retombe sur le MEDAF plutôt que sur zéro :
      // un rendement nul imposé ferait fuir l'optimisateur de la valeur, ce qui
      // est une opinion, alors qu'on n'en a justement aucune.
      sansCible++;
      return muMedaf[i];
    }
    return Math.pow(1 + pot, 1 / SEMAINES_PAR_AN) - 1;
  });

  const mu =
    p.methode === "medaf"
      ? muMedaf
      : p.methode === "cibles"
        ? muCibles
        : muMedaf.map((m, i) => (m + muCibles[i]) / 2);

  if (p.methode !== "medaf") {
    if (potentielsAnnuels.size === 0) {
      avertissements.push(
        `Aucun cours cible disponible pour la méthode « ${p.methodeValorisation} » : l'optimisation retombe entièrement sur le MEDAF.`,
      );
    } else if (sansCible > 0) {
      avertissements.push(
        `${sansCible} valeur(s) sans cours cible exploitable : leur rendement attendu reste celui du MEDAF.`,
      );
    }
  }

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

  // ── Plafonds ligne par ligne, dérogation comprise ───────────────────────
  //
  // L'Art. 41.1 a plafonne toute signature, mais l'Art. 41.3 relève ce plafond
  // pour un titre pesant plus de 10 % de l'indice. Appliquer le seul plafond
  // général proposait une allocation PLUS contrainte que ce que le règlement
  // autorise — et interdisait de détenir les trois plus grosses capitalisations
  // de la cote à hauteur de leur poids réel.
  const { plafonds: plafondsLignes } = plafondsParLigne(
    candidats.map((c) => c.code),
    contexte.ratios,
    poidsIndiciels(),
  );
  const plafondsVecteur = plafondsLignes.map((l) =>
    l.derogation ? l.plafond : p.partMax,
  );
  // La dérogation de l'Art. 41.3 s'applique toujours — elle n'est simplement
  // plus annoncée : un bandeau qui répète à chaque calcul une règle constante
  // finit par masquer les avertissements qui, eux, appellent une décision.

  // ── Optimisation ────────────────────────────────────────────────────────
  const poids = optimiser(mu, sigma, p.tauxSansRisque, plafondsVecteur);

  // Second volet de l'Art. 41.3 : le cumul des lignes dépassant 15 % est lui
  // aussi borné. Cette contrainte porte sur une SOMME, pas sur une ligne : elle
  // ne se projette pas comme un plafond individuel, et l'optimisateur ne peut
  // pas la respecter par construction. On la vérifie donc après coup et on le
  // dit — un contrôle explicite vaut mieux qu'une contrainte silencieusement
  // ignorée.
  const seuilCumul = plafondCumule(contexte.ratios);
  if (seuilCumul !== null) {
    const cumul = poids
      .filter((w) => w > SEUIL_LIGNE_CUMULEE)
      .reduce((s, w) => s + w, 0);
    if (cumul > seuilCumul + 1e-9) {
      avertissements.push(
        `Cumul des lignes supérieures à ${(SEUIL_LIGNE_CUMULEE * 100).toFixed(0)} % : ${(cumul * 100).toFixed(1)} % contre un plafond de ${(seuilCumul * 100).toFixed(0)} % (Art. 41.3). La proposition dépasse cette limite — elle est à corriger avant validation.`,
      );
    }
  }

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
  // Les valeurs écartées faute d'historique ne sont plus signalées : la liste
  // ne bouge qu'au rythme des introductions en bourse, et rien ne peut être
  // fait de cette information.
  //
  // L'avertissement sur la rentabilité annualisée disparaît aussi. Il invitait
  // à « ajuster le rendement du marché » — un conseil devenu caduc depuis que
  // cette hypothèse est déduite du BRVM Composite et n'est plus saisissable.

  return {
    parametres: p,
    origines,
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
