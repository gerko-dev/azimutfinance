// === CALCUL DES RATIOS FONDAMENTAUX ===
// Recalcule les ratios depuis DB_Valeurs.csv (postes bruts) + DB_Titres.csv
// (nb_titres) + data/historique_sika/ (cours de fin d'exercice). Remplace
// progressivement la lecture passive de DB_Ratios.csv : on a vérifié qu'on
// retrouve 99,94 % des valeurs stockées (cf. scripts/calc-fund-ratios.mjs).
//
// Limites assumées (option 2 retenue par l'utilisateur le 2026-05-07) :
//  - Nb_Titres pris constant depuis DB_Titres.csv → ratios marché historiques
//    (PER, capi/CA, yield, P/B) faux pour exercices antérieurs à un split non
//    répercuté (5 cas connus : ONTBF 2016-17, PALC 2016, BOA*, SLBC).
//  - Cours_Fin_Ex = dernière clôture ≤ 31/12/N dans data/historique_sika/.
//    Fallback DB_Titres.cours si ticker absent de l'historique.

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import type { FundRatios, FormatEtats } from "./fundamentals";

const DATA_DIR = join(process.cwd(), "data");
const HIST_DIR = join(DATA_DIR, "historique_sika");

// ── parsing helpers (alignés sur lib/fundamentals.ts) ───────────────────────

function num(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  const s = String(value).trim();
  if (s === "" || s === "NC" || s === "-") return NaN;
  if (/^-?\d+,\d+[eE][+-]?\d+$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return isNaN(n) ? NaN : n;
  }
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return isNaN(n) ? NaN : n;
}

function readCSV<T>(path: string, delimiter: string): T[] {
  let c = readFileSync(path, "utf-8");
  if (c.charCodeAt(0) === 0xfeff) c = c.slice(1);
  return Papa.parse<T>(c, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  }).data;
}

// ── caches au scope module (parsing une fois par process server) ────────────

type TitreLite = {
  ticker: string;
  nbTitres: number;
  cours: number;
  formatEtats: FormatEtats;
};

type ValeursIndex = Map<string, Map<number, Map<string, number>>>;
type HistSeries = { date: string; close: number }[];

let _titresCache: Map<string, TitreLite> | null = null;
let _valeursIndexCache: ValeursIndex | null = null;
let _histCache: Map<string, HistSeries> | null = null;
let _ratiosByTickerCache: Map<string, FundRatios[]> | null = null;

function loadTitres(): Map<string, TitreLite> {
  if (_titresCache) return _titresCache;
  type Raw = { ticker: string; nb_titres: string; cours: string; format_etats: string };
  const rows = readCSV<Raw>(join(DATA_DIR, "DB_Titres.csv"), ",");
  const map = new Map<string, TitreLite>();
  for (const r of rows) {
    const k = r.ticker?.trim().toUpperCase();
    if (!k) continue;
    map.set(k, {
      ticker: k,
      nbTitres: num(r.nb_titres),
      cours: num(r.cours),
      formatEtats: ((r.format_etats?.trim() || "SYSCOHADA") as FormatEtats),
    });
  }
  _titresCache = map;
  return map;
}

function loadValeursIndex(): ValeursIndex {
  if (_valeursIndexCache) return _valeursIndexCache;
  type Raw = { ticker: string; exercice: string; periode: string; code_poste: string; valeur: string };
  const rows = readCSV<Raw>(join(DATA_DIR, "DB_Valeurs.csv"), ",");
  const idx: ValeursIndex = new Map();
  for (const v of rows) {
    const ticker = v.ticker?.trim().toUpperCase();
    if (!ticker) continue;
    // Filtrer "Annuel" — sinon les périodes T1/S1/T3 écrasent (cf. note dans
    // lib/fundamentals.ts:411).
    if (v.periode?.trim() !== "Annuel") continue;
    const ex = num(v.exercice);
    if (!Number.isFinite(ex)) continue;
    const code = v.code_poste?.trim();
    if (!code) continue;
    let byEx = idx.get(ticker);
    if (!byEx) idx.set(ticker, (byEx = new Map()));
    let byCode = byEx.get(ex);
    if (!byCode) byEx.set(ex, (byCode = new Map()));
    byCode.set(code, num(v.valeur));
  }
  _valeursIndexCache = idx;
  return idx;
}

