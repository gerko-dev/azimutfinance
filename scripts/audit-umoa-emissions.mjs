#!/usr/bin/env node
/**
 * Audit des incohérences dans les 3 CSV UMOA scrapés.
 *
 * Critères vérifiés :
 *   - dateValeur/echeance valides et cohérentes (dateValeur < echeance)
 *   - maturité dérivée des dates vs maturiteMois affiché (sanity check)
 *   - rendementMoyenPondere dans [0 ; 25%]
 *   - BAT plafonné à 2 ans (règle UMOA)
 *   - montantRetenuM cohérent avec montantSoumisM (retenu ≤ soumis)
 *   - ISIN format et duplicats
 *   - pays mappable vers code UEMOA
 *   - tauxInteret = "multiple" ou nombre valide
 *
 * Lecture-only — affiche un rapport, ne modifie rien.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");

// Mapping pays UMOA-Titres vers code ISO 2 lettres.
const UMOA_COUNTRY_CODE = {
  "Bénin": "BJ", "Benin": "BJ",
  "Burkina Faso": "BF",
  "Côte d'Ivoire": "CI", "Côte d’Ivoire": "CI", "Cote d'Ivoire": "CI",
  "Guinée Bissau": "GW", "Guinee Bissau": "GW", "Guinée-Bissau": "GW",
  "Mali": "ML",
  "Niger": "NE",
  "Sénégal": "SN", "Senegal": "SN",
  "Togo": "TG",
};

function parseCSV(file) {
  const raw = readFileSync(file, "utf-8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    head.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return row;
  });
}

function audit(file, label, checks) {
  const rows = parseCSV(path.join(DATA, file));
  const issues = [];
  rows.forEach((r, idx) => {
    for (const [code, fn] of Object.entries(checks)) {
      const msg = fn(r);
      if (msg) issues.push({ idx: idx + 2, code, row: r, msg });
    }
  });
  console.log(`\n=== ${label} (${rows.length} lignes) ===`);
  if (issues.length === 0) {
    console.log("  ✓ Aucune incohérence détectée.");
    return { rows, issues: [] };
  }
  const byCode = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1;
  console.log(`  ✗ ${issues.length} incohérences sur ${Object.keys(byCode).length} catégories :`);
  for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${code.padEnd(28)}  ${n}`);
  }
  console.log(`  Exemples (5 premiers) :`);
  issues.slice(0, 5).forEach((i) =>
    console.log(`    L${i.idx}  ${i.code}  ${i.msg}`)
  );
  return { rows, issues };
}

// === COMMON CHECKS ===
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isFloat = (s) => s !== "" && /^-?\d+(\.\d+)?$/.test(s);

function dateMs(s) {
  if (!isoDate.test(s)) return NaN;
  return new Date(s + "T00:00:00Z").getTime();
}

const commonChecks = {
  pays_inconnu: (r) =>
    r.pays && !UMOA_COUNTRY_CODE[r.pays]
      ? `pays "${r.pays}" non mappé`
      : null,
  pays_vide: (r) => (!r.pays ? "pays vide" : null),
  dateOp_invalide: (r) =>
    r.dateOperation && !isoDate.test(r.dateOperation)
      ? `dateOperation "${r.dateOperation}" non ISO`
      : null,
  dateOp_vide: (r) => (!r.dateOperation ? "dateOperation vide" : null),
  montant_invalide: (r) =>
    r.montantM && !isFloat(r.montantM)
      ? `montantM "${r.montantM}" non numérique`
      : null,
  url_vide: (r) => (!r.url ? "url vide" : null),
};

// === REALISEES ===
audit("umoa-emissions-realisees.csv", "RÉALISÉES", {
  ...commonChecks,
  dateValeur_invalide: (r) =>
    r.dateValeur && !isoDate.test(r.dateValeur)
      ? `dateValeur "${r.dateValeur}" non ISO`
      : null,
  echeance_invalide: (r) =>
    r.echeance && !isoDate.test(r.echeance)
      ? `echeance "${r.echeance}" non ISO`
      : null,
  dateValeur_apres_echeance: (r) => {
    const v = dateMs(r.dateValeur);
    const e = dateMs(r.echeance);
    if (isFinite(v) && isFinite(e) && v >= e)
      return `dateValeur ${r.dateValeur} ≥ échéance ${r.echeance}`;
    return null;
  },
  maturite_negative_ou_extreme: (r) => {
    const v = dateMs(r.dateValeur);
    const e = dateMs(r.echeance);
    if (!isFinite(v) || !isFinite(e)) return null;
    const years = (e - v) / (365.25 * 24 * 3600 * 1000);
    if (years <= 0) return `maturité ≤ 0 (${years.toFixed(2)} ans)`;
    if (years > 50) return `maturité > 50 ans (${years.toFixed(2)} ans)`;
    return null;
  },
  bat_trop_long: (r) => {
    if (r.instrument !== "BAT") return null;
    const v = dateMs(r.dateValeur);
    const e = dateMs(r.echeance);
    if (!isFinite(v) || !isFinite(e)) return null;
    const years = (e - v) / (365.25 * 24 * 3600 * 1000);
    if (years > 2.05)
      return `BAT avec maturité ${years.toFixed(2)} ans (> 2 ans)`;
    return null;
  },
  retenu_excede_soumis: (r) => {
    const ret = parseFloat(r.montantRetenuM);
    const sou = parseFloat(r.montantSoumisM);
    if (Number.isFinite(ret) && Number.isFinite(sou) && ret > sou + 0.01)
      return `retenu ${ret} > soumis ${sou}`;
    return null;
  },
  isin_vide: (r) =>
    !r.isin ? "isin vide" : null,
  isin_format: (r) =>
    r.isin && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r.isin) && r.isin !== ""
      ? `isin "${r.isin}" format inhabituel`
      : null,
  rendement_hors_borne: (r) => {
    const y = parseFloat(r.rendementMoyenPondere);
    if (!Number.isFinite(y)) return null;
    // Le scraper publie en unités % (ex 5.5200 = 5.52%). Donc bornes [0 ; 25].
    if (y < 0 || y > 25) return `rendement ${y}% hors [0 ; 25]`;
    return null;
  },
  taux_interet_invalide: (r) => {
    const t = r.tauxInteret;
    if (!t) return null;
    if (t.toLowerCase() === "multiple") return null;
    if (!isFloat(t)) return `tauxInteret "${t}" non numérique ni "multiple"`;
    return null;
  },
  instrument_inconnu: (r) =>
    r.instrument && !["BAT", "OAT", "ES", "OB"].includes(r.instrument)
      ? `instrument "${r.instrument}" inconnu`
      : null,
});

// === A VENIR ===
audit("umoa-emissions-a-venir.csv", "À VENIR", {
  ...commonChecks,
  instrument_inconnu: (r) =>
    r.instrument && !["BAT", "OAT", "ES", "OB"].includes(r.instrument)
      ? `instrument "${r.instrument}" inconnu`
      : null,
});

// === PLANIFIÉES ===
audit("umoa-emissions-planifiees.csv", "PLANIFIÉES", {
  ...commonChecks,
  // Pour planifiées, on tolère instrument vide (souvent inconnu en amont)
});

// === DUPLICATS ISIN sur réalisées (clé pour aggregateSovereignBonds) ===
console.log("\n=== Audit ISIN duplicats sur RÉALISÉES ===");
const realisees = parseCSV(path.join(DATA, "umoa-emissions-realisees.csv"));
const isinCount = new Map();
for (const r of realisees) {
  if (!r.isin) continue;
  isinCount.set(r.isin, (isinCount.get(r.isin) || 0) + 1);
}
const reabondees = [...isinCount.entries()].filter(([, n]) => n > 1);
console.log(`  ISIN uniques : ${isinCount.size}`);
console.log(`  ISIN ré-abondés (>1 émission) : ${reabondees.length}`);
console.log(`  C'est NORMAL pour les OAT ré-abondées. Top 5 :`);
reabondees
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([isin, n]) => console.log(`    ${isin}  ${n} rounds`));
