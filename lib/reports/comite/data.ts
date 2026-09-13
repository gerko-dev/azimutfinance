import "server-only";

// === Rapport du comité d'investissement — assemblage des données ===
//
// Suit le patron des rapports existants du portail (lib/reports/cotation.ts) :
// ce fichier NE FAIT QUE LIRE et calculer, le rendu est dans html.ts et la
// route se contente d'enchaîner les deux.
//
// Toutes les sections sont bornées par la période fournie par l'utilisateur.
// Aucune ne prend « aujourd'hui » comme référence implicite : un comité qui se
// tient en septembre peut analyser un trimestre clos en juin.

import {
  BRVM_INDEX_NAMES,
  BRVM_MAIN_INDICES,
  BRVM_SECTORIAL_INDICES,
  loadAllActions,
  loadListedBondPrices,
  loadListedBonds,
  loadMultipleIndicesHistory,
  loadPriceHistory,
  loadSectorComponents,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { loadFunds } from "@/lib/fcp";
import type { EmissionUMOA } from "@/lib/listedBondsTypes";

import { LIBELLE_PUBLICATION, publicationsSurPeriode } from "./publications";
import type {
  AnticipationActions,
  AnticipationObligations,
  BandeAnticipation,
  BlocPublications,
  LigneAction,
  LigneAnticipationAction,
  LigneIndice,
  LigneObligation,
  LigneOpcvm,
  PeriodeRapport,
  RapportComite,
  RecapObligations,
  RecapTitresPublics,
} from "./types";

// ============================================================
// Outils communs
// ============================================================

type Point = { date: string; value: number };

/** Dernière valeur connue AU PLUS TARD à `date`.
 *
 *  Le marché BRVM ne cote pas tous les jours : une borne de période tombe
 *  souvent un week-end ou un jour férié. Prendre la valeur exacte du jour
 *  renverrait null et viderait le rapport. On remonte donc à la dernière
 *  séance cotée, ce qui est aussi la convention de place pour arrêter un
 *  encours à une date.
 */
function valeurAu(serie: Point[], date: string): number | null {
  let trouve: number | null = null;
  for (const p of serie) {
    if (p.date <= date) trouve = p.value;
    else break;
  }
  return trouve;
}

function variation(depart: number | null, arrivee: number | null): number | null {
  if (depart === null || arrivee === null || depart === 0) return null;
  return (arrivee / depart - 1) * 100;
}

/** 31 décembre de l'exercice précédent : la base des variations YTD. */
function baseYtd(dateFin: string): string {
  const annee = Number(dateFin.slice(0, 4));
  return `${annee - 1}-12-31`;
}

function mediane(valeurs: number[]): number | null {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Régression linéaire simple. Renvoie la pente, l'ordonnée et le R².
 *  Utilisée par l'anticipation obligataire ; isolée ici pour être testable
 *  à l'œil nu plutôt que noyée dans la section. */
function regression(
  points: { x: number; y: number }[],
): { pente: number; ordonnee: number; r2: number } | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const pente = sxy / sxx;
  return {
    pente,
    ordonnee: my - pente * mx,
    r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy),
  };
}

/** Nombre de mois écoulés entre deux dates ISO, en fraction. */
function moisEntre(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (30.44 * 86_400_000);
}

// ============================================================
// Slides 42 et 43 — indices
// ============================================================

function construireIndices(
  codes: string[],
  periode: PeriodeRapport,
  compterSocietes: boolean,
): LigneIndice[] {
  const histo = loadMultipleIndicesHistory(codes);
  const base = baseYtd(periode.fin);

  return codes
    .map((code): LigneIndice => {
      const serie = (histo[code.toUpperCase()] ?? []).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const niveauDebut = valeurAu(serie, periode.debut);
      const niveauFin = valeurAu(serie, periode.fin);
      return {
        code,
        libelle: BRVM_INDEX_NAMES[code] ?? code,
        niveauDebut,
        niveauIntermediaire: valeurAu(serie, periode.intermediaire),
        niveauFin,
        varPeriode: variation(niveauDebut, niveauFin),
        varYtd: variation(valeurAu(serie, base), niveauFin),
        nbSocietes: compterSocietes ? loadSectorComponents(code).length : null,
      };
    })
    // Un indice sans aucun point sur la période n'apporte rien au comité.
    .filter((l) => l.niveauFin !== null || l.niveauDebut !== null);
}