function loadHistorique(): Map<string, HistSeries> {
  if (_histCache) return _histCache;
  const map = new Map<string, HistSeries>();
  if (!existsSync(HIST_DIR)) {
    _histCache = map;
    return map;
  }
  for (const f of readdirSync(HIST_DIR)) {
    if (!f.toLowerCase().endsWith(".csv")) continue;
    const m = f.match(/^([A-Z0-9]+)\./i);
    if (!m) continue;
    const ticker = m[1].toUpperCase();
    type Raw = { date_iso: string; close: string };
    const rows = readCSV<Raw>(join(HIST_DIR, f), ";");
    const series: HistSeries = rows
      .map((r) => ({ date: r.date_iso?.trim() ?? "", close: num(r.close) }))
      .filter((r) => r.date && Number.isFinite(r.close))
      .sort((a, b) => a.date.localeCompare(b.date));
    map.set(ticker, series);
  }
  _histCache = map;
  return map;
}

// ── helpers numériques ──────────────────────────────────────────────────────

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

// Moyenne (N + N-1)/2 si les deux > 0, sinon valeur N seule.
// Règle CRITIQUE : sans ce fallback, les premières années des tickers ont des
// ROE/ROA/Rotation_Actif × 2 vs source (cf. memory/fundamental_ratios_formulas.md).
function avgWithFallback(curr: number, prev: number): number {
  if (Number.isFinite(prev) && prev !== 0 && Number.isFinite(curr) && curr !== 0) {
    return (curr + prev) / 2;
  }
  return Number.isFinite(curr) ? curr : NaN;
}

function get(byCode: Map<string, number>, code: string): number {
  const v = byCode.get(code);
  return Number.isFinite(v) ? (v as number) : 0;
}

// True si le poste a été publié pour cet exercice (clé présente avec valeur
// finie). Permet de distinguer "0 parce qu'absent" de "0 légitime" — utile pour
// renvoyer null (= "—" en UI) plutôt qu'un ratio à 0,0 % trompeur.
function has(byCode: Map<string, number>, code: string): boolean {
  if (!byCode.has(code)) return false;
  return Number.isFinite(byCode.get(code));
}

// Cours de fin d'exercice : dernière clôture ≤ "YYYY-12-31" dans historique_sika.
// Fallbacks : dernière clôture dispo si exercice futur, sinon DB_Titres.cours.
function getCoursFinEx(ticker: string, exercice: number): number {
  const series = loadHistorique().get(ticker);
  const titres = loadTitres();
  if (!series || series.length === 0) {
    return titres.get(ticker)?.cours ?? NaN;
  }
  const cutoff = `${exercice}-12-31`;
  let last = NaN;
  for (const r of series) {
    if (r.date <= cutoff) last = r.close;
    else break;
  }
  if (!Number.isFinite(last)) {
    last = series[series.length - 1].close;
  }
  return last;
}

// ── calcul d'un exercice ────────────────────────────────────────────────────

