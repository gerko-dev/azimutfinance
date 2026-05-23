// === EXPORT RÉCAPITULATIF DE COTATION BRVM ===
// Génère deux fichiers dans exports/ à partir du payload de la page
// /marches/actions (servi par la route temporaire /api/cotation-export) :
//   - cotation-brvm-<date>.xlsx  : données brutes (5 feuilles)
//   - cotation-brvm-<date>.pptx  : récapitulatif (graphiques PowerPoint natifs)
//
// Usage :
//   1. npm run dev (serveur sur :3000)
//   2. node scripts/export-cotation.mjs
//
// Le PPTX utilise des graphiques natifs (données embarquées dans le .pptx),
// cohérents avec le contenu de l'Excel — pas de lien OLE externe fragile.

import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";
import { readFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "exports");
const SRC = process.env.COTATION_JSON || join(OUT_DIR, "cotation.json");

mkdirSync(OUT_DIR, { recursive: true });
const data = JSON.parse(readFileSync(SRC, "utf-8"));

const dateTag = (data.session?.fetchedAt || new Date().toISOString()).slice(0, 10);
const XLSX_PATH = join(OUT_DIR, `cotation-brvm-${dateTag}.xlsx`);
const PPTX_PATH = join(OUT_DIR, `cotation-brvm-${dateTag}.pptx`);

// ── Formatage fr-FR ─────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fMrd = (v) => (v == null ? "—" : nf1.format(v / 1e9) + " Md");
const fPct = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + nf2.format(v) + " %");
const fNum = (v) => (v == null ? "—" : nf0.format(v));

// Couleurs (sans #)
const C = {
  dark: "0F172A", slate: "334155", grayLt: "F1F5F9", white: "FFFFFF",
  blue: "2563EB", green: "16A34A", red: "DC2626", amber: "D97706",
};
const varColor = (v) => (v == null ? C.slate : v > 0 ? C.green : v < 0 ? C.red : C.slate);

// ── Données ───────────────────────────────────────────────────────────────
const actions = [...data.actions].sort((a, b) => b.capitalization - a.capitalization);
const indices = data.indices;
const stats = data.marketStats;
const gainers = data.topGainers;
const losers = data.topLosers;
const comp = data.compositeStat;

const sectorEntries = Object.entries(stats.bySector).sort((a, b) => b[1] - a[1]);
const countryEntries = Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1]);