// ============================================================
// Slides 44 et 45 — performances individuelles
// ============================================================

function classementsActions(periode: PeriodeRapport): {
  top10: LigneAction[];
  flop10: LigneAction[];
  toutes: LigneAction[];
} {
  const base = baseYtd(periode.fin);
  const lignes: LigneAction[] = [];

  for (const a of loadAllActions()) {
    const serie = loadPriceHistory(a.code);
    if (serie.length === 0) continue;
    const coursDebut = valeurAu(serie, periode.debut);
    const coursFin = valeurAu(serie, periode.fin);
    const varPeriode = variation(coursDebut, coursFin);
    if (varPeriode === null) continue;
    lignes.push({
      code: a.code,
      nom: a.name,
      secteur: a.sector,
      pays: a.country,
      coursDebut,
      coursFin,
      varPeriode,
      varYtd: variation(valeurAu(serie, base), coursFin),
    });
  }

  const trie = [...lignes].sort(
    (x, y) => (y.varPeriode ?? 0) - (x.varPeriode ?? 0),
  );
  return {
    top10: trie.slice(0, 10),
    // On repart de la fin du tri, puis on remet du plus fort recul au plus
    // faible : un flop se lit du pire au moins pire.
    flop10: trie.slice(-10).reverse(),
    toutes: lignes,
  };
}

// ============================================================
// Slides 23 à 40 — publications officielles
// ============================================================

function construirePublications(periode: PeriodeRapport): BlocPublications {
  const pubs = publicationsSurPeriode(periode.debut, periode.fin);
  const noms = new Map(loadAllActions().map((a) => [a.code, a.name]));

  const groupes = new Map<string, BlocPublications["parType"][number]>();
  for (const p of pubs) {
    const g =
      groupes.get(p.type) ??
      groupes
        .set(p.type, {
          type: p.type,
          libelle: LIBELLE_PUBLICATION[p.type] ?? p.type,
          lignes: [],
        })
        .get(p.type)!;
    g.lignes.push({
      ticker: p.ticker,
      nom: noms.get(p.ticker) ?? p.ticker,
      date: p.date,
      exercice: p.exercice,
    });
  }

  for (const g of groupes.values()) {
    g.lignes.sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    total: pubs.length,
    parType: [...groupes.values()].sort((a, b) => b.lignes.length - a.lignes.length),
  };
}

// ============================================================
// Obligations cotées — récap + nouveauté « top 10 évolution »
// ============================================================

