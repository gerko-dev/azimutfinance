// === MOTEUR DE CALCUL FCP ===
//
// Métriques retenues : performance cumulée TWR, perf annualisée, quartiles
// catégorie, dynamique d'AUM, flux nets implicites, persistance.
//
// Volatilité, perte maximale et statistiques de distribution : longtemps
// exclues d'ici, parce que le référentiel ne portait que les quatre points
// trimestriels de l'ASGOP — quatorze observations, dont on ne tire aucun
// écart-type digne de ce nom. L'historique BOC a changé la donne : 35 000
// relevés, quotidiens pour la plupart des fonds. Elles sont donc calculées,
// mais SOUS CONDITION DE DENSITÉ (cf. `statsRisque`) : la fréquence reste
// hétérogène d'un fonds à l'autre (cf. lib/fcp.ts), et un fonds qui ne publie
// qu'au trimestre doit rendre « null », pas un chiffre rassurant tiré de
// quatorze points.

import type { Fund, FundObservation } from "./fcp";
import { obsAt } from "./fcp";

/** Observation d'un fonds a une date, seulement si elle porte une VL.
 *
 *  Passe par l'index de `obsAt` au lieu de balayer `observations` : depuis que
 *  l'historique BOC porte les series a neuf cents points, un `.find()` par
 *  date et par fonds de cohorte demandait des dizaines de millions de
 *  comparaisons par fiche. */
function obsVLAt(fund: Fund, dateISO: string): FundObservation | undefined {
  const o = obsAt(fund, dateISO);
  return o && o.vl !== null ? o : undefined;
}

/** Point trimestriel complet : actif net ET valeur liquidative. */
function obsQuarterCompletAt(
  fund: Fund,
  dateISO: string,
): FundObservation | undefined {
  const o = obsAt(fund, dateISO);
  return o && o.kind === "quarter" && o.aum !== null && o.vl !== null
    ? o
    : undefined;
}

