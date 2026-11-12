#!/usr/bin/env node

// =========================================================================
// « Mise à jour cours.xlsx » — les cours du jour, et rien d'autre
// =========================================================================
//
//   node scripts/maj-cours-xlsx.mjs 2026-11-09
//   node scripts/maj-cours-xlsx.mjs 2026-11-09 --verifier   (ne rien écrire)
//
// QUATRE CHOSES QUI NE SE DEVINENT PAS, et que ce script tient pour acquises.
//
// SEULS LES COURS. Clôture pour les actions (colonne F, lignes 2 à 49), cours
// du jour pour les obligations (colonne E, lignes 54 à 332). Volume, cours de
// veille, ouverture, variation et coupon couru NE SE TOUCHENT PAS — consigne
// donnée après une fois où tout le bloc avait été réécrit.
//
// LES DONNÉES VIENNENT DE LA PRODUCTION. Le dépôt local est souvent plusieurs
// dizaines de commits en retard et ses historiques s'arrêtent avant la date
// demandée. On extrait donc depuis `origin/main` sans toucher à la branche de
// travail.
//
// LES COURS ACTIONS SONT DES CHAÎNES FORMATÉES, parfois PARTAGÉES. Une même
// entrée de `sharedStrings.xml` peut servir à plusieurs cellules : la réécrire
// en place corromprait les colonnes voisines. Le script vérifie l'usage de
// chaque entrée — il réécrit celles qui n'ont qu'un seul lecteur, et en ajoute
// une nouvelle pour les autres. Les cours obligataires, eux, sont numériques.
//
// LE XML SE MODIFIE EN PLACE. Le classeur porte deux requêtes Power Query,
// deux tableaux et une extension de volet, qu'une bibliothèque de tableur
// détruirait en réécrivant le fichier.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

import JSZip from "jszip";

const RACINE = path.resolve(import.meta.dirname, "..");
const CLASSEUR = path.join(RACINE, "Mise à jour cours.xlsx");
const VERIFIER = process.argv.includes("--verifier");
const DATE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!DATE) {
  console.error("Usage : node scripts/maj-cours-xlsx.mjs AAAA-MM-JJ [--verifier]");
  process.exit(1);
}

/** Les lignes du classeur, telles qu'il est bâti. */
const ACTIONS = { premiere: 2, derniere: 49, colonne: "F" };
const OBLIGATIONS = { premiere: 54, derniere: 332, colonne: "E" };

/** Suspendues de cotation : elles n'ont jamais de cours, et ce n'est pas une anomalie. */
const SUSPENDUES = new Set(["SEMC", "SICC"]);

const fr = (v) => Math.round(v).toLocaleString("fr-FR").replace(/ | /g, " ");

// ─── La production, extraite sans toucher à la branche ───────────────────
//
// EN ZIP, ET NON EN TAR. Le tar de Git pour Windows prend « C:… » pour un
// hote distant et tente de s'y connecter ; le zip se lit avec la bibliotheque
// deja presente, sans sous-processus ni chemin a echapper.
async function extraireProduction() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cours-"));
  console.log("Extraction depuis origin/main…");
  execFileSync("git", ["fetch", "origin", "--quiet"], { cwd: RACINE });
  const archive = execFileSync(
    "git",
    [
      "archive",
      "--format=zip",
      "origin/main",
      "data/historique_sika",
      "data/obligations-cotees-prix.csv",
      "data/obligations-cotees.csv",
    ],
    { cwd: RACINE, maxBuffer: 1024 * 1024 * 512 },
  );
  const z = await JSZip.loadAsync(archive);
  for (const nom of Object.keys(z.files)) {
    const entree = z.files[nom];
    const cible = path.join(tmp, nom);
    if (entree.dir) {
      fs.mkdirSync(cible, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, await entree.async("nodebuffer"));
  }
  return tmp;
}

const lireCsv = (chemin) => {
  const texte = fs.readFileSync(chemin, "utf8").replace(/^﻿/, "");
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "");
  const entete = lignes[0].split(";");
  return lignes.slice(1).map((l) => {
    const cases = l.split(";");
    const o = {};
    entete.forEach((c, i) => (o[c] = (cases[i] ?? "").trim()));
    return o;
  });
};

