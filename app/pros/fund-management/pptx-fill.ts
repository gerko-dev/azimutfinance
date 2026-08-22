// Moteur de remplissage du template PPTX (Rapport du comité d'investissement).
// Manipule le .pptx comme une archive (JSZip) : régénère le texte des zones de
// commentaire et remplit les cellules des tableaux DrawingML natifs, en gardant
// intacts la mise en page, la police (Aptos), les logos et les objets OLE.
// Module serveur (fs + jszip) — importé uniquement par la route de génération.
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TEMPLATE_FILE = "Rapport du comité d'investissement NFD_Template_v04.pptx";

export type Line = string | { text: string; bold?: boolean };

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Capture le PREMIER élément `<tag …/>` (auto-fermant) ou `<tag …>…</tag>`
// complet. Les balises pPr/rPr/bodyPr ne s'imbriquent pas en elles-mêmes, donc
// le premier `</tag>` ferme correctement. (Une capture naïve `[\s\S]*?/>`
// s'arrêterait sur un enfant auto-fermant et casserait le XML.)
function captureEl(tag: string, s: string, fallback: string): string {
  const open = s.match(new RegExp(`<${tag}\\b[^>]*?(/?)>`));
  if (!open || open.index == null) return fallback;
  if (open[1] === "/") return open[0]; // <tag .../>
  const start = open.index;
  const afterOpen = start + open[0].length;
  const close = s.slice(afterOpen).match(new RegExp(`</${tag}>`));
  if (!close || close.index == null) return fallback;
  return s.slice(start, afterOpen + close.index + close[0].length);
}
// Texte concaténé des <a:t> d'un fragment XML.
function runText(frag: string): string {
  return [...frag.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("");
}

// Reconstruit le contenu d'un txBody : conserve bodyPr, réutilise le pPr et le
// rPr existants (police/puce), produit un paragraphe par ligne fournie.
function rebuildTxBody(txBody: string, lines: Line[]): string {
  const bodyPr = captureEl("a:bodyPr", txBody, "<a:bodyPr/>");
  const pPr = captureEl("a:pPr", txBody, "");
  const rPr = captureEl("a:rPr", txBody, '<a:rPr lang="fr-FR"/>');
  const boldRPr =
    '<a:rPr lang="fr-FR" sz="1600" b="1" dirty="0"><a:solidFill><a:srgbClr val="002060"/></a:solidFill>' +
    '<a:latin typeface="Aptos" panose="020B0004020202020204" pitchFamily="34" charset="0"/></a:rPr>';
  const paras = lines
    .map((ln) => {
      const bold = typeof ln === "object" && !!ln.bold;
      const text = typeof ln === "object" ? ln.text : ln;
      if (text === "") return `<a:p>${pPr}</a:p>`;
      return bold
        ? `<a:p><a:r>${boldRPr}<a:t>${esc(text)}</a:t></a:r></a:p>`
        : `<a:p>${pPr}<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r></a:p>`;
    })
    .join("");
  return `${bodyPr}<a:lstStyle/>${paras}`;
}

// Remplace le texte de la zone (p:sp) dont le contenu concaténé inclut `anchor`.
function replaceShapeText(xml: string, anchor: string, lines: Line[]): { xml: string; ok: boolean } {
  const sps = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  for (const sp of sps) {
    if (!runText(sp).includes(anchor)) continue;
    const tb = sp.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
    if (!tb) return { xml, ok: false };
    const newSp = sp.replace(tb[0], `<p:txBody>${rebuildTxBody(tb[1], lines)}</p:txBody>`);
    return { xml: xml.replace(sp, newSp), ok: true };
  }
  return { xml, ok: false };
}

// Écrit les valeurs d'une ligne de tableau (tableau `tblIdx`, ligne `rowIdx`).
// `values[i] === null|undefined` → cellule inchangée.
function setTableRow(
  xml: string,
  tblIdx: number,
  rowIdx: number,
  values: (string | number | null | undefined)[],
): { xml: string; ok: boolean } {
  const tbls = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || [];
  const tbl = tbls[tblIdx];
  if (!tbl) return { xml, ok: false };
  const rows = tbl.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
  const row = rows[rowIdx];
  if (!row) return { xml, ok: false };
  const cells = row.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g) || [];
  let newRow = row;
  cells.forEach((cell, i) => {
    if (i >= values.length || values[i] == null) return;
    const tb = cell.match(/<a:txBody>([\s\S]*?)<\/a:txBody>/);
    if (!tb) return;
    const newCell = cell.replace(
      tb[0],
      `<a:txBody>${rebuildTxBody(tb[1], [String(values[i])])}</a:txBody>`,
    );
    newRow = newRow.replace(cell, newCell);
  });
  const newTbl = tbl.replace(row, newRow);
  return { xml: xml.replace(tbl, newTbl), ok: true };
}

// ── Génération de tableaux natifs (pour remplacer les objets OLE Excel) ──────
// Bordure de cellule (noir fin), clonée du style des tableaux du template.
const BORDER = (side: "L" | "R" | "T" | "B") =>
  `<a:ln${side} w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln${side}>`;
const ALL_BORDERS = BORDER("L") + BORDER("R") + BORDER("T") + BORDER("B");

