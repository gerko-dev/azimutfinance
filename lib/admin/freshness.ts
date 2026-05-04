import "server-only";

import { promises as fs, readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import {
  DATA_FILES_CATALOG,
  type DataFileCadence,
  type DataFileMeta,
} from "./dataFilesCatalog";

const DATA_DIR = join(process.cwd(), "data");

export type FreshnessStatus = "fresh" | "stale" | "outdated" | "ref" | "unknown";

export type FileFreshness = {
  category: string;
  cadence: DataFileCadence;
  description: string;
  rowCount: number | null;
  /** ISO YYYY-MM-DD ; null si non détecté */
  lastDataDate: string | null;
  /** Nombre de jours entre la dernière donnée et aujourd'hui */
  lagDays: number | null;
  status: FreshnessStatus;
  /** Message d'erreur ou note (catalog absent, parse impossible, etc.) */
  message: string | null;
};

const FALLBACK_META: DataFileMeta = {
  category: "Autres",
  cadence: "ref",
  dateColumn: null,
  delimiter: ",",
  description: "(non catalogué — ajoute-le à dataFilesCatalog.ts)",
};

const THRESHOLDS_DAYS: Record<DataFileCadence, { fresh: number; stale: number }> = {
  "daily-business": { fresh: 5, stale: 14 },
  daily: { fresh: 3, stale: 7 },
  monthly: { fresh: 45, stale: 90 },
  yearly: { fresh: 425, stale: 730 },
  "event-driven": { fresh: 30, stale: 90 },
  ref: { fresh: 0, stale: 0 },
};

const FR_MONTHS: Record<string, number> = {
  janv: 1, jan: 1,
  fevr: 2, févr: 2, fev: 2, fév: 2,
  mars: 3, mar: 3,
  avr: 4, avri: 4,
  mai: 5,
  juin: 6,
  juil: 7, jui: 7,
  aout: 8, août: 8,
  sept: 9, sep: 9,
  oct: 10,
  nov: 11,
  dec: 12, déc: 12,
};

/**
 * Parse une cellule de date dans les formats utilisés à travers data/ :
 *  - ISO YYYY-MM-DD
 *  - FR DD/MM/YYYY ou DD-MM-YYYY
 *  - FR mois abrégé "déc-19" / "déc.-2019" (utilisé par bddtaux.csv)
 *  - Année seule "1970" (macro.csv et exercice DB_*)
 * Retourne null si non parsable.
 */
export function parseDateCell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/^["']|["']$/g, "");
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // "déc-19", "déc.-2019", "fevr-2024"
  m = s.match(/^([A-Za-zéèêûôàùÉÈÊÛÔÀÙ]+)\.?[-_/](\d{2,4})$/);
  if (m) {
    const monKey = m[1].toLowerCase();
    const mon = FR_MONTHS[monKey] ?? FR_MONTHS[monKey.substring(0, 4)] ?? FR_MONTHS[monKey.substring(0, 3)];
    if (mon) {
      let y = parseInt(m[2], 10);
      if (y < 100) y += y < 50 ? 2000 : 1900;
      return `${y}-${String(mon).padStart(2, "0")}-01`;
    }
  }

  m = s.match(/^(\d{4})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1900 && y <= 2100) return `${y}-12-31`;
  }

  return null;
}

type AnalyzeResult = { lastDataDate: string | null; rowCount: number };

const _analyzeCache = new Map<
  string,
  { mtimeMs: number; size: number; result: AnalyzeResult }
>();

/**
 * Lit le CSV et trouve la dernière date dans la colonne déclarée par le catalogue.
 * Mémoïse par (filename, mtime, size) pour éviter de re-parser un gros CSV à
 * chaque chargement de la page admin. Le cache vit pendant la durée du process Node.
 */
async function analyzeCsv(filename: string, meta: DataFileMeta): Promise<AnalyzeResult> {
  if (!meta.dateColumn) return { lastDataDate: null, rowCount: 0 };

  const filePath = join(DATA_DIR, filename);
  const stat = await fs.stat(filePath);

  const cached = _analyzeCache.get(filename);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.result;
  }

  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    delimiter: meta.delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });

  let maxIso: string | null = null;
  for (const row of parsed.data) {
    const raw = row[meta.dateColumn];
    const iso = parseDateCell(raw);
    if (iso && (maxIso === null || iso > maxIso)) maxIso = iso;
  }

  const result: AnalyzeResult = { lastDataDate: maxIso, rowCount: parsed.data.length };
  _analyzeCache.set(filename, { mtimeMs: stat.mtimeMs, size: stat.size, result });
  return result;
}

function computeStatus(
  lastDate: string | null,
  cadence: DataFileCadence,
  now: Date,
): { status: FreshnessStatus; lagDays: number | null } {
  if (cadence === "ref") return { status: "ref", lagDays: null };
  if (!lastDate) return { status: "unknown", lagDays: null };
  const lastMs = Date.parse(`${lastDate}T00:00:00Z`);
  if (isNaN(lastMs)) return { status: "unknown", lagDays: null };
  const lagDays = Math.floor((now.getTime() - lastMs) / (24 * 3600 * 1000));
  const t = THRESHOLDS_DAYS[cadence];
  if (lagDays <= t.fresh) return { status: "fresh", lagDays };
  if (lagDays <= t.stale) return { status: "stale", lagDays };
  return { status: "outdated", lagDays };
}

export async function analyzeFreshness(filename: string): Promise<FileFreshness> {
  const meta = DATA_FILES_CATALOG[filename] ?? FALLBACK_META;
  const isCatalogued = filename in DATA_FILES_CATALOG;

  if (!isCatalogued) {
    return {
      category: meta.category,
      cadence: meta.cadence,
      description: meta.description,
      rowCount: null,
      lastDataDate: null,
      lagDays: null,
      status: "unknown",
      message: "Fichier non catalogué — sa fraîcheur n'est pas suivie.",
    };
  }

  try {
    const { lastDataDate, rowCount } = await analyzeCsv(filename, meta);
    const { status, lagDays } = computeStatus(lastDataDate, meta.cadence, new Date());
    return {
      category: meta.category,
      cadence: meta.cadence,
      description: meta.description,
      rowCount,
      lastDataDate,
      lagDays,
      status,
      message: null,
    };
  } catch (e) {
    return {
      category: meta.category,
      cadence: meta.cadence,
      description: meta.description,
      rowCount: null,
      lastDataDate: null,
      lagDays: null,
      status: "unknown",
      message: `Erreur d'analyse : ${(e as Error).message}`,
    };
  }
}