function buildOne(ticker: string, exercice: number): FundRatios | null {
  const titre = loadTitres().get(ticker);
  if (!titre) return null;
  const byEx = loadValeursIndex().get(ticker);
  if (!byEx) return null;
  const cur = byEx.get(exercice);
  if (!cur) return null;
  const prev = byEx.get(exercice - 1);

  const isBank = titre.formatEtats === "Bancaire";

  // Postes bruts (avec aiguillage SYSCOHADA / Bancaire)
  const ca = get(cur, "CR_CA");
  const rn = get(cur, "CR_RNET");
  const rexp = get(cur, "CR_REXP");
  const va = get(cur, "CR_VA");
  const ebe = isBank ? get(cur, "CR_RBE") : get(cur, "CR_EBE");
  const ta = get(cur, "BIL_TOTAL_ACTIF");
  const cp = get(cur, "BIL_TOTAL_CP");
  const df = isBank
    ? get(cur, "BIL_DETTES_INTERBANC") +
      get(cur, "BIL_P_EMPRUNTS_ET_TITRES_EMIS_SUBORDONNES")
    : get(cur, "BIL_TOTAL_DETTES_FIN");
  const trA = get(cur, "BIL_TOTAL_TRES_ACTIF");
  const trP = get(cur, "BIL_TOTAL_TRES_PASSIF");
  const ac = get(cur, "BIL_TOTAL_CIRC");
  const pc = get(cur, "BIL_TOTAL_PASSIF_CIRC");
  const stocks = get(cur, "BIL_STOCKS");
  const clients = isBank
    ? get(cur, "BIL_CREANCES_CLIENT")
    : get(cur, "BIL_CLIENTS");
  const fournisseurs = get(cur, "BIL_FOURN_EXPL");
  const immo = get(cur, "BIL_TOTAL_IMMOB");
  const ressStables = get(cur, "BIL_TOTAL_RESS_STABLES");
  const chPerso = get(cur, "CR_CHARGES_DE_PERSONNEL");
  const dap = isBank
    ? get(cur, "CR_DOTATION_AUX_AMORT")
    : get(cur, "CR_DOTATIONS_AUX_AMORTISSEMENTS_AUX_PROVISI");
  const fraisFin = isBank
    ? get(cur, "CR_INTERETS_ET_CHARGES_ASSIMILEES")
    : get(cur, "CR_FRAIS_FINANCIERS_ET_CHARGES_ASSIMILES");
  const cafg = get(cur, "TFT_CAFG");
  const dpa = get(cur, "PA_DNPA");
  const cgeBank = isBank ? get(cur, "CR_CHARGES_GENERALES_D_EXPLOITATION") : 0;
  const coutRisque = isBank ? get(cur, "CR_COT_NET_DU_RISQUE") : 0;
  const impotsResult = get(cur, "CR_IMPTS_SUR_LE_RSULTAT"); // < 0 dans le CSV
  const rao = get(cur, "CR_RESULTAT_DES_ACTIVITES_ORDINAIRES");
  const acquisImmo = get(cur, "TFT_DCAISSEMENTS_LIS_AUX_ACQUISITIONS_D_IMMO"); // < 0 (sortie de tréso)
  const bfrSimple = ac - pc; // BFR comptable hors trésorerie
  const dettesLT = ressStables - cp; // ressources stables hors fonds propres

  // Flags de présence — gated chaque ratio pour distinguer "0 parce qu'absent"
  // (→ null = "—") de "0 légitime" (ex. pas de dette financière). Cf. règle UI.
  const hasCA = has(cur, "CR_CA");
  const hasRN = has(cur, "CR_RNET");
  const hasREXP = has(cur, "CR_REXP");
  const hasVA = has(cur, "CR_VA");
  const hasEBE = has(cur, isBank ? "CR_RBE" : "CR_EBE");
  const hasTA = has(cur, "BIL_TOTAL_ACTIF");
  const hasCP = has(cur, "BIL_TOTAL_CP");
  const hasDF = isBank
    ? has(cur, "BIL_DETTES_INTERBANC") ||
      has(cur, "BIL_P_EMPRUNTS_ET_TITRES_EMIS_SUBORDONNES")
    : has(cur, "BIL_TOTAL_DETTES_FIN");
  const hasTrA = has(cur, "BIL_TOTAL_TRES_ACTIF");
  const hasTrP = has(cur, "BIL_TOTAL_TRES_PASSIF");
  const hasAC = has(cur, "BIL_TOTAL_CIRC");
  const hasPC = has(cur, "BIL_TOTAL_PASSIF_CIRC");
  const hasStocks = has(cur, "BIL_STOCKS");
  const hasClients = has(cur, isBank ? "BIL_CREANCES_CLIENT" : "BIL_CLIENTS");
  const hasFourn = has(cur, "BIL_FOURN_EXPL");
  const hasImmo = has(cur, "BIL_TOTAL_IMMOB");
  const hasRS = has(cur, "BIL_TOTAL_RESS_STABLES");
  const hasCAFG = has(cur, "TFT_CAFG");
  const hasDPA = has(cur, "PA_DNPA");
  const hasFraisFin = has(
    cur,
    isBank
      ? "CR_INTERETS_ET_CHARGES_ASSIMILEES"
      : "CR_FRAIS_FINANCIERS_ET_CHARGES_ASSIMILES"
  );
  const hasChPerso = has(cur, "CR_CHARGES_DE_PERSONNEL");
  const hasIS = has(cur, "CR_IMPTS_SUR_LE_RSULTAT");
  const hasAcquisImmo = has(
    cur,
    "TFT_DCAISSEMENTS_LIS_AUX_ACQUISITIONS_D_IMMO"
  );
  const hasCGE = isBank && has(cur, "CR_CHARGES_GENERALES_D_EXPLOITATION");
  const hasCoutRisque = isBank && has(cur, "CR_COT_NET_DU_RISQUE");

  // Taux IS effectif = |IS| / RAO. Borné [0, 0.5]. null si RAO ≤ 0 (perte ou
  // donnée manquante) pour éviter une rentabilité économique aberrante.
  const tauxIS: number | null =
    rao > 0
      ? Math.min(0.5, Math.max(0, Math.abs(impotsResult) / rao))
      : null;

  // N-1 (pour averaging et croissance)
  const cpPrev = prev ? get(prev, "BIL_TOTAL_CP") : 0;
  const taPrev = prev ? get(prev, "BIL_TOTAL_ACTIF") : 0;
  const caPrev = prev ? get(prev, "CR_CA") : 0;
  const vaPrev = prev ? get(prev, "CR_VA") : 0;
  const rnPrev = prev ? get(prev, "CR_RNET") : 0;
  const rexpPrev = prev ? get(prev, "CR_REXP") : 0;

  const cpAvg = avgWithFallback(cp, cpPrev);
  const taAvg = avgWithFallback(ta, taPrev);

  // Marché
  const nbT = titre.nbTitres;
  const cours = getCoursFinEx(ticker, exercice);
  const capi = Number.isFinite(cours) && Number.isFinite(nbT) ? cours * nbT : 0;
  const bpa = safeDiv(rn, nbT);

  function growth(curV: number, prevV: number): number | null {
    if (!prev) return null;
    if (!Number.isFinite(curV) || !Number.isFinite(prevV) || prevV === 0) return null;
    return (curV - prevV) / prevV;
  }

  return {
    ticker,
    exercice,
    formatEtats: titre.formatEtats,
    // Aggregats
    ca,
    resultatNet: rn,
    resultatExploitation: rexp,
    totalActif: ta,
    capitauxPropres: cp,
    dettesFinancieres: df,
    va,
    ebe,
    chargesPersonnel: chPerso,
    dap,
    fraisFinanciers: fraisFin,
    cafg,
    capiBoursiere: capi,
    nbTitres: nbT,
    coursFinEx: cours,
    dpa,
    // Marges — null si CA ou numérateur non publié, sinon safeDiv (gère /0)
    margeBrute: hasCA && hasVA && ca > 0 ? safeDiv(va, ca) : null,
    margeOperationnelle: hasCA && hasREXP && ca > 0 ? safeDiv(rexp, ca) : null,
    margeVA: hasCA && hasEBE && ca > 0 ? safeDiv(ebe, ca) : null,
    margeNette: hasCA && hasRN && ca > 0 ? safeDiv(rn, ca) : null,
    // Rentabilité
    roe: hasRN && hasCP ? safeDiv(rn, cpAvg) : null,
    roa: hasRN && hasTA ? safeDiv(rn, taAvg) : null,
    // Rentabilité économique = REXP × (1 - T_eff) / Capital économique
    // Capital économique = Immobilisations + BFR (hors trésorerie).
    rentaEconomique:
      !isBank &&
      hasREXP &&
      hasImmo &&
      hasAC &&
      hasPC &&
      tauxIS !== null &&
      immo + bfrSimple > 0
        ? safeDiv(rexp * (1 - tauxIS), immo + bfrSimple)
        : null,
    // Solvabilité — non pertinent pour banques
    gearing: !isBank && hasDF && hasCP ? safeDiv(df, cp) : null,
    autonomieFinanciere:
      !isBank && hasCP && hasDF && hasTrP && df + trP !== 0
        ? safeDiv(cp, df + trP)
        : null,
    // Autonomie globale = CP / Ressources_stables.
    autonomieGlobale:
      !isBank && hasCP && hasRS && ressStables > 0 ? safeDiv(cp, ressStables) : null,
    capaciteRemb:
      !isBank && hasDF && hasCAFG && cafg !== 0 ? safeDiv(df, cafg) : null,
    solvabilite: hasCP && hasTA ? safeDiv(cp, ta) : null,
    // Couverture / financement — formules conceptuelles standard SYSCOHADA.
    financementImmo:
      !isBank && hasRS && hasImmo && immo > 0 ? safeDiv(ressStables, immo) : null,
    couvertureCapInvestis:
      !isBank && hasRS && hasImmo && hasAC && hasPC && immo + bfrSimple > 0
        ? safeDiv(ressStables, immo + bfrSimple)
        : null,
    couvertureCapInvestis2: null,
    tauxAutofinancement:
      !isBank && hasCAFG && hasAcquisImmo && acquisImmo !== 0
        ? safeDiv(cafg, Math.abs(acquisImmo))
        : null,
    // Répartition VA
    remTravail: hasVA && hasChPerso && va > 0 ? safeDiv(chPerso, va) : null,
    remPreteurs:
      hasVA && hasFraisFin && va > 0 ? safeDiv(Math.abs(fraisFin), va) : null,
    remEtat: hasVA && hasIS && va > 0 ? safeDiv(impotsResult, va) : null,
    autoRemuneration: hasVA && hasCAFG && va > 0 ? safeDiv(cafg, va) : null,
    remActionnaires:
      hasVA && hasDPA && va > 0 && Number.isFinite(nbT)
        ? safeDiv(dpa * nbT, va)
        : null,
    // Liquidité — SYSCOHADA seulement
    liquiditeImmediate:
      !isBank && hasTrA && hasPC && pc > 0 ? safeDiv(trA, pc) : null,
    liquiditeReduite:
      !isBank && hasClients && hasTrA && hasPC && pc > 0
        ? safeDiv(clients + trA, pc)
        : null,
    liquiditeGenerale:
      !isBank && hasAC && hasTrA && hasPC && pc > 0
        ? safeDiv(ac + trA, pc)
        : null,
    // Activité (jours, base 360) — SYSCOHADA seulement
    rotationStocks:
      !isBank && hasStocks && hasCA && ca > 0
        ? (safeDiv(stocks, ca) ?? 0) * 360
        : null,
    rotationClients:
      !isBank && hasClients && hasCA && ca > 0
        ? (safeDiv(clients, ca * 1.18) ?? 0) * 360
        : null,
    rotationFournisseurs:
      !isBank && hasFourn && hasCA && ca > 0
        ? (safeDiv(fournisseurs, ca) ?? 0) * 360
        : null,
    rotationActif: hasCA && hasTA ? safeDiv(ca, taAvg) : null,
    // Croissance
    croissanceCA: growth(ca, caPrev),
    croissanceVA: growth(va, vaPrev),
    croissanceRNet: growth(rn, rnPrev),
    croissanceRExp: growth(rexp, rexpPrev),
    // Marché
    per: bpa !== null && bpa !== 0 ? safeDiv(cours, bpa) : null,
    bpa,
    tauxDistribution:
      hasDPA && bpa !== null && bpa !== 0 ? safeDiv(dpa, bpa) : null,
    dividendYield: hasDPA && cours > 0 ? safeDiv(dpa, cours) : null,
    capiSurCA: hasCA && ca > 0 ? safeDiv(capi, ca) : null,
    // Bancaire — convention référentiel : (|CGE| + |Coût risque|) / PNB.
    // Requiert les DEUX postes (sinon le calcul partiel sous-estime fortement).
    coefficientExploitation:
      isBank && hasCGE && hasCoutRisque && hasCA && ca > 0
        ? safeDiv(Math.abs(cgeBank) + Math.abs(coutRisque), ca)
        : null,
    coutRisqueSurPNB:
      isBank && hasCoutRisque && hasCA && ca > 0
        ? safeDiv(Math.abs(coutRisque), ca)
        : null,
    // Structure
    levierFinancier: hasTA && hasCP && cp > 0 ? safeDiv(ta, cp) : null,
  };
}

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Calcule l'historique de ratios pour un ticker, exercices croissants.
 * Filtre les exercices "placeholder" (CA=0 ET TA=0).
 * Mémorisé au scope module — un ticker = un calcul par process server.
 */