/** Idem, restreint aux points trimestriels porteurs d'un actif net. */
function obsQuarterAumAt(
  fund: Fund,
  dateISO: string,
): FundObservation | undefined {
  const o = obsAt(fund, dateISO);
  return o && o.kind === "quarter" && o.aum !== null ? o : undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==========================================
// HELPERS
// ==========================================

function toMs(dateISO: string): number {
  return new Date(dateISO + "T00:00:00Z").getTime();
}

function yearsBetween(fromISO: string, toISO: string): number {
  return (toMs(toISO) - toMs(fromISO)) / (365.25 * MS_PER_DAY);
}

/**
 * Dans une série triée d'observations avec VL non nulle, trouve le point
 * dont la date est <= targetISO et le plus proche. Retourne null si aucun
 * point antérieur ou égal n'existe.
 */
export function findObsOnOrBefore(
  obs: FundObservation[],
  targetISO: string
): FundObservation | null {
  let chosen: FundObservation | null = null;
  for (const o of obs) {
    if (o.vl === null) continue;
    if (o.date <= targetISO) chosen = o;
    else break;
  }
  return chosen;
}

/**
 * Dernière observation avec VL non nulle (n'importe quel kind).
 */
export function latestVLObs(fund: Fund): FundObservation | null {
  for (let i = fund.observations.length - 1; i >= 0; i--) {
    const o = fund.observations[i];
    if (o.vl !== null) return o;
  }
  return null;
}

// ==========================================
// PERFORMANCE
// ==========================================

/**
 * Total return entre deux observations : (VL_to / VL_from) - 1.
 * On suppose qu'il n'y a pas de distribution dans le CSV (limite documentée).
 */
export function twr(vlFrom: number, vlTo: number): number {
  if (vlFrom <= 0) return 0;
  return vlTo / vlFrom - 1;
}

export function annualize(totalReturn: number, years: number): number {
  if (years <= 0) return 0;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

export type PerfWindow = {
  label: string;       // "3M", "6M", "YTD", "1Y", "3Y", "Création"
  fromDate: string;    // date du point utilisé en borne basse
  toDate: string;      // date du point utilisé en borne haute (latestVL)
  totalReturn: number; // perf cumulée
  annualized: number;  // perf annualisée (ou 0 si fenêtre < 1 an)
  available: boolean;  // false si aucune borne basse trouvée
};

/**
 * Calcule la perf d'un fonds sur une fenêtre, en utilisant `latestVL` comme
 * borne haute et l'observation <= asOf - window comme borne basse.
 */
export function perfWindow(
  fund: Fund,
  windowYears: number,
  label: string,
  asOf?: string
): PerfWindow {
  const last = latestVLObs(fund);
  if (!last || last.vl === null) {
    return { label, fromDate: "", toDate: "", totalReturn: 0, annualized: 0, available: false };
  }
  const refISO = asOf ?? last.date;
  const targetMs = toMs(refISO) - windowYears * 365.25 * MS_PER_DAY;
  const targetISO = new Date(targetMs).toISOString().slice(0, 10);

  const startObs = findObsOnOrBefore(fund.observations, targetISO);
  if (!startObs || startObs.vl === null) {
    return { label, fromDate: "", toDate: last.date, totalReturn: 0, annualized: 0, available: false };
  }

  const tr = twr(startObs.vl, last.vl);
  const yrs = yearsBetween(startObs.date, last.date);
  return {
    label,
    fromDate: startObs.date,
    toDate: last.date,
    totalReturn: tr,
    annualized: yrs >= 1 ? annualize(tr, yrs) : 0,
    available: true,
  };
}

/**
 * Perf YTD : du dernier 31-déc disponible avant `last.date` jusqu'à last.
 */
export function perfYTD(fund: Fund): PerfWindow {
  const last = latestVLObs(fund);
  if (!last || last.vl === null) {
    return { label: "YTD", fromDate: "", toDate: "", totalReturn: 0, annualized: 0, available: false };
  }
  const year = parseInt(last.date.slice(0, 4), 10);
  // Le 31-déc de l'année précédente
  const targetISO = `${year - 1}-12-31`;
  const startObs = findObsOnOrBefore(fund.observations, targetISO);
  if (!startObs || startObs.vl === null) {
    return { label: "YTD", fromDate: "", toDate: last.date, totalReturn: 0, annualized: 0, available: false };
  }
  return {
    label: "YTD",
    fromDate: startObs.date,
    toDate: last.date,
    totalReturn: twr(startObs.vl, last.vl),
    annualized: 0,
    available: true,
  };
}

/**
 * Perf depuis le 1er point observé (création apparente).
 */
export function perfSinceInception(fund: Fund): PerfWindow {
  const last = latestVLObs(fund);
  const first = fund.observations.find((o) => o.vl !== null);
  if (!last || !first || last.vl === null || first.vl === null || last.date === first.date) {
    return { label: "Création", fromDate: "", toDate: "", totalReturn: 0, annualized: 0, available: false };
  }
  const tr = twr(first.vl, last.vl);
  const yrs = yearsBetween(first.date, last.date);
  return {
    label: "Création",
    fromDate: first.date,
    toDate: last.date,
    totalReturn: tr,
    annualized: yrs >= 1 ? annualize(tr, yrs) : 0,
    available: true,
  };
}

/**
 * Perf "dernière publication" : entre le dernier trimestre canonique
 * antérieur strictement à `latestVL.date` et `latestVL.date`. Pour un fonds
 * qui n'a publié que des trimestres canoniques, c'est la perf trimestrielle
 * la plus récente.
 */
export function perfLastPeriod(fund: Fund): PerfWindow {
  const last = latestVLObs(fund);
  if (!last || last.vl === null) {
    return { label: "Dernière", fromDate: "", toDate: "", totalReturn: 0, annualized: 0, available: false };
  }
  // Dernier point trimestriel ANTERIEUR strictement à la dernière VL
  const previousQuarter = [...fund.observations]
    .reverse()
    .find((o) => o.kind === "quarter" && o.vl !== null && o.date < last.date);
  if (!previousQuarter || previousQuarter.vl === null) {
    return { label: "Dernière", fromDate: "", toDate: last.date, totalReturn: 0, annualized: 0, available: false };
  }
  return {
    label: "Dernière",
    fromDate: previousQuarter.date,
    toDate: last.date,
    totalReturn: twr(previousQuarter.vl, last.vl),
    annualized: 0,
    available: true,
  };
}

/**
 * Bundle de perf canonique pour les tableaux/screeners.
 */
export type FundPerfSnapshot = {
  perf3M: PerfWindow;
  perf6M: PerfWindow;
  perfYTD: PerfWindow;
  perf1Y: PerfWindow;
  perf3Y: PerfWindow;
  perfInception: PerfWindow;
};

export function computePerfSnapshot(fund: Fund): FundPerfSnapshot {
  return {
    perf3M: perfWindow(fund, 0.25, "3M"),
    perf6M: perfWindow(fund, 0.5, "6M"),
    perfYTD: perfYTD(fund),
    perf1Y: perfWindow(fund, 1, "1Y"),
    perf3Y: perfWindow(fund, 3, "3Y"),
    perfInception: perfSinceInception(fund),
  };
}

// ==========================================
// QUARTILES CATEGORIE
// ==========================================

/**
 * Calcule le quartile (1-4) d'un fonds dans sa cohorte sur une métrique
 * de perf. 1 = meilleur quartile, 4 = pire. Retourne null si la cohorte
 * (incluant le fonds) compte moins de 4 entrées valides.
 */
export function quartileInCohort(
  value: number,
  cohortValues: number[]
): 1 | 2 | 3 | 4 | null {
  const valid = cohortValues.filter((v) => Number.isFinite(v));
  if (valid.length < 4) return null;
  const sorted = [...valid].sort((a, b) => b - a); // desc : 1 = meilleur
  const idx = sorted.findIndex((v) => v <= value);
  const rank = idx === -1 ? sorted.length : idx + 1;
  const ratio = rank / sorted.length;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * Frise des quartiles trimestriels d'un fonds dans sa catégorie sur les N
 * derniers trimestres (perf trimestrielle Δ VL_q / VL_{q-1}).
 */
export type QuartileFrame = { date: string; quartile: 1 | 2 | 3 | 4 | null; perf: number | null };

export function quartileHistory(
  fund: Fund,
  cohort: Fund[],
  quarterEnds: string[]
): QuartileFrame[] {
  const frames: QuartileFrame[] = [];
  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];

    const perfFor = (f: Fund): number | null => {
      const prev = obsVLAt(f, qPrev);
      const cur = obsVLAt(f, qCur);
      if (!prev || !cur || prev.vl === null || cur.vl === null) return null;
      return twr(prev.vl, cur.vl);
    };

    const targetPerf = perfFor(fund);
    if (targetPerf === null) {
      frames.push({ date: qCur, quartile: null, perf: null });
      continue;
    }

    const cohortPerfs = cohort
      .map((f) => perfFor(f))
      .filter((v): v is number => v !== null);

    const q = quartileInCohort(targetPerf, cohortPerfs);
    frames.push({ date: qCur, quartile: q, perf: targetPerf });
  }
  return frames;
}

// ==========================================
// AUM & FLUX NETS IMPLICITES
// ==========================================

export type AumPoint = {
  date: string;
  aum: number;
  vl: number;
  perfQuarter: number | null;       // perf entre ce trim et le précédent
  perfEffectAmount: number | null;  // AUM_{t-1} × perf
  netFlowAmount: number | null;     // ΔAUM − effet perf
};

/**
 * Décompose la dynamique d'AUM trimestre par trimestre en effet performance
 * vs collecte nette implicite. Utilise uniquement les points kind="quarter"
 * avec AUM non nul.
 */
export function aumDecomposition(fund: Fund): AumPoint[] {
  const quarters = fund.observations.filter(
    (o) => o.kind === "quarter" && o.aum !== null && o.vl !== null
  );
  const points: AumPoint[] = [];
  for (let i = 0; i < quarters.length; i++) {
    const cur = quarters[i];
    const prev = i > 0 ? quarters[i - 1] : null;
    let perfQ: number | null = null;
    let perfEffect: number | null = null;
    let netFlow: number | null = null;
    if (prev && prev.vl !== null && cur.vl !== null && prev.aum !== null && cur.aum !== null) {
      perfQ = twr(prev.vl, cur.vl);
      perfEffect = prev.aum * perfQ;
      netFlow = cur.aum - prev.aum - perfEffect;
    }
    points.push({
      date: cur.date,
      aum: cur.aum as number,
      vl: cur.vl as number,
      perfQuarter: perfQ,
      perfEffectAmount: perfEffect,
      netFlowAmount: netFlow,
    });
  }
  return points;
}

// ==========================================
// AGREGATS DE COHORTE (pour les vues marché)
// ==========================================

export type CategoryAggregate = {
  categorie: string;
  nbFunds: number;
  aumTotal: number;
  perfMedian1Y: number | null;
  perfQ1_1Y: number | null;   // 25e centile
  perfQ3_1Y: number | null;   // 75e centile
  perfMin1Y: number | null;
  perfMax1Y: number | null;
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function aggregateByCategory(funds: Fund[]): CategoryAggregate[] {
  const byCat = new Map<string, Fund[]>();
  for (const f of funds) {
    const list = byCat.get(f.categorie) || [];
    list.push(f);
    byCat.set(f.categorie, list);
  }
  const out: CategoryAggregate[] = [];
  for (const [cat, list] of byCat) {
    const aumTotal = list.reduce((s, f) => s + (f.latestQuarter?.aum ?? 0), 0);
    const perfs = list
      .map((f) => perfWindow(f, 1, "1Y").totalReturn)
      .filter((v) => Number.isFinite(v) && v !== 0);
    out.push({
      categorie: cat,
      nbFunds: list.length,
      aumTotal,
      perfMedian1Y: percentile(perfs, 0.5),
      perfQ1_1Y: percentile(perfs, 0.25),
      perfQ3_1Y: percentile(perfs, 0.75),
      perfMin1Y: perfs.length > 0 ? Math.min(...perfs) : null,
      perfMax1Y: perfs.length > 0 ? Math.max(...perfs) : null,
    });
  }
  out.sort((a, b) => b.aumTotal - a.aumTotal);
  return out;
}

export type ManagerAggregate = {
  gestionnaire: string;
  nbFunds: number;
  aumTotal: number;
  marketShare: number;          // 0..1
  perfWeighted1Y: number | null;
  perfMedian1Y: number | null;
  topQuartileShare: number | null; // % de fonds Q1 sur 1Y
};

export function aggregateByManager(funds: Fund[]): ManagerAggregate[] {
  // Pour les quartiles : on calcule le quartile par fonds dans sa propre catégorie
  const cohortByCat = new Map<string, number[]>();
  for (const f of funds) {
    const v = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(v) || v === 0) continue;
    const list = cohortByCat.get(f.categorie) || [];
    list.push(v);
    cohortByCat.set(f.categorie, list);
  }

  const totalAUM = funds.reduce((s, f) => s + (f.latestQuarter?.aum ?? 0), 0);

  const byMgr = new Map<string, Fund[]>();
  for (const f of funds) {
    const list = byMgr.get(f.gestionnaire) || [];
    list.push(f);
    byMgr.set(f.gestionnaire, list);
  }

  const out: ManagerAggregate[] = [];
  for (const [mgr, list] of byMgr) {
    const aumTotal = list.reduce((s, f) => s + (f.latestQuarter?.aum ?? 0), 0);

    let weightedNum = 0;
    let weightedDen = 0;
    const perfs: number[] = [];
    let q1Count = 0;
    let qEvalCount = 0;

    for (const f of list) {
      const tr = perfWindow(f, 1, "1Y").totalReturn;
      if (!Number.isFinite(tr) || tr === 0) continue;
      const aum = f.latestQuarter?.aum ?? 0;
      perfs.push(tr);
      weightedNum += tr * aum;
      weightedDen += aum;

      const cohort = cohortByCat.get(f.categorie) || [];
      const q = quartileInCohort(tr, cohort);
      if (q !== null) {
        qEvalCount++;
        if (q === 1) q1Count++;
      }
    }

    out.push({
      gestionnaire: mgr,
      nbFunds: list.length,
      aumTotal,
      marketShare: totalAUM > 0 ? aumTotal / totalAUM : 0,
      perfWeighted1Y: weightedDen > 0 ? weightedNum / weightedDen : null,
      perfMedian1Y: percentile(perfs, 0.5),
      topQuartileShare: qEvalCount > 0 ? q1Count / qEvalCount : null,
    });
  }
  out.sort((a, b) => b.aumTotal - a.aumTotal);
  return out;
}

// ==========================================
// SERIES TEMPORELLES MARCHE
// ==========================================

/**
 * Stacked area : pour chaque fin de trimestre, AUM total par catégorie.
 */
export function aumTimelineByCategory(
  funds: Fund[],
  quarterEnds: string[]
): Array<Record<string, number | string>> {
  const series: Array<Record<string, number | string>> = [];
  for (const q of quarterEnds) {
    const row: Record<string, number | string> = { date: q };
    const totals = new Map<string, number>();
    for (const f of funds) {
      const obs = obsQuarterAumAt(f, q);
      if (!obs || obs.aum === null) continue;
      totals.set(f.categorie, (totals.get(f.categorie) || 0) + obs.aum);
    }
    for (const [cat, total] of totals) row[cat] = total;
    series.push(row);
  }
  return series;
}

/**
 * Heatmap perf × catégorie : pour chaque trimestre, perf médiane des fonds
 * de chaque catégorie sur ce trimestre seul (Δ VL_q / VL_{q-1}).
 */
export function quarterlyPerfHeatmap(
  funds: Fund[],
  quarterEnds: string[]
): Array<{ date: string; categorie: string; perf: number | null }> {
  const out: Array<{ date: string; categorie: string; perf: number | null }> = [];
  const cats = Array.from(new Set(funds.map((f) => f.categorie)));
  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];
    for (const cat of cats) {
      const perfs: number[] = [];
      for (const f of funds) {
        if (f.categorie !== cat) continue;
        const prev = obsVLAt(f, qPrev);
        const cur = obsVLAt(f, qCur);
        if (!prev || !cur || prev.vl === null || cur.vl === null) continue;
        perfs.push(twr(prev.vl, cur.vl));
      }
      out.push({ date: qCur, categorie: cat, perf: percentile(perfs, 0.5) });
    }
  }
  return out;
}

