// Parsing serveur d'une balance générale (grand livre OPCVM, plan SYSCOA).
// Colonnes : Compte(3) | Libellé(5) | Solde début Débit(9)/Crédit(11) |
// Soldes cumulés (fin) Débit(22)/Crédit(23).
import ExcelJS from "exceljs";
import type { PortfolioSection } from "./portfolio-types";

export type ClassMap = Record<PortfolioSection, number>;

export type BalanceResult = {
  allocation: ClassMap; // valeur de marché par classe (coût + écarts)
  cost: ClassMap; // capital investi par classe (comptes de position)
  gain: ClassMap; // résultat de la période par classe (comptes fournis)
  performance: ClassMap; // % = gain / coût
  total: number; // total valeur de marché
};

// finD/finC = soldes cumulés (valeur/coût de fin) ; mvtD/mvtC = mouvements de
// la période (utilisés pour le résultat/gain par classe).
const COL = { compte: 3, mvtD: 18, mvtC: 20, finD: 22, finC: 23 } as const;

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
function num(cell: ExcelJS.Cell): number {
  const v = cellRaw(cell);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Classe d'un compte de POSITION (valeur de marché / coût).
function positionClass(c: string): PortfolioSection | null {
  if (c.startsWith("111") || c.startsWith("121") || c.startsWith("389")) return "tresorerie";
  if (c.startsWith("141")) return "dat";
  if (c.startsWith("213")) return "action";
  if (c.startsWith("214")) return "opcvm";
  if (c.startsWith("211") || c.startsWith("240")) return "obligation";
  if (c.startsWith("217")) {
    if (c.startsWith("217300")) return "action";
    if (c.startsWith("217500")) return "opcvm";
    return "obligation"; // 217400 + intérêts courus
  }
  return null;
}

// Capital investi (coût) par classe : comptes de position hors écarts (217).
function costClass(c: string): PortfolioSection | null {
  if (c.startsWith("111") || c.startsWith("121") || c.startsWith("389")) return "tresorerie";
  if (c.startsWith("141")) return "dat";
  if (c.startsWith("213")) return "action";
  if (c.startsWith("214")) return "opcvm";
  if (c.startsWith("211") || c.startsWith("240")) return "obligation";
  return null;
}

// Comptes de RÉSULTAT par classe (fournis par l'utilisateur) avec le SENS du
// solde à retenir pour le gain :
//   "DC" = débit − crédit (écarts d'estimation : gain latent au débit)
//   "CD" = crédit − débit (produits & +/- values : gain au crédit)
type GainAccount = { code: string; dir: "DC" | "CD" };
const GAIN_ACCOUNTS: Record<PortfolioSection, GainAccount[]> = {
  action: [
    { code: "217300", dir: "DC" }, // écart d'estimation actions
    { code: "551803", dir: "CD" }, // plus-values actions
    { code: "551804", dir: "CD" }, // moins-values actions
    { code: "710100", dir: "CD" }, // revenus/dividendes actions
  ],
  obligation: [
    { code: "217400", dir: "DC" }, // écart d'estimation obligations
    { code: "551801", dir: "CD" }, // plus-values obligations
    { code: "551802", dir: "CD" }, // moins-values obligations
    { code: "710200", dir: "CD" }, // revenus obligations
  ],
  opcvm: [{ code: "217500", dir: "DC" }], // écart d'estimation OPCVM
  dat: [{ code: "727120", dir: "CD" }], // intérêts courus DAT
  tresorerie: [],
  autre: [],
};

function emptyMap(): ClassMap {
  return { action: 0, obligation: 0, opcvm: 0, dat: 0, tresorerie: 0, autre: 0 };
}

export async function parseBalanceBuffer(buffer: Buffer): Promise<BalanceResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  let ws: ExcelJS.Worksheet | undefined;
  wb.eachSheet((sheet) => {
    if (!ws && sheet.rowCount > 1) ws = sheet;
  });

  const allocation = emptyMap();
  const cost = emptyMap();
  const gain = emptyMap();

  if (ws) {
    ws.eachRow((row) => {
      const raw = cellRaw(row.getCell(COL.compte));
      const c = raw == null ? "" : String(raw).trim();
      if (!/^\d/.test(c)) return;

      const netSolde = num(row.getCell(COL.finD)) - num(row.getCell(COL.finC));
      const netMvt = num(row.getCell(COL.mvtD)) - num(row.getCell(COL.mvtC));

      // Valeur de marché par classe (poids) — soldes cumulés de fin.
      const pc = positionClass(c);
      if (pc) allocation[pc] += netSolde;

      // Capital investi (coût) par classe — soldes cumulés de fin.
      const cc = costClass(c);
      if (cc) cost[cc] += netSolde;

      // Résultat de la PÉRIODE par classe (mouvements des comptes fournis),
      // avec le sens (DC / CD) propre à chaque compte.
      for (const section of Object.keys(GAIN_ACCOUNTS) as PortfolioSection[]) {
        for (const acc of GAIN_ACCOUNTS[section]) {
          if (c.startsWith(acc.code)) {
            gain[section] += acc.dir === "DC" ? netMvt : -netMvt;
            break;
          }
        }
      }
    });
  }

  const performance = emptyMap();
  for (const s of Object.keys(performance) as PortfolioSection[]) {
    performance[s] = cost[s] > 0 ? (gain[s] / cost[s]) * 100 : 0;
  }

  const total =
    allocation.action +
    allocation.obligation +
    allocation.opcvm +
    allocation.dat +
    allocation.tresorerie +
    allocation.autre;

  return { allocation, cost, gain, performance, total };
}
