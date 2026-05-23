import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import type { CotationReportData, ReportIndex } from "./cotation";

// ── Formatage fr-FR ──────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const frInt = (n: number) => nf0.format(Math.round(n));
const frMd = (n: number) => nf1.format(n / 1e9);
const signedPct = (v: number, d = 2) =>
  (v >= 0 ? "+" : "") + (d === 1 ? nf1 : nf2).format(v) + " %";
const cls = (v: number | null) =>
  v == null || Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
const monthTag = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Ressources image embarquées en base64 ────────────────────────────────────
// Le PDF est rendu par Chromium via setContent() sans base URL ni serveur : les
// images doivent donc être inlinées en data URI (aucune ressource réseau).
let _logoUri: string | null = null;
let _bgUri: string | null = null;
function pngDataUri(relPath: string): string {
  const buf = readFileSync(join(process.cwd(), relPath));
  return `data:image/png;base64,${buf.toString("base64")}`;
}
function bannerLogoUri(): string {
  // Logo horizontal blanc sur fond marine (#0A2A5E) — se fond dans le bandeau.
  if (_logoUri == null) _logoUri = pngDataUri("logo/png/logo-horizontal-fond-sombre.png");
  return _logoUri;
}
function lastPageBgUri(): string {
  // Visuel de fond de la dernière diapositive du PPT (exporté en PNG).
  if (_bgUri == null) _bgUri = pngDataUri("lib/reports/assets/last-page-bg.png");
  return _bgUri;
}

const SECTOR_ABBR: Record<string, string> = {
  "Télécommunications": "Télécom",
  "Services financiers": "Finance",
  "Consommation de base": "Conso base",
  "Consommation discrétionnaire": "Conso discr.",
  "Industriels": "Industrie",
  "Services aux collectivités": "Services pub.",
  "Services publics": "Services pub.",
  "Énergie": "Énergie",
  "Agro-industrie": "Agro",
};
const abbrSector = (s: string) =>
  SECTOR_ABBR[s] ?? (s.length <= 13 ? s : s.slice(0, 12) + ".");