// ════════════════════════════════════════════════════════════════════════════
//  1. EXCEL
// ════════════════════════════════════════════════════════════════════════════
async function buildExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance";
  wb.created = new Date();

  const FMT_INT = "#,##0";
  const FMT_PCT = '+0.00" %";-0.00" %";0.00" %"';
  const FMT_DEC = "#,##0.00";

  const headerStyle = (cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  };

  // ── Feuille Synthèse ──
  const syn = wb.addWorksheet("Synthèse", { properties: { tabColor: { argb: "FF2563EB" } } });
  syn.columns = [{ width: 38 }, { width: 26 }];
  syn.mergeCells("A1:B1");
  syn.getCell("A1").value = "Récapitulatif de cotation — BRVM";
  syn.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  syn.mergeCells("A2:B2");
  syn.getCell("A2").value = `Séance : ${data.session?.sessionLabel || dateTag}${data.session?.isClosed ? " (clôturée)" : ""}`;
  syn.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } };

  const kpis = [
    ["Indicateur", "Valeur"],
    ["Actions cotées", stats.totalActions],
    ["Actions cotées (séance)", data.session?.liveListedCount ?? "—"],
    ["Capitalisation totale", fMrd(stats.totalCapitalization)],
    ["Volume du jour (titres)", stats.totalVolume],
    ["PER moyen", Number(stats.averagePer.toFixed(2))],
    ["Rendement moyen", fPct(stats.averageYield)],
    ["BRVM Composite", comp?.latestValue ?? "—"],
    ["Variation Composite", fPct(comp?.variationPct)],
  ];
  let r = 4;
  kpis.forEach((row, i) => {
    const rowRef = syn.getRow(r);
    rowRef.getCell(1).value = row[0];
    rowRef.getCell(2).value = row[1];
    if (i === 0) {
      headerStyle(rowRef.getCell(1));
      headerStyle(rowRef.getCell(2));
    } else {
      rowRef.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
      rowRef.getCell(2).alignment = { horizontal: "right" };
      if (typeof row[1] === "number") rowRef.getCell(2).numFmt = FMT_INT;
      if (i % 2 === 0) {
        rowRef.getCell(1).fill = rowRef.getCell(2).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" },
        };
      }
    }
    r++;
  });

  // ── Feuille Cotations (table complète) ──
  const cot = wb.addWorksheet("Cotations", { views: [{ state: "frozen", ySplit: 1 }] });
  cot.columns = [
    { header: "Code", key: "code", width: 9 },
    { header: "Société", key: "name", width: 30 },
    { header: "Secteur", key: "sector", width: 26 },
    { header: "Pays", key: "country", width: 16 },
    { header: "ISIN", key: "isin", width: 15 },
    { header: "Cours (FCFA)", key: "price", width: 13 },
    { header: "Var. %", key: "changePercent", width: 10 },
    { header: "YTD %", key: "ytdPct", width: 10 },
    { header: "Volume", key: "volume", width: 12 },
    { header: "Capi. (FCFA)", key: "capitalization", width: 18 },
    { header: "Capi. (Md)", key: "capiMrd", width: 12 },
    { header: "PER", key: "per", width: 9 },
    { header: "Rdt %", key: "yieldPct", width: 9 },
  ];
  cot.getRow(1).eachCell(headerStyle);
  for (const a of actions) {
    const row = cot.addRow({
      ...a,
      capiMrd: a.capitalization / 1e9,
      per: a.hasPer ? a.per : null,
      yieldPct: a.hasYield ? a.yieldPct : null,
      ytdPct: a.ytdPct,
    });
    row.getCell("price").numFmt = FMT_INT;
    row.getCell("volume").numFmt = FMT_INT;
    row.getCell("capitalization").numFmt = FMT_INT;
    row.getCell("capiMrd").numFmt = FMT_DEC;
    row.getCell("per").numFmt = FMT_DEC;
    row.getCell("yieldPct").numFmt = FMT_DEC;
    for (const k of ["changePercent", "ytdPct"]) {
      const cell = row.getCell(k);
      cell.numFmt = FMT_PCT;
      const v = a[k];
      cell.font = { color: { argb: "FF" + varColor(v) }, bold: true };
    }
  }
  cot.autoFilter = { from: "A1", to: "M1" };

  // ── Feuille Indices ──
  const idx = wb.addWorksheet("Indices", { views: [{ state: "frozen", ySplit: 1 }] });
  idx.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Indice", key: "name", width: 30 },
    { header: "Catégorie", key: "category", width: 14 },
    { header: "Valeur", key: "value", width: 12 },
    { header: "Préc.", key: "previousValue", width: 12 },
    { header: "Var.", key: "variationValue", width: 12 },
    { header: "Var. %", key: "variationPct", width: 11 },
    { header: "YTD %", key: "ytdPct", width: 11 },
  ];
  idx.getRow(1).eachCell(headerStyle);
  for (const i of indices) {
    const row = idx.addRow(i);
    row.getCell("value").numFmt = FMT_DEC;
    row.getCell("previousValue").numFmt = FMT_DEC;
    row.getCell("variationValue").numFmt = FMT_DEC;
    for (const k of ["variationPct", "ytdPct"]) {
      const cell = row.getCell(k);
      cell.numFmt = FMT_PCT;
      cell.font = { color: { argb: "FF" + varColor(i[k]) }, bold: true };
    }
  }

  // ── Feuille Top hausses / baisses ──
  const top = wb.addWorksheet("Top hausses-baisses");
  top.columns = [{ width: 9 }, { width: 30 }, { width: 13 }, { width: 11 }, { width: 12 }];
  const topBlock = (title, rows, startRow, color) => {
    top.mergeCells(startRow, 1, startRow, 5);
    const t = top.getCell(startRow, 1);
    t.value = title;
    t.font = { bold: true, size: 13, color: { argb: "FF" + color } };
    const head = top.getRow(startRow + 1);
    ["Code", "Société", "Cours", "Var. %", "Volume"].forEach((h, i) => {
      head.getCell(i + 1).value = h;
      headerStyle(head.getCell(i + 1));
    });
    rows.forEach((a, i) => {
      const row = top.getRow(startRow + 2 + i);
      row.getCell(1).value = a.code;
      row.getCell(2).value = a.name;
      row.getCell(3).value = a.price;
      row.getCell(3).numFmt = FMT_INT;
      row.getCell(4).value = a.changePercent;
      row.getCell(4).numFmt = FMT_PCT;
      row.getCell(4).font = { bold: true, color: { argb: "FF" + color } };
      row.getCell(5).value = a.volume;
      row.getCell(5).numFmt = FMT_INT;
    });
  };
  topBlock("▲ Top 5 hausses du jour", gainers, 1, C.green);
  topBlock("▼ Top 5 baisses du jour", losers, 1 + 2 + gainers.length + 2, C.red);

  // ── Feuille Répartition ──
  const rep = wb.addWorksheet("Répartition");
  rep.columns = [{ width: 30 }, { width: 14 }, { width: 4 }, { width: 22 }, { width: 14 }];
  rep.getCell("A1").value = "Par secteur";
  rep.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  rep.getCell("D1").value = "Par pays";
  rep.getCell("D1").font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  ["Secteur", "Nb"].forEach((h, i) => { rep.getCell(2, i + 1).value = h; headerStyle(rep.getCell(2, i + 1)); });
  ["Pays", "Nb"].forEach((h, i) => { rep.getCell(2, i + 4).value = h; headerStyle(rep.getCell(2, i + 4)); });
  sectorEntries.forEach(([k, v], i) => { rep.getCell(3 + i, 1).value = k; rep.getCell(3 + i, 2).value = v; });
  countryEntries.forEach(([k, v], i) => { rep.getCell(3 + i, 4).value = k; rep.getCell(3 + i, 5).value = v; });

  await wb.xlsx.writeFile(XLSX_PATH);
  console.log("✓ Excel  :", XLSX_PATH);
}

