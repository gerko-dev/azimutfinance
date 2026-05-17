// === ANTICIPATION DE COURS — 8 METHODES ===
// Calcule un cours cible 12 mois par croisement de 8 approches : projection
// trimestrielle, multiples historiques, Gordon-Shapiro, comparables sectoriels,
// analyse technique. Agrege le tout en moyenne ponderee + intervalle +/-1 sigma.
//
// Server-only (lit les CSV via fs). Appele depuis app/titre/[code]/page.tsx.

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import { computeRatiosByTicker } from "./fundamentalsCalc";
import type { FundRatios } from "./fundamentals";
import type { ActionRow } from "./dataLoader";

const DATA_DIR = join(process.cwd(), "data");

// ── Quarterly cache (T1/S1/9M) ──────────────────────────────────────────────
// fundamentalsCalc filtre periode = Annuel uniquement. Pour la projection T1
// on a besoin d'un index parallele.
type QuarterlyKey = string; // `${ticker}|${exercice}|${periode}|${code_poste}`
let _quarterlyCache: Map<QuarterlyKey, number> | null = null;

function loadQuarterly(): Map<QuarterlyKey, number> {
  if (_quarterlyCache) return _quarterlyCache;
  type Raw = {
    ticker: string;
    exercice: string;
    periode: string;
    code_poste: string;
    valeur: string;
  };
  let c = readFileSync(join(DATA_DIR, "DB_Valeurs.csv"), "utf-8");
  if (c.charCodeAt(0) === 0xfeff) c = c.slice(1);
  const rows = Papa.parse<Raw>(c, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
  }).data;
  const m = new Map<QuarterlyKey, number>();
  for (const r of rows) {
    const tk = r.ticker?.trim().toUpperCase();
    const per = r.periode?.trim();
    const code = r.code_poste?.trim();
    if (!tk || !per || !code) continue;
    if (per === "Annuel") continue; // deja dans computeRatiosByTicker
    const ex = Number(r.exercice);
    const v = Number(String(r.valeur).replace(/\s/g, "").replace(/,/g, "."));
    if (!Number.isFinite(ex) || !Number.isFinite(v)) continue;
    m.set(`${tk}|${ex}|${per}|${code}`, v);
  }
  _quarterlyCache = m;
  return m;
}

