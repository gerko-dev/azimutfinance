import "server-only";

import type {
  CommoditiesWeeklyData,
  CommodityWeekly,
  LocalPrice,
} from "./commoditiesWeekly";
import { logoColorUri } from "./assets";

// ── Formatage fr-FR ──────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (n: number) => (Math.abs(n) >= 1000 ? nf0 : nf2).format(n);
const fcfa = (n: number) => nf0.format(Math.round(n));
const signedPct = (v: number | null) =>
  v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + nf1.format(v) + " %";
const cls = (v: number | null) =>
  v == null || Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
const tri = (v: number | null) =>
  v == null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "▲ " : "▼ ";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MOIS_ABBR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthTag = (iso: string) => `${MOIS_ABBR[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

const CATEGORY_LABEL: Record<string, string> = {
  agri: "Agricole",
  energy: "Énergie",
  metal: "Métal précieux",
};

type CommentaryStatus = "ok" | "no_key" | "error";
const NO_KEY_MSG = "Commentaire automatique indisponible : clé API non configurée.";
const ERROR_MSG =
  "Commentaire automatique indisponible : la recherche web a échoué ou dépassé le délai imparti. Relancez la génération.";
function commentaryFallback(status: CommentaryStatus): string {
  if (status === "no_key") return NO_KEY_MSG;
  if (status === "error") return ERROR_MSG;
  return "Commentaire indisponible pour cette matière première.";
}

// ── Graphiques SVG inline ─────────────────────────────────────────────────────
let _gid = 0;
function gid(): string {
  return "g" + (++_gid).toString(36);
}

/** Aire de prix, remplit la hauteur de son conteneur (preserveAspectRatio none). */
function areaChart(points: { date: string; value: number }[], color: string): string {
  if (points.length < 2) return "";
  const W = 1000;
  const H = 380;
  const padT = 10;
  const padB = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerH = H - padT - padB;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const base = (padT + innerH).toFixed(1);
  const area = `0,${base} ${line} ${W},${base}`;
  const id = gid();
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${id})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function sparkline(points: { date: string; value: number }[], color: string): string {
  if (points.length < 2) return "";
  const W = 220;
  const H = 46;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => 3 + (1 - (v - min) / range) * (H - 6);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:8mm;display:block">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
  </svg>`;
}