function construireObligations(periode: PeriodeRapport): RecapObligations {
  const bonds = loadListedBonds();
  const prix = loadListedBondPrices();
  const base = baseYtd(periode.fin);

  // Un index par ISIN évite de re-filtrer la table de prix pour chaque titre.
  const parIsin = new Map<string, Point[]>();
  for (const p of prix) {
    if (!(p.cleanPrice > 0)) continue;
    const l = parIsin.get(p.isin);
    const point = { date: p.date, value: p.cleanPrice };
    if (l) l.push(point);
    else parIsin.set(p.isin, [point]);
  }
  for (const l of parIsin.values()) l.sort((a, b) => a.date.localeCompare(b.date));

  const lignes: LigneObligation[] = [];
  for (const b of bonds) {
    const serie = parIsin.get(b.isin) ?? [];
    if (serie.length === 0) continue;
    const coursDebut = valeurAu(serie, periode.debut);
    const coursFin = valeurAu(serie, periode.fin);
    lignes.push({
      isin: b.isin,
      code: b.code,
      nom: b.name,
      emetteur: b.issuer,
      couponRate: b.couponRate,
      coursDebut,
      coursFin,
      varPeriode: variation(coursDebut, coursFin),
      varYtd: variation(valeurAu(serie, base), coursFin),
    });
  }

  // Encours et moyennes pondérées par l'encours : un titre de 200 Mds ne pèse
  // pas comme un titre de 5 Mds dans le coupon moyen du compartiment.
  let encoursTotal = 0;
  let numCoupon = 0;
  let numMaturite = 0;
  for (const b of bonds) {
    if (!(b.outstanding > 0)) continue;
    encoursTotal += b.outstanding;
    numCoupon += b.couponRate * b.outstanding;
    numMaturite += b.yearsToMaturity * b.outstanding;
  }

  const avecPeriode = lignes.filter((l) => l.varPeriode !== null);
  const avecYtd = lignes.filter((l) => l.varYtd !== null);

  return {
    nbLignes: bonds.length,
    encoursTotal,
    couponMoyenPondere: encoursTotal > 0 ? numCoupon / encoursTotal : null,
    maturiteMoyennePonderee: encoursTotal > 0 ? numMaturite / encoursTotal : null,
    topPeriode: avecPeriode
      .sort((a, b) => (b.varPeriode ?? 0) - (a.varPeriode ?? 0))
      .slice(0, 10),
    topYtd: avecYtd.sort((a, b) => (b.varYtd ?? 0) - (a.varYtd ?? 0)).slice(0, 10),
  };
}

// ============================================================
// Slides 49 à 54 — marché des titres publics
// ============================================================

/** Taux d'absorption = montant retenu / montant soumis.
 *
 *  On ne prend PAS le montant proposé comme dénominateur : le CSV UMOA-Titres
 *  le répète à l'identique sur chaque ligne d'une même session, si bien qu'une
 *  somme naïve le surcompte (avertissement documenté dans
 *  lib/listedBondsTypes.ts, § taux de couverture). Retenu/soumis se calcule
 *  ligne par ligne sans ce piège, et répond à la question du comité : sur ce
 *  qui a été offert par les investisseurs, quelle part l'État a-t-il servie ?
 */
function absorption(items: EmissionUMOA[]): number | null {
  let retenu = 0;
  let soumis = 0;
  for (const e of items) {
    if (!(e.amountSubmitted > 0)) continue;
    retenu += e.amount;
    soumis += e.amountSubmitted;
  }
  return soumis > 0 ? retenu / soumis : null;
}

/** Moyenne pondérée par le montant retenu, sur un champ de taux. */
function tauxPondere(
  items: EmissionUMOA[],
  champ: (e: EmissionUMOA) => number | null,
): number | null {
  let num = 0;
  let den = 0;
  for (const e of items) {
    const v = champ(e);
    if (v === null || !(e.amount > 0)) continue;
    num += v * e.amount;
    den += e.amount;
  }
  return den > 0 ? num / den : null;
}