// ==========================================
// FICHE FONDS — HELPERS DEDIES
// ==========================================

/**
 * Médiane des perf d'une cohorte sur une fenêtre standard.
 */
export function cohortMedianPerf(
  cohort: Fund[],
  windowYears: number
): { totalReturn: number | null; annualized: number | null } {
  const trs: number[] = [];
  for (const f of cohort) {
    const p = perfWindow(f, windowYears, "");
    if (p.available) trs.push(p.totalReturn);
  }
  const median = percentile(trs, 0.5);
  return {
    totalReturn: median,
    annualized: median !== null && windowYears >= 1 ? annualize(median, windowYears) : null,
  };
}

/**
 * Médiane YTD d'une cohorte.
 */
export function cohortMedianYTD(cohort: Fund[]): number | null {
  const trs: number[] = [];
  for (const f of cohort) {
    const p = perfYTD(f);
    if (p.available) trs.push(p.totalReturn);
  }
  return percentile(trs, 0.5);
}

/**
 * Médiane "dernière" : perf entre l'avant-dernier trimestre canonique et la
 * dernière VL de chaque fonds de la cohorte.
 */
export function cohortMedianLastPeriod(cohort: Fund[]): number | null {
  const trs: number[] = [];
  for (const f of cohort) {
    const p = perfLastPeriod(f);
    if (p.available) trs.push(p.totalReturn);
  }
  return percentile(trs, 0.5);
}

/**
 * Pour chaque date de la liste, médiane des cohortes funds rebasés à 100
 * depuis baseDate. Permet l'overlay "perf médiane catégorie" sur un graphe
 * VL rebasée du fonds courant.
 */
export function cohortMedianRebasedSeries(
  cohort: Fund[],
  baseDate: string,
  dates: string[]
): Array<{ date: string; value: number | null }> {
  // Chaque fonds est indexé UNE fois par date, au lieu d'être rebalayé à
  // chaque point de la courbe.
  //
  // La version précédente appelait deux `.find()` linéaires par date et par
  // fonds de cohorte. Cela passait tant qu'un fonds n'avait que ses quatorze
  // points trimestriels — 14 × 40 × 14, soit huit mille opérations. Depuis que
  // l'historique BOC porte les séries à neuf cents points, le même calcul en
  // demande 900 × 40 × 900, soixante-cinq millions par fiche : le worker Next
  // mourait avant de rendre la page.
  //
  // La correspondance se fait au DERNIER RELEVE CONNU a la date, jamais sur une
  // egalite de dates. Une egalite vidait la cohorte : les dates demandees sont
  // celles du fonds courant, et deux SGO ne publient pas le meme jour. Sur la
  // premiere date de SECURITAS, trois fonds sur cent trente-quatre avaient un
  // releve — la « mediane de la categorie » se reduisait au fonds lui-meme et
  // affichait un ecart de 0,00 % sur toutes les fenetres.
  const series = cohort.map((f) => {
    const pts: Array<{ date: string; vl: number }> = [];
    for (const o of f.observations) {
      if (o.vl !== null && o.vl > 0) pts.push({ date: o.date, vl: o.vl });
    }
    pts.sort((a, b) => a.date.localeCompare(b.date));
    return pts;
  });

  /** Dernier releve du fonds `i` a la date, ou avant. */
  const auPlusTard = (pts: Array<{ date: string; vl: number }>, d: string) => {
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].date <= d) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? pts[lo - 1].vl : null;
  };

  const bases = series.map((pts) => auPlusTard(pts, baseDate));

  // Balayage a deux pointeurs : les dates demandees sont triees, chaque serie
  // aussi. On avance sans jamais revenir en arriere.
  const curseurs = new Array(series.length).fill(0);
  const courants: Array<number | null> = series.map(() => null);
  for (let i = 0; i < series.length; i++) {
    courants[i] = bases[i];
    while (
      curseurs[i] < series[i].length &&
      series[i][curseurs[i]].date <= baseDate
    ) {
      curseurs[i]++;
    }
  }

  return dates.map((d) => {
    const values: number[] = [];
    for (let i = 0; i < series.length; i++) {
      const base = bases[i];
      const pts = series[i];
      while (curseurs[i] < pts.length && pts[curseurs[i]].date <= d) {
        courants[i] = pts[curseurs[i]].vl;
        curseurs[i]++;
      }
      const cur = courants[i];
      if (base === null || base === 0 || cur === null) continue;
      values.push((cur / base) * 100);
    }
    return { date: d, value: percentile(values, 0.5) };
  });
}

/**
 * Excès trimestriel du fonds vs médiane de sa catégorie. Retourne aussi
 * l'excès cumulé (composé) depuis le 1er trimestre disponible.
 */
export type ExcessFrame = {
  date: string;
  fundPerf: number | null;
  cohortMedianPerf: number | null;
  excess: number | null;
  cumulativeExcess: number | null; // composé : ((1+f1)(1+f2)..) / ((1+m1)(1+m2)..) - 1
};

