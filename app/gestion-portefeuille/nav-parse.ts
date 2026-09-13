// Parsing serveur d'un fichier Excel d'historique VL / actif net.
// Colonnes attendues : Date | Valeur Liquidative | Nombre de Parts | Actif Net | Actif Brut
import ExcelJS from "exceljs";
import type { NavPoint } from "./nav-types";

const COL = { date: 1, vl: 2, parts: 3, actifNet: 4, actifBrut: 5 } as const;

function cellRaw(cell: ExcelJS.Cell): unknown {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) v = o.result;
    else if ("text" in o) v = o.text;
    else if ("richText" in o && Array.isArray(o.richText))
      v = (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    else v = null;
  }
  return v;
}

// Date -> ISO YYYY-MM-DD. Gère Date (exceljs), ISO, et français JJ/MM/AAAA.
function cellDate(cell: ExcelJS.Cell): string {
  const v = cellRaw(cell);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = (v == null ? "" : String(v)).trim();
  if (!s) return "";
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cellRaw(cell);
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || s === "-" || s === "NC") return null;
  s = s.replace(/[\s  ]/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function parseNavBuffer(buffer: Buffer): Promise<NavPoint[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  let ws: ExcelJS.Worksheet | undefined;
  wb.eachSheet((sheet) => {
    if (!ws && sheet.rowCount > 1) ws = sheet;
  });
  if (!ws) return [];

  // Dédoublonnage par date : la dernière occurrence l'emporte.
  const byDate = new Map<string, NavPoint>();
  ws.eachRow((row) => {
    const date = cellDate(row.getCell(COL.date));
    if (!date) return; // ligne d'en-tête ou vide
    byDate.set(date, {
      date,
      vl: cellNum(row.getCell(COL.vl)),
      parts: cellNum(row.getCell(COL.parts)),
      actifNet: cellNum(row.getCell(COL.actifNet)),
      actifBrut: cellNum(row.getCell(COL.actifBrut)),
    });
  });

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