function construireTitresPublics(periode: PeriodeRapport): RecapTitresPublics {
  const toutes = loadUmoaEmissions().filter(
    (e) => e.date && e.date >= periode.debut && e.date <= periode.fin,
  );

  const montantRetenuTotal = toutes.reduce((s, e) => s + e.amount, 0);

  const parPaysMap = new Map<string, EmissionUMOA[]>();
  for (const e of toutes) {
    const l = parPaysMap.get(e.country);
    if (l) l.push(e);
    else parPaysMap.set(e.country, [e]);
  }

  const parPays = [...parPaysMap.entries()]
    .map(([code, items]) => {
      const montantRetenu = items.reduce((s, e) => s + e.amount, 0);
      return {
        code,
        nom: items[0]?.countryName ?? code,
        montantRetenu,
        poids:
          montantRetenuTotal > 0 ? (montantRetenu / montantRetenuTotal) * 100 : 0,
        tauxMoyenPondere: tauxPondere(items, (e) => e.weightedAvgYield),
        prixMarginalMoyen: tauxPondere(items, (e) => e.marginalPrice),
        tauxAbsorption: absorption(items),
      };
    })
    .sort((a, b) => b.montantRetenu - a.montantRetenu);

  const parMatMap = new Map<number, EmissionUMOA[]>();
  for (const e of toutes) {
    const l = parMatMap.get(e.maturityMonths);
    if (l) l.push(e);
    else parMatMap.set(e.maturityMonths, [e]);
  }
  const parMaturite = [...parMatMap.entries()]
    .map(([mois, items]) => ({
      mois,
      montantRetenu: items.reduce((s, e) => s + e.amount, 0),
      tauxMoyenPondere: tauxPondere(items, (e) => e.weightedAvgYield),
      tauxAbsorption: absorption(items),
    }))
    .sort((a, b) => a.mois - b.mois);

  // Les BAT sont zéro-coupon : leur taux se lit dans weightedAvgRate, pas dans
  // le rendement des OAT. Les mélanger fausserait les deux moyennes.
  const bats = toutes.filter((e) => e.type === "BAT");
  const batParMatMap = new Map<number, EmissionUMOA[]>();
  const batParPaysMap = new Map<string, EmissionUMOA[]>();
  for (const e of bats) {
    const m = batParMatMap.get(e.maturityMonths);
    if (m) m.push(e);
    else batParMatMap.set(e.maturityMonths, [e]);
    const p = batParPaysMap.get(e.country);
    if (p) p.push(e);
    else batParPaysMap.set(e.country, [e]);
  }

  return {
    montantRetenuTotal,
    nbOperations: toutes.length,
    parPays,
    parMaturite,
    bat: {
      montantRetenu: bats.reduce((s, e) => s + e.amount, 0),
      tauxAbsorptionMoyen: absorption(bats),
      parMaturite: [...batParMatMap.entries()]
        .map(([mois, items]) => ({
          mois,
          tauxMoyenPondere: tauxPondere(
            items,
            (e) => e.weightedAvgRate ?? e.marginalYield,
          ),
        }))
        .sort((a, b) => a.mois - b.mois),
      parPays: [...batParPaysMap.entries()]
        .map(([code, items]) => ({
          code,
          nom: items[0]?.countryName ?? code,
          tauxMoyenPondere: tauxPondere(
            items,
            (e) => e.weightedAvgRate ?? e.marginalYield,
          ),
          tauxAbsorption: absorption(items),
        }))
        .sort((a, b) => (b.tauxMoyenPondere ?? 0) - (a.tauxMoyenPondere ?? 0)),
    },
    tauxAbsorptionGlobal: absorption(toutes),
    prixMarginalMoyenGeneral: tauxPondere(toutes, (e) => e.marginalPrice),
  };
}

// ============================================================
// Slides 56 à 58 — marché des OPCVM
// ============================================================

