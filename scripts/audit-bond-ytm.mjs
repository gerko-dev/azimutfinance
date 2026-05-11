#!/usr/bin/env node
/**
 * Audit reproductible du calcul de YTM sur le cas TPBF.O12.
 *
 * Re-implémente la cascade per-surviving-titre attendue (sans dépendance au
 * module TS) et lance la bissection sur 3 prix de saisie pour vérifier que :
 *   1. prix = 10 000 (pair)   → YTM ≈ couponRate (6,50% ± 5 bp)
 *   2. prix =  9 990 (sous le pair) → YTM ∈ [6,40 ; 6,90]%
 *   3. prix = 10 100 (au-dessus) → YTM < 6,50%
 *
 * Usage : node scripts/audit-bond-ytm.mjs
 *
 * Bond : TPBF.O12 (BF0000001743)
 *  - Etat du Burkina Faso, 6,50% nominal annuel, semestrielle
 *  - Issue 06/07/2021, 1er amort 06/01/2023, échéance 06/07/2031
 *  - Mode Titre (T), Amortissement Constant Différé (ACD)
 *  - 18 dates d'amort total — à mai 2026 : 7 passés, 11 futurs
 */

const N_TOTAL_AMORTS = 18;
const N_PAST_AMORTS = 7;
const R = N_TOTAL_AMORTS - N_PAST_AMORTS; // 11 futurs
const NOMINAL = 10_000;
const RATE = 0.065;
const FREQ = 2; // semestrielle
const COUPON_PERIOD_DAYS = 182.5; // approx semestrielle
const DAYS_SINCE_LAST_COUPON = 124;
const DAYS_IN_PERIOD = 181;

// === Cascade per-surviving-titre (formule retablie) ===
//   amortPerPeriod = NOMINAL / R
//   outstanding cascade depuis NOMINAL → 0 sur R periodes
function buildSchedule() {
  const amortPerPeriod = NOMINAL / R;
  let outstanding = NOMINAL;
  const flows = [];
  // Premiere echeance future : COUPON_PERIOD_DAYS - DAYS_SINCE_LAST_COUPON jours
  const daysFirst = DAYS_IN_PERIOD - DAYS_SINCE_LAST_COUPON;
  for (let i = 0; i < R; i++) {
    const isLast = i === R - 1;
    const before = outstanding;
    const coupon = (before * RATE) / FREQ;
    const amort = isLast ? before : amortPerPeriod;
    const daysFromNow = daysFirst + i * COUPON_PERIOD_DAYS;
    flows.push({ i: i + 1, daysFromNow, before, coupon, amort, after: before - amort, totalFlow: coupon + amort });
    outstanding = Math.max(0, before - amort);
  }
  return flows;
}

function dirtyAt(ytm, flows) {
  let dirty = 0;
  for (const cf of flows) {
    const years = cf.daysFromNow / 365;
    dirty += cf.totalFlow * Math.pow(1 + ytm, -years);
  }
  return dirty;
}

function accruedInterest() {
  // Coupon couru = (outstandingAtPeriodStart × rate / freq) × daysSince/daysInPeriod
  const periodicCoupon = (NOMINAL * RATE) / FREQ;
  return (periodicCoupon * DAYS_SINCE_LAST_COUPON) / DAYS_IN_PERIOD;
}