export function computeRatiosByTicker(ticker: string): FundRatios[] {
  if (!_ratiosByTickerCache) _ratiosByTickerCache = new Map();
  const key = ticker.toUpperCase();
  const cached = _ratiosByTickerCache.get(key);
  if (cached) return cached;

  const byEx = loadValeursIndex().get(key);
  if (!byEx) {
    _ratiosByTickerCache.set(key, []);
    return [];
  }
  const exercices = [...byEx.keys()].sort((a, b) => a - b);
  const list: FundRatios[] = [];
  for (const ex of exercices) {
    const r = buildOne(key, ex);
    if (!r) continue;
    if (r.ca === 0 && r.totalActif === 0) continue;
    list.push(r);
  }
  _ratiosByTickerCache.set(key, list);
  return list;
}

/** Dernier exercice calculé avec activité. */
export function computeLatestRatios(ticker: string): FundRatios | null {
  const list = computeRatiosByTicker(ticker);
  return list[list.length - 1] ?? null;
}

export type LiveRatios = {
  /** PER = cours actuel / BPA du dernier exercice. null si BPA <= 0 (pertes)
   *  ou exercice non disponible. */
  per: number | null;
  /** Rendement = dernier DPA versé > 0 / cours actuel (décimal, ex 0.075).
   *  Fallback sur l'exercice N-1, N-2, ... si le dernier exercice publié
   *  n'a pas encore son dividende renseigne. null si aucun dividende
   *  historiquement publié. */
  dividendYield: number | null;
  /** Bénéfice net par action du dernier exercice (peut être négatif / null). */
  bpa: number | null;
  /** Dividende par action utilisé pour le yield (dernier DPA > 0 si trouvé,
   *  sinon DPA du dernier exercice = 0). */
  dpa: number;
  /** Nombre de titres (DB_Titres) — pour recalculer la capitalisation live. */
  nbTitres: number;
  /** Dernier résultat net disponible. */
  resultatNet: number;
  /** Exercice du BPA servant au PER. Les fondamentaux ne sont pas publiés au
   *  même rythme selon les sociétés : sans ce millésime, un PER sur comptes
   *  2023 se lit comme un PER sur comptes 2026. */
  perExercice: number | null;
  /** Exercice du DPA retenu pour le rendement. Peut être antérieur à
   *  `perExercice` quand le dernier exercice n'a pas encore de dividende
   *  (fallback ci-dessous) — le rendement affiché est alors historique. */
  dpaExercice: number | null;
};

