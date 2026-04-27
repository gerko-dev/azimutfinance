// Loader pour data/bddtaux.csv (BCEAO - Bulletin mensuel des statistiques)
// Format long : section, indicator, country, period, value, unit, source
// Délimiteur virgule (différent de la convention `;` du projet).

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import type {
  NormalizedPeriod,
  PeriodKind,
  SeriesPoint,
  TauxRow,
  TauxSection,
  TauxSeries,
  TauxUnit,
} from "./tauxTypes";

const DATA_DIR = join(process.cwd(), "data");
const FILE = "bddtaux.csv";

type RawRow = {
  section: string;
  indicator: string;
  country: string;
  period: string;
  value: string;
  unit: string;
  source: string;
};

let _cache: TauxRow[] | null = null;

const MONTH_FR: Record<string, number> = {
  janv: 1, jan: 1,
  fév: 2, fev: 2, "févr": 2,
  mars: 3, mar: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8, aout: 8,
  sept: 9, sep: 9, "sept.": 9,
  oct: 10,
  nov: 11,
  déc: 12, dec: 12, "déc.": 12,
};

const MONTH_LABEL_SHORT = [
  "", "Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function makeMonthly(year4: number, month: number): NormalizedPeriod {
  const iso = `${year4}-${pad2(month)}`;
  return {
    raw: "",
    iso,
    label: `${MONTH_LABEL_SHORT[month]} ${year4}`,
    sortKey: Date.UTC(year4, month - 1, 1),
    kind: "monthly",
  };
}

function makeYearly(year4: number, kind: PeriodKind = "yearly", labelPrefix = ""): NormalizedPeriod {
  return {
    raw: "",
    iso: `${year4}`,
    label: labelPrefix ? `${labelPrefix} ${year4}` : `${year4}`,
    sortKey: Date.UTC(year4, 11, 31),
    kind,
  };
}

function makeSnapshot(y: number, m: number, d: number, label: string): NormalizedPeriod {
  return {
    raw: "",
    iso: `${y}-${pad2(m)}-${pad2(d)}`,
    label,
    sortKey: Date.UTC(y, m - 1, d),
    kind: "snapshot",
  };
}

/**
 * Normalise une période CSV en {iso, label, sortKey, kind}.
 *
 * Formats acceptés :
 * - "déc-19" → 2019-12 (mensuel, année 2 chiffres)
 * - "juin-25", "juil-25", "août-25", "déc-25", "janv-26", "fév-26"
 * - "25/09/2026" → bug Excel : interprété comme sept 2025 (le préfixe "25" est
 *   en réalité l'année 2025 mal convertie). Vrai pour MM ∈ {09,10,11}, YYYY=2026.
 * - "2022", "2023" → annuel
 * - "Moy. 2023" → annuel (moyenne)
 * - "dec_2025", "jan_2026", "fev_2026", "fin_dec_2025" → snake_case
 * - "16_01_15_02_2026" → fenêtre constitution réserves (16 janv → 15 fév 2026)
 * - "fev_2026_vs_fev_2025" → variation YoY (point unique aligné sur fév 2026)
 */
