// === APROMAC : loader CSV + stats prix caoutchouc CI ===
//
// Source : data/apromac.csv, alimenté par scripts/scrape_apromac.py
// depuis https://www.eagrici.com/ (page d'accueil).
//
// Une série unique mensuelle en FCFA/kg : prix APROMAC (référence officielle
// pour les producteurs ivoiriens). Historique depuis janvier 2018.
//
// Mémoisé au niveau module : un parse par processus serveur.

import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");
const CSV_PATH = join(DATA_DIR, "apromac.csv");

export type ApromacPoint = {
  /** ISO YYYY-MM-01 (premier du mois, convention pour données mensuelles) */
  date: string;
  /** Libellé long, ex "Mai 2026" */
  moisLabel: string;
  /** Prix APROMAC mensuel, FCFA/kg */
  prixApromac: number;
  /** true = APROMAC officiel publié ; false = tendance du mois en cours (non confirmé) */
  confirme: boolean;
};

type RawRow = {
  date_iso: string;
  mois_label: string;
  prix_apromac: string;
  confirme?: string;
  // tolérance migration : ancienne colonne
  prix_marche?: string;
};

let _cache: ApromacPoint[] | null = null;
let _cacheMtime = 0;

export function loadApromacHistory(): ApromacPoint[] {
  if (!existsSync(CSV_PATH)) {
    _cache = [];
    _cacheMtime = 0;
    return _cache;
  }
  // Invalide le cache si le CSV a été modifié (utile en dev quand le scraper
  // tourne sans redémarrer le serveur).
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

  const points: ApromacPoint[] = [];
  for (const r of result.data) {
    const date = (r.date_iso ?? "").trim();
    if (!date) continue;
    const raw = (r.prix_apromac ?? r.prix_marche ?? "").trim();
    const value = Number(raw);
    if (!isFinite(value) || value <= 0) continue;
    const confirmeRaw = (r.confirme ?? "1").trim();
    const confirme = !["0", "false", "False", "no", "No"].includes(confirmeRaw);
    points.push({
      date,
      moisLabel: (r.mois_label ?? "").trim(),
      prixApromac: value,
      confirme,
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  _cache = points;
  return points;
}

export type ApromacStats = {
  /** Dernier APROMAC officiel confirmé */
  latest: ApromacPoint;
  /** Point confirmé précédent (M-1) si disponible */
  previous: ApromacPoint | null;
  /** APROMAC de Décembre de l'année précédente (référence YTD) si disponible */
  decPrevYear: ApromacPoint | null;
  /** Variation % vs point précédent confirmé */
  changeVsPrevPct: number | null;
  /** Variation % vs Décembre N-1 */
  changeVsDecPrevYearPct: number | null;
  /** Mois en cours non confirmé si disponible (tendance) */
  tendance: ApromacPoint | null;
};

/** Récupère le dernier APROMAC officiel confirmé et ses variations clés.
 *  Sépare la tendance du mois courant (non confirmé) si elle existe. */
export function computeApromacStats(): ApromacStats | null {
  const hist = loadApromacHistory();
  if (hist.length === 0) return null;

  const confirmed = hist.filter((p) => p.confirme);
  if (confirmed.length === 0) return null;

  const latest = confirmed[confirmed.length - 1];
  const previous = confirmed.length > 1 ? confirmed[confirmed.length - 2] : null;

  const latestYear = Number(latest.date.slice(0, 4));
  const decPrevYearIso = `${latestYear - 1}-12-01`;
  const decPrevYear = confirmed.find((p) => p.date === decPrevYearIso) ?? null;

  const changeVsPrevPct =
    previous && previous.prixApromac > 0
      ? ((latest.prixApromac - previous.prixApromac) / previous.prixApromac) * 100
      : null;

  const changeVsDecPrevYearPct =
    decPrevYear && decPrevYear.prixApromac > 0
      ? ((latest.prixApromac - decPrevYear.prixApromac) /
          decPrevYear.prixApromac) *
        100
      : null;

  // Tendance : éventuel point non confirmé postérieur au dernier confirmé
  const tendance =
    hist.find((p) => !p.confirme && p.date > latest.date) ?? null;

  return {
    latest,
    previous,
    decPrevYear,
    changeVsPrevPct,
    changeVsDecPrevYearPct,
    tendance,
  };
}