/**
 * Ratios de marché recalculés sur le cours COURANT (live ou dernière clôture
 * Sika), pas sur la clôture de fin d'exercice. C'est la définition attendue
 * côté site :
 *   PER   = cours actuel / dernier BPA disponible
 *   yield = dernier DPA versé > 0 / cours actuel (fallback exercices precedents
 *           si le dernier exercice a publie ses comptes mais pas encore son
 *           dividende — frequent au S1 N+1 entre publication et AG).
 * Les agrégats BPA / Nb_Titres viennent du dernier exercice publié dans
 * DB_Valeurs.csv. Renvoie null si le ticker n'a aucun exercice exploitable.
 */
export function computeLiveRatios(
  ticker: string,
  currentPrice: number,
): LiveRatios | null {
  const list = computeRatiosByTicker(ticker);
  const r = list[list.length - 1] ?? null;
  if (!r) return null;

  // Fallback DPA : si le dernier exercice n'a pas (encore) annonce de
  // dividende, on remonte jusqu'au premier DPA > 0 pour calculer un
  // rendement stable. Cf. cas CBIBF 2025 publie en S1 avant l'AG.
  let effectiveDpa = r.dpa;
  let dpaExercice: number | null = effectiveDpa > 0 ? r.exercice : null;
  if (effectiveDpa <= 0) {
    for (let i = list.length - 2; i >= 0; i--) {
      if (list[i].dpa > 0) {
        effectiveDpa = list[i].dpa;
        dpaExercice = list[i].exercice;
        break;
      }
    }
  }

  const per =
    r.bpa !== null && r.bpa > 0 && currentPrice > 0
      ? currentPrice / r.bpa
      : null;
  const dividendYield =
    effectiveDpa > 0 && currentPrice > 0 ? effectiveDpa / currentPrice : null;
  return {
    per,
    dividendYield,
    bpa: r.bpa,
    dpa: effectiveDpa,
    nbTitres: r.nbTitres,
    resultatNet: r.resultatNet,
    perExercice: per !== null ? r.exercice : null,
    dpaExercice: dividendYield !== null ? dpaExercice : null,
  };
}

