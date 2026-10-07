import "server-only";

import ExcelJS from "exceljs";

import type { ExportOat } from "@/app/gestion-portefeuille/oat-export";

// === Le classeur des OAT cessibles ========================================
//
// CINQ COLONNES, DANS L'ORDRE DU TABLEAU QUE LA CONTREPARTIE ENVOIE : Titre,
// Quantité, Facial, Échéance, Prix de cession. Rien de plus dans la première
// feuille — ce qu'on y ajouterait, il faudrait l'effacer avant de transmettre.
//
// CONSOLAS 9 PARTOUT. Une police à chasse fixe aligne les ISIN et les
// quantités colonne par colonne : on repère une faute de frappe dans
// « GW0000001416 » à l'œil, ce qu'une police proportionnelle interdit.
//
// LES NOMBRES SONT DES NOMBRES, et les dates des dates : la contrepartie va
// recalculer dessus. Du texte l'obligerait à retaper la colonne.
//
// UNE DEUXIÈME FEUILLE MONTRE LE CALCUL. Le prix d'un réméré n'est pas une
// cotation : il se déduit du rendement convenu, et le gérant doit pouvoir le
// refaire de tête avant de l'envoyer. Les composantes sont donc posées
// séparément — pair, intérêts courus, amortissement, décote — et la colonne
// « Rendement » rend la cible : c'est le contrôle que le calcul tombe juste.

const POLICE = { name: "Consolas", size: 9 } as const;
const FMT_QTE = "#,##0";
const FMT_PRIX = "#,##0.00";
const FMT_PCT = "0.00%";
const FMT_PCT3 = "0.000%";
const FMT_DATE = "dd/mm/yyyy";

