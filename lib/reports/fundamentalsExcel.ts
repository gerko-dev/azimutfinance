import "server-only";

import ExcelJS from "exceljs";
import type { FundTitre, StatementLine, StatementLevel } from "@/lib/fundamentals";

const FMT_INT = "#,##0";

export type FundamentalsExcelData = {
  ticker: string;
  titre: FundTitre;
  exercices: number[]; // ordre croissant
  sections: { title: string; lines: StatementLine[] }[];
};

// Styles par niveau hiérarchique (thème clair, cohérent avec cotationExcel).
const LEVEL_STYLE: Record<
  StatementLevel,
  { fill?: string; fontArgb: string; bold: boolean; indent: number }
> = {
  "total-general": { fill: "FFDBEAFE", fontArgb: "FF1E3A8A", bold: true, indent: 0 },
  total: { fill: "FFE2E8F0", fontArgb: "FF0F172A", bold: true, indent: 0 },
  "sous-total": { fill: "FFF1F5F9", fontArgb: "FF334155", bold: true, indent: 1 },
  solde: { fill: "FFEFF6FF", fontArgb: "FF1E40AF", bold: true, indent: 0 },
  produit: { fontArgb: "FF166534", bold: false, indent: 2 },
  charge: { fontArgb: "FF991B1B", bold: false, indent: 2 },
  detail: { fontArgb: "FF334155", bold: false, indent: 2 },
};

function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

/** Écrit une section (un état financier) sur sa propre feuille. */
function writeSection(
  ws: ExcelJS.Worksheet,
  title: string,
  lines: StatementLine[],
  exercices: number[],
) {
  const nCols = 1 + exercices.length;

  // Titre + unité
  ws.mergeCells(1, 1, 1, nCols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
  ws.mergeCells(2, 1, 2, nCols);
  const sub = ws.getCell(2, 1);
  sub.value = "Montants en FCFA";
  sub.font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  // En-tête de colonnes
  const headRow = ws.getRow(4);
  headRow.getCell(1).value = "Poste";
  headerStyle(headRow.getCell(1));
  headRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  exercices.forEach((y, i) => {
    const c = headRow.getCell(2 + i);
    c.value = y;
    headerStyle(c);
  });

  // Largeurs
  ws.getColumn(1).width = 52;
  for (let i = 0; i < exercices.length; i++) ws.getColumn(2 + i).width = 18;

  // Lignes
  let r = 5;
  for (const l of lines) {
    const st = LEVEL_STYLE[l.niveau];
    const row = ws.getRow(r);
    const labelCell = row.getCell(1);
    labelCell.value = l.libelle;
    labelCell.font = { bold: st.bold, color: { argb: st.fontArgb } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: st.indent };
    if (st.fill) {
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: st.fill } };
    }
    exercices.forEach((y, i) => {
      const c = row.getCell(2 + i);
      c.value = l.values[y] ?? 0;
      c.numFmt = FMT_INT;
      c.font = { bold: st.bold, color: { argb: st.fontArgb } };
      if (st.fill) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: st.fill } };
      }
    });
    r++;
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
}

/** Construit le classeur Excel des états financiers et renvoie un Buffer. */
export async function buildFundamentalsExcel(
  data: FundamentalsExcelData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance";
  wb.created = new Date();

  // Feuille de garde
  const cover = wb.addWorksheet("Émetteur", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  cover.columns = [{ width: 30 }, { width: 40 }];
  cover.mergeCells("A1:B1");
  cover.getCell("A1").value = `États financiers — ${data.titre.raisonSociale || data.ticker}`;
  cover.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  const meta: [string, string | number][] = [
    ["Ticker", data.ticker],
    ["Secteur", data.titre.secteur || "—"],
    ["Format des états", data.titre.formatEtats],
    ["Devise", data.titre.devise || "XOF"],
    [
      "Exercices",
      data.exercices.length > 0
        ? `${data.exercices[0]} – ${data.exercices[data.exercices.length - 1]}`
        : "—",
    ],
  ];
  let cr = 3;
  for (const [k, v] of meta) {
    cover.getCell(cr, 1).value = k;
    cover.getCell(cr, 1).font = { bold: true, color: { argb: "FF334155" } };
    cover.getCell(cr, 2).value = v;
    cr++;
  }

  // Une feuille par état financier
  for (const section of data.sections) {
    if (section.lines.length === 0) continue;
    const ws = wb.addWorksheet(section.title.slice(0, 31));
    writeSection(ws, section.title, section.lines, data.exercices);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