// ── Snapshots screener ──────────────────────────────────────────────────────

/**
 * Snapshot par ticker pour le screener : moyenne des ratios sur une fenêtre
 * temporelle (1-5 derniers exercices avec activité). Inclut un priceToBook
 * dérivé de capi/CP par exercice.
 */
export type FundScreenerSnapshot = {
  ticker: string;
  formatEtats: FormatEtats;
  exercice: number;
  // Rentabilité
  roe: number | null;
  roa: number | null;
  rentaEconomique: number | null;
  margeBrute: number | null;
  margeOperationnelle: number | null;
  margeVA: number | null;
  margeNette: number | null;
  // Bancaire
  coefficientExploitation: number | null;
  coutRisqueSurPNB: number | null;
  // Croissance
  croissanceCA: number | null;
  croissanceVA: number | null;
  croissanceRNet: number | null;
  croissanceRExp: number | null;
  // Solvabilité / structure
  gearing: number | null;
  autonomieFinanciere: number | null;
  autonomieGlobale: number | null;
  capaciteRemb: number | null;
  levierFinancier: number | null;
  solvabilite: number | null;
  // Liquidité
  liquiditeGenerale: number | null;
  liquiditeReduite: number | null;
  liquiditeImmediate: number | null;
  // Activité
  rotationActif: number | null;
  rotationStocks: number | null;
  rotationClients: number | null;
  rotationFournisseurs: number | null;
  // Couverture / financement
  financementImmo: number | null;
  couvertureCapInvestis: number | null;
  couvertureCapInvestis2: number | null;
  tauxAutofinancement: number | null;
  // Répartition de la valeur ajoutée
  remTravail: number | null;
  remPreteurs: number | null;
  remEtat: number | null;
  autoRemuneration: number | null;
  remActionnaires: number | null;
  // Valorisation
  priceToBook: number | null;
  per: number | null;
  bpa: number | null;
  tauxDistribution: number | null;
  dividendYield: number | null;
  capiSurCA: number | null;
};