export function excessVsCategory(
  fund: Fund,
  cohort: Fund[],
  quarterEnds: string[]
): ExcessFrame[] {
  const out: ExcessFrame[] = [];
  let cumFund = 1;
  let cumMedian = 1;

  // Même indexation que cohortMedianRebasedSeries, pour la même raison : les
  // séries font desormais des centaines de points, un balayage linéaire par
  // trimestre et par fonds n'est plus tenable.
  const vlDu = (f: Fund) => {
    const m = new Map<string, number>();
    for (const o of f.observations) if (o.vl !== null) m.set(o.date, o.vl);
    return m;
  };
  const indexFonds = vlDu(fund);
  const indexCohorte = cohort.map(vlDu);

  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];
    const prev = indexFonds.get(qPrev);
    const cur = indexFonds.get(qCur);
    const fundPerf =
      prev !== undefined && cur !== undefined ? twr(prev, cur) : null;

    const cohortPerfs: number[] = [];
    for (const m of indexCohorte) {
      const p = m.get(qPrev);
      const c = m.get(qCur);
      if (p !== undefined && c !== undefined) cohortPerfs.push(twr(p, c));
    }
    const cohortMedianPerf = percentile(cohortPerfs, 0.5);

    let excess: number | null = null;
    if (fundPerf !== null && cohortMedianPerf !== null) {
      excess = fundPerf - cohortMedianPerf;
      cumFund *= 1 + fundPerf;
      cumMedian *= 1 + cohortMedianPerf;
    }
    const cumulativeExcess =
      excess === null ? null : cumFund / cumMedian - 1;

    out.push({ date: qCur, fundPerf, cohortMedianPerf, excess, cumulativeExcess });
  }
  return out;
}

/**
 * Décomposition AUM entre deux trimestres canoniques :
 *   ΔAUM = effetPerf + collecteNette
 * où effetPerf = AUM_{from} × (VL_{to} / VL_{from} − 1).
 */
export type AumGrowth = {
  fromDate: string;
  toDate: string;
  startAUM: number | null;
  endAUM: number | null;
  totalGrowth: number | null;
  perfEffect: number | null;
  netFlow: number | null;
  perfPct: number | null;            // perf cumulée VL sur la fenêtre
  netFlowPct: number | null;         // collecte / AUM_start
};

export function aumGrowthDecomposition(
  fund: Fund,
  fromDate: string,
  toDate: string
): AumGrowth {
  const startObs = obsQuarterCompletAt(fund, fromDate);
  const endObs = obsQuarterCompletAt(fund, toDate);
  if (
    !startObs ||
    !endObs ||
    startObs.aum === null ||
    endObs.aum === null ||
    startObs.vl === null ||
    endObs.vl === null
  ) {
    return {
      fromDate,
      toDate,
      startAUM: null,
      endAUM: null,
      totalGrowth: null,
      perfEffect: null,
      netFlow: null,
      perfPct: null,
      netFlowPct: null,
    };
  }
  const perfPct = endObs.vl / startObs.vl - 1;
  const perfEffect = startObs.aum * perfPct;
  const netFlow = endObs.aum - startObs.aum - perfEffect;
  return {
    fromDate,
    toDate,
    startAUM: startObs.aum,
    endAUM: endObs.aum,
    totalGrowth: endObs.aum - startObs.aum,
    perfEffect,
    netFlow,
    perfPct,
    netFlowPct: netFlow / startObs.aum,
  };
}

/**
 * Cadence de publication : "quotidienne" / "hebdomadaire" / "trimestrielle" /
 * "irrégulière", basée sur le nb de points intra-trim sur les 365 derniers
 * jours et le taux de publication trimestrielle.
 */
export type PublicationCadence = {
  kind: "quotidienne" | "hebdomadaire" | "trimestrielle" | "irrégulière";
  publishedQuarters: number;     // trimestres canoniques effectivement publiés
  expectedQuarters: number;
  regularity: number;            // 0..1
  intraTrim365: number;          // nb de points kind=latest sur 365 j
  avgGapDays: number | null;     // gap moyen entre obs sur 365 j
  lastPublicationDate: string;
  daysSinceLast: number | null;  // jours écoulés depuis la dernière VL vs refDate
};

export function publicationCadence(
  fund: Fund,
  refDate: string,
  quarterEnds: string[]
): PublicationCadence {
  if (fund.observations.length === 0) {
    return {
      kind: "irrégulière",
      publishedQuarters: 0,
      expectedQuarters: 0,
      regularity: 0,
      intraTrim365: 0,
      avgGapDays: null,
      lastPublicationDate: "",
      daysSinceLast: null,
    };
  }
  const firstDate = fund.observations[0].date;
  const expected = quarterEnds.filter((q) => q >= firstDate && q <= refDate);
  const publishedSet = new Set(
    fund.observations.filter((o) => o.kind === "quarter").map((o) => o.date)
  );
  const publishedQuarters = expected.filter((q) => publishedSet.has(q)).length;
  const regularity = expected.length > 0 ? publishedQuarters / expected.length : 0;

  const refMs = toMs(refDate);
  const cutoffMs = refMs - 365 * MS_PER_DAY;
  const cutoffISO = new Date(cutoffMs).toISOString().slice(0, 10);
  const intraTrim365 = fund.observations.filter(
    (o) => o.kind === "latest" && o.date >= cutoffISO
  ).length;

  const recent = fund.observations.filter((o) => o.date >= cutoffISO);
  let avgGapDays: number | null = null;
  if (recent.length >= 2) {
    let total = 0;
    for (let i = 1; i < recent.length; i++) {
      total += (toMs(recent[i].date) - toMs(recent[i - 1].date)) / MS_PER_DAY;
    }
    avgGapDays = total / (recent.length - 1);
  }

  let kind: PublicationCadence["kind"];
  if (intraTrim365 >= 50) kind = "quotidienne";
  else if (intraTrim365 >= 10) kind = "hebdomadaire";
  else if (regularity >= 0.8) kind = "trimestrielle";
  else kind = "irrégulière";

  const last = fund.observations[fund.observations.length - 1];
  const daysSinceLast = (refMs - toMs(last.date)) / MS_PER_DAY;

  return {
    kind,
    publishedQuarters,
    expectedQuarters: expected.length,
    regularity,
    intraTrim365,
    avgGapDays,
    lastPublicationDate: last.date,
    daysSinceLast,
  };
}

/**
 * Performances 1 an glissantes sur les `lookback` derniers trimestres.
 * Évite l'effet "année calendaire" et donne une fourchette honnête.
 */
export type Rolling1YStats = {
  points: Array<{ asOf: string; perf1Y: number | null }>;
  min: number | null;
  median: number | null;
  max: number | null;
};

export function rolling1YStats(
  fund: Fund,
  quarterEnds: string[],
  lookback: number = 8
): Rolling1YStats {
  const points: Array<{ asOf: string; perf1Y: number | null }> = [];
  const recent = quarterEnds.slice(-lookback);
  for (const q of recent) {
    const targetMs = toMs(q) - 365.25 * MS_PER_DAY;
    const targetISO = new Date(targetMs).toISOString().slice(0, 10);
    const fromObs = findObsOnOrBefore(fund.observations, targetISO);
    const toObs = obsVLAt(fund, q);
    let perf1Y: number | null = null;
    if (fromObs && toObs && fromObs.vl !== null && toObs.vl !== null) {
      perf1Y = twr(fromObs.vl, toObs.vl);
    }
    points.push({ asOf: q, perf1Y });
  }
  const valids = points.map((p) => p.perf1Y).filter((v): v is number => v !== null);
  return {
    points,
    min: valids.length > 0 ? Math.min(...valids) : null,
    median: percentile(valids, 0.5),
    max: valids.length > 0 ? Math.max(...valids) : null,
  };
}

/**
 * Part de marché du fonds dans sa catégorie au fil du temps. Calcule aussi
 * le rang AUM dans la catégorie à chaque trimestre.
 */
export type MarketShareFrame = {
  date: string;
  share: number | null;
  rank: number | null;
  nbInCat: number;
  fundAUM: number | null;
  totalCatAUM: number;
};