function cell(
  text: unknown,
  opts: { header?: boolean; bold?: boolean; align?: "l" | "r" | "ctr" } = {},
): string {
  const header = !!opts.header;
  const color = header ? "FFFFFF" : "000000";
  const bold = header || opts.bold ? "1" : "0";
  const align = opts.align ?? (header ? "ctr" : "l");
  const fill = header ? '<a:solidFill><a:srgbClr val="002060"/></a:solidFill>' : "<a:noFill/>";
  const rPr = `<a:rPr lang="fr-FR" sz="1200" b="${bold}" i="0" u="none" strike="noStrike"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:effectLst/><a:latin typeface="Avenir"/></a:rPr>`;
  const pPr = `<a:pPr algn="${align}" fontAlgn="ctr"><a:buNone/></a:pPr>`;
  const tcPr = `<a:tcPr marL="18000" marR="18000" marT="0" marB="0" anchor="ctr">${ALL_BORDERS}${fill}</a:tcPr>`;
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${pPr}<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r></a:p></a:txBody>${tcPr}</a:tc>`;
}

export type TableDef = {
  headers: string[];
  rows: (string | number)[][];
  hasTotal?: boolean; // dernière ligne en gras
  colAligns?: ("l" | "r" | "ctr")[]; // défaut : col0 à gauche, reste à droite
};

// Construit un p:graphicFrame contenant un tableau natif, positionné en (x,y).
function buildTableFrame(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  def: TableDef,
): string {
  const ncol = def.headers.length || 1;
  const colW = Math.floor(cx / ncol);
  const aligns = def.colAligns ?? def.headers.map((_, i) => (i === 0 ? "l" : "r"));
  const nRows = def.rows.length + 1;
  const rowH = Math.max(120000, Math.floor(cy / nRows));
  const grid = def.headers.map(() => `<a:gridCol w="${colW}"/>`).join("");
  const headerRow = `<a:tr h="${rowH}">${def.headers.map((h) => cell(h, { header: true })).join("")}</a:tr>`;
  const dataRows = def.rows
    .map((r, ri) => {
      const isTotal = !!def.hasTotal && ri === def.rows.length - 1;
      const tcs = def.headers
        .map((_, ci) => cell(r[ci] ?? "", { bold: isTotal, align: aligns[ci] }))
        .join("");
      return `<a:tr h="${rowH}">${tcs}</a:tr>`;
    })
    .join("");
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(name)}"/>` +
    `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
    `<a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${grid}</a:tblGrid>${headerRow}${dataRows}</a:tbl>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`
  );
}

export class PptxReport {
  private zip: JSZip;
  private constructor(zip: JSZip) {
    this.zip = zip;
  }
  static async load(): Promise<PptxReport> {
    const buf = await readFile(join(process.cwd(), TEMPLATE_FILE));
    return new PptxReport(await JSZip.loadAsync(buf));
  }
  private async read(slide: number): Promise<string> {
    const f = this.zip.file(`ppt/slides/slide${slide}.xml`);
    if (!f) throw new Error(`slide${slide}.xml introuvable`);
    return f.async("string");
  }
  private write(slide: number, xml: string): void {
    this.zip.file(`ppt/slides/slide${slide}.xml`, xml);
  }

  // Régénère le commentaire (zone de texte contenant `anchor`) d'une slide.
  async comment(slide: number, anchor: string, lines: Line[]): Promise<boolean> {
    const xml = await this.read(slide);
    const r = replaceShapeText(xml, anchor, lines);
    if (r.ok) this.write(slide, r.xml);
    return r.ok;
  }

  // Remplit une ou plusieurs lignes d'un tableau natif d'une slide.
  async tableRows(
    slide: number,
    tblIdx: number,
    rows: Record<number, (string | number | null | undefined)[]>,
  ): Promise<boolean> {
    let xml = await this.read(slide);
    let any = false;
    for (const [rowIdx, values] of Object.entries(rows)) {
      const r = setTableRow(xml, tblIdx, Number(rowIdx), values);
      xml = r.xml;
      any = any || r.ok;
    }
    if (any) this.write(slide, xml);
    return any;
  }

  // Supprime les objets OLE Excel d'une slide et, pour chacun (dans l'ordre du
  // document), insère un tableau natif à sa position si `defs[i]` est fourni ;
  // sinon l'objet est simplement retiré. Renvoie le nombre de tableaux créés.
  async replaceOle(slide: number, defs: (TableDef | null)[]): Promise<number> {
    let xml = await this.read(slide);
    const frames = xml.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g) || [];
    const oleFrames = frames.filter((f) => f.includes("oleObj"));
    let created = 0;
    oleFrames.forEach((f, i) => {
      const off = f.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/);
      const ext = f.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
      const def = defs[i];
      if (def && off && ext) {
        const frame = buildTableFrame(
          900 + slide * 10 + i,
          `Tableau ${slide}-${i + 1}`,
          Number(off[1]),
          Number(off[2]),
          Number(ext[1]),
          Number(ext[2]),
          def,
        );
        xml = xml.replace(f, frame);
        created++;
      } else {
        xml = xml.replace(f, "");
      }
    });
    this.write(slide, xml);
    return created;
  }

  async toBuffer(): Promise<Buffer> {
    return this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as Promise<Buffer>;
  }
}
