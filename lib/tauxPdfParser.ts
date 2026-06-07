// Parses data/marche-monetaire/Bul_stat.pdf — source unique des séries de taux
// BCEAO & UEMOA. Appelé par lib/tauxLoader.ts quand le PDF est plus récent que
// le parse mémoïsé.

import { readFileSync } from "fs";
import { join } from "path";
import type { TauxSection, TauxUnit } from "./tauxTypes";

// Dynamic ESM import for the Node-legacy build of pdfjs-dist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsModule: any = null;
async function getPdfJs() {
  if (!pdfjsModule) {
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsModule;
}

export type ParsedRow = {
  section: TauxSection;
  indicator: string;
  country: string;
  period: string; // raw label, will be normalized by tauxLoader
  value: number;
  unit: TauxUnit;
  source: string;
};

export type ParsedBulletin = {
  rows: ParsedRow[];
  /** Bulletin month as detected on page 1 (e.g. "Mars 2026") */
  bulletinLabel: string;
  /** Source label string baked into every row's source field */
  sourceLabel: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PdfItem = { str: string; x: number; y: number };
type PdfLine = { y: number; items: PdfItem[] };
type PdfPage = { page: number; width: number; height: number; lines: PdfLine[] };

function parseFrNum(s: string | undefined): number {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/ /g, " ");
  if (!t || t === "-" || t === "nd" || t === "NC" || t === "Err :509") return NaN;
  if (!/^-?[\d \s,.]+$/.test(t)) return NaN;
  const cleaned = t.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function snapToColumn(x: number, anchors: number[], tol = 25): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(x - anchors[i]);
    if (d < bestDist && d <= tol) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function cellsByColumn(items: PdfItem[], anchors: number[], tol = 25): string[] {
  const out = anchors.map(() => "");
  for (const it of items) {
    const col = snapToColumn(it.x, anchors, tol);
    if (col >= 0) out[col] = out[col] ? out[col] + " " + it.str.trim() : it.str.trim();
  }
  return out.map((s) => s.trim());
}

async function loadPdfPages(pdfPath: string): Promise<PdfPage[]> {
  const pdfjsLib = await getPdfJs();
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    const items: PdfItem[] = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        str: it.str as string,
        x: Math.round(it.transform[4] * 10) / 10,
        y: Math.round((viewport.height - it.transform[5]) * 10) / 10,
      }))
      .filter((it: PdfItem) => it.str && it.str.trim());

    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: PdfLine[] = [];
    let current: PdfLine | null = null;
    for (const it of items) {
      if (!current || Math.abs(it.y - current.y) > 3) {
        current = { y: it.y, items: [it] };
        lines.push(current);
      } else {
        current.items.push(it);
      }
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    pages.push({ page: p, width: viewport.width, height: viewport.height, lines });
  }
  return pages;
}

function makeRow(
  section: TauxSection,
  indicator: string,
  country: string,
  period: string,
  value: number,
  unit: TauxUnit,
  source: string,
): ParsedRow {
  return { section, indicator, country, period, value, unit, source };
}

// ---------------------------------------------------------------------------
// Bulletin month detection (page 1, e.g. "Mars 2026")
// ---------------------------------------------------------------------------

function detectBulletinLabel(pages: PdfPage[]): string {
  const p1 = pages[0];
  if (!p1) return "";
  for (const line of p1.lines) {
    const full = line.items.map((i) => i.str).join(" ").trim();
    const m = full.match(/^(Janv(?:ier)?|Févr(?:ier)?|Fev(?:rier)?|Mars|Avr(?:il)?|Mai|Juin|Juil(?:let)?|Août|Aout|Sept(?:embre)?|Oct(?:obre)?|Nov(?:embre)?|Déc(?:embre)?|Dec(?:embre)?)\s+(\d{4})$/i);
    if (m) {
      const month = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return `${month} ${m[2]}`;
    }
  }
  return "";
}