export function marketShareHistory(
  fund: Fund,
  cohort: Fund[],
  quarterEnds: string[]
): MarketShareFrame[] {
  const out: MarketShareFrame[] = [];
  for (const q of quarterEnds) {
    const aumsInCat: number[] = [];
    let fundAUM: number | null = null;
    let totalCat = 0;
    for (const f of cohort) {
      const o = obsQuarterAumAt(f, q);
      if (!o || o.aum === null) continue;
      totalCat += o.aum;
      aumsInCat.push(o.aum);
      if (f.id === fund.id) fundAUM = o.aum;
    }
    if (totalCat === 0 || fundAUM === null) {
      out.push({
        date: q,
        share: null,
        rank: null,
        nbInCat: aumsInCat.length,
        fundAUM,
        totalCatAUM: totalCat,
      });
      continue;
    }
    const sorted = [...aumsInCat].sort((a, b) => b - a);
    const rank = sorted.findIndex((v) => v === fundAUM) + 1;
    out.push({
      date: q,
      share: fundAUM / totalCat,
      rank: rank > 0 ? rank : null,
      nbInCat: aumsInCat.length,
      fundAUM,
      totalCatAUM: totalCat,
    });
  }
  return out;
}

/**
 * Calendrier perf trimestrielle du fonds : pour chaque (année, trimestre Q1-Q4),
 * la perf du fonds sur ce trimestre. Utilisé pour la heatmap calendaire.
 */
export type CalendarCell = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  perf: number | null;
};

// ==========================================
// FICHE GESTIONNAIRE (SGO) — HELPERS DEDIES
// ==========================================

/**
 * Répartition AUM par catégorie pour les fonds d'un gestionnaire à une date
 * de référence (point in time, l'AUM n'est jamais cumulatif).
 */
export type CategoryBreakdown = {
  categorie: string;
  aum: number;
  nbFunds: number;
  share: number; // 0..1 dans le portefeuille de la SGO
};

export function categoryBreakdownForManager(
  managerFunds: Fund[],
  refDate: string
): CategoryBreakdown[] {
  const map = new Map<string, { aum: number; nb: number }>();
  for (const f of managerFunds) {
    const obs = obsQuarterAumAt(f, refDate);
    if (!obs || obs.aum === null) continue;
    const cat = obs.categorie;
    const e = map.get(cat) || { aum: 0, nb: 0 };
    e.aum += obs.aum;
    e.nb += 1;
    map.set(cat, e);
  }
  const total = Array.from(map.values()).reduce((s, e) => s + e.aum, 0);
  const out: CategoryBreakdown[] = [];
  for (const [cat, e] of map) {
    out.push({
      categorie: cat,
      aum: e.aum,
      nbFunds: e.nb,
      share: total > 0 ? e.aum / total : 0,
    });
  }
  out.sort((a, b) => b.aum - a.aum);
  return out;
}

/**
 * Score qualité d'une SGO : % de fonds en Q1+Q2 sur la fenêtre 1Y, ainsi
 * que la perf médiane et la perf pondérée AUM.
 */
export type ManagerQualityScore = {
  topHalfShare: number | null;        // 0..1
  topQuartileShare: number | null;
  perfMedian1Y: number | null;
  perfWeighted1Y: number | null;
  nbEvaluated: number;
};

export function managerQualityScore(
  managerFunds: Fund[],
  allFunds: Fund[]
): ManagerQualityScore {
  // Cohortes par catégorie sur la base des perf 1Y de tout le marché
  const cohortByCat = new Map<string, number[]>();
  for (const f of allFunds) {
    const v = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(v) || v === 0) continue;
    const list = cohortByCat.get(f.categorie) || [];
    list.push(v);
    cohortByCat.set(f.categorie, list);
  }
  let q1 = 0;
  let topHalf = 0;
  let evaluated = 0;
  const perfs: number[] = [];
  let weightedNum = 0;
  let weightedDen = 0;
  for (const f of managerFunds) {
    const tr = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(tr) || tr === 0) continue;
    perfs.push(tr);
    const aum = f.latestQuarter?.aum ?? 0;
    weightedNum += tr * aum;
    weightedDen += aum;
    const q = quartileInCohort(tr, cohortByCat.get(f.categorie) || []);
    if (q !== null) {
      evaluated++;
      if (q === 1) q1++;
      if (q === 1 || q === 2) topHalf++;
    }
  }
  return {
    topHalfShare: evaluated > 0 ? topHalf / evaluated : null,
    topQuartileShare: evaluated > 0 ? q1 / evaluated : null,
    perfMedian1Y: percentile(perfs, 0.5),
    perfWeighted1Y: weightedDen > 0 ? weightedNum / weightedDen : null,
    nbEvaluated: evaluated,
  };
}

/**
 * Décomposition AUM agrégée d'une SGO entre 2 trimestres canoniques.
 * Somme par fonds : ΣΔAUM = ΣeffetPerf + ΣcollecteNette.
 *
 * Restriction importante : seuls les fonds publiés AUX DEUX dates entrent
 * dans la décomposition. Les fonds créés ou fermés entre `fromDate` et
 * `toDate` sont remontés séparément (`newFundsCount`/`newFundsAUM`,
 * `closedFundsCount`/`closedFundsAUM`) pour permettre la réconciliation
 * avec l'encours total — sinon on attribuerait à tort un AUM entrant en
 * "collecte nette" alors qu'on n'a pas son AUM de référence.
 */
export function managerAumGrowthDecomposition(
  managerFunds: Fund[],
  fromDate: string,
  toDate: string
): {
  startAUM: number;
  endAUM: number;
  totalGrowth: number;
  perfEffect: number;
  netFlow: number;
  perfPctApprox: number | null; // perf agrégée pondérée par AUM_start
  fundsContributing: number;
  newFundsCount: number;
  newFundsAUM: number;
  closedFundsCount: number;
  closedFundsAUM: number;
} {
  let startAUM = 0;
  let endAUM = 0;
  let perfEffect = 0;
  let netFlow = 0;
  let fundsContributing = 0;
  let newFundsCount = 0;
  let newFundsAUM = 0;
  let closedFundsCount = 0;
  let closedFundsAUM = 0;
  for (const f of managerFunds) {
    const start = obsQuarterCompletAt(f, fromDate);
    const end = obsQuarterCompletAt(f, toDate);
    const hasStart = !!start && start.aum !== null && start.vl !== null;
    const hasEnd = !!end && end.aum !== null && end.vl !== null;
    if (hasStart && hasEnd) {
      fundsContributing++;
      startAUM += start!.aum as number;
      endAUM += end!.aum as number;
      const perfTr = (end!.vl as number) / (start!.vl as number) - 1;
      const pe = (start!.aum as number) * perfTr;
      perfEffect += pe;
      netFlow += (end!.aum as number) - (start!.aum as number) - pe;
    } else if (hasEnd) {
      newFundsCount++;
      newFundsAUM += end!.aum as number;
    } else if (hasStart) {
      closedFundsCount++;
      closedFundsAUM += start!.aum as number;
    }
  }
  return {
    startAUM,
    endAUM,
    totalGrowth: endAUM - startAUM,
    perfEffect,
    netFlow,
    perfPctApprox: startAUM > 0 ? perfEffect / startAUM : null,
    fundsContributing,
    newFundsCount,
    newFundsAUM,
    closedFundsCount,
    closedFundsAUM,
  };
}

/**
 * Comptage des cadences de publication des fonds d'une SGO — proxy de
 * transparence.
 */
export type ManagerCadenceMix = {
  quotidienne: number;
  hebdomadaire: number;
  trimestrielle: number;
  irreguliere: number;
};

export function managerCadenceMix(
  managerFunds: Fund[],
  refDate: string,
  quarterEnds: string[]
): ManagerCadenceMix {
  const out: ManagerCadenceMix = {
    quotidienne: 0,
    hebdomadaire: 0,
    trimestrielle: 0,
    irreguliere: 0,
  };
  for (const f of managerFunds) {
    const c = publicationCadence(f, refDate, quarterEnds);
    if (c.kind === "quotidienne") out.quotidienne++;
    else if (c.kind === "hebdomadaire") out.hebdomadaire++;
    else if (c.kind === "trimestrielle") out.trimestrielle++;
    else out.irreguliere++;
  }
  return out;
}