export async function buildOatExcel(donnees: ExportOat): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance — gestion de portefeuille";
  wb.created = new Date();

  // ── Feuille 1 : le tableau, et rien d'autre ─────────────────────────────
  const ws = wb.addWorksheet("OAT cessibles");
  ws.columns = [
    { key: "titre", width: 18 },
    { key: "quantite", width: 12 },
    { key: "facial", width: 10 },
    { key: "echeance", width: 13 },
    { key: "prix", width: 16 },
  ];

  const entete = ws.addRow(["Titre", "Quantité", "Facial", "Échéance", "Prix de cession"]);
  entete.eachCell((c) => {
    c.font = { ...POLICE, bold: true };
    c.alignment = { horizontal: "center" };
    c.border = { bottom: { style: "thin" } };
  });

  for (const l of donnees.lignes) {
    const r = ws.addRow([
      l.titre,
      l.quantite,
      l.facial,
      l.echeance ? new Date(`${l.echeance}T00:00:00Z`) : null,
      Number(l.prixCession.toFixed(2)),
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(2).numFmt = FMT_QTE;
    r.getCell(3).numFmt = FMT_PCT;
    r.getCell(4).numFmt = FMT_DATE;
    r.getCell(5).numFmt = FMT_PRIX;
    // LE LIBELLÉ EN COMMENTAIRE, PAS EN COLONNE : la contrepartie attend cinq
    // colonnes, et le titre se lit par son ISIN. Mais un ISIN seul ne se
    // relit pas, et l'info-bulle le dit sans encombrer le tableau.
    r.getCell(1).note =
      `${l.libelle}\n` +
      `Pair ${l.pair.toLocaleString("fr-FR")} · courus ${l.interetsCourus.toFixed(2)}` +
      (l.amortissement > 0 ? ` · amortissement ${l.amortissement.toFixed(2)}` : "") +
      `\nDécote ${(l.decote * 100).toFixed(2)} % · rendement ${(l.rendement * 100).toFixed(2)} %` +
      (l.reserve ? `\n${l.reserve}` : "");
    if (l.reserve) r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
  }

  // Le total, détaché d'une ligne : il se lit, il ne se colle pas.
  if (donnees.lignes.length > 0) {
    ws.addRow([]);
    const total = ws.addRow([
      `${donnees.lignes.length} OAT`,
      donnees.lignes.reduce((s, l) => s + l.quantite, 0),
      null,
      null,
      Number(
        donnees.lignes.reduce((s, l) => s + l.quantite * l.prixCession, 0).toFixed(2),
      ),
    ]);
    total.eachCell((c) => (c.font = { ...POLICE, bold: true }));
    total.getCell(2).numFmt = FMT_QTE;
    total.getCell(5).numFmt = FMT_PRIX;
  }

  ws.addRow([]);
  for (const texte of [
    `${donnees.fondsNom} — inventaire du ${donnees.dateInventaire ?? "?"} — quantités nettes des titres prêtés, pris en réméré et déjà engagés à la vente`,
    `Prix calculé pour un réméré de ${donnees.dureeMois} mois (du ${donnees.dateRef} au ${donnees.dateTerme}), rachat au pair, rendement contrepartie ${(donnees.rendementCible * 100).toFixed(2)} % sur la période`,
  ]) {
    const r = ws.addRow([texte]);
    r.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Feuille 2 : d'où sort le prix ───────────────────────────────────────
  const calc = wb.addWorksheet("Calcul");
  calc.columns = [
    { key: "titre", width: 18 },
    { key: "pair", width: 12 },
    { key: "facial", width: 10 },
    { key: "mois", width: 8 },
    { key: "courus", width: 14 },
    { key: "amort", width: 14 },
    { key: "prix", width: 16 },
    { key: "decote", width: 11 },
    { key: "rdt", width: 12 },
  ];
  const eCalc = calc.addRow([
    "Titre",
    "Pair",
    "Facial",
    "Mois",
    "Intérêts courus",
    "Amortissement",
    "Prix de cession",
    "Décote",
    "Rendement",
  ]);
  eCalc.eachCell((c) => {
    c.font = { ...POLICE, bold: true };
    c.alignment = { horizontal: "center" };
    c.border = { bottom: { style: "thin" } };
  });
  for (const l of [...donnees.lignes, ...donnees.ecartees]) {
    const r = calc.addRow([
      l.titre,
      l.pair,
      l.facial,
      donnees.dureeMois,
      Number(l.interetsCourus.toFixed(2)),
      Number(l.amortissement.toFixed(2)),
      Number(l.prixCession.toFixed(2)),
      l.decote,
      l.rendement,
    ]);
    r.eachCell((c) => (c.font = { ...POLICE }));
    r.getCell(2).numFmt = FMT_QTE;
    r.getCell(3).numFmt = FMT_PCT;
    r.getCell(5).numFmt = FMT_PRIX;
    r.getCell(6).numFmt = FMT_PRIX;
    r.getCell(7).numFmt = FMT_PRIX;
    r.getCell(8).numFmt = FMT_PCT;
    r.getCell(9).numFmt = FMT_PCT3;
    if (l.reserve) {
      r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
      r.getCell(1).note = l.reserve;
    }
  }
  calc.addRow([]);
  for (const texte of [
    "Prix = (pair + intérêts courus + amortissement) ÷ (1 + rendement)",
    `Rendement contrepartie = (pair − prix + intérêts courus + amortissement) ÷ prix = ${(donnees.rendementCible * 100).toFixed(2)} % sur ${donnees.dureeMois} mois`,
    "Intérêts courus = pair × facial × mois ÷ 12. Amortissement : tranches de capital du référentiel tombant avant le terme, remboursement final exclu.",
    "Décote NÉGATIVE = surcote : quand le titre rapporte plus que le rendement convenu sur la période — un facial de 6,5 % sur six mois en rapporte 3,25 % —, la contrepartie paie au-dessus du pair, puisqu'elle garde le coupon et rend le titre à 10 000.",
  ]) {
    const r = calc.addRow([texte]);
    r.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };
  }
  calc.views = [{ state: "frozen", ySplit: 1 }];

  // ── Feuille 3 : ce qui n'a pas suivi ────────────────────────────────────
  //
  // Une OAT détenue mais incessible doit SE VOIR : sans cette feuille, le
  // gérant croit l'avoir oubliée, et la cherche dans l'inventaire.
  if (donnees.ecartees.length > 0 || donnees.avertissements.length > 0) {
    const ctrl = wb.addWorksheet("Écartées");
    ctrl.columns = [
      { key: "titre", width: 18 },
      { key: "detenue", width: 12 },
      { key: "pretee", width: 12 },
      { key: "remeree", width: 14 },
      { key: "engagee", width: 14 },
      { key: "mouvements", width: 14 },
      { key: "dispo", width: 12 },
    ];
    const e = ctrl.addRow([
      "Titre",
      "Inventaire",
      "Prêtés",
      "Pris en réméré",
      "Déjà en vente",
      "Mouvements",
      "Cessible",
    ]);
    e.eachCell((c) => {
      c.font = { ...POLICE, bold: true };
      c.border = { bottom: { style: "thin" } };
    });
    for (const l of donnees.ecartees) {
      const r = ctrl.addRow([
        l.titre,
        l.dispo.detenue,
        l.dispo.pretee,
        l.dispo.remeree,
        l.dispo.engagee,
        l.dispo.mouvements,
        l.dispo.disponible,
      ]);
      r.eachCell((c) => {
        c.font = { ...POLICE };
        if (typeof c.value === "number") c.numFmt = FMT_QTE;
      });
    }
    if (donnees.avertissements.length > 0) {
      ctrl.addRow([]);
      for (const a of donnees.avertissements) {
        const r = ctrl.addRow([a]);
        r.getCell(1).font = { ...POLICE, color: { argb: "FFB45309" } };
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