function construireOpcvm(periode: PeriodeRapport): LigneOpcvm[] {
  const parCategorie = new Map<
    string,
    { perfs: { nom: string; gestionnaire: string; performance: number }[]; risques: number[]; nb: number }
  >();

  for (const f of loadFunds()) {
    const serie: Point[] = f.observations
      .filter((o) => o.vl !== null && o.vl > 0)
      .map((o) => ({ date: o.date, value: o.vl as number }));
    if (serie.length === 0) continue;

    const g =
      parCategorie.get(f.categorie) ??
      parCategorie.set(f.categorie, { perfs: [], risques: [], nb: 0 }).get(f.categorie)!;
    g.nb++;
    if (f.risque) g.risques.push(f.risque.niveau);

    const perf = variation(
      valeurAu(serie, periode.debut),
      valeurAu(serie, periode.fin),
    );
    // Un fonds sans VL aux deux bornes est compté dans l'effectif mais pas
    // dans la moyenne : l'écarter des deux masquerait la taille du marché.
    if (perf !== null) {
      g.perfs.push({ nom: f.nom, gestionnaire: f.gestionnaire, performance: perf });
    }
  }

  return [...parCategorie.entries()]
    .map(([categorie, g]) => ({
      categorie,
      nbFonds: g.nb,
      // Niveau de risque le plus fréquent parmi ceux réellement publiés.
      niveauRisque:
        g.risques.length > 0
          ? [...g.risques]
              .sort(
                (a, b) =>
                  g.risques.filter((x) => x === b).length -
                  g.risques.filter((x) => x === a).length,
              )[0]
          : null,
      performanceMoyenne:
        g.perfs.length > 0
          ? g.perfs.reduce((s, p) => s + p.performance, 0) / g.perfs.length
          : null,
      top3: [...g.perfs]
        .sort((a, b) => b.performance - a.performance)
        .slice(0, 3),
    }))
    .sort((a, b) => (b.performanceMoyenne ?? -999) - (a.performanceMoyenne ?? -999));
}

// ============================================================
// Anticipation du marché des actions — section nouvelle
// ============================================================

const METHODE_ACTIONS = `Trois signaux indépendants, pondérés à l'identique, faute d'historique \
suffisant pour justifier une pondération plus fine :
(1) VALORISATION — PER comparé à la médiane de son secteur. Un écart de plus de \
15 % vaut un point, dans un sens ou dans l'autre. La comparaison est sectorielle \
et non générale : un PER de 6 n'a pas le même sens pour une banque et pour une \
société de distribution.
(2) RENDEMENT — rendement du dividende comparé à la médiane du marché. Au-dessus, \
un point ; en dessous de la moitié de la médiane, un point négatif.
(3) MOMENTUM — cours rapporté à sa moyenne mobile 50 séances. Au-dessus, le \
marché confirme ; en dessous, il infirme.
Le score est la somme des trois signaux, borné à [-3, +3]. À partir de +2 la \
valeur est signalée sous-évaluée, à -2 ou moins sur-évaluée. \
LIMITE ASSUMÉE : ce score ne remplace pas une analyse fondamentale. Il classe \
un univers de 47 lignes pour orienter le travail du comité, il ne conclut pas. \
Les projections de résultats partiels ne sont pas encore intégrées faute d'une \
source structurée d'estimations dans le portail.`;

