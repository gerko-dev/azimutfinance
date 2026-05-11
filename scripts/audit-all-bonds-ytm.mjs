#!/usr/bin/env node
/**
 * Audit YTM sur les 198 obligations cotées du CSV.
 *
 * Pour chaque bond :
 *  - Construit la cascade per-surviving-titre (Engine A / buildBondCashflowSchedule)
 *  - Solveur YTM par bissection sur prix saisi = nominalValue (pair)
 *  - Vérifie : YTM fini, dans [0%; 25%], "raisonnable" (proche du coupon ±300 bp)
 *
 * Reproduit la logique TS (lib/listedBondsTypes.ts) en JS pur — pas de
 * dépendance à tsx/ts-node. Si la TS change, ce script doit être mis à jour.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "data", "obligations-cotees.csv");
const INITIAL = 10_000;
const TODAY = new Date();

// === PARSE CSV ===
function parseCSV() {
  const raw = readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, "");
  const [head, ...lines] = raw.split(/\r?\n/).filter((l) => l.trim());
  const cols = head.split(";");
  const ix = (name) => cols.indexOf(name);
  const fields = {
    isin: ix("isin"),
    code: ix("code"),
    name: ix("name"),
    nominalValue: ix("nominalValue"),
    couponRate: ix("couponRate"),
    couponFrequency: ix("couponFrequency"),
    issueDate: ix("issueDate"),
    maturityDate: ix("maturityDate"),
    firstCouponDate: ix("firstCouponDate"),
    amortizationType: ix("amortizationType"),
    mode: ix("Titre/Nominal"),
  };
  return lines.map((line) => {
    const f = line.split(";");
    return {
      isin: f[fields.isin],
      code: f[fields.code],
      name: f[fields.name],
      nominalValue: parseNum(f[fields.nominalValue]),
      couponRate: parseNum(f[fields.couponRate]) / 100,
      couponFrequency: Number(f[fields.couponFrequency]) || 1,
      issueDate: parseFrDate(f[fields.issueDate]),
      maturityDate: parseFrDate(f[fields.maturityDate]),
      firstAmortDate: parseFrDate(f[fields.firstCouponDate]),
      amortizationType: f[fields.amortizationType] || "ACD",
      amortizationMode: (f[fields.mode] || "N").trim().toUpperCase() === "T" ? "T" : "N",
    };
  });
}

function parseNum(s) {
  if (!s) return NaN;
  return Number(s.replace(/\s/g, "").replace(",", "."));
}

function parseFrDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

// === GENERATE COUPON DATES (ports lib/listedBondsTypes.ts) ===
function generateCouponDates(issue, maturity, freq) {
  const monthsPerPeriod = 12 / freq;
  const dates = [];
  const cur = new Date(issue);
  while (true) {
    cur.setUTCMonth(cur.getUTCMonth() + monthsPerPeriod);
    if (cur.getTime() > maturity.getTime()) break;
    dates.push(new Date(cur));
  }
  // Ensure last date = maturity
  if (dates.length === 0 || dates[dates.length - 1].getTime() !== maturity.getTime()) {
    dates.push(new Date(maturity));
  }
  return dates;
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

// === BUILD SCHEDULE (ports buildBondCashflowSchedule) ===
function buildSchedule(bond, opDate) {
  if (!bond.issueDate || !bond.maturityDate) return null;
  if (opDate.getTime() >= bond.maturityDate.getTime()) return null;

  const allCouponDates = generateCouponDates(bond.issueDate, bond.maturityDate, bond.couponFrequency);
  if (allCouponDates.length === 0) return null;

  const isIF = bond.amortizationType === "IF" || !bond.amortizationType;
  let firstAmortDate;
  if (isIF) firstAmortDate = bond.maturityDate;
  else if (bond.firstAmortDate) firstAmortDate = bond.firstAmortDate;
  else firstAmortDate = allCouponDates[0];

  const oneDay = 24 * 3600 * 1000;
  const allAmortDates = allCouponDates.filter((d) => d.getTime() >= firstAmortDate.getTime() - oneDay);
  const totalNbAmortPeriods = allAmortDates.length;

  const nbPastAmorts = allAmortDates.filter((d) => d.getTime() <= opDate.getTime()).length;

  let initialNominal = bond.nominalValue;
  let amortPerPeriod = 0;
  if (!isIF && totalNbAmortPeriods > nbPastAmorts) {
    const remainingAmorts = totalNbAmortPeriods - nbPastAmorts;
    initialNominal = (bond.nominalValue * totalNbAmortPeriods) / remainingAmorts;
    amortPerPeriod = initialNominal / totalNbAmortPeriods;
  }

  const pastCouponDates = allCouponDates.filter((d) => d.getTime() <= opDate.getTime());
  const previousCouponDate = pastCouponDates.length > 0 ? pastCouponDates[pastCouponDates.length - 1] : bond.issueDate;
  const futureCouponDatesArr = allCouponDates.filter((d) => d.getTime() > opDate.getTime());
  const nextCouponDate = futureCouponDatesArr.length > 0 ? futureCouponDatesArr[0] : bond.maturityDate;

  const daysSinceLastCoupon = Math.max(0, daysBetween(previousCouponDate, opDate));
  const daysInPeriod = Math.max(1, daysBetween(previousCouponDate, nextCouponDate));

  const periodicCoupon = (bond.nominalValue * bond.couponRate) / bond.couponFrequency;

  let outstanding = bond.nominalValue;
  const futureCashflows = [];
  for (let i = 0; i < futureCouponDatesArr.length; i++) {
    const d = futureCouponDatesArr[i];
    const daysFromNow = (d.getTime() - opDate.getTime()) / oneDay;
    const before = outstanding;
    const coupon = (before * bond.couponRate) / bond.couponFrequency;

    const allAmortIndex = allAmortDates.findIndex((ad) => ad.getTime() === d.getTime());
    const isAmortPeriod = allAmortIndex >= 0;
    const isLastAmort = allAmortIndex === totalNbAmortPeriods - 1;

    let amort = 0;
    if (isAmortPeriod) {
      if (isIF) {
        if (i === futureCouponDatesArr.length - 1) amort = before;
      } else {
        amort = isLastAmort ? before : amortPerPeriod;
      }
    }
    const after = Math.max(0, before - amort);
    futureCashflows.push({ daysFromNow, totalFlow: coupon + amort });
    outstanding = after;
  }

  return {
    futureCashflows,
    daysSinceLastCoupon,
    daysInPeriod,
    periodicCoupon,
  };
}

// === PRICE FROM SCHEDULE ===
function cleanPriceAt(sched, ytm) {
  let dirty = 0;
  for (const cf of sched.futureCashflows) {
    dirty += cf.totalFlow * Math.pow(1 + ytm, -cf.daysFromNow / 365);
  }
  const accrued = sched.daysInPeriod > 0 ? (sched.periodicCoupon * sched.daysSinceLastCoupon) / sched.daysInPeriod : 0;
  return dirty - accrued;
}

// === BISSECTION YTM ===
function ytmFromCleanPrice(sched, target) {
  if (target <= 0 || sched.futureCashflows.length === 0) return 0;
  const LO = -0.5, HI = 2.0;
  const pLo = cleanPriceAt(sched, LO);
  const pHi = cleanPriceAt(sched, HI);
  if ((pLo - target) * (pHi - target) > 0) return NaN;
  let lo = LO, hi = HI;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const p = cleanPriceAt(sched, mid);
    if (Math.abs(p - target) < 1e-4) return mid;
    if (p > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// === RUN AUDIT ===
const bonds = parseCSV();
console.log(`Audit YTM sur ${bonds.length} obligations cotées (au pair = nominalValue)\n`);

const failures = [];
const warnings = [];
const stats = {
  total: 0,
  byType: {},
  byMode: {},
  ytmRange: { min: Infinity, max: -Infinity },
};

for (const bond of bonds) {
  if (!bond.isin || !bond.maturityDate || !Number.isFinite(bond.nominalValue) || !Number.isFinite(bond.couponRate)) continue;
  if (bond.maturityDate.getTime() <= TODAY.getTime()) continue; // bond echu

  stats.total++;
  const key = `${bond.amortizationType}|${bond.amortizationMode}`;
  stats.byType[bond.amortizationType] = (stats.byType[bond.amortizationType] || 0) + 1;
  stats.byMode[bond.amortizationMode] = (stats.byMode[bond.amortizationMode] || 0) + 1;

  const sched = buildSchedule(bond, TODAY);
  if (!sched || sched.futureCashflows.length === 0) {
    failures.push({ bond, reason: "schedule vide" });
    continue;
  }

  // YTM au pair
  const ytmPair = ytmFromCleanPrice(sched, bond.nominalValue);
  if (!Number.isFinite(ytmPair)) {
    failures.push({ bond, reason: `YTM NaN au pair (${bond.nominalValue})` });
    continue;
  }
  if (ytmPair < -0.49 || ytmPair > 1.99) {
    failures.push({ bond, reason: `YTM aux bornes : ${(ytmPair * 100).toFixed(2)}%` });
    continue;
  }
  if (ytmPair < 0 || ytmPair > 0.25) {
    warnings.push({ bond, reason: `YTM hors marche [0; 25] : ${(ytmPair * 100).toFixed(2)}%`, ytm: ytmPair });
  }

  // Comparaison au coupon : ne devrait pas s'ecarter de plus de 300 bp pour un bond au pair
  const ecartCoupon = Math.abs(ytmPair - bond.couponRate);
  if (ecartCoupon > 0.03) {
    warnings.push({
      bond,
      reason: `YTM ${(ytmPair * 100).toFixed(2)}% s'écarte du coupon ${(bond.couponRate * 100).toFixed(2)}% de ${(ecartCoupon * 10000).toFixed(0)} bp`,
      ytm: ytmPair,
    });
  }

  stats.ytmRange.min = Math.min(stats.ytmRange.min, ytmPair);
  stats.ytmRange.max = Math.max(stats.ytmRange.max, ytmPair);
}

console.log(`=== Stats ===`);
console.log(`Bonds testés      : ${stats.total}`);
console.log(`Par type d'amort  : ${JSON.stringify(stats.byType)}`);
console.log(`Par mode (T/N)    : ${JSON.stringify(stats.byMode)}`);
console.log(`Plage YTM au pair : [${(stats.ytmRange.min * 100).toFixed(2)} ; ${(stats.ytmRange.max * 100).toFixed(2)}]%`);
console.log("");

if (failures.length === 0) {
  console.log(`✓ AUCUN FAILURE — tous les YTM sont finis et dans [-49% ; +199%]`);
} else {
  console.log(`✗ ${failures.length} FAILURES :`);
  for (const f of failures.slice(0, 10)) {
    console.log(`   ${f.bond.code.padEnd(12)} ${f.bond.amortizationType}|${f.bond.amortizationMode}  ${f.reason}`);
  }
  if (failures.length > 10) console.log(`   … et ${failures.length - 10} autres`);
}
console.log("");

if (warnings.length === 0) {
  console.log(`✓ AUCUN WARNING — tous les YTM sont raisonnables (proches du coupon ±300 bp)`);
} else {
  console.log(`⚠ ${warnings.length} WARNINGS (YTM s'écarte du coupon de >300 bp ou hors [0; 25%]) :`);
  warnings.sort((a, b) => Math.abs(b.ytm - b.bond.couponRate) - Math.abs(a.ytm - a.bond.couponRate));
  for (const w of warnings.slice(0, 15)) {
    console.log(`   ${w.bond.code.padEnd(12)} ${w.bond.amortizationType}|${w.bond.amortizationMode}  ${w.reason}`);
  }
  if (warnings.length > 15) console.log(`   … et ${warnings.length - 15} autres`);
}

process.exit(failures.length === 0 ? 0 : 1);