function getQuarterly(
  ticker: string,
  exercice: number,
  periode: "T1" | "S1" | "9M",
  code: string,
): number | null {
  const v = loadQuarterly().get(
    `${ticker.toUpperCase()}|${exercice}|${periode}|${code}`,
  );
  return Number.isFinite(v) ? (v as number) : null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Moyenne geometrique des taux de croissance d'une serie. Cap a +/-20%/an. */
function geometricGrowth(values: number[]): number | null {
  const positive = values.filter((v) => v > 0);
  if (positive.length < 2) return null;
  const first = positive[0];
  const last = positive[positive.length - 1];
  const n = positive.length - 1;
  if (first <= 0 || last <= 0) return null;
  const g = Math.pow(last / first, 1 / n) - 1;
  return Math.max(-0.2, Math.min(0.2, g));
}

/** SMA 200 sur la serie complete. */
function sma200(history: { date: string; value: number }[]): number | null {
  if (history.length < 50) return null;
  const window = history.slice(-Math.min(200, history.length));
  const sum = window.reduce((a, p) => a + p.value, 0);
  return sum / window.length;
}

// ── Types exposes ───────────────────────────────────────────────────────────

export type PriceTargetMethod = {
  id: string;
  label: string;
  /** Cours cible (FCFA) ou null si non calculable. */
  value: number | null;
  /** Poids dans la moyenne ponderee (0..1). Re-normalise si la methode est
   *  indisponible. */
  weight: number;
  /** Liste d'hypotheses utilisees, pour transparence cote UI. */
  hypotheses: { label: string; value: string }[];
  /** Raison textuelle si value = null (donnees manquantes). */
  reasonUnavailable?: string;
};

export type PriceTarget = {
  ticker: string;
  currentPrice: number;
  /** Moyenne ponderee des methodes disponibles. */
  centralValue: number;
  /** Borne basse = central - sigma (plancher 0). */
  lower: number;
  /** Borne haute = central + sigma. */
  upper: number;
  /** Dispersion (ecart-type pondere). */
  stdDev: number;
  /** Upside relatif (decimal, ex 0.12 = +12%). null si pas de prix actuel. */
  upsidePct: number | null;
  methods: PriceTargetMethod[];
};

// ── Poids initiaux ──────────────────────────────────────────────────────────
// Equilibre 4 multiples + 1 forward-looking (T1) + 1 intrinseque (DDM) +
// 1 relatif (comparables) + 1 technique. Les multiples + DDM dominent car
// soutenus par 10 ans d'historique fondamental ; la technique est secondaire.
const WEIGHTS: Record<string, number> = {
  t1_projection: 0.15,
  yield_history: 0.15,
  per_history: 0.15,
  technical: 0.1,
  ddm_gordon: 0.15,
  pbv_history: 0.1,
  sector_comparable: 0.1,
  psales_history: 0.1,
};

// ───────────────────────────────────────────────────────────────────────────
// METHODE 1 — PROJECTION T1 -> ANNUEL
// ───────────────────────────────────────────────────────────────────────────
function methodT1Projection(
  ticker: string,
  ratios: FundRatios[],
  currentYear: number,
): PriceTargetMethod {
  const id = "t1_projection";
  const label = "Projection T1 → Annuel";
  const out: PriceTargetMethod = {
    id,
    label,
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  // Lit le RN T1 de l'annee en cours (ou la plus recente avec T1)
  let t1Year = currentYear;
  let t1Rn: number | null = getQuarterly(ticker, t1Year, "T1", "CR_RNET");
  if (t1Rn === null) {
    // fallback : derniere annee avec T1 publie
    for (let y = currentYear; y >= currentYear - 2; y--) {
      const v = getQuarterly(ticker, y, "T1", "CR_RNET");
      if (v !== null && v !== 0) {
        t1Year = y;
        t1Rn = v;
        break;
      }
    }
  }
  if (t1Rn === null || t1Rn === 0) {
    out.reasonUnavailable = "Pas de Résultat Net T1 publié récemment";
    return out;
  }

  // Taux d'avancement T1 historique : moyenne de (T1_N / Annuel_N) sur les
  // 5 dernieres annees ou les deux sont disponibles.
  const ratios5 = ratios.slice(-6, -1); // exclut l'annee en cours
  const advancementRates: number[] = [];
  for (const r of ratios5) {
    const t1 = getQuarterly(ticker, r.exercice, "T1", "CR_RNET");
    if (t1 !== null && r.resultatNet > 0 && t1 > 0) {
      advancementRates.push(t1 / r.resultatNet);
    }
  }
  const tauxAvancement = avg(advancementRates);
  if (tauxAvancement === null || tauxAvancement <= 0) {
    out.reasonUnavailable = "Pas d'historique T1/Annuel exploitable";
    return out;
  }

  const rnProjete = t1Rn / tauxAvancement;
  const nbT = ratios[ratios.length - 1]?.nbTitres ?? 0;
  if (nbT <= 0) {
    out.reasonUnavailable = "Nombre de titres indisponible";
    return out;
  }
  const bpaProjete = rnProjete / nbT;

  // Payout moyen historique (DPA/BPA) sur les 5 derniers exercices.
  const payouts: number[] = [];
  for (const r of ratios5) {
    if (r.dpa > 0 && r.bpa !== null && r.bpa > 0) {
      payouts.push(r.dpa / r.bpa);
    }
  }
  const payoutMoy = avg(payouts);
  if (payoutMoy === null) {
    out.reasonUnavailable = "Pas d'historique de payout exploitable";
    return out;
  }
  const dpaProjete = bpaProjete * payoutMoy;

  // Yield historique moyen (DPA / cours fin d'exercice).
  const yields: number[] = [];
  for (const r of ratios5) {
    if (r.dpa > 0 && r.coursFinEx > 0) {
      yields.push(r.dpa / r.coursFinEx);
    }
  }
  const yieldMoy = avg(yields);
  if (yieldMoy === null || yieldMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de rendement exploitable";
    return out;
  }

  const target = dpaProjete / yieldMoy;
  out.value = target;
  out.hypotheses = [
    { label: `RN T1 ${t1Year}`, value: formatBig(t1Rn) },
    {
      label: "Taux d'avancement T1",
      value: `${(tauxAvancement * 100).toFixed(1)}%`,
    },
    { label: "RN annuel projeté", value: formatBig(rnProjete) },
    { label: "BPA projeté", value: `${Math.round(bpaProjete)} FCFA` },
    { label: "Payout moyen", value: `${(payoutMoy * 100).toFixed(0)}%` },
    { label: "DPA projeté", value: `${Math.round(dpaProjete)} FCFA` },
    { label: "Yield moyen", value: `${(yieldMoy * 100).toFixed(2)}%` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 2 — RENDEMENT HISTORIQUE × DPA DERNIER EXERCICE
// ───────────────────────────────────────────────────────────────────────────
function methodYieldHistory(
  ticker: string,
  ratios: FundRatios[],
): PriceTargetMethod {
  const id = "yield_history";
  const out: PriceTargetMethod = {
    id,
    label: "Rendement historique × DPA",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  // DPA effectif (dernier > 0)
  let dpaRef = 0;
  let dpaYear: number | null = null;
  for (let i = ratios.length - 1; i >= 0; i--) {
    if (ratios[i].dpa > 0) {
      dpaRef = ratios[i].dpa;
      dpaYear = ratios[i].exercice;
      break;
    }
  }
  if (dpaRef <= 0) {
    out.reasonUnavailable = "Aucun dividende historique";
    return out;
  }

  const yields = ratios
    .slice(-6)
    .filter((r) => r.dpa > 0 && r.coursFinEx > 0)
    .map((r) => r.dpa / r.coursFinEx);
  const yieldMoy = avg(yields);
  if (yieldMoy === null || yieldMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de rendement exploitable";
    return out;
  }

  out.value = dpaRef / yieldMoy;
  out.hypotheses = [
    {
      label: `DPA ${dpaYear}`,
      value: `${Math.round(dpaRef)} FCFA`,
    },
    {
      label: "Yield moyen 5 ans",
      value: `${(yieldMoy * 100).toFixed(2)}%`,
    },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 3 — PER HISTORIQUE × BPA DERNIER
// ───────────────────────────────────────────────────────────────────────────
function methodPER(ticker: string, ratios: FundRatios[]): PriceTargetMethod {
  const id = "per_history";
  const out: PriceTargetMethod = {
    id,
    label: "PER moyen × BPA",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  const last = ratios[ratios.length - 1];
  if (!last || last.bpa === null || last.bpa <= 0) {
    out.reasonUnavailable = "Pas de BPA positif au dernier exercice";
    return out;
  }

  const pers = ratios
    .slice(-6)
    .filter((r) => r.bpa !== null && r.bpa > 0 && r.coursFinEx > 0)
    .map((r) => r.coursFinEx / (r.bpa as number));
  const perMoy = avg(pers);
  if (perMoy === null || perMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de PER exploitable";
    return out;
  }

  out.value = last.bpa * perMoy;
  out.hypotheses = [
    { label: "BPA dernier", value: `${Math.round(last.bpa)} FCFA` },
    { label: "PER moyen 5 ans", value: `${perMoy.toFixed(1)}×` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 4 — ANALYSE TECHNIQUE (SMA 200)
// ───────────────────────────────────────────────────────────────────────────
function methodTechnical(
  history: { date: string; value: number }[],
): PriceTargetMethod {
  const id = "technical";
  const out: PriceTargetMethod = {
    id,
    label: "Réversion à la moyenne (SMA 200)",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  const sma = sma200(history);
  if (sma === null || sma <= 0) {
    out.reasonUnavailable = "Historique insuffisant (< 50 séances)";
    return out;
  }

  out.value = sma;
  out.hypotheses = [
    {
      label: "Moyenne mobile 200j",
      value: `${Math.round(sma)} FCFA`,
    },
    {
      label: "Hypothèse",
      value: "Réversion à la moyenne longue terme",
    },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 5 — GORDON-SHAPIRO (DDM)
// Cours = DPA × (1 + g) / (k - g), avec :
//   g = croissance moyenne du DPA (capee +/-20%)
//   k = yield moyen historique + 2,5% (prime de risque BRVM)
// ───────────────────────────────────────────────────────────────────────────
function methodDDM(ticker: string, ratios: FundRatios[]): PriceTargetMethod {
  const id = "ddm_gordon";
  const out: PriceTargetMethod = {
    id,
    label: "Gordon-Shapiro (DDM)",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  // DPA reference
  let dpaRef = 0;
  for (let i = ratios.length - 1; i >= 0; i--) {
    if (ratios[i].dpa > 0) {
      dpaRef = ratios[i].dpa;
      break;
    }
  }
  if (dpaRef <= 0) {
    out.reasonUnavailable = "Aucun dividende historique (DDM inapplicable)";
    return out;
  }

  const dpas = ratios
    .slice(-6)
    .map((r) => r.dpa)
    .filter((d) => d > 0);
  const g = geometricGrowth(dpas) ?? 0.02;

  const yields = ratios
    .slice(-6)
    .filter((r) => r.dpa > 0 && r.coursFinEx > 0)
    .map((r) => r.dpa / r.coursFinEx);
  const yieldMoy = avg(yields);
  if (yieldMoy === null || yieldMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de rendement (DDM inapplicable)";
    return out;
  }

  const k = yieldMoy + 0.025; // prime de risque marche BRVM
  if (k <= g) {
    out.reasonUnavailable = "k ≤ g : modèle dégénéré";
    return out;
  }

  out.value = (dpaRef * (1 + g)) / (k - g);
  out.hypotheses = [
    { label: "DPA référence", value: `${Math.round(dpaRef)} FCFA` },
    { label: "g (croissance DPA)", value: `${(g * 100).toFixed(1)}%` },
    { label: "k (taux exigé)", value: `${(k * 100).toFixed(1)}%` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 6 — P/B HISTORIQUE × BOOK VALUE
// ───────────────────────────────────────────────────────────────────────────
function methodPBV(ticker: string, ratios: FundRatios[]): PriceTargetMethod {
  const id = "pbv_history";
  const out: PriceTargetMethod = {
    id,
    label: "P/B moyen × Book Value",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  const last = ratios[ratios.length - 1];
  if (!last || last.capitauxPropres <= 0 || last.nbTitres <= 0) {
    out.reasonUnavailable = "Capitaux propres ≤ 0 ou nb titres indisponible";
    return out;
  }
  const bvps = last.capitauxPropres / last.nbTitres;

  const pbvs = ratios
    .slice(-6)
    .filter((r) => r.capitauxPropres > 0 && r.coursFinEx > 0 && r.nbTitres > 0)
    .map((r) => (r.coursFinEx * r.nbTitres) / r.capitauxPropres);
  const pbvMoy = avg(pbvs);
  if (pbvMoy === null || pbvMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de P/B exploitable";
    return out;
  }

  out.value = bvps * pbvMoy;
  out.hypotheses = [
    { label: "Book value / action", value: `${Math.round(bvps)} FCFA` },
    { label: "P/B moyen 5 ans", value: `${pbvMoy.toFixed(2)}×` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 7 — COMPARABLES SECTORIELS (PER median secteur × BPA)
// ───────────────────────────────────────────────────────────────────────────
function methodSectorComparable(
  ticker: string,
  ratios: FundRatios[],
  allActions: ActionRow[],
): PriceTargetMethod {
  const id = "sector_comparable";
  const out: PriceTargetMethod = {
    id,
    label: "Comparables sectoriels (PER secteur × BPA)",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  const last = ratios[ratios.length - 1];
  if (!last || last.bpa === null || last.bpa <= 0) {
    out.reasonUnavailable = "Pas de BPA positif au dernier exercice";
    return out;
  }

  const me = allActions.find((a) => a.code === ticker);
  if (!me || !me.sector) {
    out.reasonUnavailable = "Secteur indéterminé";
    return out;
  }
  const peers = allActions.filter(
    (a) => a.sector === me.sector && a.code !== ticker && a.hasPer && a.per > 0,
  );
  if (peers.length < 2) {
    out.reasonUnavailable = "Moins de 2 pairs avec PER (échantillon trop faible)";
    return out;
  }
  const pers = peers.map((a) => a.per).sort((a, b) => a - b);
  // mediane robuste aux outliers
  const mid = Math.floor(pers.length / 2);
  const perSecteur =
    pers.length % 2 === 0 ? (pers[mid - 1] + pers[mid]) / 2 : pers[mid];

  out.value = last.bpa * perSecteur;
  out.hypotheses = [
    { label: "BPA", value: `${Math.round(last.bpa)} FCFA` },
    { label: `PER médian ${me.sector}`, value: `${perSecteur.toFixed(1)}×` },
    { label: "Pairs", value: `${peers.length}` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// METHODE 8 — P/SALES HISTORIQUE × CA PAR ACTION
// ───────────────────────────────────────────────────────────────────────────
function methodPSales(ticker: string, ratios: FundRatios[]): PriceTargetMethod {
  const id = "psales_history";
  const out: PriceTargetMethod = {
    id,
    label: "P/Sales moyen × CA par action",
    value: null,
    weight: WEIGHTS[id],
    hypotheses: [],
  };

  const last = ratios[ratios.length - 1];
  if (!last || last.ca <= 0 || last.nbTitres <= 0) {
    out.reasonUnavailable = "CA ≤ 0 ou nb titres indisponible";
    return out;
  }
  const caPerShare = last.ca / last.nbTitres;

  const ps = ratios
    .slice(-6)
    .filter((r) => r.ca > 0 && r.coursFinEx > 0 && r.nbTitres > 0)
    .map((r) => (r.coursFinEx * r.nbTitres) / r.ca);
  const psMoy = avg(ps);
  if (psMoy === null || psMoy <= 0) {
    out.reasonUnavailable = "Pas d'historique de P/Sales exploitable";
    return out;
  }

  out.value = caPerShare * psMoy;
  out.hypotheses = [
    { label: "CA / action", value: `${Math.round(caPerShare)} FCFA` },
    { label: "P/S moyen 5 ans", value: `${psMoy.toFixed(2)}×` },
  ];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// AGREGATION — Moyenne ponderee + ecart-type pondere
// ───────────────────────────────────────────────────────────────────────────
function formatBig(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

export function computePriceTarget(
  ticker: string,
  currentPrice: number,
  history: { date: string; value: number }[],
  allActions: ActionRow[],
  currentYear: number = new Date().getFullYear(),
): PriceTarget | null {
  const tk = ticker.toUpperCase();
  const ratios = computeRatiosByTicker(tk);
  if (ratios.length === 0) return null;

  const methods: PriceTargetMethod[] = [
    methodT1Projection(tk, ratios, currentYear),
    methodYieldHistory(tk, ratios),
    methodPER(tk, ratios),
    methodTechnical(history),
    methodDDM(tk, ratios),
    methodPBV(tk, ratios),
    methodSectorComparable(tk, ratios, allActions),
    methodPSales(tk, ratios),
  ];

  // Re-normalise les poids parmi les methodes disponibles uniquement.
  const valid = methods.filter((m) => m.value !== null && m.value > 0);
  if (valid.length === 0) return null;
  const wSum = valid.reduce((s, m) => s + m.weight, 0);
  if (wSum <= 0) return null;

  const central =
    valid.reduce((s, m) => s + (m.value as number) * m.weight, 0) / wSum;
  // Variance ponderee : sigma^2 = sum w_i (x_i - mu)^2 / sum w_i
  const variance =
    valid.reduce((s, m) => {
      const diff = (m.value as number) - central;
      return s + m.weight * diff * diff;
    }, 0) / wSum;
  const stdDev = Math.sqrt(variance);

  return {
    ticker: tk,
    currentPrice,
    centralValue: central,
    lower: Math.max(0, central - stdDev),
    upper: central + stdDev,
    stdDev,
    upsidePct: currentPrice > 0 ? (central - currentPrice) / currentPrice : null,
    methods,
  };
}