function construireAnticipationActions(
  periode: PeriodeRapport,
): AnticipationActions {
  const actions = loadAllActions();
  const perMedianMarche = mediane(
    actions.filter((a) => a.hasPer && a.per > 0).map((a) => a.per),
  );
  const rendementMedianMarche = mediane(
    actions.filter((a) => a.hasYield && a.yieldPct > 0).map((a) => a.yieldPct),
  );

  // Médiane de PER par secteur : la référence de comparaison du signal (1).
  const perParSecteur = new Map<string, number[]>();
  for (const a of actions) {
    if (!a.hasPer || !(a.per > 0)) continue;
    const l = perParSecteur.get(a.sector);
    if (l) l.push(a.per);
    else perParSecteur.set(a.sector, [a.per]);
  }
  const medianeSecteur = new Map<string, number | null>();
  for (const [secteur, v] of perParSecteur) medianeSecteur.set(secteur, mediane(v));

  const lignes: LigneAnticipationAction[] = [];
  for (const a of actions) {
    const serie = loadPriceHistory(a.code);
    const cours = valeurAu(serie, periode.fin) ?? a.price;
    if (!(cours > 0)) continue;

    // Moyenne mobile 50 séances arrêtée à la fin de période — pas à
    // aujourd'hui : le rapport doit être reproductible à l'identique plus tard.
    const jusqua = serie.filter((p) => p.date <= periode.fin);
    const fenetre = jusqua.slice(-50);
    const mm50 =
      fenetre.length >= 20
        ? fenetre.reduce((s, p) => s + p.value, 0) / fenetre.length
        : null;
    const momentum = mm50 && mm50 > 0 ? (cours / mm50 - 1) * 100 : null;

    const medSect = medianeSecteur.get(a.sector) ?? null;
    const per = a.hasPer && a.per > 0 ? a.per : null;
    const rendement = a.hasYield && a.yieldPct > 0 ? a.yieldPct : null;
    const ecartPerSecteur =
      per !== null && medSect !== null && medSect > 0
        ? (per / medSect - 1) * 100
        : null;

    let score = 0;
    const motifs: string[] = [];

    if (ecartPerSecteur !== null) {
      if (ecartPerSecteur < -15) {
        score += 1;
        motifs.push(
          `PER ${per!.toFixed(1)} contre ${medSect!.toFixed(1)} pour le secteur`,
        );
      } else if (ecartPerSecteur > 15) {
        score -= 1;
        motifs.push(
          `PER ${per!.toFixed(1)} au-dessus du secteur (${medSect!.toFixed(1)})`,
        );
      }
    }

    if (rendement !== null && rendementMedianMarche !== null) {
      if (rendement > rendementMedianMarche) {
        score += 1;
        motifs.push(
          `rendement ${rendement.toFixed(2)} % au-dessus de la médiane du marché`,
        );
      } else if (rendement < rendementMedianMarche / 2) {
        score -= 1;
        motifs.push(`rendement ${rendement.toFixed(2)} % faible`);
      }
    }

    if (momentum !== null) {
      if (momentum > 0) {
        score += 1;
        motifs.push(`cours ${momentum.toFixed(1)} % au-dessus de sa MM50`);
      } else {
        score -= 1;
        motifs.push(`cours ${momentum.toFixed(1)} % sous sa MM50`);
      }
    }

    score = Math.max(-3, Math.min(3, score));
    lignes.push({
      code: a.code,
      nom: a.name,
      secteur: a.sector,
      cours,
      per,
      rendement,
      ecartPerSecteur,
      momentum,
      score,
      signal: score >= 2 ? "sous-évalué" : score <= -2 ? "sur-évalué" : "neutre",
      motifs,
    });
  }

  lignes.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  return { perMedianMarche, rendementMedianMarche, lignes, methode: METHODE_ACTIONS };
}

// ============================================================
// Anticipation des rendements obligataires — section nouvelle
// ============================================================

/** Ajustement minimal pour qu'une pente soit jugée descriptive. */
const R2_MIN = 0.3;
/** Effectif minimal d'une bande pour qu'une projection soit publiable.
 *  Voir le commentaire au point d'usage : sans ce seuil, une bande de trois
 *  adjudications affiche un R² quasi parfait sans rien prédire. */
const OBS_MIN = 8;

const BANDES: { libelle: string; bornes: [number, number] }[] = [
  { libelle: "0 à 12 mois (BAT)", bornes: [0, 12] },
  { libelle: "13 à 36 mois", bornes: [13, 36] },
  { libelle: "37 à 60 mois", bornes: [37, 60] },
  { libelle: "61 à 84 mois", bornes: [61, 84] },
  { libelle: "85 à 120 mois", bornes: [85, 120] },
  { libelle: "plus de 120 mois", bornes: [121, 999] },
];