/**
 * Perf médiane des fonds d'une SGO par catégorie × trimestre. Sert à la
 * heatmap "où la SGO excelle ou sous-perf".
 */
export type ManagerPerfHeatmapCell = {
  categorie: string;
  date: string;
  perf: number | null;
  nbFunds: number;
};

export function managerPerfHeatmap(
  managerFunds: Fund[],
  quarterEnds: string[]
): ManagerPerfHeatmapCell[] {
  const out: ManagerPerfHeatmapCell[] = [];
  const cats = Array.from(new Set(managerFunds.map((f) => f.categorie)));
  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];
    for (const cat of cats) {
      const perfs: number[] = [];
      for (const f of managerFunds) {
        if (f.categorie !== cat) continue;
        const prev = obsVLAt(f, qPrev);
        const cur = obsVLAt(f, qCur);
        if (!prev || !cur || prev.vl === null || cur.vl === null) continue;
        perfs.push(twr(prev.vl, cur.vl));
      }
      out.push({
        categorie: cat,
        date: qCur,
        perf: percentile(perfs, 0.5),
        nbFunds: perfs.length,
      });
    }
  }
  return out;
}

export function quarterlyCalendar(fund: Fund, quarterEnds: string[]): CalendarCell[] {
  const out: CalendarCell[] = [];
  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];
    const prev = obsVLAt(fund, qPrev);
    const cur = obsVLAt(fund, qCur);
    const perf =
      prev && cur && prev.vl !== null && cur.vl !== null ? twr(prev.vl, cur.vl) : null;
    const year = parseInt(qCur.slice(0, 4), 10);
    const month = parseInt(qCur.slice(5, 7), 10);
    const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    out.push({ year, quarter, perf });
  }
  return out;
}

// ==========================================
// STATISTIQUES DE RISQUE
// ==========================================
//
// Tout ce qui suit se calcule sur la serie de VL, et non sur les trimestres.
// Deux garde-fous encadrent l'ensemble, parce qu'une statistique de risque
// fausse est pire qu'une case vide :
//
//   1. DENSITE. Sous vingt rendements dans la fenetre, on rend `null`. Un
//      ecart-type sur douze points n'estime rien.
//   2. ANNUALISATION. On annualise par l'ecart MEDIAN entre deux releves, pas
//      par un √252 emprunte aux actions. Les fonds ne publient pas au meme
//      rythme — quotidien, hebdomadaire, trimestriel — et certains changent de
//      rythme en cours de route. La mediane resiste aux trous de publication la
//      ou une moyenne se ferait emporter par un seul intervalle de six mois.

/** Nombre minimal de rendements pour qu'un ecart-type veuille dire quelque chose. */
const MIN_RENDEMENTS = 20;
/** Idem pour les statistiques mensuelles (un an de recul). */
const MIN_MOIS = 12;
/** Au-dela, les releves sont trop espaces pour parler de risque. */
const PAS_MAX_JOURS = 45;

type PointVL = { date: string; vl: number };