// ════════════════════════════════════════════════════════════════════════════
//  2. POWERPOINT
// ════════════════════════════════════════════════════════════════════════════
async function buildPptx() {
  const pptx = new pptxgen();
  pptx.author = "AzimutFinance";
  pptx.company = "AzimutFinance";
  pptx.title = "Récapitulatif de cotation BRVM";
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  const W = 13.333;
  const titleBar = (slide, text, sub) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.0, fill: { color: C.dark } });
    slide.addText(text, { x: 0.5, y: 0.08, w: W - 3, h: 0.6, fontSize: 24, bold: true, color: C.white, fontFace: "Calibri" });
    if (sub) slide.addText(sub, { x: 0.5, y: 0.62, w: W - 3, h: 0.3, fontSize: 11, color: "CBD5E1", italic: true });
    slide.addText("AzimutFinance", { x: W - 2.7, y: 0.3, w: 2.3, h: 0.4, fontSize: 12, color: "94A3B8", align: "right", bold: true });
  };

  // ── Slide 1 : couverture ──
  const s1 = pptx.addSlide();
  s1.background = { color: C.dark };
  s1.addText("Récapitulatif de cotation", { x: 0.7, y: 2.4, w: 12, h: 1, fontSize: 40, bold: true, color: C.white });
  s1.addText("Bourse Régionale des Valeurs Mobilières (BRVM)", { x: 0.7, y: 3.5, w: 12, h: 0.6, fontSize: 20, color: "60A5FA" });
  s1.addText(`Séance : ${data.session?.sessionLabel || dateTag}${data.session?.isClosed ? " — clôturée" : ""}`, { x: 0.7, y: 4.3, w: 12, h: 0.5, fontSize: 16, color: "CBD5E1" });
  s1.addText("AzimutFinance · azimutfinance.com", { x: 0.7, y: 6.6, w: 12, h: 0.4, fontSize: 13, color: "64748B" });

  // ── Slide 2 : KPI marché ──
  const s2 = pptx.addSlide();
  titleBar(s2, "Synthèse du marché", data.session?.sessionLabel || dateTag);
  const kpiCards = [
    ["Actions cotées", String(stats.totalActions), C.blue],
    ["Capitalisation totale", fMrd(stats.totalCapitalization), C.blue],
    ["Volume du jour", fNum(stats.totalVolume), C.slate],
    ["PER moyen", nf2.format(stats.averagePer), C.slate],
    ["Rendement moyen", fPct(stats.averageYield), C.green],
    ["BRVM Composite", `${nf2.format(comp?.latestValue ?? 0)}  (${fPct(comp?.variationPct)})`, varColor(comp?.variationPct)],
  ];
  const cardW = 3.9, cardH = 1.6, gapX = 0.35, gapY = 0.4, x0 = 0.6, y0 = 1.45;
  kpiCards.forEach((c, i) => {
    const col = i % 3, rowi = Math.floor(i / 3);
    const x = x0 + col * (cardW + gapX), y = y0 + rowi * (cardH + gapY);
    s2.addShape(pptx.ShapeType.roundRect, { x, y, w: cardW, h: cardH, fill: { color: C.grayLt }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.08 });
    s2.addText(c[0].toUpperCase(), { x: x + 0.2, y: y + 0.18, w: cardW - 0.4, h: 0.4, fontSize: 12, bold: true, color: C.slate });
    s2.addText(c[1], { x: x + 0.2, y: y + 0.6, w: cardW - 0.4, h: 0.8, fontSize: 24, bold: true, color: c[2] });
  });

  // ── Slide 3 : variations de tous les indices ──
  const s3 = pptx.addSlide();
  titleBar(s3, "Variations des indices", "Variation du jour (%) et performance annuelle (YTD)");
  const idxSorted = [...indices].sort((a, b) => b.variationPct - a.variationPct);
  s3.addChart(pptx.ChartType.bar, [
    { name: "Var. jour %", labels: idxSorted.map((i) => i.code), values: idxSorted.map((i) => Number(i.variationPct.toFixed(2))) },
  ], {
    x: 0.5, y: 1.3, w: 6.2, h: 5.7, barDir: "bar", showValue: true,
    dataLabelFontSize: 9, dataLabelColor: C.dark,
    chartColors: [C.blue], showLegend: false, showTitle: false,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
  });
  // Table des indices à droite
  const idxRows = [
    [{ text: "Indice", options: { bold: true, color: C.white, fill: { color: C.dark } } },
     { text: "Valeur", options: { bold: true, color: C.white, fill: { color: C.dark }, align: "right" } },
     { text: "Var %", options: { bold: true, color: C.white, fill: { color: C.dark }, align: "right" } },
     { text: "YTD %", options: { bold: true, color: C.white, fill: { color: C.dark }, align: "right" } }],
    ...indices.map((i) => [
      { text: i.code, options: { fontSize: 10 } },
      { text: nf2.format(i.value), options: { align: "right", fontSize: 10 } },
      { text: fPct(i.variationPct), options: { align: "right", fontSize: 10, color: varColor(i.variationPct), bold: true } },
      { text: fPct(i.ytdPct), options: { align: "right", fontSize: 10, color: varColor(i.ytdPct) } },
    ]),
  ];
  s3.addTable(idxRows, { x: 7.0, y: 1.3, w: 5.8, colW: [1.7, 1.5, 1.3, 1.3], border: { type: "solid", color: "E2E8F0", pt: 0.5 }, rowH: 0.32, valign: "middle" });

  // ── Slide 4 : top hausses / baisses ──
  const s4 = pptx.addSlide();
  titleBar(s4, "Top mouvements du jour", "Plus fortes hausses et baisses");
  const moverChart = (slide, title, rows, color, x) => {
    slide.addText(title, { x, y: 1.25, w: 6, h: 0.4, fontSize: 16, bold: true, color });
    slide.addChart(pptx.ChartType.bar, [
      { name: "Var %", labels: rows.map((a) => a.code), values: rows.map((a) => Number(a.changePercent.toFixed(2))) },
    ], {
      x, y: 1.7, w: 6.0, h: 4.3, barDir: "bar", showValue: true, dataLabelFontSize: 11, dataLabelColor: C.dark,
      chartColors: [color], showLegend: false, catAxisLabelFontSize: 11, valAxisLabelFontSize: 9,
    });
    slide.addText(rows.map((a) => `${a.code} — ${a.name}`).join("\n"), { x, y: 6.1, w: 6.0, h: 1.2, fontSize: 9, color: C.slate, lineSpacingMultiple: 1.1 });
  };
  moverChart(s4, "▲ Hausses", gainers, C.green, 0.5);
  moverChart(s4, "▼ Baisses", losers, C.red, 6.9);

  // ── Slide 5 : répartition secteur / pays ──
  const s5 = pptx.addSlide();
  titleBar(s5, "Répartition des sociétés cotées", "Nombre d'actions par secteur et par pays");
  s5.addText("Par secteur", { x: 0.5, y: 1.2, w: 6, h: 0.4, fontSize: 15, bold: true, color: C.dark });
  s5.addChart(pptx.ChartType.doughnut, [
    { name: "Secteurs", labels: sectorEntries.map((e) => e[0]), values: sectorEntries.map((e) => e[1]) },
  ], { x: 0.4, y: 1.6, w: 6.3, h: 5.4, showLegend: true, legendPos: "b", legendFontSize: 8, showValue: true, dataLabelFontSize: 9, holeSize: 55 });
  s5.addText("Par pays", { x: 7.0, y: 1.2, w: 6, h: 0.4, fontSize: 15, bold: true, color: C.dark });
  s5.addChart(pptx.ChartType.pie, [
    { name: "Pays", labels: countryEntries.map((e) => e[0]), values: countryEntries.map((e) => e[1]) },
  ], { x: 6.9, y: 1.6, w: 6.3, h: 5.4, showLegend: true, legendPos: "b", legendFontSize: 8, showValue: true, dataLabelFontSize: 9 });

  // ── Slides 6+ : tableau complet (pagination manuelle) ──
  const headOpt = { bold: true, color: C.white, fill: { color: C.dark }, fontSize: 10, align: "center", valign: "middle" };
  const headerRow = [
    { text: "Code", options: headOpt },
    { text: "Société", options: { ...headOpt, align: "left" } },
    { text: "Cours", options: { ...headOpt, align: "right" } },
    { text: "Var %", options: { ...headOpt, align: "right" } },
    { text: "YTD %", options: { ...headOpt, align: "right" } },
    { text: "Volume", options: { ...headOpt, align: "right" } },
    { text: "Capi (Md)", options: { ...headOpt, align: "right" } },
    { text: "PER", options: { ...headOpt, align: "right" } },
    { text: "Rdt %", options: { ...headOpt, align: "right" } },
  ];
  const rowFor = (a, i) => {
    const base = { fontSize: 9, fill: { color: i % 2 ? "F8FAFC" : "FFFFFF" }, valign: "middle" };
    return [
      { text: a.code, options: { ...base, bold: true } },
      { text: a.name, options: { ...base, align: "left" } },
      { text: fNum(a.price), options: { ...base, align: "right" } },
      { text: fPct(a.changePercent), options: { ...base, align: "right", color: varColor(a.changePercent), bold: true } },
      { text: a.ytdPct == null ? "—" : fPct(a.ytdPct), options: { ...base, align: "right", color: varColor(a.ytdPct) } },
      { text: fNum(a.volume), options: { ...base, align: "right" } },
      { text: nf1.format(a.capitalization / 1e9), options: { ...base, align: "right" } },
      { text: a.hasPer ? nf2.format(a.per) : "—", options: { ...base, align: "right" } },
      { text: a.hasYield ? nf2.format(a.yieldPct) : "—", options: { ...base, align: "right" } },
    ];
  };
  const PER_PAGE = 24;
  const pages = Math.ceil(actions.length / PER_PAGE);
  for (let p = 0; p < pages; p++) {
    const chunk = actions.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
    const slide = pptx.addSlide();
    titleBar(
      slide,
      "Tableau complet des cotations" + (pages > 1 ? ` (${p + 1}/${pages})` : ""),
      `${actions.length} valeurs · triées par capitalisation`,
    );
    slide.addTable([headerRow, ...chunk.map((a, i) => rowFor(a, p * PER_PAGE + i))], {
      x: 0.3, y: 1.2, w: 12.7, colW: [0.9, 3.4, 1.2, 1.1, 1.1, 1.3, 1.2, 1.0, 1.0],
      border: { type: "solid", color: "E2E8F0", pt: 0.5 }, rowH: 0.24, valign: "middle",
    });
  }

  await pptx.writeFile({ fileName: PPTX_PATH });
  console.log("✓ PPTX   :", PPTX_PATH);
}

await buildExcel();
await buildPptx();
console.log("\nTerminé.");