// Convert "Mars 2026" → ISO-ish "mars-26" key used downstream
function bulletinMonthKey(label: string): string {
  const m = label.match(/^([A-Za-zéèêàâ]+)\s+(\d{4})$/);
  if (!m) return "";
  const monthMap: Record<string, string> = {
    janv: "janv", janvier: "janv",
    fev: "fév", fevr: "fév", fevrier: "fév", "fév": "fév", "févr": "fév", "février": "fév",
    mars: "mars",
    avr: "avr", avril: "avr",
    mai: "mai",
    juin: "juin",
    juil: "juil", juillet: "juil",
    aout: "août", "août": "août",
    sept: "sept", septembre: "sept",
    oct: "oct", octobre: "oct",
    nov: "nov", novembre: "nov",
    dec: "déc", decembre: "déc", "déc": "déc", "décembre": "déc",
  };
  const key = monthMap[m[1].toLowerCase()];
  if (!key) return "";
  return `${key}-${m[2].slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Section 1 + 2 : Taux directeurs BCEAO + Marché monétaire
// ---------------------------------------------------------------------------

function parse_1_2(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page37 = pages[36];
  if (!page37) return [];
  const rows: ParsedRow[] = [];

  const changeAnchors = [93, 145, 210, 263, 315, 380];
  const changes: { iso: string; marginal: number; min: number }[] = [];
  const monthMap: Record<string, number> = { janv: 1, "fév": 2, fevr: 2, "févr": 2, fev: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, "août": 8, aout: 8, sept: 9, oct: 10, nov: 11, "déc": 12, dec: 12 };

  for (const line of page37.lines) {
    const cells = cellsByColumn(line.items, changeAnchors);
    const year = cells[0];
    const day = cells[1];
    const marg = parseFrNum(cells[2]);
    const minR = parseFrNum(cells[4]);
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}-\w+$/.test(day)) continue;
    if (!Number.isFinite(marg) || !Number.isFinite(minR)) continue;
    const dm = day.match(/^(\d{1,2})-(\w+)/);
    if (!dm) continue;
    const monthKey = dm[2].toLowerCase().replace(/\./g, "");
    const month = monthMap[monthKey];
    if (!month) continue;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(parseInt(dm[1], 10)).padStart(2, "0")}`;
    changes.push({ iso, marginal: marg / 100, min: minR / 100 });
  }
  changes.sort((a, b) => a.iso.localeCompare(b.iso));

  const rateAt = (year: number, monthEnd: number) => {
    const cutoff = `${year}-${String(monthEnd).padStart(2, "0")}-31`;
    let last = changes[0];
    for (const c of changes) {
      if (c.iso <= cutoff) last = c;
      else break;
    }
    return last;
  };

  // Reconstruct annual end-of-year snapshots from 2019 forward, then add the
  // bulletin's own month as the final point.
  const targets: { label: string; y: number; m: number }[] = [
    { label: "déc-19", y: 2019, m: 12 },
    { label: "déc-20", y: 2020, m: 12 },
    { label: "déc-21", y: 2021, m: 12 },
    { label: "déc-22", y: 2022, m: 12 },
    { label: "déc-23", y: 2023, m: 12 },
    { label: "déc-24", y: 2024, m: 12 },
    { label: "juin-25", y: 2025, m: 6 },
    { label: "déc-25", y: 2025, m: 12 },
  ];
  if (bulletinLatest) {
    const bm = bulletinLatest.match(/^([a-zéèêà]+)-(\d{2})$/i);
    if (bm) {
      const year = 2000 + parseInt(bm[2], 10);
      const month = monthMap[bm[1].toLowerCase()];
      if (month && !targets.some((t) => t.label === bulletinLatest)) {
        targets.push({ label: bulletinLatest, y: year, m: month });
      }
    }
  }
  for (const t of targets) {
    const r = rateAt(t.y, t.m);
    if (!r) continue;
    rows.push(makeRow("1_Taux_directeurs_BCEAO", "Taux pret marginal", "UEMOA", t.label, r.marginal, "pct", source));
    rows.push(makeRow("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA", t.label, r.min, "pct", source));
  }

  const monthlyAnchors = [71, 206.8, 259.5, 309, 374];
  // Build month-header → canonical month-key map. The PDF prefixes monthly aggregates
  // with abbreviations like "Nov. 2025", "Déc. 2025", "Jan. 2026", "Fév-2026", "Mar.2026".
  // We detect them by prefix match.
  const monthAbbrev: { pat: string; key: string }[] = [
    { pat: "Janv. ", key: "janv" }, { pat: "Jan. ", key: "janv" }, { pat: "Jan.", key: "janv" },
    { pat: "Févr. ", key: "fév" }, { pat: "Fév. ", key: "fév" }, { pat: "Fév-", key: "fév" },
    { pat: "Mars ", key: "mars" }, { pat: "Mar.", key: "mars" },
    { pat: "Avr. ", key: "avr" }, { pat: "Avril ", key: "avr" },
    { pat: "Mai ", key: "mai" },
    { pat: "Juin ", key: "juin" },
    { pat: "Juil. ", key: "juil" }, { pat: "Juillet ", key: "juil" },
    { pat: "Août ", key: "août" }, { pat: "Aout ", key: "août" },
    { pat: "Sept. ", key: "sept" }, { pat: "Sept-", key: "sept" },
    { pat: "Oct. ", key: "oct" }, { pat: "Oct-", key: "oct" },
    { pat: "Nov. ", key: "nov" }, { pat: "Nov-", key: "nov" },
    { pat: "Déc. ", key: "déc" }, { pat: "Déc-", key: "déc" }, { pat: "Dec. ", key: "déc" },
  ];
  // Scan first 4 chars after pattern for year.
  const detectMonthAggKey = (full: string): string | null => {
    for (const { pat, key } of monthAbbrev) {
      if (full.startsWith(pat)) {
        const rest = full.slice(pat.length);
        const ym = rest.match(/^(\d{4})/);
        if (ym) return `${key}-${ym[1].slice(-2)}`;
      }
    }
    return null;
  };

  const weeklyByMonth: Record<string, { hebdoSum: number; hebdoCount: number; mensuelle: number }> = {};

  for (const line of page37.lines) {
    const full = line.items.map((i) => i.str).join(" ").trim();
    const aggKey = detectMonthAggKey(full);
    if (aggKey && !/^\d/.test(full)) {
      const cells = cellsByColumn(line.items, monthlyAnchors);
      const hebdo = parseFrNum(cells[1]);
      const mens = parseFrNum(cells[2]);
      const refiB = parseFrNum(cells[3]);
      if (Number.isFinite(mens)) rows.push(makeRow("2_Marche_monetaire", "TMP adjudication mensuelle", "UEMOA", aggKey, mens / 100, "pct", source));
      if (Number.isFinite(hebdo)) rows.push(makeRow("2_Marche_monetaire", "TMP adjudication hebdomadaire", "UEMOA", aggKey, hebdo / 100, "pct", source));
      if (Number.isFinite(refiB)) rows.push(makeRow("2_Marche_monetaire", "Encours refinancement banques", "UEMOA", aggKey, refiB, "Mds_FCFA", source));
      continue;
    }
    const wk = full.match(/^(\d{1,2})\s+(janv|janvier|fév|févr|février|fevrier|mars|avr|avril|mai|juin|juil|juillet|août|aout|sept|septembre|oct|octobre|nov|novembre|déc|décembre|decembre)[a-zéèê.]*\s+(\d{4})/i);
    if (!wk) continue;
    const monthShortMap: Record<string, string> = {
      janv: "janv", janvier: "janv",
      "fév": "fév", "févr": "fév", fevrier: "fév", "février": "fév",
      mars: "mars",
      avr: "avr", avril: "avr",
      mai: "mai",
      juin: "juin",
      juil: "juil", juillet: "juil",
      "août": "août", aout: "août",
      sept: "sept", septembre: "sept",
      oct: "oct", octobre: "oct",
      nov: "nov", novembre: "nov",
      "déc": "déc", "décembre": "déc", decembre: "déc",
    };
    const ms = monthShortMap[wk[2].toLowerCase().replace(/\./g, "")];
    if (!ms) continue;
    const monthKey = `${ms}-${wk[3].slice(-2)}`;
    const cells = cellsByColumn(line.items, monthlyAnchors);
    const hebdo = parseFrNum(cells[1]);
    const mens = parseFrNum(cells[2]);
    const slot = weeklyByMonth[monthKey] ?? (weeklyByMonth[monthKey] = { hebdoSum: 0, hebdoCount: 0, mensuelle: NaN });
    if (Number.isFinite(hebdo)) { slot.hebdoSum += hebdo; slot.hebdoCount++; }
    if (Number.isFinite(mens) && !Number.isFinite(slot.mensuelle)) slot.mensuelle = mens;
  }
  for (const [key, w] of Object.entries(weeklyByMonth)) {
    const hasHebdo = rows.some((r) => r.section === "2_Marche_monetaire" && r.indicator === "TMP adjudication hebdomadaire" && r.period === key);
    if (!hasHebdo && w.hebdoCount > 0) rows.push(makeRow("2_Marche_monetaire", "TMP adjudication hebdomadaire", "UEMOA", key, w.hebdoSum / w.hebdoCount / 100, "pct", source));
    const hasMens = rows.some((r) => r.section === "2_Marche_monetaire" && r.indicator === "TMP adjudication mensuelle" && r.period === key);
    if (!hasMens && Number.isFinite(w.mensuelle)) rows.push(makeRow("2_Marche_monetaire", "TMP adjudication mensuelle", "UEMOA", key, w.mensuelle / 100, "pct", source));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section 3 : Crédits / Dépôts UEMOA (page 42)
// ---------------------------------------------------------------------------

function parse_3(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[41];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const anchors = [216.8, 256.2, 294.4, 330.3, 365, 399.4, 433.3, 468, 501.8];
  // Header columns derived from the table 2.2.2.3.1: 3 yearly averages, then the
  // 6 most recent monthly snapshots ending with the bulletin month.
  const periodLabels = derivePeriodHeader(page, 130, anchors) ?? [
    "Moy. 2022", "Moy. 2023", "Moy. 2024",
    "mars-25", "nov-25", "déc-25", "janv-26", "fév-26", bulletinLatest || "mars-26",
  ];

  const findRowContains = (sub: string): PdfLine | null => {
    for (const line of page.lines) {
      const full = line.items.map((i) => i.str).join(" ").trim();
      if (full.includes(sub)) return line;
    }
    return null;
  };

  const volLine = findRowContains("- Volume (en milliards de FCFA)");
  let aLine: PdfLine | null = null;
  let bLine: PdfLine | null = null;
  for (const line of page.lines) {
    const full = line.items.map((i) => i.str).join(" ").trim();
    if (/^\(A\)\s*[–-]\s*Taux d'int/.test(full)) aLine = line;
    if (/^\(B\)\s*[–-]\s*Taux d'int/.test(full)) bLine = line;
  }
  const margeLine = findRowContains("Marge moyenne d'intérêt");

  const emit = (line: PdfLine | null, indicator: string, divisor = 100) => {
    if (!line) return;
    const cells = cellsByColumn(line.items, anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (!Number.isFinite(v) || !periodLabels[i]) return;
      rows.push(makeRow("3_Credits_Depots_UEMOA", indicator, "UEMOA", periodLabels[i], v / divisor, divisor === 1 ? "Mds_FCFA" : "pct", source));
    });
  };

  emit(aLine, "Taux moyen credits");
  emit(bLine, "Taux moyen depots");
  emit(margeLine, "Marge interet");
  emit(volLine, "Volume nouveaux credits", 1);
  return rows;
}

// ---------------------------------------------------------------------------
// Period header detection — generic
// Reads the line of headers within a small y-band starting from yStart, snaps
// each item to one of the column anchors, and returns the parsed labels.
// ---------------------------------------------------------------------------

function derivePeriodHeader(page: PdfPage, yStart: number, anchors: number[]): string[] | null {
  // Find the line whose items contain at least 3 month-like tokens.
  const candidates = page.lines.filter((l) => l.y >= yStart && l.y <= yStart + 80);
  // Allow trailing footnote markers like " (*)", "(**)" after the year.
  const monthRegex = /^(janv|fév|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|fevr|aout)[a-zéè]*\.?[-\s]?(\d{2,4})(?:\s*\(\**\))?$/i;
  const yearRegex = /^(?:Moy\.?\s*)?(\d{4})(?:\s*\(\**\))?$/;
  for (const line of candidates) {
    let matches = 0;
    for (const it of line.items) {
      if (monthRegex.test(it.str.trim()) || yearRegex.test(it.str.trim())) matches++;
    }
    if (matches >= Math.min(3, anchors.length / 2)) {
      const out: string[] = anchors.map(() => "");
      for (const it of line.items) {
        const col = snapToColumn(it.x, anchors, 30);
        if (col < 0) continue;
        const s = it.str.trim();
        const m1 = s.match(monthRegex);
        if (m1) {
          const monthKey = m1[1].toLowerCase().replace(/\./g, "");
          const mShort = canonicalMonthShort(monthKey);
          const yy = m1[2].length === 4 ? m1[2].slice(-2) : m1[2];
          if (mShort) out[col] = `${mShort}-${yy}`;
          continue;
        }
        const m2 = s.match(yearRegex);
        if (m2) {
          out[col] = s.startsWith("Moy") ? `Moy. ${m2[1]}` : `Moy. ${m2[1]}`;
          continue;
        }
      }
      // Fill empties with sequential guess from neighbours? Keep blanks for now.
      if (out.every((x) => x === "")) continue;
      return out;
    }
  }
  return null;
}

function canonicalMonthShort(key: string): string | null {
  const map: Record<string, string> = {
    janv: "janv", jan: "janv",
    "fév": "fév", "févr": "fév", fev: "fév", fevr: "fév",
    mars: "mars", mar: "mars",
    avr: "avr", avril: "avr",
    mai: "mai",
    juin: "juin",
    juil: "juil",
    "août": "août", aout: "août",
    sept: "sept", sep: "sept",
    oct: "oct",
    nov: "nov",
    "déc": "déc", dec: "déc",
  };
  return map[key] || null;
}

// ---------------------------------------------------------------------------
// Section 4 : Inflation pays UEMOA (page 60)
// ---------------------------------------------------------------------------

function parse_4(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[59];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const anchors = [193.7, 237.1, 278.1, 322, 364.1, 406.3, 451.1, 497.3];
  const periodLabels = derivePeriodHeader(page, 150, anchors) ?? [
    "Moy. 2023", "Moy. 2024", "Moy. 2025",
    "mars-25", "déc-25", "janv-26", "fév-26", bulletinLatest || "mars-26",
  ];

  const countryMap: Record<string, string> = {
    "Bénin": "Benin",
    "Burkina": "Burkina Faso",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Guinée-Bissau": "Guinee-Bissau",
    "Mali": "Mali",
    "Niger": "Niger",
    "Sénégal": "Senegal",
    "Togo": "Togo",
    "UEMOA": "UEMOA",
    "Médiane UEMOA": "Mediane UEMOA",
    "Mediane UEMOA": "Mediane UEMOA",
  };

  for (const line of page.lines) {
    if (!line.items.length) continue;
    // Le bulletin marque les pays/zones aux données estimées avec un suffixe
    // "(*)" (ex. "UEMOA (*)", "Guinée-Bissau (*)"). On le retire avant lookup.
    const head = line.items[0].str.trim().replace(/\s*\(\*\)\s*$/, "").trim();
    const country = countryMap[head];
    if (!country) continue;
    const cells = cellsByColumn(line.items.slice(1), anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (!Number.isFinite(v) || !periodLabels[i]) return;
      rows.push(makeRow("4_Inflation_pays_UEMOA", "IPC glissement annuel", country, periodLabels[i], v / 100, "pct", source));
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section 5 : Agrégats monétaires — latest snapshot (pages 13-15, take last one)
// ---------------------------------------------------------------------------

function parse_5(pages: PdfPage[], source: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  // Find the highest-numbered "TABLEAU 2.1.1 ..." table — it's the latest snapshot.
  // Each "à fin <mois> <année>" carries the snapshot date.
  let latestPage: PdfPage | null = null;
  let latestSnapshot = ""; // canonical "fin_<mois>_<yyyy>"
  for (let i = 11; i < Math.min(pages.length, 17); i++) {
    const p = pages[i];
    for (const line of p.lines) {
      const full = line.items.map((it) => it.str).join(" ").trim();
      const m = full.match(/TABLEAU 2\.1\.1.*Agrégats de monnaie à fin\s+([a-zéèêûôîàâ]+)\s+(\d{4})/i);
      if (m) {
        const month = m[1].toLowerCase().replace(/\./g, "");
        const key = canonicalMonthShort(month) ?? month.slice(0, 3);
        const snapshot = `fin_${snakeMonth(key)}_${m[2]}`;
        // pick the most recent by year/month
        if (!latestSnapshot || snapshotIsLater(snapshot, latestSnapshot)) {
          latestSnapshot = snapshot;
          latestPage = p;
        }
      }
    }
  }
  if (!latestPage) return [];

  const anchors = [308.2, 358.3, 408.4, 461, 508.7, 561.3, 608.9, 661.5, 707.5];
  const countries = ["Benin", "Burkina Faso", "Cote d'Ivoire", "Guinee-Bissau", "Mali", "Niger", "Senegal", "Togo", "Union"];
  const wanted: Record<string, string> = {
    "Circulation fiduciaire": "Circulation fiduciaire",
    "Actifs extérieurs nets": "Actifs exterieurs nets",
    "Créances intérieures": "Creances interieures",
    "Masse monétaire (M2)": "Masse monetaire M2",
  };

  for (const line of latestPage.lines) {
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const indicator = wanted[head];
    if (!indicator) continue;
    const cells = cellsByColumn(line.items.slice(1), anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (Number.isFinite(v)) rows.push(makeRow("5_Reserves_Agregats", indicator, countries[i], latestSnapshot, v, "Mds_FCFA", source));
    });
  }
  return rows;
}

function snakeMonth(short: string): string {
  // canonical short ("fév", "déc", "janv") → ASCII snake ("fev", "dec", "jan")
  const map: Record<string, string> = {
    janv: "jan",
    "fév": "fev",
    mars: "mars",
    avr: "avr",
    mai: "mai",
    juin: "juin",
    juil: "juil",
    "août": "aout",
    sept: "sept",
    oct: "oct",
    nov: "nov",
    "déc": "dec",
  };
  return map[short] || short;
}

function snapshotIsLater(a: string, b: string): boolean {
  // Compare two "fin_<mois>_<yyyy>" labels chronologically.
  const monthOrder: Record<string, number> = { jan: 1, fev: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, sept: 9, oct: 10, nov: 11, dec: 12 };
  const parse = (s: string) => {
    const m = s.match(/^fin_([a-z]+)_(\d{4})$/);
    if (!m) return -1;
    return parseInt(m[2], 10) * 100 + (monthOrder[m[1]] || 0);
  };
  return parse(a) > parse(b);
}

// ---------------------------------------------------------------------------
// Section 6 : Taux directeurs partenaires (page 11)
// ---------------------------------------------------------------------------

function parse_6(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[10];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const anchors = [225.9, 273.1, 320.4, 367.3, 412.4, 458.5, 505.7];
  // The Mars 2026 PDF shows a duplicate "déc-25" header — we keep one and add the
  // 3 most recent months ending at the bulletin month.
  const periodLabels = ["déc-23", "déc-24", "déc-25", "déc-25", "janv-26", "fév-26", bulletinLatest || "mars-26"];

  const labelMap: Record<string, string> = {
    "Zone euro (taux de refinancement)": "Zone euro (BCE)",
    "Japon (taux d'intervention)": "Japon",
    "USA (taux objectif des fed funds)*": "USA (Fed funds)",
    "Royaume-Uni (Bank Rate)": "Royaume-Uni (Bank Rate)",
  };

  for (const line of page.lines) {
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const series = labelMap[head];
    if (!series) continue;
    const cells = cellsByColumn(line.items.slice(1), anchors);
    cells.forEach((cell, i) => {
      if (i === 2) return; // skip first déc-25 duplicate
      const v = parseFrNum(cell);
      if (!Number.isFinite(v)) return;
      rows.push(makeRow("6_Taux_directeurs_partenaires", series, series, periodLabels[i], v / 100, "pct", source));
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section 7 : Change EUR (page 11)
// ---------------------------------------------------------------------------

function parse_7(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[10];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const anchors = [174.2, 225.9, 273.1, 320.4, 367.3, 412.4, 459.4, 508.1];
  // The Mars 2026 bulletin shows columns: 2023, 2024, 2025 (avg) | mars-25, prev-month, bulletin-month (end-period) | var mens, var ann.
  // To keep the loader generic, we anchor on the bulletin month and derive the previous month.
  const prev = prevMonthKey(bulletinLatest || "mars-26");
  const periodLabels = [
    "Moy. 2023", "Moy. 2024", "Moy. 2025",
    "mars-25", prev || "fév-26", bulletinLatest || "mars-26",
    "var_mensuelle", "var_annuelle",
  ];

  const pairsMap: Record<string, string> = {
    "Dollar": "EUR/USD",
    "Livre Sterling": "EUR/GBP",
    "Yen japonais": "EUR/JPY",
    "Yuan": "EUR/CNY",
  };

  for (const line of page.lines) {
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const pair = pairsMap[head];
    if (!pair) continue;
    const cells = cellsByColumn(line.items.slice(1), anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (!Number.isFinite(v)) return;
      const label = periodLabels[i];
      if (label === "var_annuelle") {
        rows.push(makeRow("7_Change_EUR", `Variation annuelle ${pair}`, pair, `${snakeBulletinKey(bulletinLatest)}_vs_${snakeBulletinKeyPrevYear(bulletinLatest)}`, v / 100, "pct", source));
      } else if (label !== "var_mensuelle") {
        rows.push(makeRow("7_Change_EUR", pair, pair, label, v, "rate", source));
      }
    });
  }

  // EUR/FCFA pegged at 655.957
  const eurFcfaPoints = ["Moy. 2023", "Moy. 2024", "Moy. 2025", "mars-25", prev || "fév-26", bulletinLatest || "mars-26"];
  for (const p of eurFcfaPoints) rows.push(makeRow("7_Change_EUR", "EUR/FCFA", "EUR/FCFA", p, 655.957, "rate", source));
  rows.push(makeRow("7_Change_EUR", "Variation annuelle EUR/FCFA", "EUR/FCFA", `${snakeBulletinKey(bulletinLatest)}_vs_${snakeBulletinKeyPrevYear(bulletinLatest)}`, 0, "pct", source));
  return rows;
}

function prevMonthKey(monthKey: string): string {
  const m = monthKey.match(/^([a-zéèêà]+)-(\d{2})$/i);
  if (!m) return "";
  const order = ["janv", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  const idx = order.indexOf(m[1].toLowerCase());
  if (idx < 0) return "";
  if (idx === 0) {
    const yy = (parseInt(m[2], 10) - 1).toString().padStart(2, "0");
    return `déc-${yy}`;
  }
  return `${order[idx - 1]}-${m[2]}`;
}

function snakeBulletinKey(monthKey: string): string {
  const m = monthKey.match(/^([a-zéèêà]+)-(\d{2})$/i);
  if (!m) return "fev_2026";
  const snake = snakeMonth(m[1].toLowerCase());
  return `${snake}_20${m[2]}`;
}

function snakeBulletinKeyPrevYear(monthKey: string): string {
  const m = monthKey.match(/^([a-zéèêà]+)-(\d{2})$/i);
  if (!m) return "fev_2025";
  const snake = snakeMonth(m[1].toLowerCase());
  const prevYY = (parseInt(m[2], 10) - 1).toString().padStart(2, "0");
  return `${snake}_20${prevYY}`;
}

// ---------------------------------------------------------------------------
// Section 8 : Interbancaire UMOA (page 46)
// ---------------------------------------------------------------------------

function parse_8(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[45];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const maturities = ["1j", "1sem", "2sem", "1mois", "3mois", "6mois", "9mois", "12mois"];
  const montantAnchors = [135, 204, 273, 343, 412, 481, 550, 619];
  const tauxAnchors = [170, 239, 308, 377, 446, 515, 584, 654];

  const moyLines = page.lines.filter((l) => l.items[0]?.str.trim() === "Moyenne");
  // The 3 "Moyenne" rows correspond to (prev-prev month, prev month, bulletin month).
  const prev = prevMonthKey(bulletinLatest || "mars-26");
  const prevPrev = prevMonthKey(prev || "fév-26");
  const months = [prevPrev || "janv-26", prev || "fév-26", bulletinLatest || "mars-26"];

  moyLines.forEach((line, idx) => {
    if (idx >= months.length) return;
    const period = months[idx];
    const items = line.items.slice(1);
    const montants = cellsByColumn(items, montantAnchors);
    const taux = cellsByColumn(items, tauxAnchors);
    maturities.forEach((m, i) => {
      const vm = parseFrNum(montants[i]);
      const vt = parseFrNum(taux[i]);
      if (Number.isFinite(vm) && vm > 0) rows.push(makeRow("8_Interbancaire_UMOA", `Volume ${m}`, "UMOA", period, vm, "M_FCFA", source));
      if (Number.isFinite(vt) && vt > 0) rows.push(makeRow("8_Interbancaire_UMOA", `Taux ${m}`, "UMOA", period, vt / 100, "pct", source));
    });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Section 9 : Réserves constituées vs requises (pages 52-54)
// ---------------------------------------------------------------------------

function parse_9(pages: PdfPage[], source: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  // Page index 51 = page 52, 52 = page 53, 53 = page 54
  const countries: Record<number, string[]> = {
    52: ["UMOA", "Benin", "Burkina Faso"],
    53: ["Cote d'Ivoire", "Guinee-Bissau", "Mali"],
    54: ["Niger", "Senegal", "Togo"],
  };
  const blockAnchors = [
    { req: 182, cons: 245 },
    { req: 395, cons: 451 },
    { req: 595, cons: 649 },
  ];

  // Find the latest period: scan lines of "page 52" for the bottommost "X/Y/ZZ au A/B/CC" entry.
  const findLatestPeriodLine = (page: PdfPage): { line: PdfLine; period: string } | null => {
    let latest: { line: PdfLine; period: string; sortKey: number } | null = null;
    for (const line of page.lines) {
      const full = line.items.slice(0, 3).map((i) => i.str).join(" ").trim();
      const m = full.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+au\s+(\d{1,2})\/(\d{1,2})\/(\d{2})/);
      if (!m) continue;
      const d2 = m[4], mo2 = m[5], y2 = m[6];
      const period = `${pad2(m[1])}_${pad2(m[2])}_${pad2(d2)}_${pad2(mo2)}_20${y2}`;
      const sortKey = parseInt(`20${y2}${pad2(mo2)}${pad2(d2)}`, 10);
      if (!latest || sortKey > latest.sortKey) latest = { line, period, sortKey };
    }
    return latest;
  };

  for (const [pageStr, countriesOnPage] of Object.entries(countries)) {
    const page = pages[parseInt(pageStr, 10) - 1];
    if (!page) continue;
    const latest = findLatestPeriodLine(page);
    if (!latest) continue;
    const valueItems = latest.line.items.filter((i) => i.x > 140);

    blockAnchors.forEach((block, idx) => {
      const country = countriesOnPage[idx];
      const reqCells = cellsByColumn(valueItems, [block.req]);
      const consCells = cellsByColumn(valueItems, [block.cons]);
      const req = parseFrNum(reqCells[0]);
      const cons = parseFrNum(consCells[0]);
      if (!Number.isFinite(req) || !Number.isFinite(cons)) return;
      rows.push(makeRow("9_Reserves_const_vs_req", "Reserves requises", country, latest.period, req, "M_FCFA", source));
      rows.push(makeRow("9_Reserves_const_vs_req", "Reserves constituees", country, latest.period, cons, "M_FCFA", source));
      rows.push(makeRow("9_Reserves_const_vs_req", "Solde net", country, latest.period, cons - req, "M_FCFA", source));
      rows.push(makeRow("9_Reserves_const_vs_req", "Ratio constituees sur requises", country, latest.period, cons / req, "x", source));
    });
  }
  return rows;
}

function pad2(s: string | number): string {
  return String(s).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Section 10 : Conditions de banque (page 43)
// ---------------------------------------------------------------------------

function parse_10(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[42];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const countryMap: Record<string, string> = {
    "Bénin": "Benin",
    "Burkina": "Burkina Faso",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Guinée-Bissau": "Guinee-Bissau",
    "Mali": "Mali",
    "Niger": "Niger",
    "Sénégal": "Senegal",
    "Togo": "Togo",
  };

  // Both tables: data appears at these mars-26 column anchors (feb anchors sit ~47 left).
  const marsAnchors = [185.9, 280.3, 374.6, 468.9, 563.2, 657.6, 751.9];
  const catIndicators = ["Autres institutions de depots", "Societes financieres", "Societes non financieres", "Menages", "ISBLM", "Administrations Publiques", "Ensemble"];
  const objIndicators = ["Consommation", "Exportation", "Tresorerie", "Equipement", "Immobilier", "Autres", "Ensemble"];

  const findTitleY = (key: string) => {
    for (const l of page.lines) {
      const full = l.items.map((i) => i.str).join(" ");
      if (full.includes(key)) return l.y;
    }
    return null;
  };
  const yCat = findTitleY("Tableau 2.2.2.4.1") ?? 0;
  const yObj = findTitleY("Tableau 2.2.2.4.2") ?? 1e9;
  const yDep = findTitleY("Tableau 2.2.2.4.3") ?? 1e9;

  const extract = (yStart: number, yEnd: number, indicators: string[], sectionLabel: TauxSection) => {
    for (const line of page.lines) {
      if (line.y < yStart || line.y >= yEnd) continue;
      if (!line.items.length) continue;
      const head = line.items[0].str.trim();
      const country = countryMap[head];
      if (!country) continue;
      const items = line.items.slice(1);
      const cells = cellsByColumn(items, marsAnchors, 20);
      indicators.forEach((indicator, i) => {
        const v = parseFrNum(cells[i]);
        if (Number.isFinite(v)) rows.push(makeRow(sectionLabel, indicator, country, bulletinLatest || "mars-26", v / 100, "pct", source));
      });
    }
  };

  extract(yCat, yObj, catIndicators, "10a_Conditions_banque_categorie");
  extract(yObj, yDep, objIndicators, "10b_Conditions_banque_objet");
  return rows;
}

// ---------------------------------------------------------------------------
// Section 11 : Contributions à l'inflation par poste (page 60, tableau 2.3.2.2)
// ---------------------------------------------------------------------------

function parse_11(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[59];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  // Same column anchors as table 2.3.2.1 (inflation par pays — both tables
  // share the layout on page 60).
  const anchors = [193.7, 237.1, 278.1, 322, 364.1, 406.3, 451.1, 497.3];
  const periodLabels = derivePeriodHeader(page, 410, anchors) ?? [
    "Moy. 2023", "Moy. 2024", "Moy. 2025",
    "mars-25", "déc-25", "janv-26", "fév-26", bulletinLatest || "mars-26",
  ];

  // Rows expected, in PDF order. Some labels span 2 lines — we match on the
  // value-bearing leading text (which is the continuation half) and remap to a
  // canonical indicator name.
  const indicatorOrder = [
    "Produits alimentaires et boissons",
    "Boissons alcoolisees, Tabac",
    "Habillement",
    "Logement",
    "Ameublement",
    "Sante",
    "Transport",
    "Communication",
    "Loisirs et culture",
    "Enseignement",
    "Restaurants et Hotels",
    "Assurances",
    "Autres biens",
    "Ensemble",
  ];
  // Heuristic detector: leading text on the value-bearing line, normalised to
  // ASCII/lowercase.
  const matchIndicator = (leading: string): string | null => {
    const n = leading.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (n.startsWith("boissons non")) return "Produits alimentaires et boissons";
    if (n.startsWith("stupefiant")) return "Boissons alcoolisees, Tabac";
    if (n.startsWith("habillement")) return "Habillement";
    if (n.startsWith("logement")) return "Logement";
    if (n.startsWith("ameublement")) return "Ameublement";
    if (n.startsWith("sante")) return "Sante";
    if (n.startsWith("transport")) return "Transport";
    if (n.startsWith("communication")) return "Communication";
    if (n.startsWith("loisirs")) return "Loisirs et culture";
    if (n.startsWith("enseignement")) return "Enseignement";
    if (n.startsWith("restaurants")) return "Restaurants et Hotels";
    if (n.startsWith("assurances")) return "Assurances";
    if (n.startsWith("autres biens")) return "Autres biens";
    if (n.startsWith("ensemble")) return "Ensemble";
    return null;
  };

  // Find the y-band of the table: between "Tableau 2.3.2.2" and "Sources : INS"
  const titleLine = page.lines.find((l) => l.items.map((i) => i.str).join(" ").includes("Tableau 2.3.2.2"));
  const endLine = page.lines.find((l) => l.y > (titleLine?.y ?? 0) && l.items.map((i) => i.str).join(" ").startsWith("Sources : INS"));
  const yStart = titleLine?.y ?? 0;
  const yEnd = endLine?.y ?? 1e9;

  for (const line of page.lines) {
    if (line.y <= yStart || line.y >= yEnd) continue;
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const indicator = matchIndicator(head);
    if (!indicator) continue;
    // Skip the "Ensemble" row of section 11 if we don't want to duplicate with
    // section 4's UEMOA series — actually keep it: it's the same number but
    // serves as a sanity check.
    const items = line.items.slice(1);
    const cells = cellsByColumn(items, anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (!Number.isFinite(v) || !periodLabels[i]) return;
      rows.push(makeRow("11_Inflation_composante", indicator, "UEMOA", periodLabels[i], v / 100, "pct", source));
    });
    void indicatorOrder; // (preserved for future ordering guarantees)
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section 12 : Activité économique — indicateurs sectoriels (page 59, tableau 2.3.1.1)
// ---------------------------------------------------------------------------

function parse_12(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[58];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  // 7 columns: 2023, 2024, 2025, mars-25, janv-26, févr-26, mars-26
  const anchors = [215.5, 262.1, 306.6, 346.9, 394, 438.5, 480];
  const defaultLabels = [
    "Moy. 2023", "Moy. 2024", "Moy. 2025",
    "mars-25", "janv-26", "fév-26", bulletinLatest || "mars-26",
  ];
  const detected = derivePeriodHeader(page, 180, anchors);
  const periodLabels = detected && detected.every((s) => !!s) ? detected : defaultLabels;

  // Indicator detector. Some labels are split across 2 lines — we identify the
  // value row by its trailing piece.
  const matchIndicator = (leading: string): string | null => {
    const n = leading.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (n.startsWith("indice de la production industrielle")) return "Indice Production Industrielle";
    if (n.startsWith("commerce")) return "Indice Chiffre Affaires Commerce";
    if (n.startsWith("services marchands")) return "Indice Chiffre Affaires Services Marchands";
    if (n.startsWith("indice des services financiers")) return "Indice Services Financiers";
    return null;
  };

  // Y-band: between "Tableau 2.3.1.1" and "Tableau 2.3.1.2" (climat)
  const titleLine = page.lines.find((l) => l.items.map((i) => i.str).join(" ").includes("Tableau 2.3.1.1"));
  const endLine = page.lines.find((l) => l.y > (titleLine?.y ?? 0) && l.items.map((i) => i.str).join(" ").includes("Tableau 2.3.1.2"));
  const yStart = titleLine?.y ?? 0;
  const yEnd = endLine?.y ?? 1e9;

  // Labels can sit before OR after their value row (multi-line label split
  // across "Indice du Chiffre d'Affaires dans le" + values + "Commerce (**)").
  // We maintain `pending` (label seen, awaiting values below) and `lastValues`
  // (value line seen, awaiting label below).
  let pending: string | null = null;
  let lastValues: PdfLine | null = null;

  const emit = (line: PdfLine, indicator: string, hasLeadingLabel: boolean) => {
    const items = hasLeadingLabel ? line.items.slice(1) : line.items;
    const cells = cellsByColumn(items, anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (Number.isFinite(v) && periodLabels[i]) {
        rows.push(makeRow("12_Activite_economique", indicator, "UEMOA", periodLabels[i], v / 100, "pct", source));
      }
    });
  };

  const isValueLine = (line: PdfLine): boolean => {
    let n = 0;
    for (const it of line.items) if (Number.isFinite(parseFrNum(it.str))) n++;
    return n >= 3;
  };

  for (const line of page.lines) {
    if (line.y <= yStart || line.y >= yEnd) continue;
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const ind = matchIndicator(head);

    if (ind) {
      if (isValueLine(line)) {
        emit(line, ind, true);
        pending = null;
        lastValues = null;
      } else if (lastValues && Math.abs(line.y - lastValues.y) < 20) {
        emit(lastValues, ind, false);
        lastValues = null;
        pending = null;
      } else {
        pending = ind;
      }
      continue;
    }
    if (isValueLine(line)) {
      if (pending) {
        emit(line, pending, false);
        pending = null;
        lastValues = null;
      } else {
        lastValues = line;
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section 13 : Climat des affaires par pays (page 59, tableau 2.3.1.2)
// ---------------------------------------------------------------------------

function parse_13(pages: PdfPage[], bulletinLatest: string, source: string): ParsedRow[] {
  const page = pages[58];
  if (!page) return [];
  const rows: ParsedRow[] = [];

  const anchors = [215.5, 262.1, 306.6, 348.2, 395.3, 439.8, 480];
  const defaultLabels = [
    "Moy. 2023", "Moy. 2024", "Moy. 2025",
    "mars-25", "janv-26", "fév-26", bulletinLatest || "mars-26",
  ];
  const detected = derivePeriodHeader(page, 450, anchors);
  const periodLabels = detected && detected.every((s) => !!s) ? detected : defaultLabels;

  const countryMap: Record<string, string> = {
    "Bénin": "Benin",
    "Burkina": "Burkina Faso",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Guinée-Bissau": "Guinee-Bissau",
    "Mali": "Mali",
    "Niger (**)": "Niger",
    "Niger": "Niger",
    "Sénégal": "Senegal",
    "Togo": "Togo",
    "Union": "Union",
  };

  const titleLine = page.lines.find((l) => l.items.map((i) => i.str).join(" ").includes("Tableau 2.3.1.2"));
  const endLine = page.lines.find((l) => l.y > (titleLine?.y ?? 0) && l.items.map((i) => i.str).join(" ").startsWith("Source : BCEAO"));
  const yStart = titleLine?.y ?? 0;
  const yEnd = endLine?.y ?? 1e9;

  for (const line of page.lines) {
    if (line.y <= yStart || line.y >= yEnd) continue;
    if (!line.items.length) continue;
    const head = line.items[0].str.trim();
    const country = countryMap[head];
    if (!country) continue;
    const items = line.items.slice(1);
    const cells = cellsByColumn(items, anchors);
    cells.forEach((cell, i) => {
      const v = parseFrNum(cell);
      if (!Number.isFinite(v) || !periodLabels[i]) return;
      // Unit "x" means raw points (base 100). Loader-friendly: keep as decimal.
      rows.push(makeRow("13_Climat_affaires", "Indicateur climat des affaires", country, periodLabels[i], v, "x", source));
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main parse entrypoint
// ---------------------------------------------------------------------------

export async function parseBceaoBulletinPdf(pdfPath?: string): Promise<ParsedBulletin> {
  const finalPath = pdfPath ?? join(process.cwd(), "data", "marche-monetaire", "Bul_stat.pdf");
  const pages = await loadPdfPages(finalPath);
  const bulletinLabel = detectBulletinLabel(pages);
  const sourceLabel = `BCEAO - Bulletin mensuel des statistiques - ${bulletinLabel || "Inconnu"}`;
  const bulletinLatest = bulletinMonthKey(bulletinLabel);

  const rows: ParsedRow[] = [
    ...parse_1_2(pages, bulletinLatest, sourceLabel),
    ...parse_3(pages, bulletinLatest, sourceLabel),
    ...parse_4(pages, bulletinLatest, sourceLabel),
    ...parse_5(pages, sourceLabel),
    ...parse_6(pages, bulletinLatest, sourceLabel),
    ...parse_7(pages, bulletinLatest, sourceLabel),
    ...parse_8(pages, bulletinLatest, sourceLabel),
    ...parse_9(pages, sourceLabel),
    ...parse_10(pages, bulletinLatest, sourceLabel),
    ...parse_11(pages, bulletinLatest, sourceLabel),
    ...parse_12(pages, bulletinLatest, sourceLabel),
    ...parse_13(pages, bulletinLatest, sourceLabel),
  ];

  return { rows, bulletinLabel, sourceLabel };
}