/** Serie de VL du fonds, triee, sans les trous. */
function serieVL(fund: Fund): PointVL[] {
  return fund.observations
    .filter((o) => o.vl !== null && o.vl > 0)
    .map((o) => ({ date: o.date, vl: o.vl as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Dernier releve de chaque mois calendaire. */
function serieMensuelle(pts: PointVL[]): Array<{ mois: string; date: string; vl: number }> {
  const parMois = new Map<string, PointVL>();
  for (const p of pts) parMois.set(p.date.slice(0, 7), p); // la serie est triee
  return [...parMois.entries()]
    .map(([mois, p]) => ({ mois, date: p.date, vl: p.vl }))
    .sort((a, b) => a.mois.localeCompare(b.mois));
}

function ecartType(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const moy = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - moy) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Volatilite annualisee d'une serie de VL, ou null si elle est trop maigre. */
function volatiliteAnnualisee(pts: PointVL[]): number | null {
  const rendements: number[] = [];
  const ecarts: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const jours = (toMs(pts[i].date) - toMs(pts[i - 1].date)) / MS_PER_DAY;
    if (jours <= 0) continue;
    rendements.push(Math.log(pts[i].vl / pts[i - 1].vl));
    ecarts.push(jours);
  }
  if (rendements.length < MIN_RENDEMENTS) return null;
  const sigma = ecartType(rendements);
  const pas = percentile(ecarts, 0.5);
  if (sigma === null || pas === null || pas <= 0 || pas > PAS_MAX_JOURS) return null;
  return sigma * Math.sqrt(365.25 / pas);
}

/**
 * Plus forte baisse de pic a creux sur la periode, et ce qu'il est advenu
 * ensuite. `recuperee` porte la date a laquelle la VL a retrouve son pic —
 * null si elle ne l'a pas encore fait, ce qui est l'information la plus utile
 * des quatre.
 */
export type PerteMax = {
  amplitude: number;
  pic: string;
  creux: string;
  recuperee: string | null;
  joursBaisse: number;
  joursRecuperation: number | null;
};

function calculePerteMax(pts: PointVL[]): PerteMax | null {
  if (pts.length < MIN_RENDEMENTS) return null;
  let sommet = pts[0];
  let pire: PerteMax | null = null;
  for (const p of pts) {
    if (p.vl >= sommet.vl) {
      sommet = p;
      continue;
    }
    const amplitude = p.vl / sommet.vl - 1;
    if (pire === null || amplitude < pire.amplitude) {
      pire = {
        amplitude,
        pic: sommet.date,
        creux: p.date,
        recuperee: null,
        joursBaisse: Math.round((toMs(p.date) - toMs(sommet.date)) / MS_PER_DAY),
        joursRecuperation: null,
      };
    }
  }
  if (pire === null) return null;
  const seuil = pts.find((p) => p.date === pire!.pic)?.vl;
  if (seuil !== undefined) {
    const retour = pts.find((p) => p.date > pire!.creux && p.vl >= seuil);
    if (retour) {
      pire.recuperee = retour.date;
      pire.joursRecuperation = Math.round(
        (toMs(retour.date) - toMs(pire.creux)) / MS_PER_DAY,
      );
    }
  }
  return pire;
}

/** Une fenetre du tableau de statistiques. */
export type StatsFenetre = {
  cle: string;
  label: string;
  fromDate: string;
  toDate: string;
  nbPoints: number;
  perfCumulee: number | null;
  perfAnnualisee: number | null;
  volatilite: number | null;
  /** Perf annualisee rapportee a la volatilite. Ce N'EST PAS un Sharpe : il n'y
   *  a pas de taux sans risque UEMOA publie a la frequence qu'il faudrait. */
  rendementSurRisque: number | null;
  perteMax: number | null;
  moisPositifs: number | null;
  meilleurMois: number | null;
  pireMois: number | null;
};

/** Comportement du fonds face a la mediane de sa categorie, en mensuel. */
export type StatsCategorie = {
  nbMois: number;
  correlation: number | null;
  beta: number | null;
  trackingError: number | null;
  ratioInformation: number | null;
};

export type StatsRisque = {
  fenetres: StatsFenetre[];
  perteMax: PerteMax | null;
  categorie: StatsCategorie | null;
  mensuels: Array<{ mois: string; perf: number }>;
  histogramme: Array<{ label: string; centre: number; n: number }>;
  /** Ecart median entre deux releves, en jours. Dit au lecteur sur quoi repose
   *  tout le reste — et pourquoi certaines cases sont vides. */
  pasMedianJours: number | null;
  nbPointsTotal: number;
};

/** Mediane de la cohorte au dernier releve de chaque mois.
 *
 *  On ne reutilise pas `cohortMedianRebasedSeries` : elle exige une date EXACTE
 *  et les fonds d'une meme categorie ne publient pas le meme jour. Ici chaque
 *  fonds apporte son dernier releve connu a la fin du mois.
 */
function medianeCohorteMensuelle(
  cohort: Fund[],
  mois: string[],
): Array<{ mois: string; valeur: number | null }> {
  const series = cohort.map((f) => serieMensuelle(serieVL(f)));
  return mois.map((m, i) => {
    if (i === 0) return { mois: m, valeur: null };
    const rendements: number[] = [];
    for (const s of series) {
      const cur = s.find((x) => x.mois === m);
      const prev = s.find((x) => x.mois === mois[i - 1]);
      if (cur && prev && prev.vl > 0) rendements.push(cur.vl / prev.vl - 1);
    }
    return { mois: m, valeur: percentile(rendements, 0.5) };
  });
}

/**
 * Statistiques de risque du fonds, calculees sur la serie de VL.
 *
 * Rend des `null` en cascade plutot que des approximations : un fonds
 * trimestriel ressort avec un tableau vide et la fiche le dit franchement.
 */
export function statsRisque(fund: Fund, cohort: Fund[]): StatsRisque {
  const pts = serieVL(fund);
  const vide: StatsRisque = {
    fenetres: [],
    perteMax: null,
    categorie: null,
    mensuels: [],
    histogramme: [],
    pasMedianJours: null,
    nbPointsTotal: pts.length,
  };
  if (pts.length < 2) return vide;

  const fin = pts[pts.length - 1].date;
  const ecarts: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const j = (toMs(pts[i].date) - toMs(pts[i - 1].date)) / MS_PER_DAY;
    if (j > 0) ecarts.push(j);
  }
  const pasMedian = percentile(ecarts, 0.5);

  // --- Rendements mensuels, socle des statistiques de distribution ---
  const mensuel = serieMensuelle(pts);
  const mensuels: Array<{ mois: string; perf: number }> = [];
  for (let i = 1; i < mensuel.length; i++) {
    if (mensuel[i - 1].vl > 0) {
      mensuels.push({
        mois: mensuel[i].mois,
        perf: mensuel[i].vl / mensuel[i - 1].vl - 1,
      });
    }
  }

  // --- Fenetres ---
  const fenetres: StatsFenetre[] = [
    { cle: "y1", label: "1 an", annees: 1 },
    { cle: "y3", label: "3 ans", annees: 3 },
    { cle: "origine", label: "Depuis l'origine", annees: null as number | null },
  ].map(({ cle, label, annees }) => {
    const debut =
      annees === null
        ? pts[0].date
        : new Date(toMs(fin) - annees * 365.25 * MS_PER_DAY).toISOString().slice(0, 10);
    const fenetre = pts.filter((p) => p.date >= debut);
    const moisFenetre = mensuels.filter((m) => m.mois >= debut.slice(0, 7));
    const positifs = moisFenetre.filter((m) => m.perf > 0).length;

    if (fenetre.length < 2) {
      return {
        cle,
        label,
        fromDate: debut,
        toDate: fin,
        nbPoints: fenetre.length,
        perfCumulee: null,
        perfAnnualisee: null,
        volatilite: null,
        rendementSurRisque: null,
        perteMax: null,
        moisPositifs: null,
        meilleurMois: null,
        pireMois: null,
      };
    }

    const cumulee = twr(fenetre[0].vl, fenetre[fenetre.length - 1].vl);
    const duree = yearsBetween(fenetre[0].date, fenetre[fenetre.length - 1].date);
    const annualisee = duree >= 0.75 ? annualize(cumulee, duree) : null;
    const vol = volatiliteAnnualisee(fenetre);
    const dd = calculePerteMax(fenetre);
    return {
      cle,
      label,
      fromDate: fenetre[0].date,
      toDate: fin,
      nbPoints: fenetre.length,
      perfCumulee: cumulee,
      perfAnnualisee: annualisee,
      volatilite: vol,
      rendementSurRisque:
        annualisee !== null && vol !== null && vol > 0 ? annualisee / vol : null,
      perteMax: dd ? dd.amplitude : null,
      moisPositifs: moisFenetre.length >= MIN_MOIS ? positifs / moisFenetre.length : null,
      meilleurMois:
        moisFenetre.length >= MIN_MOIS ? Math.max(...moisFenetre.map((m) => m.perf)) : null,
      pireMois:
        moisFenetre.length >= MIN_MOIS ? Math.min(...moisFenetre.map((m) => m.perf)) : null,
    };
  });

  // --- Face a la categorie, en mensuel ---
  let categorie: StatsCategorie | null = null;
  if (mensuels.length >= MIN_MOIS) {
    const moisCles = mensuel.map((m) => m.mois);
    const medianes = medianeCohorteMensuelle(cohort, moisCles);
    const paires: Array<{ f: number; c: number }> = [];
    for (const m of mensuels) {
      const ref = medianes.find((x) => x.mois === m.mois);
      if (ref && ref.valeur !== null) paires.push({ f: m.perf, c: ref.valeur });
    }
    if (paires.length >= MIN_MOIS) {
      const mf = paires.reduce((s, p) => s + p.f, 0) / paires.length;
      const mc = paires.reduce((s, p) => s + p.c, 0) / paires.length;
      const cov = paires.reduce((s, p) => s + (p.f - mf) * (p.c - mc), 0) / (paires.length - 1);
      const sf = ecartType(paires.map((p) => p.f));
      const sc = ecartType(paires.map((p) => p.c));
      const ecarts = paires.map((p) => p.f - p.c);
      const te = ecartType(ecarts);
      const teAnnuel = te !== null ? te * Math.sqrt(12) : null;
      const excesMoyen = ecarts.reduce((s, e) => s + e, 0) / ecarts.length;
      categorie = {
        nbMois: paires.length,
        correlation: sf !== null && sc !== null && sf > 0 && sc > 0 ? cov / (sf * sc) : null,
        beta: sc !== null && sc > 0 ? cov / sc ** 2 : null,
        trackingError: teAnnuel,
        ratioInformation:
          teAnnuel !== null && teAnnuel > 0 ? (excesMoyen * 12) / teAnnuel : null,
      };
    }
  }

  // --- Histogramme des rendements mensuels ---
  const histogramme: Array<{ label: string; centre: number; n: number }> = [];
  if (mensuels.length >= MIN_MOIS) {
    const vals = mensuels.map((m) => m.perf);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const nbClasses = 9;
    const largeur = (hi - lo) / nbClasses || 0.001;
    for (let i = 0; i < nbClasses; i++) {
      const a = lo + i * largeur;
      const b = i === nbClasses - 1 ? hi + 1e-12 : a + largeur;
      histogramme.push({
        label: `${(a * 100).toFixed(1).replace(".", ",")}%`,
        centre: a + largeur / 2,
        n: vals.filter((v) => v >= a && v < b).length,
      });
    }
  }

  return {
    fenetres,
    perteMax: calculePerteMax(pts),
    categorie,
    mensuels,
    histogramme,
    pasMedianJours: pasMedian,
    nbPointsTotal: pts.length,
  };
}

// ==========================================
// COMPARATIF FONDS / CATEGORIE / MARCHE
// ==========================================
//
// Les trois series arrivent alignees sur les MEMES dates — celles des releves
// de VL du fonds — parce que c'est le fonds qui commande : lui seul dit quand
// une observation existe. La mediane et la reference sont des indices base 100,
// la VL est en FCFA ; toutes trois se comparent en RAPPORT de deux valeurs, ce
// qui rend l'unite indifferente.

/** Valeur d'une serie a une date, ou a la date connue la plus proche avant.
 *  Rend aussi la date effectivement retenue : sur un fonds trimestriel, une
 *  borne demandee au 1er juin est servie par le releve du 31 mars, et afficher
 *  « 1er juin » ferait passer trois mois de performance pour un trimestre. */
function valeurAuPlusTard(
  serie: Array<{ date: string; valeur: number | null }>,
  dateISO: string,
): { valeur: number; date: string } | null {
  let trouve: { valeur: number; date: string } | null = null;
  for (const p of serie) {
    if (p.date > dateISO) break;
    if (p.valeur !== null) trouve = { valeur: p.valeur, date: p.date };
  }
  return trouve;
}

/** Performance d'une serie entre deux dates, null si l'une des bornes manque. */
function perfEntre(
  serie: Array<{ date: string; valeur: number | null }>,
  debut: string,
  fin: string,
): number | null {
  const a = valeurAuPlusTard(serie, debut);
  const b = valeurAuPlusTard(serie, fin);
  return a !== null && b !== null && a.valeur > 0 ? b.valeur / a.valeur - 1 : null;
}

/** Bornes reellement servies par la serie du fonds, pour l'affichage. */
function bornesEffectives(
  serie: Array<{ date: string; valeur: number | null }>,
  debut: string,
  fin: string,
): { de: string; a: string } {
  return {
    de: valeurAuPlusTard(serie, debut)?.date ?? debut,
    a: valeurAuPlusTard(serie, fin)?.date ?? fin,
  };
}

export type LigneComparatif = {
  cle: string;
  label: string;
  fromDate: string;
  toDate: string;
  fonds: number | null;
  mediane: number | null;
  reference: number | null;
};

export type AnneeComparatif = {
  annee: number;
  fonds: number | null;
  mediane: number | null;
  reference: number | null;
  /** L'exercice n'est pas complet : premiere annee d'historique, ou annee en
   *  cours. Le lecteur doit le savoir avant de comparer la barre aux autres. */
  partielle: boolean;
};

export type Comparatif = {
  fenetres: LigneComparatif[];
  annees: AnneeComparatif[];
  /** Perf mensuelle du fonds, pour le calendrier. */
  mois: Array<{ annee: number; mois: number; perf: number | null }>;
  totauxAnnuels: Array<{ annee: number; perf: number | null }>;
  aReference: boolean;
};

/**
 * Comparatif de performance du fonds contre la mediane de sa categorie et
 * contre la reference de marche de sa categorie.
 */
export function comparatifPerformances(
  vl: Array<{ date: string; vl: number }>,
  medianeSerie: Array<{ date: string; value: number | null }>,
  referenceSerie: Array<{ date: string; value: number | null }> | null,
  origine?: { date: string; vl: number } | null,
): Comparatif {
  const vide: Comparatif = {
    fenetres: [],
    annees: [],
    mois: [],
    totauxAnnuels: [],
    aReference: false,
  };
  if (vl.length < 2) return vide;

  const fonds = vl.map((p) => ({ date: p.date, valeur: p.vl as number | null }));
  const mediane = medianeSerie.map((p) => ({ date: p.date, valeur: p.value }));
  const reference = (referenceSerie ?? []).map((p) => ({
    date: p.date,
    valeur: p.value,
  }));

  const debutHisto = vl[0].date;
  const fin = vl[vl.length - 1].date;
  const finMs = toMs(fin);
  const anneeFin = parseInt(fin.slice(0, 4), 10);

  const recule = (mois: number): string =>
    new Date(finMs - mois * 30.4375 * MS_PER_DAY).toISOString().slice(0, 10);

  const bornes: Array<{ cle: string; label: string; debut: string }> = [
    { cle: "ytd", label: "Depuis le 1er janvier", debut: `${anneeFin - 1}-12-31` },
    { cle: "m3", label: "3 mois", debut: recule(3) },
    { cle: "m6", label: "6 mois", debut: recule(6) },
    { cle: "y1", label: "1 an", debut: recule(12) },
    { cle: "y3", label: "3 ans", debut: recule(36) },
    { cle: "origine", label: "Depuis l'origine", debut: debutHisto },
  ];

  // Depuis l'origine part de la CREATION du fonds quand le BOC la publie, et
  // non de notre premier bulletin : SECURITAS est ne en 2013 a 5 000, notre
  // archive commence en novembre 2022.
  //
  // Les cellules de comparaison de cette ligne restent vides, et c'est
  // deliberе : la mediane de categorie et la reference de marche ne remontent
  // pas avant novembre 2022. Afficher +79 % pour le fonds en face d'un +12 % de
  // categorie ferait passer dix ans d'anteriorite pour de la surperformance.
  // Les cinq autres fenetres portent la comparaison ; celle-ci porte le chemin
  // parcouru.
  const origineHorsArchive =
    origine != null && origine.vl > 0 && origine.date !== "" && origine.date < debutHisto;
  const dernierVL = vl[vl.length - 1].vl;

  const fenetres: LigneComparatif[] = bornes
    .filter((b) => b.debut >= debutHisto || b.cle === "origine")
    .map((b) => {
      if (b.cle === "origine" && origineHorsArchive && origine) {
        return {
          cle: b.cle,
          label: b.label,
          fromDate: origine.date,
          toDate: fin,
          fonds: dernierVL / origine.vl - 1,
          mediane: null,
          reference: null,
        };
      }
      return {
        cle: b.cle,
        label: b.label,
        // Bornes effectives et non demandees : voir `valeurAuPlusTard`.
        fromDate: bornesEffectives(fonds, b.debut, fin).de,
        toDate: bornesEffectives(fonds, b.debut, fin).a,
        fonds: perfEntre(fonds, b.debut, fin),
        mediane: perfEntre(mediane, b.debut, fin),
        reference: reference.length > 0 ? perfEntre(reference, b.debut, fin) : null,
      };
    });

  // --- Annees calendaires ---
  const anneeDebut = parseInt(debutHisto.slice(0, 4), 10);
  const annees: AnneeComparatif[] = [];
  for (let a = anneeDebut; a <= anneeFin; a++) {
    const ouverture = `${a - 1}-12-31`;
    const cloture = a === anneeFin ? fin : `${a}-12-31`;
    // La premiere annee ne compte que si le fonds etait deja observe au
    // 31 decembre precedent ; sinon la « performance annuelle » ne couvrirait
    // qu'un bout d'annee sans le dire.
    const partielle = ouverture < debutHisto || a === anneeFin;
    if (ouverture < debutHisto && a !== anneeFin) {
      // Exercice tronque a l'ouverture : on part du premier releve connu.
      annees.push({
        annee: a,
        fonds: perfEntre(fonds, debutHisto, cloture),
        mediane: perfEntre(mediane, debutHisto, cloture),
        reference: reference.length > 0 ? perfEntre(reference, debutHisto, cloture) : null,
        partielle: true,
      });
      continue;
    }
    if (ouverture < debutHisto) continue;
    annees.push({
      annee: a,
      fonds: perfEntre(fonds, ouverture, cloture),
      mediane: perfEntre(mediane, ouverture, cloture),
      reference: reference.length > 0 ? perfEntre(reference, ouverture, cloture) : null,
      partielle,
    });
  }

  // --- Calendrier mensuel du fonds ---
  // Dernier releve de chaque mois ; la performance d'un mois se mesure contre
  // le dernier releve du mois PRECEDENT, pas contre son premier releve a lui.
  const parMois = new Map<string, { date: string; vl: number }>();
  for (const p of vl) parMois.set(p.date.slice(0, 7), p); // la serie est triee
  const clesMois = [...parMois.keys()].sort();
  const mois: Array<{ annee: number; mois: number; perf: number | null }> = [];
  for (let i = 1; i < clesMois.length; i++) {
    const prec = parMois.get(clesMois[i - 1])!;
    const cur = parMois.get(clesMois[i])!;
    // Un trou de plus d'un mois ne donne pas une performance mensuelle.
    const ecartMois =
      (parseInt(clesMois[i].slice(0, 4), 10) - parseInt(clesMois[i - 1].slice(0, 4), 10)) * 12 +
      (parseInt(clesMois[i].slice(5, 7), 10) - parseInt(clesMois[i - 1].slice(5, 7), 10));
    mois.push({
      annee: parseInt(clesMois[i].slice(0, 4), 10),
      mois: parseInt(clesMois[i].slice(5, 7), 10),
      perf: ecartMois === 1 && prec.vl > 0 ? cur.vl / prec.vl - 1 : null,
    });
  }

  const totauxAnnuels = annees.map((a) => ({ annee: a.annee, perf: a.fonds }));

  return { fenetres, annees, mois, totauxAnnuels, aReference: reference.length > 0 };
}
