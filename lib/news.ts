// === ACTUALITES PAR TITRE — LOADER SERVERSIDE ===
// Source de vérité : data/actualites.csv (delimiter `;`).
// Édition manuelle via Excel/Sheets puis commit git.

import { readFileSync, statSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import { NEWS_TYPES } from "./newsTypes";
import type { NewsItem, NewsType } from "./newsTypes";

export {
  NEWS_TYPES,
  NEWS_TYPE_LABELS,
} from "./newsTypes";
export type { NewsItem, NewsType } from "./newsTypes";

const DATA_DIR = join(process.cwd(), "data");

type RawRow = {
  ticker: string;
  date: string;
  type: string;
  titre: string;
  source: string;
  url: string;
  resume: string;
};

let _cache: NewsItem[] | null = null;
let _cacheMtimeMs = 0;

/**
 * Lit le fichier en UTF-8 strict ; en cas d'échec (caractères non décodables),
 * retombe sur Windows-1252 / Latin-1 — Excel sur Windows tend à exporter en
 * cp1252 et corrompt les accents si on lit naïvement en UTF-8.
 */
function readCsvSafely(filePath: string): string {
  const buf = readFileSync(filePath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function normalizeDate(s: string): string {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  // Accept DD/MM/YYYY or DD-MM-YYYY
  const fr = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(trimmed);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function parseAllNews(): NewsItem[] {
  const filePath = join(DATA_DIR, "actualites.csv");
  // Invalide le cache si le fichier a été modifié — utile en dev quand on
  // édite le CSV sans redémarrer le serveur.
  const mtimeMs = statSync(filePath).mtimeMs;
  if (_cache && mtimeMs === _cacheMtimeMs) return _cache;

  let content = readCsvSafely(filePath);
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });

  const validTypes = new Set<string>(NEWS_TYPES);
  _cache = result.data
    .filter((r) => r.ticker?.trim() && r.titre?.trim() && r.date?.trim())
    .map((r) => {
      const rawType = (r.type || "").trim().toLowerCase();
      const type: NewsType = validTypes.has(rawType)
        ? (rawType as NewsType)
        : "communique";
      return {
        ticker: r.ticker.trim().toUpperCase(),
        date: normalizeDate(r.date),
        type,
        titre: r.titre.trim(),
        source: (r.source || "").trim(),
        url: (r.url || "").trim(),
        resume: (r.resume || "").trim(),
      };
    })
    // Plus récent en premier
    .sort((a, b) => b.date.localeCompare(a.date));

  _cacheMtimeMs = mtimeMs;
  return _cache;
}

/** Toutes les actualités d'un ticker, triées par date desc. */
export function loadNewsByTicker(ticker: string): NewsItem[] {
  const t = ticker.toUpperCase();
  return parseAllNews().filter((n) => n.ticker === t);
}

/** Toutes les actualités du marché, triées par date desc. Pratique pour une
 *  vue agrégée future. */
export function loadAllNews(): NewsItem[] {
  return parseAllNews();
}
