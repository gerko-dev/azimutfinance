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

const POLICE = { name: "Consolas", size: 9 } as const;
const FMT_QTE = "#,##0";
const FMT_PRIX = "#,##0.00";
const FMT_PCT = "0.00%";
const FMT_DATE = "dd/mm/yyyy";

const SOURCES: Record<ExportOat["lignes"][number]["sourcePrix"], string> = {
  theorique: "courbe souveraine du jour",
  cote: "dernière cotation échangée",
  inventaire: "valorisation d'inventaire",
  nominal: "nominal, faute de mieux",
};

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
    r.getCell(1).note = `${l.libelle}\nPrix : ${SOURCES[l.sourcePrix]}${
      l.ytm !== null ? ` — ${(l.ytm * 100).toFixed(2)} %` : ""
    }\nNominal : ${l.nominal.toLocaleString("fr-FR")}`;
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
  const pied = ws.addRow([
    `${donnees.fondsNom} — inventaire du ${donnees.dateInventaire ?? "?"} — quantités nettes des titres prêtés, pris en réméré et déjà engagés à la vente`,
  ]);
  pied.getCell(1).font = { ...POLICE, italic: true, color: { argb: "FF64748B" } };

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Feuille 2 : ce qui n'a pas suivi ────────────────────────────────────
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
