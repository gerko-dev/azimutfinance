// === MOTEUR DE CALCUL FCP ===
//
// Métriques retenues : performance cumulée TWR, perf annualisée, quartiles
// catégorie, dynamique d'AUM, flux nets implicites, persistance.
// PAS de volatilité / Sharpe / drawdown — fréquence d'observation hétérogène
// entre fonds (cf. lib/fcp.ts).

import type { Fund, FundObservation } from "./fcp";

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
      const prev = f.observations.find((o) => o.date === qPrev && o.vl !== null);
      const cur = f.observations.find((o) => o.date === qCur && o.vl !== null);
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
      const obs = f.observations.find((o) => o.date === q && o.kind === "quarter" && o.aum !== null);
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
        const prev = f.observations.find((o) => o.date === qPrev && o.vl !== null);
        const cur = f.observations.find((o) => o.date === qCur && o.vl !== null);
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
  return dates.map((d) => {
    const values: number[] = [];
    for (const f of cohort) {
      const baseObs = f.observations.find((o) => o.date === baseDate && o.vl !== null);
      const curObs = f.observations.find((o) => o.date === d && o.vl !== null);
      if (!baseObs || baseObs.vl === null || !curObs || curObs.vl === null) continue;
      values.push((curObs.vl / baseObs.vl) * 100);
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
  for (let i = 1; i < quarterEnds.length; i++) {
    const qPrev = quarterEnds[i - 1];
    const qCur = quarterEnds[i];
    const prev = fund.observations.find((o) => o.date === qPrev && o.vl !== null);
    const cur = fund.observations.find((o) => o.date === qCur && o.vl !== null);
    const fundPerf =
      prev && cur && prev.vl !== null && cur.vl !== null ? twr(prev.vl, cur.vl) : null;

    const cohortPerfs: number[] = [];
    for (const f of cohort) {
      const p = f.observations.find((o) => o.date === qPrev && o.vl !== null);
      const c = f.observations.find((o) => o.date === qCur && o.vl !== null);
      if (p && c && p.vl !== null && c.vl !== null) cohortPerfs.push(twr(p.vl, c.vl));
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
  const startObs = fund.observations.find(
    (o) => o.date === fromDate && o.kind === "quarter" && o.aum !== null && o.vl !== null
  );
  const endObs = fund.observations.find(
    (o) => o.date === toDate && o.kind === "quarter" && o.aum !== null && o.vl !== null
  );
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
    const toObs = fund.observations.find((o) => o.date === q && o.vl !== null);
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
      const o = f.observations.find(
        (o) => o.date === q && o.kind === "quarter" && o.aum !== null
      );
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
// FICHE GESTIONNAIRE (SGP) — HELPERS DEDIES
// ==========================================

/**
 * Répartition AUM par catégorie pour les fonds d'un gestionnaire à une date
 * de référence (point in time, l'AUM n'est jamais cumulatif).
 */
export type CategoryBreakdown = {
  categorie: string;
  aum: number;
  nbFunds: number;
  share: number; // 0..1 dans le portefeuille de la SGP
};

export function categoryBreakdownForManager(
  managerFunds: Fund[],
  refDate: string
): CategoryBreakdown[] {
  const map = new Map<string, { aum: number; nb: number }>();
  for (const f of managerFunds) {
    const obs = f.observations.find(
      (o) => o.date === refDate && o.kind === "quarter" && o.aum !== null
    );
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
 * Score qualité d'une SGP : % de fonds en Q1+Q2 sur la fenêtre 1Y, ainsi
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
 * Décomposition AUM agrégée d'une SGP entre 2 trimestres canoniques.
 * Somme par fonds : ΣΔAUM = ΣeffetPerf + ΣcollecteNette.
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
} {
  let startAUM = 0;
  let endAUM = 0;
  let perfEffect = 0;
  let netFlow = 0;
  let fundsContributing = 0;
  for (const f of managerFunds) {
    const start = f.observations.find(
      (o) => o.date === fromDate && o.kind === "quarter" && o.aum !== null && o.vl !== null
    );
    const end = f.observations.find(
      (o) => o.date === toDate && o.kind === "quarter" && o.aum !== null && o.vl !== null
    );
    if (
      !start ||
      !end ||
      start.aum === null ||
      end.aum === null ||
      start.vl === null ||
      end.vl === null
    ) {
      continue;
    }
    fundsContributing++;
    startAUM += start.aum;
    endAUM += end.aum;
    const perfTr = end.vl / start.vl - 1;
    const pe = start.aum * perfTr;
    perfEffect += pe;
    netFlow += end.aum - start.aum - pe;
  }
  return {
    startAUM,
    endAUM,
    totalGrowth: endAUM - startAUM,
    perfEffect,
    netFlow,
    perfPctApprox: startAUM > 0 ? perfEffect / startAUM : null,
    fundsContributing,
  };
}

/**
 * Comptage des cadences de publication des fonds d'une SGP — proxy de
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
 * Perf médiane des fonds d'une SGP par catégorie × trimestre. Sert à la
 * heatmap "où la SGP excelle ou sous-perf".
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
        const prev = f.observations.find((o) => o.date === qPrev && o.vl !== null);
        const cur = f.observations.find((o) => o.date === qCur && o.vl !== null);
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
    const prev = fund.observations.find((o) => o.date === qPrev && o.vl !== null);
    const cur = fund.observations.find((o) => o.date === qCur && o.vl !== null);
    const perf =
      prev && cur && prev.vl !== null && cur.vl !== null ? twr(prev.vl, cur.vl) : null;
    const year = parseInt(qCur.slice(0, 4), 10);
    const month = parseInt(qCur.slice(5, 7), 10);
    const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    out.push({ year, quarter, perf });
  }
  return out;
}