function normalizePeriod(raw: string): NormalizedPeriod {
  const r = raw.trim();

  // 1. Mensuel français court : "mois-YY"
  const mFr = r.match(/^([A-Za-zéèêà]+\.?)-(\d{2})$/);
  if (mFr) {
    const monthKey = mFr[1].toLowerCase().replace(/\.$/, "");
    const month = MONTH_FR[monthKey];
    if (month) {
      const year = 2000 + parseInt(mFr[2], 10);
      return { ...makeMonthly(year, month), raw: r };
    }
  }

  // 2. Bug Excel "25/09/2026" → 2025-09 (année 2 chiffres "25" mal convertie)
  const mDate = r.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mDate) {
    const dd = parseInt(mDate[1], 10);
    const mm = parseInt(mDate[2], 10);
    const yyyy = parseInt(mDate[3], 10);
    if (dd === 25 && yyyy === 2026 && mm >= 1 && mm <= 12) {
      // Excel a transformé "sept-25" en "25/09/2026" → on rétablit 2025-09
      return { ...makeMonthly(2025, mm), raw: r };
    }
    // Sinon : vraie date snapshot
    return {
      ...makeSnapshot(yyyy, mm, dd, `${pad2(dd)}/${pad2(mm)}/${yyyy}`),
      raw: r,
    };
  }

  // 3. Snake_case "dec_2025", "jan_2026", "fev_2026", "fin_dec_2025"
  const mSnake = r.match(/^(?:fin_)?([a-z]{3,4})_(\d{4})$/i);
  if (mSnake) {
    const monthKey = mSnake[1].toLowerCase();
    const month = MONTH_FR[monthKey];
    const year = parseInt(mSnake[2], 10);
    if (month) {
      const period = makeMonthly(year, month);
      const isFin = r.toLowerCase().startsWith("fin_");
      return {
        ...period,
        raw: r,
        kind: isFin ? "snapshot" : "monthly",
        label: isFin ? `Fin ${MONTH_LABEL_SHORT[month].toLowerCase()} ${year}` : period.label,
      };
    }
  }

  // 4. Année seule "2022"
  const mYear = r.match(/^(\d{4})$/);
  if (mYear) {
    return { ...makeYearly(parseInt(mYear[1], 10)), raw: r };
  }

  // 5. "Moy. 2023"
  const mMoy = r.match(/^Moy\.\s*(\d{4})$/);
  if (mMoy) {
    return { ...makeYearly(parseInt(mMoy[1], 10), "yearly", "Moy."), raw: r };
  }

  // 6. Fenêtre constitution réserves "16_01_15_02_2026"
  const mWin = r.match(/^(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{4})$/);
  if (mWin) {
    const d2 = parseInt(mWin[3], 10);
    const m2 = parseInt(mWin[4], 10);
    const y = parseInt(mWin[5], 10);
    return {
      ...makeSnapshot(y, m2, d2, `${pad2(parseInt(mWin[1], 10))}/${pad2(parseInt(mWin[2], 10))} → ${pad2(d2)}/${pad2(m2)}/${y}`),
      raw: r,
      kind: "window",
    };
  }

  // 7. YoY variation "fev_2026_vs_fev_2025"
  const mYoy = r.match(/^([a-z]{3,4})_(\d{4})_vs_([a-z]{3,4})_(\d{4})$/i);
  if (mYoy) {
    const month = MONTH_FR[mYoy[1].toLowerCase()];
    const year = parseInt(mYoy[2], 10);
    if (month) {
      return {
        ...makeMonthly(year, month),
        raw: r,
        kind: "yoy",
        label: `YoY ${MONTH_LABEL_SHORT[month]} ${year} / ${mYoy[3]} ${mYoy[4]}`,
      };
    }
  }

  // Fallback : on garde tel quel avec sortKey 0 → restera trié à part
  return {
    raw: r,
    iso: r,
    label: r,
    sortKey: 0,
    kind: "snapshot",
  };
}

function parseValue(v: string): number {
  const s = (v ?? "").toString().trim();
  if (!s || s === "NC" || s === "-") return NaN;
  // Format CSV : point décimal standard, parfois trailing dot ("5226.")
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

function loadRaw(): TauxRow[] {
  if (_cache !== null) return _cache;

  const filePath = join(DATA_DIR, FILE);
  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const result = Papa.parse<RawRow>(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });

  const rows: TauxRow[] = [];
  for (const r of result.data) {
    const section = r.section?.trim() as TauxSection;
    const indicator = r.indicator?.trim();
    const country = r.country?.trim();
    const periodRaw = r.period?.trim();
    const value = parseValue(r.value);
    const unit = (r.unit?.trim() || "pct") as TauxUnit;
    const source = r.source?.trim() || "";

    if (!section || !indicator || !country || !periodRaw) continue;
    if (!isFinite(value)) continue;

    rows.push({
      section,
      indicator,
      country,
      period: normalizePeriod(periodRaw),
      value,
      unit,
      source,
    });
  }

  _cache = rows;
  return rows;
}

// ===========================================================================
// API publique
// ===========================================================================

export function loadTauxRaw(): TauxRow[] {
  return loadRaw();
}

/** Retourne toutes les lignes d'une section donnée */
export function getSection(section: TauxSection): TauxRow[] {
  return loadRaw().filter((r) => r.section === section);
}

/** Construit une série temporelle triée pour un (section, indicateur, pays) */
export function getSeries(
  section: TauxSection,
  indicator: string,
  country?: string
): TauxSeries | null {
  const rows = loadRaw().filter(
    (r) =>
      r.section === section &&
      r.indicator === indicator &&
      (country ? r.country === country : true)
  );
  if (rows.length === 0) return null;

  const points: SeriesPoint[] = rows
    .map((r) => ({
      iso: r.period.iso,
      label: r.period.label,
      sortKey: r.period.sortKey,
      value: r.value,
    }))
    .sort((a, b) => a.sortKey - b.sortKey);

  const c = country ?? rows[0].country;
  return {
    id: `${section}|${indicator}|${c}`,
    section,
    indicator,
    country: c,
    unit: rows[0].unit,
    points,
  };
}

