// Parsing serveur d'un fichier d'inventaire Excel (.xlsx) vers des lignes de
// portefeuille brutes, regroupées par section. Utilise exceljs (dépendance déjà
// présente). Module serveur : importé uniquement par les server actions.
import ExcelJS from "exceljs";
import type { PortfolioSection } from "./portfolio-types";

// Colonnes attendues (ordre du modèle NSIA) :
// Code/Symbole | Titre | Quantité | PRU | Prix de revient | Cours | Intérêts courus | Valorisation
const COL = {
  code: 1,
  label: 2,
  quantity: 3,
  pru: 4,
  cost: 5,
  price: 6,
  accrued: 7,
  valuation: 8,
} as const;

// Une ligne brute avant matching.
export type RawPosition = {
  section: PortfolioSection;
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  cost: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
};

// Extrait la valeur scalaire d'une cellule exceljs (nombre, formule, texte riche).
function cellRaw(cell: ExcelJS.Cell): unknown {
  let v: unknown = cell.value;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) v = o.result;
    else if ("text" in o) v = o.text;
    else if ("richText" in o && Array.isArray(o.richText))
      v = (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    else v = null;
  }
  return v;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cellRaw(cell);
  return v === null || v === undefined ? "" : String(v).trim();
}

// Convertit une cellule en nombre. Gère les nombres natifs et les chaînes
// françaises ("12 345,67", "1,23E+11") ou standard. "" / null => null.
function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cellRaw(cell);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || s === "-" || s === "NC") return null;
  // Espaces (y compris insécables) = séparateurs de milliers.
  s = s.replace(/[\s  ]/g, "");
  // Format français : virgule décimale.
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Déduit une section à partir d'une ligne "en-tête de section" (code vide,
// libellé du type "Action" / "Obligation" / "OPCVM" / "Banque").
function sectionFromHeader(label: string): PortfolioSection | null {
  const l = label.toLowerCase();
  if (l.includes("obligation")) return "obligation";
  if (l.includes("opcvm")) return "opcvm";
  if (l.includes("action")) return "action";
  if (l.includes("banque") || l.includes("trésor") || l.includes("tresor") || l.includes("liquid"))
    return "tresorerie";
  return null;
}

export type ParseResult = {
  positions: RawPosition[];
  totalValuation: number;
};

// Parse le buffer d'un .xlsx en lignes de portefeuille.
export async function parseInventoryBuffer(buffer: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // Cast : @types/node expose Buffer<ArrayBufferLike>, exceljs attend son type
  // Buffer historique — même objet à l'exécution.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  // On prend la première feuille contenant des données.
  let ws: ExcelJS.Worksheet | undefined;
  wb.eachSheet((sheet) => {
    if (!ws && sheet.rowCount > 1) ws = sheet;
  });
  if (!ws) return { positions: [], totalValuation: 0 };

  const positions: RawPosition[] = [];
  let section: PortfolioSection = "autre";
  let total = 0;

  ws.eachRow((row) => {
    const code = cellText(row.getCell(COL.code));
    const label = cellText(row.getCell(COL.label));

    // En-tête de colonnes : "Code/Symbole".
    if (code.toLowerCase().replace(/\s/g, "").startsWith("code/") || code.toLowerCase() === "code") {
      return;
    }

    // Ligne sans code : en-tête de section ou sous-total.
    if (!code) {
      if (label) {
        const s = sectionFromHeader(label);
        if (s) section = s;
      }
      return; // on ignore les sous-totaux (recalculés)
    }

    const valuation = cellNum(row.getCell(COL.valuation));
    positions.push({
      section,
      rawCode: code,
      rawLabel: label,
      quantity: cellNum(row.getCell(COL.quantity)),
      pru: cellNum(row.getCell(COL.pru)),
      cost: cellNum(row.getCell(COL.cost)),
      price: cellNum(row.getCell(COL.price)),
      accruedInterest: cellNum(row.getCell(COL.accrued)),
      valuation,
    });
    if (valuation != null) total += valuation;
  });

  return { positions, totalValuation: total };
}
