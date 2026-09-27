import "server-only";

import ExcelJS from "exceljs";

import type { ExportEngagements } from "@/app/gestion-portefeuille/engagements-export";

// === Le classeur d'export des engagements ===
//
// DEUX FEUILLES, ET LA PREMIÈRE NE CONTIENT QUE LE TABLEAU. Pas de titre, pas
// de ligne de total, pas de mise en forme décorative : on sélectionne le bloc,
// on le copie, on le colle sous la dernière ligne de « Autres opérations ».
// Tout ce qu'on ajouterait au-dessus obligerait à viser la bonne cellule.
//
// LES EN-TÊTES SONT CEUX DE LA FEUILLE, mot pour mot. Ils ne servent pas à
// être collés — le tableau a déjà les siens — mais à vérifier d'un coup d'œil
// que les colonnes tombent en face.

/** Colonnes B à K de la feuille « Autres opérations », dans l'ordre. */
const COLONNES: { titre: string; largeur: number }[] = [
  { titre: "Fonds", largeur: 30 },
  { titre: "Date", largeur: 12 },
  { titre: "Type d'opération", largeur: 22 },
  { titre: "Description", largeur: 24 },
  { titre: "Détail ou action", largeur: 42 },
  { titre: "Montant", largeur: 16 },
  { titre: "Banque de règlement", largeur: 22 },
  { titre: "Date prév. flux de trésorerie", largeur: 16 },
  { titre: "Statut virement", largeur: 14 },
  { titre: "Date effective", largeur: 14 },
];

const FMT_DATE = "dd/mm/yyyy";
const FMT_MONTANT = "#,##0";

function enTete(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

/** Une date ISO en vraie date Excel — sinon elle se colle en texte et les
 *  filtres chronologiques du classeur ne la voient plus. */
const date = (iso: string): Date | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;

export async function buildEngagementsExcel(
  donnees: ExportEngagements,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance";
  wb.created = new Date();

  // ── Feuille 1 : le tableau, et rien d'autre ──────────────────────────
  const ws = wb.addWorksheet("Autres opérations");
  ws.columns = COLONNES.map((c) => ({ width: c.largeur }));

  const tete = ws.addRow(COLONNES.map((c) => c.titre));
  tete.eachCell(enTete);
  tete.height = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const l of donnees.lignes) {
    const row = ws.addRow([
      l.fonds,
      date(l.date),
      l.typeOperation,
      l.description,
      l.detail,
      l.montant,
      l.banque,
      date(l.datePrevue),
      l.statut,
      date(l.dateEffective),
    ]);
    row.getCell(2).numFmt = FMT_DATE;
    row.getCell(6).numFmt = FMT_MONTANT;
    row.getCell(8).numFmt = FMT_DATE;
    row.getCell(10).numFmt = FMT_DATE;
    row.font = { size: 10 };
  }

  if (donnees.lignes.length === 0) {
    const vide = ws.addRow(["Aucun engagement sur ce périmètre."]);
    vide.font = { size: 10, italic: true, color: { argb: "FF64748B" } };
  }

  // ── Feuille 2 : ce qu'il a fallu traduire ────────────────────────────
  //
  // ELLE N'EST PAS DÉCORATIVE. Le nom de banque est la seule colonne que le
  // site ne peut pas produire à coup sûr : le classeur écrit « BOA CI » là où
  // le référentiel écrit « BOA - Côte d'Ivoire · Côte d'Ivoire ». La règle de
  // traduction tombe juste la plupart du temps, pas toujours — et un libellé
  // faux collé dans le tableau en sort silencieusement les lignes. On expose
  // donc chaque correspondance retenue, et d'où elle vient.
  const wc = wb.addWorksheet("Correspondances");
  wc.columns = [{ width: 46 }, { width: 24 }, { width: 14 }];
  const teteC = wc.addRow(["Établissement (site)", "Libellé retenu (classeur)", "Origine"]);
  teteC.eachCell(enTete);
  for (const c of donnees.correspondances) {
    const row = wc.addRow([c.etablissement, c.libelle, c.origine]);
    row.font = { size: 10 };
    if (c.origine === "déduite") {
      row.getCell(3).font = { size: 10, color: { argb: "FF92400E" } };
    }
  }

  wc.addRow([]);
  for (const note of [
    "« Déduite » : le libellé est calculé depuis la fiche du compte (établissement + pays).",
    "Vérifiez-le. Pour le figer, renseignez « Libellé classeur » sur la fiche du compte,",
    "au référentiel : il l'emporte alors sur toute déduction.",
    "",
    "La date des frais de gestion est celle de l'arrêté : le site en calcule le montant,",
    "pas le jour du prélèvement, qui relève d'une décision.",
    "",
    `Périmètre : ${donnees.perimetre} — arrêté au ${donnees.dateArrete}.`,
  ]) {
    const row = wc.addRow([note]);
    row.font = { size: 9, color: { argb: "FF64748B" } };
  }

  return wb.xlsx.writeBuffer();
}
