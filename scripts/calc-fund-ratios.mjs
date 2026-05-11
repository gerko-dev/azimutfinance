// Dump des ratios fondamentaux calculés (depuis DB_Valeurs.csv + DB_Titres.csv
// + data/historique_sika/) pour inspection rapide d'un ticker.
//
// Usage : node scripts/calc-fund-ratios.mjs <TICKER>     (ex: BICC, ABJC, SNTS)
//         node scripts/calc-fund-ratios.mjs              (liste des tickers dispo)
//
// Note : la validation contre DB_Ratios.csv (rapport global de match) a été
// retirée le 2026-05-07 après suppression de DB_Ratios.csv. Cf. lib/fundamentalsCalc.ts
// pour le module de calcul utilisé en runtime par l'app.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const HIST_DIR = join(DATA, "historique_sika");

function num(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  if (s === "" || s === "NC" || s === "-") return NaN;
  if (/^-?\d+,\d+[eE][+-]?\d+$/.test(s)) return Number(s.replace(",", "."));
  return Number(s.replace(/\s/g, "").replace(/,/g, "."));
}
function readCSV(path, delimiter) {
  let c = readFileSync(path, "utf-8");
  if (c.charCodeAt(0) === 0xfeff) c = c.slice(1);
  return Papa.parse(c, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  }).data;
}

const valeurs = readCSV(join(DATA, "DB_Valeurs.csv"), ",");
const titres = readCSV(join(DATA, "DB_Titres.csv"), ",");

const titreByTicker = new Map();
for (const t of titres) {
  const k = (t.ticker || "").trim().toUpperCase();
  if (!k) continue;
  titreByTicker.set(k, {
    ticker: k,
    nbTitres: num(t.nb_titres),
    cours: num(t.cours),
    formatEtats: (t.format_etats || "SYSCOHADA").trim(),
  });
}

function loadHistByTicker() {
  const map = new Map();
  for (const f of readdirSync(HIST_DIR)) {
    if (!f.toLowerCase().endsWith(".csv")) continue;
    const m = f.match(/^([A-Z0-9]+)\./i);
    if (!m) continue;
    const ticker = m[1].toUpperCase();
    const rows = readCSV(join(HIST_DIR, f), ";");
    const series = rows
      .map((r) => ({ date: (r.date_iso || "").trim(), close: num(r.close) }))
      .filter((r) => r.date && Number.isFinite(r.close))
      .sort((a, b) => a.date.localeCompare(b.date));
    map.set(ticker, series);
  }
  return map;
}
const histByTicker = loadHistByTicker();

