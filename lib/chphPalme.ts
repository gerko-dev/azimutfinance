// === CHPH Palmier à Huile : loader CSV + stats prix officiels CI ===
//
// Source : data/chph-palme.csv, alimenté manuellement après revue des PDFs
// téléchargés par scripts/scrape_chph_palme.py depuis conseilheveapalmier.ci.
//
// Deux séries mensuelles en FCFA / tonne, fixées par le Conseil Hévéa-Palmier
// à Huile (autorité de régulation de la filière palmier à huile en Côte d'Ivoire) :
//   - huileBrute : Huile de palme brute (prix de transformation)
//   - regimePalme : Régime de palme bord-champ (prix d'achat planteurs)
//
// Mémoisé via mtime du CSV : invalidation auto en dev quand le fichier change.

import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");
const CSV_PATH = join(DATA_DIR, "chph-palme.csv");

export type ChphPalmePoint = {
  /** ISO YYYY-MM-01 (premier du mois) */
  date: string;
  /** Libellé long, ex "Mai 2026" */
  moisLabel: string;
  /** Prix de l'huile de palme brute, FCFA / tonne */
  huileBrute: number;
  /** Prix du régime de palme bord-champ, FCFA / tonne */
  regimePalme: number;
  /** Période source de la fixation, ex "Mai-Juin-Juillet 2026" */
  periodeSource: string;
};

type RawRow = {
  date_iso: string;
  mois_label: string;
  huile_palme_brute_fcfa_tonne: string;
  regime_palme_bord_champ_fcfa_tonne: string;
  periode_source?: string;
};

let _cache: ChphPalmePoint[] | null = null;
let _cacheMtime = 0;

export function loadChphPalmeHistory(): ChphPalmePoint[] {
  if (!existsSync(CSV_PATH)) {
    _cache = [];
    _cacheMtime = 0;
    return _cache;
  }
  const mtime = statSync(CSV_PATH).mtimeMs;
  if (_cache !== null && mtime === _cacheMtime) return _cache;
  _cacheMtime = mtime;

  let content = readFileSync(CSV_PATH, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const points: ChphPalmePoint[] = [];
  for (const r of result.data) {
    const date = (r.date_iso ?? "").trim();
    if (!date) continue;
    const huile = Number((r.huile_palme_brute_fcfa_tonne ?? "").trim());
    const regime = Number((r.regime_palme_bord_champ_fcfa_tonne ?? "").trim());
    if (!isFinite(huile) || huile <= 0) continue;
    if (!isFinite(regime) || regime <= 0) continue;
    points.push({
      date,
      moisLabel: (r.mois_label ?? "").trim(),
      huileBrute: huile,
      regimePalme: regime,
      periodeSource: (r.periode_source ?? "").trim(),
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  _cache = points;
  return points;
}

export type ChphPalmeStats = {
  /** Dernier point disponible */
  latest: ChphPalmePoint;
  /** Point précédent (M-1) si disponible */
  previous: ChphPalmePoint | null;
  /** Décembre de l'année précédente (référence YTD) si disponible */
  decPrevYear: ChphPalmePoint | null;
  /** Variation % huile brute vs mois précédent */
  changeHuileVsPrevPct: number | null;
  /** Variation % huile brute vs Décembre N-1 */
  changeHuileVsDecPrevYearPct: number | null;
  /** Variation % régime palme vs mois précédent */
  changeRegimeVsPrevPct: number | null;
  /** Variation % régime palme vs Décembre N-1 */
  changeRegimeVsDecPrevYearPct: number | null;
};

function pctChange(curr: number, ref: number | undefined): number | null {
  if (ref === undefined || ref <= 0) return null;
  return ((curr - ref) / ref) * 100;
}

export function computeChphPalmeStats(): ChphPalmeStats | null {
  const hist = loadChphPalmeHistory();
  if (hist.length === 0) return null;

  const latest = hist[hist.length - 1];
  const previous = hist.length > 1 ? hist[hist.length - 2] : null;

  const latestYear = Number(latest.date.slice(0, 4));
  const decPrevYearIso = `${latestYear - 1}-12-01`;
  const decPrevYear = hist.find((p) => p.date === decPrevYearIso) ?? null;

  return {
    latest,
    previous,
    decPrevYear,
    changeHuileVsPrevPct: pctChange(latest.huileBrute, previous?.huileBrute),
    changeHuileVsDecPrevYearPct: pctChange(latest.huileBrute, decPrevYear?.huileBrute),
    changeRegimeVsPrevPct: pctChange(latest.regimePalme, previous?.regimePalme),
    changeRegimeVsDecPrevYearPct: pctChange(latest.regimePalme, decPrevYear?.regimePalme),
  };
}