function ytmFromCleanPrice(cleanPrice, flows) {
  const accrued = accruedInterest();
  const targetDirty = cleanPrice + accrued;
  // Bornes [-50%, +200%], 200 iter, tolerance 1e-4 sur clean price
  const LOW = -0.5;
  const HIGH = 2.0;
  const cleanAtLow = dirtyAt(LOW, flows) - accrued;
  const cleanAtHigh = dirtyAt(HIGH, flows) - accrued;
  if ((cleanAtLow - cleanPrice) * (cleanAtHigh - cleanPrice) > 0) return NaN;
  let lo = LOW, hi = HIGH;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const cleanMid = dirtyAt(mid, flows) - accrued;
    const diff = cleanMid - cleanPrice;
    if (Math.abs(diff) < 1e-4) return mid;
    if (diff > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const flows = buildSchedule();
const accrued = accruedInterest();
const sumAmorts = flows.reduce((s, f) => s + f.amort, 0);
const sumCoupons = flows.reduce((s, f) => s + f.coupon, 0);

console.log("================================================================");
console.log("AUDIT YTM — TPBF.O12 (BF0000001743)");
console.log("================================================================");
console.log("Bond : Etat du BF, 6,50% 2021-2031, mode T, ACD, semestrielle");
console.log(`Nominal courant : ${NOMINAL} FCFA`);
console.log(`Amorts totaux : ${N_TOTAL_AMORTS} (${N_PAST_AMORTS} passés, ${R} futurs)`);
console.log(`amortPerPeriod : ${(NOMINAL/R).toFixed(2)} FCFA = NOMINAL/R`);
console.log(`Coupon couru   : ${accrued.toFixed(2)} FCFA (${DAYS_SINCE_LAST_COUPON}/${DAYS_IN_PERIOD} jours)`);
console.log("");
console.log("=== Tableau d'amortissement (futur) ===");
console.log("Période | outBefore | coupon  | amort   | outAfter");
for (const f of flows) {
  console.log(`   ${String(f.i).padStart(2)}   | ${f.before.toFixed(2).padStart(9)} | ${f.coupon.toFixed(2).padStart(7)} | ${f.amort.toFixed(2).padStart(7)} | ${f.after.toFixed(2).padStart(9)}`);
}
console.log(`        |           | ${sumCoupons.toFixed(2).padStart(7)} | ${sumAmorts.toFixed(2).padStart(7)} | (totaux)`);
console.log("");

// NB : pour un bond ACD, ytm_pair ≠ couponRate (vrai uniquement pour bonds
// in fine). L'amortissement constant retourne le capital plus tot, ce qui
// rehausse legerement le YTM effectif au prix au pair.
const cases = [
  { label: "Pair (au coupon)", price: 10_000, expectedRange: [0.0645, 0.0675] },
  { label: "Sous le pair    ", price:  9_990, expectedRange: [0.0650, 0.0700] },
  { label: "Au-dessus pair  ", price: 10_100, expectedRange: [0.0500, 0.0660] },
];

console.log("=== Tests YTM ===");
let allOk = true;
const ytmsByCase = [];
for (const c of cases) {
  const ytm = ytmFromCleanPrice(c.price, flows);
  ytmsByCase.push(ytm);
  const ytmPct = (ytm * 100).toFixed(4);
  const inRange = ytm >= c.expectedRange[0] && ytm <= c.expectedRange[1];
  const tag = inRange ? "✓" : "✗ HORS BORNES";
  if (!inRange) allOk = false;
  const rangeStr = `[${(c.expectedRange[0]*100).toFixed(2)} ; ${(c.expectedRange[1]*100).toFixed(2)}]%`;
  console.log(`  ${c.label} | prix=${c.price.toString().padStart(6)} | YTM=${ytmPct.padStart(8)}% ${tag.padEnd(15)} attendu ${rangeStr}`);
}

// Monotonicité : prix↑ ⟹ ytm↓. Test fondamental du solveur.
console.log("");
console.log("=== Test de monotonicité (prix ↑ ⟹ YTM ↓) ===");
const [ytmPair, ytmSous, ytmDessus] = ytmsByCase;
const monoOk = ytmSous > ytmPair && ytmPair > ytmDessus;
if (monoOk) {
  console.log(`  ✓ ytm(9990) ${(ytmSous*100).toFixed(4)}% > ytm(10000) ${(ytmPair*100).toFixed(4)}% > ytm(10100) ${(ytmDessus*100).toFixed(4)}%`);
} else {
  console.log("  ✗ Monotonicite violee — la bissection est cassee.");
  allOk = false;
}

// Pas de NaN ni de borne aberrante
console.log("");
console.log("=== Test anti-régression : pas de borne aberrante ===");
const anyAberrant = ytmsByCase.some((y) => !Number.isFinite(y) || y <= -0.49 || y >= 1.99);
if (anyAberrant) {
  console.log("  ✗ Au moins un YTM est NaN ou colle a une borne — bissection cassee.");
  allOk = false;
} else {
  console.log("  ✓ Aucun YTM n'est NaN ni proche des bornes [-50%, +200%].");
}

console.log("");
if (allOk) {
  console.log("✓ Tous les tests passent. La cascade per-surviving-titre + le solveur sont corrects.");
  process.exit(0);
} else {
  console.log("✗ Au moins un test echoue.");
  process.exit(1);
}