function coursFinEx(ticker, exercice) {
  const series = histByTicker.get(ticker);
  if (!series || series.length === 0) {
    return titreByTicker.get(ticker)?.cours ?? NaN;
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

function buildValeursIndex() {
  const idx = new Map();
  for (const v of valeurs) {
    const ticker = (v.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    if ((v.periode || "").trim() !== "Annuel") continue;
    const ex = num(v.exercice);
    if (!Number.isFinite(ex)) continue;
    const code = (v.code_poste || "").trim();
    if (!code) continue;
    let byEx = idx.get(ticker);
    if (!byEx) idx.set(ticker, (byEx = new Map()));
    let byCode = byEx.get(ex);
    if (!byCode) byEx.set(ex, (byCode = new Map()));
    byCode.set(code, num(v.valeur));
  }
  return idx;
}
const valeursIndex = buildValeursIndex();

function safeDiv(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}
function get(byCode, code) {
  const v = byCode.get(code);
  return Number.isFinite(v) ? v : 0;
}
function has(byCode, code) {
  if (!byCode.has(code)) return false;
  return Number.isFinite(byCode.get(code));
}
function avgWithFallback(curr, prev) {
  if (Number.isFinite(prev) && prev !== 0 && Number.isFinite(curr) && curr !== 0) {
    return (curr + prev) / 2;
  }
  return Number.isFinite(curr) ? curr : NaN;
}

// Calcul d'un exercice — copie de buildOne dans lib/fundamentalsCalc.ts.
// Maintenir en sync si on étend les ratios.
function computeRatios(ticker, exercice) {
  const titre = titreByTicker.get(ticker);
  if (!titre) return null;
  const byEx = valeursIndex.get(ticker);
  if (!byEx) return null;
  const cur = byEx.get(exercice);
  if (!cur) return null;
  const prev = byEx.get(exercice - 1);
  const isBank = titre.formatEtats === "Bancaire";

  const ca = get(cur, "CR_CA");
  const rn = get(cur, "CR_RNET");
  const rexp = get(cur, "CR_REXP");
  const va = get(cur, "CR_VA");
  const ebe = isBank ? get(cur, "CR_RBE") : get(cur, "CR_EBE");
  const ta = get(cur, "BIL_TOTAL_ACTIF");
  const cp = get(cur, "BIL_TOTAL_CP");
  const df = isBank
    ? get(cur, "BIL_DETTES_INTERBANC") + get(cur, "BIL_P_EMPRUNTS_ET_TITRES_EMIS_SUBORDONNES")
    : get(cur, "BIL_TOTAL_DETTES_FIN");
  const cpPrev = prev ? get(prev, "BIL_TOTAL_CP") : 0;
  const taPrev = prev ? get(prev, "BIL_TOTAL_ACTIF") : 0;
  const cpAvg = avgWithFallback(cp, cpPrev);
  const taAvg = avgWithFallback(ta, taPrev);
  const nbT = titre.nbTitres;
  const cours = coursFinEx(ticker, exercice);
  const dpa = get(cur, "PA_DNPA");
  const bpa = safeDiv(rn, nbT);
  const hasCA = has(cur, "CR_CA");
  const hasRN = has(cur, "CR_RNET");
  const hasCP = has(cur, "BIL_TOTAL_CP");
  const hasTA = has(cur, "BIL_TOTAL_ACTIF");
  const hasDF = isBank
    ? has(cur, "BIL_DETTES_INTERBANC") || has(cur, "BIL_P_EMPRUNTS_ET_TITRES_EMIS_SUBORDONNES")
    : has(cur, "BIL_TOTAL_DETTES_FIN");
  const hasDPA = has(cur, "PA_DNPA");

  return {
    exercice,
    ca, rn, ta, cp,
    cours, bpa,
    margeNette: hasCA && hasRN && ca > 0 ? safeDiv(rn, ca) : null,
    roe: hasRN && hasCP ? safeDiv(rn, cpAvg) : null,
    roa: hasRN && hasTA ? safeDiv(rn, taAvg) : null,
    gearing: !isBank && hasDF && hasCP ? safeDiv(df, cp) : null,
    per: bpa !== null && bpa !== 0 ? safeDiv(cours, bpa) : null,
    yield_: hasDPA && cours > 0 ? safeDiv(dpa, cours) : null,
  };
}

const onlyTicker = (process.argv[2] || "").trim().toUpperCase();

if (!onlyTicker) {
  const tickers = [...valeursIndex.keys()].sort();
  console.log(`${tickers.length} tickers disponibles dans DB_Valeurs.csv :\n`);
  console.log(tickers.join(", "));
  console.log(`\nUsage : node scripts/calc-fund-ratios.mjs <TICKER>`);
  process.exit(0);
}

const byEx = valeursIndex.get(onlyTicker);
if (!byEx) {
  console.error(`Ticker ${onlyTicker} absent de DB_Valeurs.csv.`);
  process.exit(1);
}

console.log(`\n=== Ratios calculés pour ${onlyTicker} ===`);
console.log("ex   |   CA(M)  |   RN(M)  |   ROE   |   ROA   | MargeNette |  Cours  |  BPA  |   PER   |  Yield");
const exercices = [...byEx.keys()].sort((a, b) => a - b);
for (const ex of exercices) {
  const r = computeRatios(onlyTicker, ex);
  if (!r) continue;
  if (r.ca === 0 && r.ta === 0) continue;
  const fmtBig = (v) => Number.isFinite(v) ? (v / 1e6).toFixed(0).padStart(8) : "    —   ";
  const fmtPct = (v) => v === null ? "   —  " : (v * 100).toFixed(1).padStart(6) + "%";
  const fmt = (v, w = 7) => v === null || !Number.isFinite(v) ? "  —  ".padStart(w) : v.toFixed(2).padStart(w);
  const fmtInt = (v) => v === null || !Number.isFinite(v) ? "  —  " : Math.round(v).toString().padStart(5);
  console.log(
    `${ex} | ${fmtBig(r.ca)} | ${fmtBig(r.rn)} | ${fmtPct(r.roe)} | ${fmtPct(r.roa)} | ${fmtPct(r.margeNette).padStart(10)} | ${fmtInt(r.cours).padStart(7)} | ${fmtInt(r.bpa)} | ${fmt(r.per)} | ${fmtPct(r.yield_)}`
  );
}