export type FundWindow = 1 | 2 | 3 | 4 | 5;
export const FUND_WINDOWS: FundWindow[] = [1, 2, 3, 4, 5];

function buildSnapshotForWindow(
  ticker: string,
  formatEtats: FormatEtats,
  windowSize: number
): FundScreenerSnapshot | null {
  const all = computeRatiosByTicker(ticker);
  if (all.length === 0) return null;
  const slice = all.slice(-windowSize);
  const last = slice[slice.length - 1];

  function avg(pick: (r: FundRatios) => number | null): number | null {
    const xs: number[] = [];
    for (const r of slice) {
      const v = pick(r);
      if (v !== null && isFinite(v)) xs.push(v);
    }
    if (xs.length === 0) return null;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  }

  // Price-to-Book : moyenne des capi/CP par exercice
  const pbValues: number[] = [];
  for (const r of slice) {
    if (r.capitauxPropres > 0 && r.capiBoursiere > 0) {
      pbValues.push(r.capiBoursiere / r.capitauxPropres);
    }
  }
  const priceToBook =
    pbValues.length > 0
      ? pbValues.reduce((s, x) => s + x, 0) / pbValues.length
      : null;

  return {
    ticker,
    formatEtats,
    exercice: last.exercice,
    roe: avg((r) => r.roe),
    roa: avg((r) => r.roa),
    rentaEconomique: avg((r) => r.rentaEconomique),
    margeBrute: avg((r) => r.margeBrute),
    margeOperationnelle: avg((r) => r.margeOperationnelle),
    margeVA: avg((r) => r.margeVA),
    margeNette: avg((r) => r.margeNette),
    coefficientExploitation: avg((r) => r.coefficientExploitation),
    coutRisqueSurPNB: avg((r) => r.coutRisqueSurPNB),
    croissanceCA: avg((r) => r.croissanceCA),
    croissanceVA: avg((r) => r.croissanceVA),
    croissanceRNet: avg((r) => r.croissanceRNet),
    croissanceRExp: avg((r) => r.croissanceRExp),
    gearing: avg((r) => r.gearing),
    autonomieFinanciere: avg((r) => r.autonomieFinanciere),
    autonomieGlobale: avg((r) => r.autonomieGlobale),
    capaciteRemb: avg((r) => r.capaciteRemb),
    levierFinancier: avg((r) => r.levierFinancier),
    solvabilite: avg((r) => r.solvabilite),
    liquiditeGenerale: avg((r) => r.liquiditeGenerale),
    liquiditeReduite: avg((r) => r.liquiditeReduite),
    liquiditeImmediate: avg((r) => r.liquiditeImmediate),
    rotationActif: avg((r) => r.rotationActif),
    rotationStocks: avg((r) => r.rotationStocks),
    rotationClients: avg((r) => r.rotationClients),
    rotationFournisseurs: avg((r) => r.rotationFournisseurs),
    financementImmo: avg((r) => r.financementImmo),
    couvertureCapInvestis: avg((r) => r.couvertureCapInvestis),
    couvertureCapInvestis2: avg((r) => r.couvertureCapInvestis2),
    tauxAutofinancement: avg((r) => r.tauxAutofinancement),
    remTravail: avg((r) => r.remTravail),
    remPreteurs: avg((r) => r.remPreteurs),
    remEtat: avg((r) => r.remEtat),
    autoRemuneration: avg((r) => r.autoRemuneration),
    remActionnaires: avg((r) => r.remActionnaires),
    priceToBook,
    per: avg((r) => r.per),
    bpa: avg((r) => r.bpa),
    tauxDistribution: avg((r) => r.tauxDistribution),
    dividendYield: avg((r) => r.dividendYield),
    capiSurCA: avg((r) => r.capiSurCA),
  };
}

/** Snapshots multi-fenêtres : pour chaque ticker, snapshot par fenêtre 1-5 ans. */
export function computeFundScreenerSnapshotsMulti(): Map<
  string,
  Record<FundWindow, FundScreenerSnapshot | null>
> {
  const result = new Map<
    string,
    Record<FundWindow, FundScreenerSnapshot | null>
  >();
  for (const ticker of loadTitres().keys()) {
    const ratios = computeRatiosByTicker(ticker);
    if (ratios.length === 0) continue;
    const formatEtats = ratios[ratios.length - 1].formatEtats;
    const byWindow = {
      1: buildSnapshotForWindow(ticker, formatEtats, 1),
      2: buildSnapshotForWindow(ticker, formatEtats, 2),
      3: buildSnapshotForWindow(ticker, formatEtats, 3),
      4: buildSnapshotForWindow(ticker, formatEtats, 4),
      5: buildSnapshotForWindow(ticker, formatEtats, 5),
    } as Record<FundWindow, FundScreenerSnapshot | null>;
    result.set(ticker, byWindow);
  }
  return result;
}