// ─── Le classeur, cellule par cellule ────────────────────────────────────
function lireCellules(sheet) {
  const cells = new Map();
  const motif = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of sheet.matchAll(motif)) {
    cells.set(m[1], {
      ref: m[1],
      attrs: m[2],
      inner: m[3] ?? null,
      type: /t="([^"]+)"/.exec(m[2])?.[1] ?? "n",
      v: m[3] ? (/<v>([\s\S]*?)<\/v>/.exec(m[3])?.[1] ?? null) : null,
      brut: m[0],
    });
  }
  return cells;
}

function lireChaines(ss) {
  return [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""),
  );
}

const echapper = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function principal() {
  if (!fs.existsSync(CLASSEUR)) {
    console.error(`Classeur introuvable : ${CLASSEUR}`);
    process.exit(1);
  }
  // LE CLASSEUR DOIT ÊTRE FERMÉ, ET ON LE VÉRIFIE AVANT TOUT LE RESTE.
  //
  // Excel garde le fichier ouvert en écriture exclusive. Sans cette garde, le
  // script extrayait la production, calculait les cours, prenait une
  // sauvegarde — puis échouait sur l'écriture en laissant une sauvegarde
  // orpheline et une trace d'erreur illisible. Mieux vaut une phrase.
  if (!VERIFIER) {
    try {
      fs.closeSync(fs.openSync(CLASSEUR, "r+"));
    } catch (e) {
      if (e.code === "EBUSY" || e.code === "EPERM" || e.code === "EACCES") {
        console.error(
          [
            `Le classeur est ouvert dans Excel : ${path.basename(CLASSEUR)}`,
            "",
            "Fermez-le, puis relancez. Rien n'a été modifié.",
            "",
            "Pour voir ce que la mise à jour changerait sans rien écrire :",
            `    node scripts/maj-cours-xlsx.mjs ${DATE} --verifier`,
          ].join(String.fromCharCode(10)),
        );
        process.exit(1);
      }
      throw e;
    }
  }
  const prod = await extraireProduction();
  const dossierSika = path.join(prod, "data", "historique_sika");

  // ── Les cours actions, depuis l'historique SIKA ──────────────────────
  const fichiersSika = fs.readdirSync(dossierSika);
  const coursAction = new Map();
  for (const f of fichiersSika) {
    const sym = f.split(".")[0].toUpperCase();
    const lignes = lireCsv(path.join(dossierSika, f));
    const jour = lignes.find((l) => l.date_iso === DATE);
    if (jour && jour.close !== "") coursAction.set(sym, Number(jour.close));
  }
  console.log(`Historique SIKA : ${fichiersSika.length} titres, ${coursAction.size} cotés le ${DATE}`);

  // ── Les cours obligataires, par code BRVM ────────────────────────────
  const referentiel = lireCsv(path.join(prod, "data", "obligations-cotees.csv"));
  const isinDuCode = new Map(referentiel.map((o) => [o.code.toUpperCase(), o.isin]));
  const prix = lireCsv(path.join(prod, "data", "obligations-cotees-prix.csv"));
  const coursObligation = new Map();
  for (const p of prix) {
    if (p.date !== DATE) continue;
    const c = Number(p.cleanPrice);
    if (Number.isFinite(c) && c > 0) coursObligation.set(p.isin, c);
  }
  console.log(`Prix obligataires : ${coursObligation.size} cotations au ${DATE}`);

  // ── Le classeur ──────────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(fs.readFileSync(CLASSEUR));
  let sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
  let ss = await zip.file("xl/sharedStrings.xml").async("string");
  const cellulesAvant = lireCellules(sheet);
  const chaines = lireChaines(ss);
  // L'INSTANTANÉ D'AVANT SE PREND AVANT, ET NE BOUGE PLUS.
  //
  // Réécrire une entrée de chaînes sur place modifie aussi ce que lisait la
  // cellule AVANT : sans copie figée, la comparaison finale trouvait « 3 400 »
  // des deux côtés et ne voyait bouger que les obligations. Elle annonçait
  // huit cellules modifiées là où quarante-sept l'étaient — un contrôle qui
  // ment est pire que pas de contrôle.
  const chainesAvant = [...chaines];

  // Combien de cellules lisent chaque entrée de chaînes ? Une entrée à
  // lecteur unique se réécrit ; une entrée partagée se duplique.
  const lecteurs = new Map();
  for (const c of cellulesAvant.values()) {
    if (c.type !== "s" || c.v == null) continue;
    const n = Number(c.v);
    lecteurs.set(n, (lecteurs.get(n) ?? 0) + 1);
  }

  const nouvelles = [];
  const changements = [];
  const absents = [];

  /** Remplace la valeur d'une cellule texte, en préservant ses attributs. */
  const ecrireTexte = (ref, texte) => {
    const c = cellulesAvant.get(ref);
    if (!c) return false;
    let index;
    if (c.type === "s" && c.v != null && (lecteurs.get(Number(c.v)) ?? 0) === 1) {
      index = Number(c.v);
      chaines[index] = echapper(texte);
      // L'entrée n'a qu'un lecteur : on la réécrit sur place, le classeur
      // ne grossit pas d'une ligne à chaque mise à jour.
      ss = ss.replace(
        new RegExp(`(<si>(?:(?!</si>)[\\s\\S])*?</si>)`, "g"),
        (() => {
          let i = -1;
          return (m) => (++i === index ? `<si><t>${echapper(texte)}</t></si>` : m);
        })(),
      );
    } else {
      index = chaines.length + nouvelles.length;
      nouvelles.push(echapper(texte));
    }
    const neuf = `<c r="${ref}"${c.attrs.replace(/\s*t="[^"]*"/, "")} t="s"><v>${index}</v></c>`;
    sheet = sheet.replace(c.brut, neuf);
    return true;
  };

  /** Remplace la valeur d'une cellule numérique. */
  const ecrireNombre = (ref, valeur) => {
    const c = cellulesAvant.get(ref);
    if (!c) return false;
    const neuf = `<c r="${ref}"${c.attrs.replace(/\s*t="[^"]*"/, "")}><v>${valeur}</v></c>`;
    sheet = sheet.replace(c.brut, neuf);
    return true;
  };

  const lire = (ref) => {
    const c = cellulesAvant.get(ref);
    if (!c) return null;
    if (c.type === "s" && c.v != null) return chaines[Number(c.v)];
    return c.v;
  };

  // ── Les actions ──────────────────────────────────────────────────────
  for (let r = ACTIONS.premiere; r <= ACTIONS.derniere; r++) {
    const sym = (lire(`A${r}`) ?? "").trim().toUpperCase();
    if (!sym) continue;
    const ref = `${ACTIONS.colonne}${r}`;
    const avant = lire(ref);
    const cours = coursAction.get(sym);
    if (cours == null) {
      absents.push(`${sym} (ligne ${r})${SUSPENDUES.has(sym) ? " — suspendue de cotation" : ""}`);
      continue;
    }
    const texte = fr(cours);
    if (texte === avant) continue;
    if (!VERIFIER) ecrireTexte(ref, texte);
    changements.push({ ref, titre: sym, avant, apres: texte });
  }

  // ── Les obligations ──────────────────────────────────────────────────
  for (let r = OBLIGATIONS.premiere; r <= OBLIGATIONS.derniere; r++) {
    const code = (lire(`A${r}`) ?? "").trim().toUpperCase();
    if (!code) continue;
    const ref = `${OBLIGATIONS.colonne}${r}`;
    const avant = lire(ref);
    const isin = isinDuCode.get(code);
    const cours = isin ? coursObligation.get(isin) : null;
    if (cours == null) {
      absents.push(`${code} (ligne ${r})${isin ? "" : " — absent du référentiel coté"}`);
      continue;
    }
    if (String(cours) === String(avant)) continue;
    if (!VERIFIER) ecrireNombre(ref, cours);
    changements.push({ ref, titre: code, avant, apres: String(cours) });
  }

  const actionsModifiees = changements.filter((c) => c.ref.startsWith(ACTIONS.colonne)).length;
  const obligationsModifiees = changements.length - actionsModifiees;
  console.log(
    `
${changements.length} cours modifiés — ${actionsModifiees} action(s), ` +
      `${obligationsModifiees} obligation(s) · ${absents.length} ligne(s) sans cotation au ${DATE}`,
  );
  console.log("");
  console.log("  quelques mouvements :");
  for (const c of changements.slice(0, 8)) {
    console.log(
      `    ${c.ref.padEnd(6)} ${c.titre.padEnd(12)} ${String(c.avant).padStart(10)} → ${String(c.apres).padStart(10)}`,
    );
  }
  if (changements.length > 8) console.log(`    … et ${changements.length - 8} autres`);
  // UNE LIGNE SANS COURS N'EST PAS UNE ANOMALIE EN SOI : la plupart sont des
  // emprunts arrivés à échéance, sortis du référentiel coté. On les compte, et
  // on ne les détaille qu'à la demande — avec --detail.
  const sansReferentiel = absents.filter((a) => a.includes("référentiel")).length;
  const suspendues = absents.filter((a) => a.includes("suspendue")).length;
  console.log(
    `
  dont ${sansReferentiel} sortie(s) du référentiel coté (emprunts échus), ` +
      `${suspendues} suspendue(s) de cotation, ` +
      `${absents.length - sansReferentiel - suspendues} cotée(s) sans prix ce jour-là.`,
  );
  if (process.argv.includes("--detail")) for (const a of absents) console.log("    sans cours :", a);

  if (VERIFIER) {
    console.log("\nRien n'a été écrit.");
    return;
  }

  // ── Les chaînes ajoutées, s'il y en a ────────────────────────────────
  if (nouvelles.length > 0) {
    const total = chaines.length + nouvelles.length;
    ss = ss
      .replace(/count="\d+"/, `count="${total}"`)
      .replace(/uniqueCount="\d+"/, `uniqueCount="${total}"`)
      .replace("</sst>", nouvelles.map((t) => `<si><t>${t}</t></si>`).join("") + "</sst>");
    console.log(`${nouvelles.length} entrée(s) de chaînes ajoutée(s) (entrées partagées).`);
  }

  // ── Sauvegarde, puis écriture ────────────────────────────────────────
  const sauvegarde = path.join(RACINE, `Mise à jour cours.sauvegarde-${DATE}.xlsx`);
  fs.copyFileSync(CLASSEUR, sauvegarde);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  zip.file("xl/sharedStrings.xml", ss);
  const sortie = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(CLASSEUR, sortie);
  console.log(`\nSauvegarde : ${path.basename(sauvegarde)}`);
  console.log(`Écrit : ${path.basename(CLASSEUR)}`);

  // ── La preuve : relire, et comparer TOUTES les cellules ──────────────
  //
  // Un classeur réécrit se vérifie cellule à cellule, pas à l'œil. Seules
  // les colonnes de cours ont le droit d'avoir bougé.
  const relu = await JSZip.loadAsync(fs.readFileSync(CLASSEUR));
  const sheet2 = await relu.file("xl/worksheets/sheet1.xml").async("string");
  const ss2 = await relu.file("xl/sharedStrings.xml").async("string");
  const cellules2 = lireCellules(sheet2);
  const chaines2 = lireChaines(ss2);
  const valeur = (cells, strs, ref) => {
    const c = cells.get(ref);
    if (!c) return null;
    if (c.type === "s" && c.v != null) return strs[Number(c.v)];
    return c.v;
  };
  const attendus = new Set(changements.map((c) => c.ref));
  const refs = new Set([...cellulesAvant.keys(), ...cellules2.keys()]);
  let bouges = 0;
  let inattendus = 0;
  for (const ref of refs) {
    const a = valeur(cellulesAvant, chainesAvant, ref);
    const b = valeur(cellules2, chaines2, ref);
    if (a === b) continue;
    bouges++;
    if (!attendus.has(ref)) {
      inattendus++;
      if (inattendus <= 10) console.error(`  CELLULE INATTENDUE ${ref} : « ${a} » → « ${b} »`);
    }
  }
  const manquants = [...attendus].filter(
    (ref) => valeur(cellules2, chaines2, ref) !== changements.find((c) => c.ref === ref).apres,
  );
  console.log(
    `\nContrôle : ${bouges} cellule(s) modifiée(s) sur ${refs.size}, ` +
      `${inattendus} hors des colonnes de cours, ${manquants.length} non appliquée(s).`,
  );
  for (const m of manquants.slice(0, 10)) console.error(`  NON APPLIQUÉ : ${m}`);
  if (inattendus > 0 || manquants.length > 0) {
    console.error("\nLe classeur ne se recoupe pas. La sauvegarde est à côté.");
    process.exit(1);
  }
  const parties = Object.keys(relu.files).filter((n) => !relu.files[n].dir).length;
  const partiesAvant = Object.keys(zip.files).filter((n) => !zip.files[n].dir).length;
  console.log(
    `Pièces de l'archive : ${parties} (contre ${partiesAvant}) — requêtes, tableaux et volets préservés.`,
  );
  console.log("\nTOUT SE RECOUPE");
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