/** Saisonnalité : 12 barres (rendement mensuel moyen) autour d'une ligne zéro. */
function seasonalityChart(avg: (number | null)[]): string {
  const labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const vals = avg.map((v) => (v == null || !isFinite(v) ? 0 : v));
  const maxAbs = Math.max(0.8, ...vals.map((v) => Math.abs(v)));
  const W = 1000;
  const H = 150;
  const mid = H / 2;
  const slot = W / 12;
  const bw = slot * 0.56;
  let bars = "";
  let lbls = "";
  for (let i = 0; i < 12; i++) {
    const v = vals[i];
    const h = (Math.abs(v) / maxAbs) * (mid - 14);
    const up = v >= 0;
    const yTop = up ? mid - h : mid;
    const cx = i * slot + slot / 2;
    const color = up ? "#157347" : "#C0392B";
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${color}"/>`;
    lbls += `<text x="${cx.toFixed(1)}" y="${H - 3}" font-size="13" fill="#8A93A0" text-anchor="middle" font-family="Arial">${labels[i]}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:18mm;display:block">
    <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="#CBD2DA" stroke-width="1"/>
    ${bars}${lbls}
  </svg>`;
}

/** Performance comparée base 100 sur 1 an : une ligne par MP (couleur propre). */
function compareChart(commodities: CommodityWeekly[]): string {
  const series = commodities
    .map((c) => {
      const h = c.history1Y;
      if (h.length < 2 || h[0].value <= 0) return null;
      const base = h[0].value;
      return { color: c.color, pts: h.map((p) => (p.value / base) * 100) };
    })
    .filter((s): s is { color: string; pts: number[] } => s !== null);
  if (series.length === 0) return "";
  const all = series.flatMap((s) => s.pts);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const W = 1000;
  const H = 360;
  const padT = 8;
  const padB = 8;
  const innerH = H - padT - padB;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;
  const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  let lines = "";
  for (const s of series) {
    const n = s.pts.length;
    const d = s.pts.map((v, i) => `${x(i, n).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    lines += `<polyline points="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>`;
  }
  const y100 = y(100).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
    <line x1="0" y1="${y100}" x2="${W}" y2="${y100}" stroke="#B9C0C9" stroke-dasharray="4 4" stroke-width="1"/>
    ${lines}
  </svg>`;
}

// ── CSS (A4 portrait, thème éditorial clair) ──────────────────────────────────
const STYLE = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {}
body { font-family: Arial, Helvetica, sans-serif; color: #14171C; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.serif { font-family: Georgia, "Times New Roman", serif; }
.page { width: 210mm; height: 297mm; background: #fff; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }

.mast { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 10mm 16mm 3.5mm; }
.mast .logo { height: 8.5mm; width: auto; }
.mast .kicker { font-size: 7.5pt; letter-spacing: 2.5px; text-transform: uppercase; color: #14171C; font-weight: 700; }
.mast-rule { flex: none; border-bottom: 1.6px solid #14171C; margin: 0 16mm; }

.content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 6mm 16mm 0; gap: 4mm; }

.foot { flex: none; margin: 0 16mm; border-top: 1px solid #D7DBE0; padding: 2.5mm 0 6mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #6B7280; }

.eyebrow { font-size: 7.5pt; letter-spacing: 1.6px; text-transform: uppercase; color: #6B7280; font-weight: 700; }
.rowlabel { font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase; color: #14171C; font-weight: 700; border-bottom: 1px solid #14171C; padding-bottom: 1.2mm; margin-bottom: 2.5mm; }

.up { color: #157347; } .down { color: #C0392B; } .flat { color: #6B7280; }
.num { font-variant-numeric: tabular-nums; }

/* En-tête fiche MP */
.mphead { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; border-bottom: 1px solid #D7DBE0; padding-bottom: 3mm; }
.mphead .mpname { font-size: 25pt; font-weight: 700; line-height: 1; }
.mphead .price { text-align: right; }
.mphead .px { font-size: 21pt; font-weight: 700; }
.mphead .px .unit { font-size: 9pt; color: #6B7280; font-weight: 400; }
.mphead .wk { font-size: 11pt; font-weight: 700; margin-top: 1mm; }
.mphead .wk .muted { font-size: 7.5pt; color: #8A93A0; font-weight: 400; letter-spacing: .3px; }

/* Graphique principal — absorbe l'espace disponible */
.chart { flex: 1 1 auto; min-height: 40mm; display: flex; flex-direction: column; }
.chart .plot { flex: 1; min-height: 0; border-bottom: 1px solid #E7E9EC; }
.chart .axis { flex: none; display: flex; justify-content: space-between; font-size: 7pt; color: #8A93A0; padding-top: 1.2mm; }

/* Perfs multi-horizons */
.perf, .metrics { flex: none; }
.cells { display: flex; }
.cells .c { flex: 1; text-align: center; padding: 2mm 0; border-right: 1px solid #E7E9EC; }
.cells .c:last-child { border-right: none; }
.cells .c .k { font-size: 6.8pt; color: #8A93A0; text-transform: uppercase; letter-spacing: .4px; }
.cells .c .v { font-size: 10pt; font-weight: 700; margin-top: .6mm; }

.metrics .cells .c { padding: 2.2mm 0; }
.metrics .cells .c .v { font-size: 9.5pt; }

/* Saisonnalité */
.seas { flex: none; }

/* Bloc prix local CI */
.local { flex: none; background: #F4F6F8; border: 1px solid #E1E5EA; padding: 3mm 4mm; }
.local .lt { font-size: 9pt; font-weight: 700; }
.local .ls { font-size: 7pt; color: #8A93A0; margin-top: .4mm; }
.local .lgrid { display: flex; gap: 6mm; margin-top: 2.5mm; align-items: center; }
.local .lstat { }
.local .lstat .k { font-size: 6.8pt; color: #8A93A0; text-transform: uppercase; letter-spacing: .3px; }
.local .lstat .v { font-size: 12pt; font-weight: 700; }
.local .lstat .s { font-size: 8pt; font-weight: 700; }
.local .lspark { flex: 1; min-width: 0; }
.local .lnote { font-size: 7pt; color: #8A93A0; margin-top: 1.5mm; }

/* Analyse (commentaire) */
.analysis { flex: none; }
.analysis p { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.62; color: #14171C; text-align: justify; }
.analysis.muted p { color: #8A93A0; font-style: italic; }

/* Récap */
.lead { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; color: #14171C; padding: 1mm 0 4mm; text-align: justify; }
table { border-collapse: collapse; width: 100%; }
thead th { font-family: Arial; font-size: 7.4pt; letter-spacing: .4px; text-transform: uppercase; color: #6B7280; font-weight: 700; text-align: right; padding: 0 2.5mm 2mm; border-bottom: 1.4px solid #14171C; }
thead th.l { text-align: left; }
tbody td { font-size: 9.4pt; padding: 2.6mm 2.5mm; border-bottom: 1px solid #E7E9EC; text-align: right; }
tbody td.l { text-align: left; }
tbody td.name { font-weight: 700; }
.dot { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 50%; margin-right: 2mm; vertical-align: middle; box-shadow: inset 0 0 0 1px rgba(20,23,28,.2); }

/* Performance comparée (récap) */
.cmp-legend { display: flex; flex-wrap: wrap; gap: 1.5mm 5mm; font-size: 7.5pt; color: #4B5563; margin: 1mm 0 1.5mm; }
.cmp-legend .lg { display: inline-flex; align-items: center; }
.cmp-legend .lgdot { display: inline-block; width: 2mm; height: 2mm; border-radius: 50%; margin-right: 1.5mm; box-shadow: inset 0 0 0 1px rgba(20,23,28,.2); }
.cmp { flex: 1; min-height: 34mm; border-bottom: 1px solid #E7E9EC; }
.cmp-axis { flex: none; display: flex; justify-content: space-between; font-size: 7pt; color: #8A93A0; padding-top: 1.2mm; }

/* Cover */
.cover { flex: 1; display: flex; flex-direction: column; padding: 22mm 20mm 16mm; }
.cover .top { flex: none; display: flex; align-items: center; justify-content: space-between; }
.cover .top .logo { height: 11mm; width: auto; }
.cover .top .ed { font-size: 8pt; letter-spacing: 2.5px; text-transform: uppercase; color: #6B7280; font-weight: 700; }
.cover .hero { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.cover .kicker { font-size: 10pt; letter-spacing: 4px; text-transform: uppercase; color: #6B7280; font-weight: 700; }
.cover h1 { font-family: Georgia, serif; font-size: 46pt; line-height: 1.02; font-weight: 700; margin-top: 3mm; }
.cover .rule { border-bottom: 2.5px solid #14171C; width: 54mm; margin: 8mm 0; }
.cover .week { font-family: Georgia, serif; font-size: 16pt; color: #14171C; }
.cover .somm { flex: none; }
.cover .somm .sl { font-size: 7.5pt; letter-spacing: 1.6px; text-transform: uppercase; color: #6B7280; font-weight: 700; border-bottom: 1px solid #14171C; padding-bottom: 1.5mm; margin-bottom: 1mm; }
.cover .somm .row { display: flex; justify-content: space-between; align-items: center; padding: 1.6mm 0; border-bottom: 1px solid #ECEEF1; font-size: 9.5pt; }
.cover .somm .row .nm { font-weight: 600; }
.cover .cfoot { flex: none; margin-top: 8mm; border-top: 1px solid #D7DBE0; padding-top: 3mm; display: flex; justify-content: space-between; font-size: 8pt; color: #6B7280; }
`;

function mast(): string {
  return `<div class="mast">
    <img class="logo" src="${logoColorUri()}" alt="AzimutFinance">
    <span class="kicker">Hebdomadaire matières premières</span>
  </div><div class="mast-rule"></div>`;
}

function foot(page: number, total: number, asOfFr: string): string {
  return `<div class="foot"><span>AzimutFinance</span><span>Arrêté au ${esc(asOfFr)} · Page ${page} / ${total}</span></div>`;
}

function horizonCells(c: CommodityWeekly): string {
  const items: [string, number | null][] = [
    ["1 sem.", c.returns["1S"]],
    ["1 mois", c.returns["1M"]],
    ["3 mois", c.returns["3M"]],
    ["6 mois", c.returns["6M"]],
    ["YTD", c.returns.YTD],
    ["1 an", c.returns["1A"]],
    ["3 ans", c.returns["3A"]],
    ["5 ans", c.returns["5A"]],
  ];
  return items
    .map(
      ([k, v]) =>
        `<div class="c"><div class="k">${k}</div><div class="v num ${cls(v)}">${signedPct(v)}</div></div>`,
    )
    .join("");
}

function metricCells(c: CommodityWeekly): string {
  const range =
    c.low52w != null && c.high52w != null ? `${num(c.low52w)} – ${num(c.high52w)}` : "—";
  const vol = c.volatility1Y != null ? nf1.format(c.volatility1Y) + " %" : "—";
  const z = c.zScore1Y != null ? (c.zScore1Y >= 0 ? "+" : "") + nf2.format(c.zScore1Y) : "—";
  const dd = c.drawdownFromHigh5Y != null ? nf1.format(c.drawdownFromHigh5Y) + " %" : "—";
  return (
    `<div class="c"><div class="k">Plage 52 sem.</div><div class="v num">${range}</div></div>` +
    `<div class="c"><div class="k">Volatilité 1 an</div><div class="v num">${vol}</div></div>` +
    `<div class="c"><div class="k">z-score 1 an</div><div class="v num">${z}</div></div>` +
    `<div class="c"><div class="k">Drawdown vs PH 5A</div><div class="v num ${cls(c.drawdownFromHigh5Y)}">${dd}</div></div>`
  );
}

function localBlock(local: LocalPrice): string {
  if (local.kind === "apromac") {
    const spark = sparkline(
      local.history.slice(-48).map((p) => ({ date: p.date, value: p.value })),
      "#157347",
    );
    const tend = local.tendance
      ? `<div class="lnote">Tendance ${esc(local.tendance.label)} : ${fcfa(local.tendance.price)} ${esc(local.unit)} (non confirmé)</div>`
      : "";
    return `<div class="local">
      <div class="lt">${esc(local.title)}</div>
      <div class="ls">${esc(local.source)}</div>
      <div class="lgrid">
        <div class="lstat"><div class="k">${esc(local.latestLabel)}</div><div class="v num">${fcfa(local.price)} <span style="font-size:8pt;color:#6B7280">${esc(local.unit)}</span></div></div>
        <div class="lstat"><div class="k">vs mois préc.</div><div class="s num ${cls(local.vsPrevPct)}">${signedPct(local.vsPrevPct)}</div></div>
        <div class="lstat"><div class="k">vs déc. N-1</div><div class="s num ${cls(local.vsDecPct)}">${signedPct(local.vsDecPct)}</div></div>
        <div class="lspark">${spark}</div>
      </div>
      ${tend}
    </div>`;
  }
  // chph
  const spark = sparkline(
    local.history.map((p) => ({ date: p.date, value: p.huile })),
    "#CA8A04",
  );
  return `<div class="local">
    <div class="lt">${esc(local.title)}</div>
    <div class="ls">${esc(local.source)} · ${esc(local.periode || local.latestLabel)}</div>
    <div class="lgrid">
      <div class="lstat"><div class="k">Huile brute (${esc(local.latestLabel)})</div><div class="v num">${fcfa(local.huile)} <span style="font-size:8pt;color:#6B7280">F/t</span></div><div class="s num ${cls(local.huileVsPrevPct)}">${signedPct(local.huileVsPrevPct)} <span style="font-weight:400;color:#8A93A0;font-size:7pt">vs M-1</span></div></div>
      <div class="lstat"><div class="k">Régime palme bord-champ</div><div class="v num">${fcfa(local.regime)} <span style="font-size:8pt;color:#6B7280">F/t</span></div><div class="s num ${cls(local.regimeVsPrevPct)}">${signedPct(local.regimeVsPrevPct)} <span style="font-weight:400;color:#8A93A0;font-size:7pt">vs M-1</span></div></div>
      <div class="lspark">${spark}</div>
    </div>
  </div>`;
}

function commodityPage(
  c: CommodityWeekly,
  page: number,
  total: number,
  asOfFr: string,
  status: CommentaryStatus,
): string {
  const first = c.history1Y[0];
  const last = c.history1Y[c.history1Y.length - 1];
  const analysis = c.commentary
    ? `<div class="analysis"><div class="rowlabel">Analyse de la semaine</div><p>${esc(c.commentary)}</p></div>`
    : `<div class="analysis muted"><div class="rowlabel">Analyse de la semaine</div><p>${esc(commentaryFallback(status))}</p></div>`;

  return `<section class="page">
  ${mast()}
  <div class="content">
    <div class="mphead">
      <div>
        <div class="eyebrow">${esc(CATEGORY_LABEL[c.category] ?? c.category)} · ${esc(c.exchange)}</div>
        <div class="mpname serif">${esc(c.name)}</div>
      </div>
      <div class="price">
        <div class="px num">${num(c.last)} <span class="unit">${esc(c.unit)}</span></div>
        <div class="wk num ${cls(c.weekChangePct)}">${tri(c.weekChangePct)}${signedPct(c.weekChangePct)} <span class="muted">sur la semaine</span></div>
      </div>
    </div>

    <div class="chart">
      <div class="plot">${areaChart(c.history1Y, c.color)}</div>
      <div class="axis"><span>${first ? monthTag(first.date) : ""}</span><span>Cours quotidien · 12 mois</span><span>${last ? monthTag(last.date) : ""}</span></div>
    </div>

    <div class="perf">
      <div class="rowlabel">Performances multi-horizons</div>
      <div class="cells">${horizonCells(c)}</div>
    </div>

    <div class="metrics">
      <div class="cells">${metricCells(c)}</div>
    </div>

    <div class="seas">
      <div class="rowlabel">Saisonnalité — rendement mensuel moyen (10 ans)</div>
      ${seasonalityChart(c.seasonalityAvg)}
    </div>

    ${c.local ? localBlock(c.local) : ""}

    ${analysis}
  </div>
  ${foot(page, total, asOfFr)}
</section>`;
}

function recapRows(commodities: CommodityWeekly[]): string {
  return commodities
    .map(
      (c) => `<tr>
      <td class="l name"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</td>
      <td class="num">${num(c.last)}</td>
      <td class="num ${cls(c.weekChangePct)}">${signedPct(c.weekChangePct)}</td>
      <td class="num ${cls(c.returns.YTD)}">${signedPct(c.returns.YTD)}</td>
      <td class="num ${cls(c.returns["1A"])}">${signedPct(c.returns["1A"])}</td>
    </tr>`,
    )
    .join("");
}

/** Document HTML complet (A4 portrait) du rapport hebdo matières premières. */
export function renderCommoditiesWeeklyHtml(data: CommoditiesWeeklyData): string {
  const total = 2 + data.commodities.length + 1;
  const [yy, mm, dd] = data.asOf.split("-");
  const asOfFr = data.asOf ? `${dd}/${mm}/${yy}` : "";

  // Page de garde — éditoriale claire + sommaire chiffré
  const sommaire = data.commodities
    .map(
      (c) =>
        `<div class="row"><span class="nm"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="num ${cls(c.weekChangePct)}">${tri(c.weekChangePct)}${signedPct(c.weekChangePct)}</span></div>`,
    )
    .join("");

  const cover = `<section class="page">
  <div class="cover">
    <div class="top">
      <img class="logo" src="${logoColorUri()}" alt="AzimutFinance">
      <span class="ed">Édition hebdomadaire</span>
    </div>
    <div class="hero">
      <div class="kicker">Revue de marché</div>
      <h1>Matières<br>premières</h1>
      <div class="rule"></div>
      <div class="week serif">Semaine ${esc(data.weekLabel)}</div>
    </div>
    <div class="somm">
      <div class="sl">Au sommaire — variation hebdomadaire</div>
      ${sommaire}
    </div>
    <div class="cfoot"><span>AzimutFinance</span><span>${esc(asOfFr)}</span></div>
  </div>
</section>`;

  // Page récap
  const globalLead = data.globalCommentary
    ? `<p class="lead">${esc(data.globalCommentary)}</p>`
    : `<p class="lead">${esc(
        (data.commentaryStatus === "no_key" ? NO_KEY_MSG : ERROR_MSG) +
          " Le tableau ci-dessous reste fondé sur les données de marché.",
      )}</p>`;

  const recap = `<section class="page">
  ${mast()}
  <div class="content">
    <div class="rowlabel">Synthèse de la semaine</div>
    ${globalLead}
    <div class="rowlabel" style="margin-top:2mm">Récapitulatif — ${data.commodities.length} matières premières</div>
    <table>
      <thead><tr>
        <th class="l">Matière première</th><th>Dernier</th><th>Semaine</th><th>YTD</th><th>1 an</th>
      </tr></thead>
      <tbody>${recapRows(data.commodities)}</tbody>
    </table>
    <div class="rowlabel" style="margin-top:3mm">Performance comparée — base 100 sur 1 an</div>
    <div class="cmp-legend">${data.commodities
      .map(
        (c) =>
          `<span class="lg"><span class="lgdot" style="background:${c.color}"></span>${esc(c.name)}</span>`,
      )
      .join("")}</div>
    <div class="cmp">${compareChart(data.commodities)}</div>
    <div class="cmp-axis"><span>${data.commodities[0]?.history1Y[0] ? monthTag(data.commodities[0].history1Y[0].date) : ""}</span><span>base 100</span><span>${esc(asOfFr)}</span></div>
  </div>
  ${foot(2, total, asOfFr)}
</section>`;

  const pages = data.commodities
    .map((c, i) => commodityPage(c, 3 + i, total, asOfFr, data.commentaryStatus))
    .join("\n");

  // Dernière page — note méthodologique + sources, sobre
  const sourcesHtml =
    data.sources.length > 0
      ? `<div style="font-size:7pt;color:#8A93A0;line-height:1.45;margin-top:4mm">Sources web consultées : ${esc(data.sources.slice(0, 14).join(" · "))}</div>`
      : "";

  const back = `<section class="page">
  ${mast()}
  <div class="content">
    <div class="rowlabel">Méthodologie &amp; avertissement</div>
    <p class="analysis" style="font-family:Georgia,serif;font-size:10pt;line-height:1.6;text-align:justify">
      Les cours sont des clôtures quotidiennes des marchés internationaux de référence (ICE, NYMEX, COMEX, Bursa Malaysia, SGX). Les performances sont calculées en glissement à la date d'arrêté. Les prix de référence locaux (APROMAC pour le caoutchouc, Conseil Hévéa-Palmier pour la palme) sont des fixations officielles mensuelles en Côte d'Ivoire. Les commentaires sont produits automatiquement à partir de recherches web et de sources jugées fiables, sans garantie d'exactitude.
    </p>
    <p class="analysis" style="font-family:Georgia,serif;font-size:9.5pt;line-height:1.6;color:#6B7280;margin-top:4mm;text-align:justify">
      Ce document est fourni à titre informatif uniquement et ne constitue ni une offre, ni un conseil, ni une recommandation d'investissement.
    </p>
    ${sourcesHtml}
    <div style="flex:1"></div>
    <div style="border-top:1.6px solid #14171C;padding-top:3mm;display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div class="serif" style="font-size:15pt;font-weight:700">AzimutFinance</div>
        <div style="font-size:8pt;color:#6B7280;margin-top:1mm">contact@azimutfinance.com · +225 07 10 41 12 00 · www.azimutfinance.com</div>
      </div>
      <div style="font-size:8pt;color:#6B7280">© ${yy || ""}</div>
    </div>
  </div>
  ${foot(total, total, asOfFr)}
</section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
${cover}
${recap}
${pages}
${back}
</body></html>`;
}
