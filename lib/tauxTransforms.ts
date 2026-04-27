// Transformations pures sur des séries {sortKey, iso, label, value}[]
// Utilisées par le Studio d'analyse.

import type { SeriesPoint, TauxSeries } from "./tauxTypes";

export type TransformMode =
  | "level"
  | "base100"
  | "yoy"
  | "deltaPP"
  | "spread"
  | "ratio"
  | "zscore";

/** Indexe une série base 100 à la première date ≥ pivot (ou première date si non fournie) */
export function base100(series: TauxSeries, pivotIso?: string): TauxSeries {
  if (series.points.length === 0) return series;
  let pivot = series.points[0];
  if (pivotIso) {
    const found = series.points.find((p) => p.iso >= pivotIso);
    if (found) pivot = found;
  }
  if (pivot.value === 0) return series;
  return {
    ...series,
    unit: "x",
    points: series.points.map((p) => ({ ...p, value: (p.value / pivot.value) * 100 })),
  };
}

/** Variation absolue mois/mois (en pp ou unité d'origine) */
export function deltaPP(series: TauxSeries): TauxSeries {
  const out: SeriesPoint[] = [];
  for (let i = 1; i < series.points.length; i++) {
    const prev = series.points[i - 1].value;
    const curr = series.points[i].value;
    out.push({ ...series.points[i], value: curr - prev });
  }
  return { ...series, points: out };
}

/**
 * Variation YoY : pour chaque point P, on cherche le point ~12 mois avant
 * (sortKey décalé de 365 j ± 32 j) et on calcule (P - P_y_1) / P_y_1.
 * Si la série est annuelle, on prend le point d'année précédente.
 */
export function yoy(series: TauxSeries): TauxSeries {
  const out: SeriesPoint[] = [];
  const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;
  for (const p of series.points) {
    const target = p.sortKey - ONE_YEAR_MS;
    let best: SeriesPoint | null = null;
    let bestDiff = Infinity;
    for (const q of series.points) {
      if (q.sortKey >= p.sortKey) continue;
      const diff = Math.abs(q.sortKey - target);
      if (diff < bestDiff) {
        best = q;
        bestDiff = diff;
      }
    }
    if (!best || best.value === 0) continue;
    if (bestDiff > 60 * 24 * 3600 * 1000) continue; // tolérance 60j
    out.push({ ...p, value: (p.value - best.value) / best.value });
  }
  return { ...series, points: out };
}

/** Spread A − B : aligne sur les iso communs (intersection) */
export function spread(a: TauxSeries, b: TauxSeries): TauxSeries {
  const bByIso = new Map(b.points.map((p) => [p.iso, p.value]));
  const points: SeriesPoint[] = [];
  for (const p of a.points) {
    const bv = bByIso.get(p.iso);
    if (bv !== undefined) points.push({ ...p, value: p.value - bv });
  }
  return {
    ...a,
    id: `spread|${a.id}|${b.id}`,
    indicator: `${a.indicator} − ${b.indicator}`,
    points,
  };
}

/** Ratio A / B (mêmes règles d'alignement) */
export function ratio(a: TauxSeries, b: TauxSeries): TauxSeries {
  const bByIso = new Map(b.points.map((p) => [p.iso, p.value]));
  const points: SeriesPoint[] = [];
  for (const p of a.points) {
    const bv = bByIso.get(p.iso);
    if (bv !== undefined && bv !== 0) points.push({ ...p, value: p.value / bv });
  }
  return {
    ...a,
    id: `ratio|${a.id}|${b.id}`,
    indicator: `${a.indicator} / ${b.indicator}`,
    unit: "x",
    points,
  };
}

/** Z-score sur la fenêtre visible : (x - mean) / sigma */
export function zscore(series: TauxSeries): TauxSeries {
  const vals = series.points.map((p) => p.value);
  if (vals.length < 2) return series;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const sigma = Math.sqrt(variance);
  if (sigma === 0) return { ...series, points: series.points.map((p) => ({ ...p, value: 0 })) };
  return {
    ...series,
    unit: "x",
    points: series.points.map((p) => ({ ...p, value: (p.value - mean) / sigma })),
  };
}

/** Stats descriptives d'une série (utilisées dans le panneau stats du Studio) */
export type SeriesStats = {
  count: number;
  last: number;
  lastLabel: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  ytd: number | null; // variation depuis la 1re obs de l'année courante
  oneYear: number | null; // variation 1 an
};

export function computeStats(series: TauxSeries): SeriesStats {
  const pts = series.points;
  if (pts.length === 0) {
    return { count: 0, last: NaN, lastLabel: "", mean: NaN, std: NaN, min: NaN, max: NaN, ytd: null, oneYear: null };
  }
  const last = pts[pts.length - 1];
  const vals = pts.map((p) => p.value);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // YTD : 1ère obs de l'année du dernier point
  const lastYear = new Date(last.sortKey).getUTCFullYear();
  const sameYear = pts.filter((p) => new Date(p.sortKey).getUTCFullYear() === lastYear);
  const ytd = sameYear.length >= 2 && sameYear[0].value !== 0
    ? (last.value - sameYear[0].value) / sameYear[0].value
    : null;

  // 1Y : point ~12 mois avant
  const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;
  const target = last.sortKey - ONE_YEAR_MS;
  let best: SeriesPoint | null = null;
  let bestDiff = Infinity;
  for (const q of pts) {
    if (q.sortKey >= last.sortKey) continue;
    const diff = Math.abs(q.sortKey - target);
    if (diff < bestDiff) {
      best = q;
      bestDiff = diff;
    }
  }
  const oneYear = best && best.value !== 0 && bestDiff < 60 * 24 * 3600 * 1000
    ? (last.value - best.value) / best.value
    : null;

  return {
    count: pts.length,
    last: last.value,
    lastLabel: last.label,
    mean,
    std,
    min,
    max,
    ytd,
    oneYear,
  };
}

/** Matrice de corrélation Pearson entre N séries (alignées sur iso commun) */
export function correlationMatrix(seriesList: TauxSeries[]): number[][] {
  const n = seriesList.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(NaN));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const a = seriesList[i];
      const b = seriesList[j];
      const bByIso = new Map(b.points.map((p) => [p.iso, p.value]));
      const xs: number[] = [];
      const ys: number[] = [];
      for (const p of a.points) {
        const bv = bByIso.get(p.iso);
        if (bv !== undefined) {
          xs.push(p.value);
          ys.push(bv);
        }
      }
      if (xs.length < 3) {
        matrix[i][j] = NaN;
        continue;
      }
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let num = 0, dx = 0, dy = 0;
      for (let k = 0; k < xs.length; k++) {
        const a0 = xs[k] - mx;
        const b0 = ys[k] - my;
        num += a0 * b0;
        dx += a0 * a0;
        dy += b0 * b0;
      }
      const denom = Math.sqrt(dx * dy);
      matrix[i][j] = denom === 0 ? NaN : num / denom;
    }
  }
  return matrix;
}

/** Filtre une série sur une fenêtre temporelle (sortKey ≥ from) */
export function clipFrom(series: TauxSeries, fromSortKey: number): TauxSeries {
  return { ...series, points: series.points.filter((p) => p.sortKey >= fromSortKey) };
}