// ── Graphique d'évolution (aire) en SVG inline ───────────────────────────────
function compositeChartSvg(points: { date: string; value: number }[]): string {
  if (points.length < 2) return "";
  const W = 1000;
  const H = 300;
  const padL = 4;
  const padR = 4;
  const padT = 10;
  const padB = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;
  const linePts = points
    .map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const baseline = (padT + innerH).toFixed(1);
  const areaPts = `${padL.toFixed(1)},${baseline} ${linePts} ${(padL + innerW).toFixed(1)},${baseline}`;
  const up = points[points.length - 1].value >= points[0].value;
  const color = up ? "#16A34A" : "#DC2626";
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <polygon points="${areaPts}" fill="url(#cg)"/>
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function compositeChartCard(data: CotationReportData): string {
  const pts = data.compositeHistory;
  if (pts.length < 2) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  const perf = first.value > 0 ? ((last.value - first.value) / first.value) * 100 : 0;
  return `<div class="chartcard">
    <div class="chart-head">
      <span class="chart-cur">${nf2.format(last.value)} pts</span>
      <span class="chart-perf ${cls(perf)}">${signedPct(perf)}<span class="chart-period"> · 1 an</span></span>
    </div>
    ${compositeChartSvg(pts)}
    <div class="chart-axis"><span>${monthTag(first.date)}</span><span>${monthTag(last.date)}</span></div>
  </div>`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────
const STYLE = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: #fff; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.banner { background: #0A2A5E; color: #fff; padding: 6mm 12mm; display: flex; justify-content: space-between; align-items: center; gap: 8mm; }
.banner .logo { height: 13mm; width: auto; flex: none; }
.banner h1 { font-size: 19pt; font-weight: 800; letter-spacing: .5px; flex: 1; text-align: left; }
.banner.compact h1 { font-size: 14.5pt; }
.datepill { background: #2563EB; color: #fff; padding: 1.6mm 5mm; border-radius: 30px; font-weight: 700; font-size: 11pt; white-space: nowrap; flex: none; }
.accent { height: 2mm; background: #2563EB; }
.content { padding: 6mm 12mm 0; }
.kpis { display: flex; gap: 5mm; margin-bottom: 5mm; }
.kpi { flex: 1; border: 1px solid #E2E8F0; border-left: 4px solid #2563EB; border-radius: 8px; padding: 3.5mm 4.5mm; background: #F8FAFC; }
.kpi .label { font-size: 8.5pt; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
.kpi .value { font-size: 19pt; font-weight: 800; margin-top: 1mm; }
.kpi .var { font-size: 11pt; font-weight: 700; margin-top: .5mm; }
.cols { display: flex; gap: 7mm; }
.col-left { flex: 1.15; } .col-right { flex: 1; }
.section-title { font-size: 11.5pt; font-weight: 800; margin: 0 0 2mm; color: #0F172A; }
.section-title.green { color: #16A34A; } .section-title.red { color: #DC2626; }
.spacer { height: 4mm; }
.chartcard { border: 1px solid #E2E8F0; border-radius: 8px; padding: 2.5mm 4mm 1.5mm; background: #F8FAFC; margin-bottom: 4mm; }
.chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1mm; }
.chart-cur { font-size: 14pt; font-weight: 800; }
.chart-perf { font-size: 10.5pt; font-weight: 700; }
.chart-period { color: #94A3B8; font-weight: 600; font-size: 8pt; }
svg.spark { width: 100%; height: 26mm; display: block; }
.chart-axis { display: flex; justify-content: space-between; font-size: 7.5pt; color: #94A3B8; margin-top: .5mm; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
th { background: #0F172A; color: #fff; text-align: left; padding: 1.5mm 2.5mm; font-size: 8pt; font-weight: 700; }
td { padding: 1.3mm 2.5mm; border-bottom: 1px solid #E2E8F0; }
tbody tr:nth-child(even) td { background: #F8FAFC; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.up { color: #16A34A; font-weight: 700; } .down { color: #DC2626; font-weight: 700; } .flat { color: #64748B; }
.bold { font-weight: 700; }
.footer { position: absolute; bottom: 5mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 8pt; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 2mm; }
/* page 3 — fond repris du PPT */
.thanks { position: absolute; inset: 0; background-position: center; background-size: cover; background-repeat: no-repeat; color: #fff; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center; padding: 0 30mm 16mm; }
.contacts { display: flex; gap: 18mm; margin-bottom: 9mm; }
.contact .ico { font-size: 16pt; }
.contact .lbl { font-size: 8.5pt; color: #60A5FA; font-weight: 700; letter-spacing: .5px; margin: 2mm 0 1mm; }
.contact .val { font-size: 10pt; }
.disclaimer { font-size: 8pt; color: #CBD5E1; max-width: 200mm; line-height: 1.5; }
`;

function indexRow(label: string, i: ReportIndex | undefined): string {
  if (!i) return "";
  return `<tr><td class="bold">${esc(label)}</td><td class="num">${nf2.format(i.value)} pts</td><td class="num ${cls(i.variationPct)}">${signedPct(i.variationPct)}</td><td class="num ${cls(i.ytdPct)}">${i.ytdPct == null ? "n.d." : signedPct(i.ytdPct)}</td></tr>`;
}

function moverRows(rows: CotationReportData["topGainers"], up: boolean): string {
  return rows
    .map(
      (a) =>
        `<tr><td class="bold">${esc(a.code)}</td><td>${esc(a.name)}</td><td class="num">${frInt(a.price)}</td><td class="num ${up ? "up" : "down"}">${signedPct(a.changePercent)}</td></tr>`,
    )
    .join("");
}

/** Document HTML complet (3 pages) du récapitulatif de cotation. */
export function renderCotationReportHtml(data: CotationReportData): string {
  const idxByCode = new Map(data.indices.map((i) => [i.code, i]));
  const dateTag = data.session.fetchedAt.slice(0, 10);
  const [yy, mm, dd] = dateTag.split("-");
  const dateFr = `${dd}/${mm}/${yy}`;
  const sessionLabel = data.session.sessionLabel || dateFr;
  const stats = data.marketStats;
  const logo = bannerLogoUri();

  const kpiCard = (code: string, label: string) => {
    const i = idxByCode.get(code);
    if (!i) return "";
    const arrow = i.variationPct >= 0 ? "▲" : "▼";
    return `<div class="kpi"><div class="label">${label}</div><div class="value">${nf2.format(i.value)} pts</div><div class="var ${cls(i.variationPct)}">${arrow} ${signedPct(i.variationPct)}</div></div>`;
  };

  const top20 = [...data.actions]
    .sort((a, b) => b.capitalization - a.capitalization)
    .slice(0, 20);

  const top20Rows = top20
    .map((a) => {
      const ytd = a.ytdPct;
      return `<tr>
        <td class="bold">${esc(a.code)} — ${esc(a.name)}</td>
        <td>${esc(abbrSector(a.sector))}</td>
        <td class="num">${frMd(a.capitalization)}</td>
        <td class="num">${frInt(a.price)}</td>
        <td class="num ${cls(a.changePercent)}">${signedPct(a.changePercent)}</td>
        <td class="num ${cls(ytd)}">${ytd == null ? "n.d." : signedPct(ytd)}</td>
        <td class="num">${frInt(a.volume)}</td>
        <td class="num">${a.hasPer ? nf1.format(a.per) + "x" : "n.d."}</td>
        <td class="num">${a.hasYield ? nf1.format(a.yieldPct) + " %" : "n.d."}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>

<!-- PAGE 1 -->
<section class="page">
  <div class="banner"><img class="logo" src="${logo}" alt="AzimutFinance"><h1>DAILY MARKET REPORT</h1><span class="datepill">${dateFr}</span></div>
  <div class="accent"></div>
  <div class="content">
    <div class="kpis">
      ${kpiCard("BRVMC", "BRVM COMPOSITE")}
      ${kpiCard("BRVM30", "BRVM 30")}
      ${kpiCard("BRVMPR", "BRVM PRESTIGE")}
    </div>
    <div class="cols">
      <div class="col-left">
        <div class="section-title">BRVM COMPOSITE · ÉVOLUTION 1 AN</div>
        ${compositeChartCard(data)}
        <div class="section-title">INDICES &amp; VOLUMES</div>
        <table>
          <thead><tr><th>Indicateur</th><th class="num">Valeur</th><th class="num">Variation</th><th class="num">YTD</th></tr></thead>
          <tbody>
            ${indexRow("BRVM COMPOSITE", idxByCode.get("BRVMC"))}
            ${indexRow("BRVM 30", idxByCode.get("BRVM30"))}
            ${indexRow("BRVM PRESTIGE", idxByCode.get("BRVMPR"))}
            ${indexRow("BRVM PRINCIPAL", idxByCode.get("BRVMPA"))}
            <tr><td class="bold">Volume transigé actions</td><td class="num">${frInt(stats.totalVolume)} titres</td><td class="num flat">—</td><td class="num flat">—</td></tr>
          </tbody>
        </table>
      </div>
      <div class="col-right">
        <div class="section-title green">▲ TOP 5 — VARIATION DU JOUR</div>
        <table>
          <thead><tr><th>Symb.</th><th>Titre</th><th class="num">Cours</th><th class="num">Var.</th></tr></thead>
          <tbody>${moverRows(data.topGainers, true)}</tbody>
        </table>
        <div class="spacer"></div>
        <div class="section-title red">▼ FLOP 5 — VARIATION DU JOUR</div>
        <table>
          <thead><tr><th>Symb.</th><th>Titre</th><th class="num">Cours</th><th class="num">Var.</th></tr></thead>
          <tbody>${moverRows(data.topLosers, false)}</tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="footer"><span>Synthèse de la dernière séance de cotation — ${esc(sessionLabel)}</span><span>Page 1 / 3 &nbsp;|&nbsp; AzimutFinance</span></div>
</section>

<!-- PAGE 2 -->
<section class="page">
  <div class="banner compact"><img class="logo" src="${logo}" alt="AzimutFinance"><h1>RÉCAP DES TITRES — TOP 20 PAR CAPITALISATION</h1><span class="datepill">${dateFr}</span></div>
  <div class="accent"></div>
  <div class="content">
    <div class="section-title">TOP 20 — CAPITALISATION, PERFORMANCE &amp; RATIOS</div>
    <table>
      <thead><tr>
        <th>Titre</th><th>Secteur</th><th class="num">Capi (Mds)</th><th class="num">Cours</th>
        <th class="num">Perf J</th><th class="num">Perf YTD</th><th class="num">Volume</th><th class="num">PER</th><th class="num">Rdt %</th>
      </tr></thead>
      <tbody>${top20Rows}</tbody>
    </table>
  </div>
  <div class="footer"><span>Récapitulatif des titres cotés</span><span>Page 2 / 3 &nbsp;|&nbsp; AzimutFinance</span></div>
</section>

<!-- PAGE 3 -->
<section class="page">
  <div class="thanks" style="background-image:url('${lastPageBgUri()}')">
    <div class="contacts">
      <div class="contact"><div class="ico">✉</div><div class="lbl">EMAIL</div><div class="val">contact@azimutfinance.com</div></div>
      <div class="contact"><div class="ico">☎</div><div class="lbl">TÉLÉPHONE</div><div class="val">+225 07 10 41 12 00</div></div>
      <div class="contact"><div class="ico">⌂</div><div class="lbl">SITE WEB</div><div class="val">www.azimutfinance.com</div></div>
    </div>
    <div class="disclaimer">Ce document est fourni à titre informatif uniquement et ne constitue ni une offre ni une recommandation d'investissement. Les données proviennent de sources jugées fiables mais ne sont pas garanties. © ${yy} AzimutFinance — Tous droits réservés.</div>
  </div>
</section>

</body></html>`;
}