/** Récupère le dernier point d'une série (par sortKey max) */
export function getLatest(
  section: TauxSection,
  indicator: string,
  country?: string
): SeriesPoint | null {
  const s = getSeries(section, indicator, country);
  if (!s || s.points.length === 0) return null;
  return s.points[s.points.length - 1];
}

/** Variation entre les 2 derniers points (en valeur absolue, même unité) */
export function getDelta(
  section: TauxSection,
  indicator: string,
  country?: string
): { last: number; prev: number; delta: number } | null {
  const s = getSeries(section, indicator, country);
  if (!s || s.points.length < 2) return null;
  const last = s.points[s.points.length - 1].value;
  const prev = s.points[s.points.length - 2].value;
  return { last, prev, delta: last - prev };
}

/** Snapshot par pays pour un indicateur (utilisé pour les heatmaps) */
export function getSnapshot(
  section: TauxSection,
  indicator: string,
  isoPeriod?: string
): { country: string; value: number; period: string }[] {
  const rows = loadRaw().filter(
    (r) =>
      r.section === section &&
      r.indicator === indicator &&
      (isoPeriod ? r.period.iso === isoPeriod : true)
  );

  if (!isoPeriod) {
    // Prend la période la plus récente disponible
    const maxKey = Math.max(0, ...rows.map((r) => r.period.sortKey));
    return rows
      .filter((r) => r.period.sortKey === maxKey)
      .map((r) => ({ country: r.country, value: r.value, period: r.period.label }));
  }
  return rows.map((r) => ({ country: r.country, value: r.value, period: r.period.label }));
}

/** Liste des indicateurs disponibles dans une section */
export function listIndicators(section: TauxSection): string[] {
  const set = new Set<string>();
  for (const r of loadRaw()) if (r.section === section) set.add(r.indicator);
  return Array.from(set);
}

/** Liste des pays disponibles pour un (section, indicateur) */
export function listCountries(section: TauxSection, indicator: string): string[] {
  const set = new Set<string>();
  for (const r of loadRaw()) {
    if (r.section === section && r.indicator === indicator) set.add(r.country);
  }
  return Array.from(set);
}

/** Catalogue complet des séries disponibles, pour le sélecteur du Studio */
export type SeriesDescriptor = {
  id: string;
  section: TauxSection;
  indicator: string;
  country: string;
  unit: TauxUnit;
  pointCount: number;
};

export function listAllSeriesDescriptors(): SeriesDescriptor[] {
  const seen = new Map<string, SeriesDescriptor>();
  for (const r of loadRaw()) {
    const id = `${r.section}|${r.indicator}|${r.country}`;
    const existing = seen.get(id);
    if (existing) {
      existing.pointCount += 1;
    } else {
      seen.set(id, {
        id,
        section: r.section,
        indicator: r.indicator,
        country: r.country,
        unit: r.unit,
        pointCount: 1,
      });
    }
  }
  return Array.from(seen.values());
}

/** Date du dernier point disponible pour la section donnée (label humain) */
export function getSectionLatestLabel(section: TauxSection): string {
  const rows = loadRaw().filter((r) => r.section === section);
  if (rows.length === 0) return "—";
  const max = rows.reduce((m, r) => (r.period.sortKey > m.period.sortKey ? r : m));
  return max.period.label;
}

/** Source officielle (déduite du fichier — toutes les lignes en ont la même valeur) */
export function getSourceLabel(): string {
  const rows = loadRaw();
  return rows[0]?.source || "BCEAO – Bulletin mensuel des statistiques";
}

/**
 * Détecte les changements du taux directeur BCEAO (taux pension = "Taux minimum
 * appels offres") entre points successifs. Sert pour les annotations du Studio.
 */
export function detectBceaoRateChanges(): {
  iso: string;
  label: string;
  sortKey: number;
  fromBp: number;
  toBp: number;
  deltaBp: number;
}[] {
  const s = getSeries("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
  if (!s) return [];
  const out: ReturnType<typeof detectBceaoRateChanges> = [];
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1].value;
    const b = s.points[i].value;
    const delta = Math.round((b - a) * 10000); // bp
    if (delta !== 0) {
      out.push({
        iso: s.points[i].iso,
        label: s.points[i].label,
        sortKey: s.points[i].sortKey,
        fromBp: Math.round(a * 10000),
        toBp: Math.round(b * 10000),
        deltaBp: delta,
      });
    }
  }
  return out;
}