const METHODE_OBLIGATIONS = `MÉTHODE — régression du taux servi sur le temps, bande de maturité par bande \
de maturité.
Les adjudications UMOA-Titres des douze mois précédant la fin de période sont \
regroupées par bande de maturité. Dans chaque bande, on régresse le taux moyen \
pondéré de chaque opération sur sa date. La pente donne la dérive du taux en \
points de base par mois ; on l'extrapole à trois mois pour obtenir la projection.
POURQUOI CETTE FENÊTRE — douze mois couvrent un cycle budgétaire complet des \
États de l'Union, donc les tensions de trésorerie saisonnières, tout en restant \
assez court pour que la pente décrive le régime de taux courant.
DEUX GARDE-FOUS — la projection n'est publiée que si le R² atteint 0,30 ET si la \
bande compte au moins 8 adjudications. Le seuil de R² écarte les bandes trop \
dispersées pour que la pente décrive quoi que ce soit. Le seuil d'effectif est \
tout aussi nécessaire : sur trois points, une régression affiche un R² proche de \
1 par construction géométrique, sans rien prouver. Sans ce second seuil, la \
bande la moins fréquentée du marché serait celle qui paraîtrait la mieux prédite. \
Une bande qui échoue apparaît sans projection, ce qui est une information en soi.
SIGNAL COMPLÉMENTAIRE — le taux d'absorption (retenu / soumis) mesure la \
pression de la demande. Une absorption qui baisse alors que les taux montent \
signale un marché qui exige davantage ; l'inverse signale une détente.
CE QUE LA MÉTHODE NE FAIT PAS — elle est purement extrapolative. Elle ignore la \
politique monétaire BCEAO, l'inflation et les calendriers d'émission annoncés. \
C'est une lecture de tendance, pas un modèle de taux.`;

function construireAnticipationObligations(
  periode: PeriodeRapport,
): AnticipationObligations {
  // Fenêtre de douze mois arrêtée à la fin de période.
  const fin = periode.fin;
  const d = new Date(fin);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const debutFenetre = d.toISOString().slice(0, 10);

  const emissions = loadUmoaEmissions().filter(
    (e) => e.date && e.date >= debutFenetre && e.date <= fin,
  );

  const bandes: BandeAnticipation[] = BANDES.map(({ libelle, bornes }) => {
    const items = emissions.filter(
      (e) => e.maturityMonths >= bornes[0] && e.maturityMonths <= bornes[1],
    );
    // Les BAT n'ont pas de rendement d'OAT : on prend le taux qui existe.
    const taux = (e: EmissionUMOA) =>
      e.type === "BAT"
        ? (e.weightedAvgRate ?? e.marginalYield)
        : e.weightedAvgYield;

    const points = items
      .map((e) => ({ x: moisEntre(debutFenetre, e.date), y: taux(e) }))
      .filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.y));

    const reg = regression(points);
    const moisTotal = moisEntre(debutFenetre, fin);

    // Moyennes de début et de fin sur le premier et le dernier tiers de la
    // fenêtre : plus robustes qu'un point unique, qui peut être une
    // adjudication atypique.
    const tiers = moisTotal / 3;
    const moyenne = (sel: (x: number) => boolean) => {
      const v = points.filter((p) => sel(p.x)).map((p) => p.y);
      return v.length > 0 ? v.reduce((s, y) => s + y, 0) / v.length : null;
    };

    // Double condition : ajustement suffisant ET effectif suffisant.
    // Sur trois points, le R² frôle 1 par construction — la bande la moins
    // fréquentée du marché passerait pour la mieux prédite. Constaté en
    // exécution sur la bande « plus de 120 mois » : n=3, R²=0,999.
    const projection =
      reg && reg.r2 >= R2_MIN && points.length >= OBS_MIN
        ? reg.ordonnee + reg.pente * (moisTotal + 3)
        : null;

    return {
      libelle,
      bornes,
      nbObservations: points.length,
      tauxMoyenDebut: moyenne((x) => x <= tiers),
      tauxMoyenFin: moyenne((x) => x >= moisTotal - tiers),
      penteBpsParMois: reg ? reg.pente * 10_000 : null,
      r2: reg ? reg.r2 : null,
      projection3Mois: projection,
      tauxAbsorption: absorption(items),
    };
  }).filter((b) => b.nbObservations > 0);

  // Tendance d'ensemble : pentes pondérées par le nombre d'observations, MAIS
  // seules les bandes qui passent les deux garde-fous y entrent.
  //
  // Sans ce filtre, la moyenne était dominée par les bandes les plus fournies
  // quel que soit leur ajustement : constaté en exécution, la bande 13-36 mois
  // pesait 205 observations pour un R² de 0,044, soit du bruit qui commandait
  // la conclusion d'ensemble. Une tendance globale doit s'appuyer sur les
  // bandes où une tendance existe.
  const retenues = bandes.filter(
    (b) =>
      b.penteBpsParMois !== null &&
      b.r2 !== null &&
      b.r2 >= R2_MIN &&
      b.nbObservations >= OBS_MIN,
  );
  let num = 0;
  let den = 0;
  for (const b of retenues) {
    num += (b.penteBpsParMois as number) * b.nbObservations;
    den += b.nbObservations;
  }
  const tendance = den > 0 ? num / den : null;

  const commentaire =
    tendance === null
      ? `Aucune bande de maturité n'atteint les seuils de fiabilité (R² ≥ 0,30 et ${OBS_MIN} adjudications) sur la fenêtre : les taux servis varient sans direction lisible. C'est un constat, pas une absence de données — ${emissions.length} adjudications ont été analysées.`
      : tendance > 2
        ? `Tendance haussière : sur les ${retenues.length} bande(s) de maturité dont l'ajustement est significatif, les taux servis dérivent de ${tendance.toFixed(1)} pb par mois. Un comité qui investit aujourd'hui à taux fixe achète avant une hausse probable.`
        : tendance < -2
          ? `Tendance baissière : sur les ${retenues.length} bande(s) de maturité dont l'ajustement est significatif, les taux servis reculent de ${Math.abs(tendance).toFixed(1)} pb par mois. Allonger la duration capte la détente ; attendre la fait perdre.`
          : `Taux globalement stables (${tendance.toFixed(1)} pb par mois sur ${retenues.length} bande(s) significative(s)). Aucun signal directionnel net.`;

  return {
    methode: METHODE_OBLIGATIONS,
    fenetre: {
      debut: debutFenetre,
      fin,
      nbAdjudications: emissions.length,
    },
    bandes,
    tendanceGlobaleBpsParMois: tendance,
    commentaire,
  };
}

