import "server-only";

import ExcelJS from "exceljs";
import type { CotationReportData } from "./cotation";

const FMT_INT = "#,##0";
const FMT_PCT = '+0.00" %";-0.00" %";0.00" %"';
const FMT_DEC = "#,##0.00";

function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function varArgb(v: number | null): string {
  if (v == null || Math.abs(v) < 1e-9) return "FF334155";
  return v > 0 ? "FF16A34A" : "FFDC2626";
}

/** Construit le classeur Excel du récapitulatif et renvoie un Buffer. */
export async function buildCotationExcel(
  data: CotationReportData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AzimutFinance";
  wb.created = new Date();

  const dateTag = data.session.fetchedAt.slice(0, 10);
  const { marketStats: stats, compositeStat: comp } = data;
  const actions = [...data.actions].sort(
    (a, b) => b.capitalization - a.capitalization,
  );

  // ── Synthèse ──
  const syn = wb.addWorksheet("Synthèse", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  syn.columns = [{ width: 38 }, { width: 26 }];
  syn.mergeCells("A1:B1");
  syn.getCell("A1").value = "Récapitulatif de cotation — BRVM";
  syn.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  syn.mergeCells("A2:B2");
  syn.getCell("A2").value = `Séance : ${data.session.sessionLabel || dateTag}${
    data.session.isClosed ? " (clôturée)" : ""
  }`;
  syn.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } };

  const kpis: [string, string | number][] = [
    ["Indicateur", "Valeur"],
    ["Actions cotées", stats.totalActions],
    ["Actions cotées (séance)", data.session.liveListedCount],
    ["Capitalisation totale (Md FCFA)", Number((stats.totalCapitalization / 1e9).toFixed(1))],
    ["Volume du jour (titres)", stats.totalVolume],
    ["PER médian", Number(stats.medianPer.toFixed(2))],
    ["Rendement moyen (%)", Number(stats.averageYield.toFixed(2))],
    ["BRVM Composite", Number(comp.latestValue.toFixed(2))],
    ["Variation Composite (%)", Number(comp.variationPct.toFixed(2))],
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
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
      }
    }
    r++;
  });

  // ── Cotations ──
  const cot = wb.addWorksheet("Cotations", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
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
      code: a.code,
      name: a.name,
      sector: a.sector,
      country: a.country,
      isin: a.isin,
      price: a.price,
      changePercent: a.changePercent,
      ytdPct: a.ytdPct,
      volume: a.volume,
      capitalization: a.capitalization,
      capiMrd: a.capitalization / 1e9,
      per: a.hasPer ? a.per : null,
      yieldPct: a.hasYield ? a.yieldPct : null,
    });
    row.getCell("price").numFmt = FMT_INT;
    row.getCell("volume").numFmt = FMT_INT;
    row.getCell("capitalization").numFmt = FMT_INT;
    row.getCell("capiMrd").numFmt = FMT_DEC;
    row.getCell("per").numFmt = FMT_DEC;
    row.getCell("yieldPct").numFmt = FMT_DEC;
    for (const k of ["changePercent", "ytdPct"] as const) {
      const cell = row.getCell(k);
      cell.numFmt = FMT_PCT;
      cell.font = { color: { argb: varArgb(a[k]) }, bold: true };
    }
  }
  cot.autoFilter = { from: "A1", to: "M1" };

  // ── Indices ──
  const idx = wb.addWorksheet("Indices", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  idx.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Indice", key: "name", width: 32 },
    { header: "Catégorie", key: "category", width: 14 },
    { header: "Valeur", key: "value", width: 12 },
    { header: "Préc.", key: "previousValue", width: 12 },
    { header: "Var.", key: "variationValue", width: 12 },
    { header: "Var. %", key: "variationPct", width: 11 },
    { header: "YTD %", key: "ytdPct", width: 11 },
  ];
  idx.getRow(1).eachCell(headerStyle);
  for (const i of data.indices) {
    const row = idx.addRow(i);
    row.getCell("value").numFmt = FMT_DEC;
    row.getCell("previousValue").numFmt = FMT_DEC;
    row.getCell("variationValue").numFmt = FMT_DEC;
    for (const k of ["variationPct", "ytdPct"] as const) {
      const cell = row.getCell(k);
      cell.numFmt = FMT_PCT;
      cell.font = { color: { argb: varArgb(i[k]) }, bold: true };
    }
  }

  // ── Top hausses / baisses ──
  const top = wb.addWorksheet("Top hausses-baisses");
  top.columns = [{ width: 9 }, { width: 30 }, { width: 13 }, { width: 11 }, { width: 12 }];
  const topBlock = (
    title: string,
    rows: typeof data.topGainers,
    startRow: number,
    argb: string,
  ) => {
    top.mergeCells(startRow, 1, startRow, 5);
    const t = top.getCell(startRow, 1);
    t.value = title;
    t.font = { bold: true, size: 13, color: { argb } };
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
      row.getCell(4).font = { bold: true, color: { argb } };
      row.getCell(5).value = a.volume;
      row.getCell(5).numFmt = FMT_INT;
    });
  };
  topBlock("▲ Top 5 hausses du jour", data.topGainers, 1, "FF16A34A");
  topBlock(
    "▼ Top 5 baisses du jour",
    data.topLosers,
    1 + 2 + data.topGainers.length + 2,
    "FFDC2626",
  );

  // ── Répartition ──
  const rep = wb.addWorksheet("Répartition");
  rep.columns = [{ width: 30 }, { width: 14 }, { width: 4 }, { width: 22 }, { width: 14 }];
  rep.getCell("A1").value = "Par secteur";
  rep.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  rep.getCell("D1").value = "Par pays";
  rep.getCell("D1").font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  ["Secteur", "Nb"].forEach((h, i) => {
    rep.getCell(2, i + 1).value = h;
    headerStyle(rep.getCell(2, i + 1));
  });
  ["Pays", "Nb"].forEach((h, i) => {
    rep.getCell(2, i + 4).value = h;
    headerStyle(rep.getCell(2, i + 4));
  });
  Object.entries(stats.bySector)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v], i) => {
      rep.getCell(3 + i, 1).value = k;
      rep.getCell(3 + i, 2).value = v;
    });
  Object.entries(stats.byCountry)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v], i) => {
      rep.getCell(3 + i, 4).value = k;
      rep.getCell(3 + i, 5).value = v;
    });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