// ============================================================
// Assemblage
// ============================================================

export function getRapportComite(periode: PeriodeRapport): RapportComite {
  const { top10, flop10 } = classementsActions(periode);
  const publications = construirePublications(periode);
  const titresPublics = construireTitresPublics(periode);
  const opcvm = construireOpcvm(periode);
  const obligationsCotees = construireObligations(periode);

  const avertissements: string[] = [];
  if (publications.total === 0) {
    avertissements.push(
      "Aucune publication officielle recensée sur la période dans data/calendrier_publications/.",
    );
  }
  if (titresPublics.nbOperations === 0) {
    avertissements.push(
      "Aucune adjudication UMOA-Titres sur la période : la section « titres publics » est vide.",
    );
  }
  if (opcvm.length === 0) {
    avertissements.push(
      "Aucune VL d'OPCVM exploitable aux deux bornes de la période.",
    );
  }
  if (obligationsCotees.topPeriode.length === 0) {
    avertissements.push(
      "Aucune cotation d'obligation sur la période : le classement d'évolution de période est vide.",
    );
  }
  if (obligationsCotees.topYtd.length === 0) {
    avertissements.push(
      `Aucune obligation ne dispose d'un cours au ${baseYtd(periode.fin)} : le classement depuis le 1er janvier est vide. L'historique de cotation obligataire ne remonte pas assez haut.`,
    );
  }

  return {
    periode,
    genereLe: new Date().toISOString(),
    indicesPrincipaux: construireIndices([...BRVM_MAIN_INDICES], periode, false),
    indicesSectoriels: construireIndices(
      [...BRVM_SECTORIAL_INDICES],
      periode,
      true,
    ),
    top10,
    flop10,
    publications,
    obligationsCotees,
    titresPublics,
    opcvm,
    anticipationActions: construireAnticipationActions(periode),
    anticipationObligations: construireAnticipationObligations(periode),
    avertissements,
  };
}
