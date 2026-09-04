import "server-only";

import type {
  MoneyMarketWeeklyData,
  CountryWeekly,
  MonthlyPoint,
  MaturityBucket,
} from "./moneyMarketWeekly";
import { logoColorUri, logoHorizontalUri, lastPageBgUri, flagUri, uemoaMapSvg } from "./assets";

// ── Formatage fr-FR ──────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Montant en millions FCFA → « 1 234 Mds » / « 56,7 Mds » / « 820 M ». */
function amt(m: number): string {
  if (m >= 1000) {
    const mds = m / 1000;
    return (mds >= 100 ? nf0 : nf1).format(mds) + " Mds";
  }
  return nf0.format(Math.round(m)) + " M";
}
/** Ratio décimal → pourcentage à 2 décimales « 6,45 % ». */
const pct = (v: number | null) => (v == null || !isFinite(v) ? "—" : nf2.format(v * 100) + " %");

// Tendance de taux : hausse des taux = rouge (financement plus cher), baisse = vert.
const rateCls = (bps: number | null) =>
  bps == null || Math.abs(bps) < 1 ? "flat" : bps > 0 ? "down" : "up";
const rateTri = (bps: number | null) =>
  bps == null || Math.abs(bps) < 1 ? "" : bps > 0 ? "▲ " : "▼ ";
const bpsLabel = (bps: number | null) =>
  bps == null ? "—" : (bps >= 0 ? "+" : "−") + nf0.format(Math.abs(bps)) + " pb";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const dmShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type CommentaryStatus = "ok" | "no_key" | "error";
const NO_KEY_MSG = "Commentaire automatique indisponible : clé API non configurée.";
const ERROR_MSG =
  "Commentaire automatique indisponible : la recherche web a échoué ou dépassé le délai imparti. Relancez la génération.";
function commentaryFallback(status: CommentaryStatus): string {
  if (status === "no_key") return NO_KEY_MSG;
  if (status === "error") return ERROR_MSG;
  return "Commentaire indisponible pour cet émetteur.";
}

// ── Graphiques SVG inline ─────────────────────────────────────────────────────
/**
 * Combo mensuel avec axes : barres (volumes adjugés, Mds — échelle de gauche,
 * dégradé bi-ton du drapeau) + ligne (taux moyen pondéré, % — échelle de droite).
 * Les étiquettes d'axe sont rendues en HTML (le SVG est étiré, du texte SVG y
 * serait déformé). `code` rend l'id du dégradé unique par fiche pays.
 */
function chartBlock(
  points: MonthlyPoint[],
  color: string,
  color2: string,
  code: string,
  firstLabel: string,
  lastLabel: string,
): string {
  if (points.length === 0) {
    return `<div class="chart"><div class="cbody"><div class="plot"></div></div></div>`;
  }
  const W = 1000;
  const H = 300;
  const padT = 10;
  const padB = 8;
  const innerH = H - padT - padB;
  const maxAmt = Math.max(...points.map((p) => p.amountMds), 1);
  const yields = points.map((p) => p.yieldPct).filter((v) => v > 0);
  const ymin = yields.length ? Math.min(...yields) : 0;
  const ymax = yields.length ? Math.max(...yields) : 1;
  const yrange = ymax - ymin || 1;
  const n = points.length;
  const slot = W / n;
  const bw = Math.min(slot * 0.62, 46);
  // Barres : 0 → maxAmt sur toute la hauteur. Ligne : ymin → ymax sur toute la
  // hauteur. Les deux échelles s'alignent sur les mêmes lignes de repère.
  const yLine = (v: number) => padT + (1 - (v - ymin) / yrange) * innerH;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = (padT + f * innerH).toFixed(1);
      return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ECEEF1" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    })
    .join("");
  let bars = "";
  points.forEach((p, i) => {
    const cx = i * slot + slot / 2;
    const h = (p.amountMds / maxAmt) * innerH;
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(padT + innerH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="url(#bar-${code})" opacity="0.5"/>`;
  });
  const linePts = points
    .map((p, i) => `${(i * slot + slot / 2).toFixed(1)},${yLine(p.yieldPct).toFixed(1)}`)
    .join(" ");
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
    <defs><linearGradient id="bar-${code}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${color2}" stop-opacity="0.5"/>
    </linearGradient></defs>
    ${grid}${bars}
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
  const volTop = maxAmt >= 100 ? nf0.format(maxAmt) : nf1.format(maxAmt);
  const volMid = maxAmt >= 100 ? nf0.format(maxAmt / 2) : nf1.format(maxAmt / 2);
  return `<div class="chart">
    <div class="cbody">
      <div class="yax l"><span><b>${volTop}</b> <span class="u">Mds</span></span><span>${volMid}</span><span>0</span></div>
      <div class="plot">${svg}</div>
      <div class="yax r" style="color:${color}"><span><b>${nf1.format(ymax)}</b> <span class="u">%</span></span><span>${nf1.format((ymin + ymax) / 2)}</span><span>${nf1.format(ymin)}</span></div>
    </div>
    <div class="axis"><span>${esc(firstLabel)}</span><span>Volumes adjugés (barres) · taux moyen pondéré (ligne) · 24 mois</span><span>${esc(lastLabel)}</span></div>
  </div>`;
}

// ── CSS (A4 portrait, thème éditorial clair) ──────────────────────────────────
const STYLE = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #14171C; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.serif { font-family: Georgia, "Times New Roman", serif; }
.page { width: 210mm; height: 297mm; background: #fff; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }

.mast { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 10mm 16mm 3.5mm; }
.mast .logo { height: 8.5mm; width: auto; }
.mast .kicker { font-size: 7.5pt; letter-spacing: 2.5px; text-transform: uppercase; color: #14171C; font-weight: 700; }
.mast-rule { flex: none; border-bottom: 1.6px solid #14171C; margin: 0 16mm; }

.content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 6mm 16mm 0; gap: 3.6mm; }
.foot { flex: none; margin: 0 16mm; border-top: 1px solid #D7DBE0; padding: 2.5mm 0 6mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #6B7280; }

.eyebrow { font-size: 7.5pt; letter-spacing: 1.6px; text-transform: uppercase; color: #6B7280; font-weight: 700; }
.rowlabel { font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase; color: #14171C; font-weight: 700; border-bottom: 1px solid #14171C; padding-bottom: 1.2mm; margin-bottom: 2.5mm; }

.up { color: #157347; } .down { color: #C0392B; } .flat { color: #6B7280; }
.num { font-variant-numeric: tabular-nums; }
.dot { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 50%; margin-right: 2mm; vertical-align: middle; box-shadow: inset 0 0 0 1px rgba(20,23,28,.2); }
.flag { display: inline-block; width: 4.8mm; height: 3.6mm; margin-right: 2mm; vertical-align: middle; object-fit: cover; border: 0.4px solid rgba(20,23,28,.25); border-radius: 0.4mm; }

/* Synthèse */
.lead { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; color: #14171C; padding: 0 0 1mm; text-align: justify; }
.lead.muted { color: #8A93A0; font-style: italic; }
.kpis { display: flex; gap: 3mm; }
.kpis .k { flex: 1; background: #F4F6F8; border: 1px solid #E1E5EA; padding: 2.6mm 3mm; }
.kpis .k .kl { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .4px; color: #8A93A0; }
.kpis .k .kv { font-size: 14pt; font-weight: 700; margin-top: .6mm; }
.kpis .k .kh { font-size: 6.8pt; color: #8A93A0; margin-top: .3mm; }

table { border-collapse: collapse; width: 100%; }
thead th { font-family: Arial; font-size: 7.2pt; letter-spacing: .4px; text-transform: uppercase; color: #6B7280; font-weight: 700; text-align: right; padding: 0 2.2mm 2mm; border-bottom: 1.4px solid #14171C; }
thead th.l { text-align: left; }
tbody td { font-size: 9pt; padding: 2.1mm 2.2mm; border-bottom: 1px solid #E7E9EC; text-align: right; }
tbody td.l { text-align: left; }
tbody td.name { font-weight: 700; }
tbody td.rk { color: #8A93A0; font-weight: 700; }

/* Classement (barres horizontales) */
.rank { display: flex; flex-direction: column; gap: 1.6mm; }
.rkrow { display: grid; grid-template-columns: 42mm 1fr 22mm; align-items: center; gap: 3mm; }
.rkrow .rknm { font-size: 8.5pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rkbar { height: 4.2mm; background: #F0F2F5; border-radius: 1mm; overflow: hidden; }
.rkbar .f { height: 100%; }
.rkrow .rkval { font-size: 8.5pt; font-weight: 700; text-align: right; }

/* Calendrier */
.cal { display: flex; flex-direction: column; gap: 0; }
.calrow { display: grid; grid-template-columns: 16mm 1fr 14mm 22mm; align-items: center; gap: 2mm; padding: 1.5mm 0; border-bottom: 1px solid #ECEEF1; font-size: 8.5pt; }
.calrow .cd { font-weight: 700; color: #14171C; }
.calrow .ci { font-size: 7pt; text-transform: uppercase; letter-spacing: .4px; color: #6B7280; font-weight: 700; }
.calrow .ca { text-align: right; font-weight: 700; }
.calnote { font-size: 7.5pt; color: #8A93A0; font-style: italic; }

/* En-tête fiche pays */
.cphead { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; border-bottom: 1px solid #D7DBE0; padding-bottom: 3mm; }
.cphead .cpname { font-size: 25pt; font-weight: 700; line-height: 1; }
.cphead .yield { text-align: right; }
.cphead .yv { font-size: 21pt; font-weight: 700; }
.cphead .yv .unit { font-size: 9pt; color: #6B7280; font-weight: 400; }
.cphead .yt { font-size: 10.5pt; font-weight: 700; margin-top: 1mm; }
.cphead .yt .muted { font-size: 7.5pt; color: #8A93A0; font-weight: 400; letter-spacing: .3px; }

/* Bandeau semaine */
.week { flex: none; background: #F4F6F8; border: 1px solid #E1E5EA; padding: 2.4mm 3mm; }
.week .wl { font-size: 7pt; text-transform: uppercase; letter-spacing: .5px; color: #8A93A0; font-weight: 700; margin-bottom: 1.6mm; }
.week .cells { display: flex; }
.week .cells .c { flex: 1; text-align: center; border-right: 1px solid #E1E5EA; }
.week .cells .c:last-child { border-right: none; }
.week .cells .c .k { font-size: 6.8pt; color: #8A93A0; text-transform: uppercase; letter-spacing: .4px; }
.week .cells .c .v { font-size: 11pt; font-weight: 700; margin-top: .5mm; }
.week .quiet { font-size: 9.5pt; color: #8A93A0; font-style: italic; padding: 1mm 0; }

/* Graphique principal */
.chart { flex: none; height: 47mm; display: flex; flex-direction: column; }
.chart .cbody { flex: 1; min-height: 0; display: flex; }
.chart .yax { flex: none; width: 11mm; display: flex; flex-direction: column; justify-content: space-between; padding: .5mm 0; font-size: 6.6pt; color: #8A93A0; line-height: 1; }
.chart .yax.l { text-align: right; padding-right: 1.6mm; }
.chart .yax.r { text-align: left; padding-left: 1.6mm; }
.chart .yax b { font-weight: 700; font-size: 7pt; color: #14171C; }
.chart .yax .u { font-size: 5.6pt; letter-spacing: .2px; opacity: .75; }
.chart .plot { flex: 1; min-height: 0; border-left: 1px solid #D7DBE0; border-bottom: 1px solid #D7DBE0; }
.chart .axis { flex: none; display: flex; justify-content: space-between; font-size: 7pt; color: #8A93A0; padding-top: 1.2mm; margin: 0 11mm; }

/* Cellules génériques */
.cells-row { flex: none; }
.cells { display: flex; }
.cells .c { flex: 1; text-align: center; padding: 2mm 0; border-right: 1px solid #E7E9EC; }
.cells .c:last-child { border-right: none; }
.cells .c .k { font-size: 6.8pt; color: #8A93A0; text-transform: uppercase; letter-spacing: .4px; }
.cells .c .v { font-size: 10pt; font-weight: 700; margin-top: .6mm; }

/* Deux colonnes : split BAT/OAT + maturités */
.two { flex: none; display: flex; gap: 5mm; }
.two > div { flex: 1; }
.split { display: flex; gap: 3mm; }
.split .s { flex: 1; border: 1px solid #E1E5EA; padding: 2.2mm 2.6mm; }
.split .s.bat { background: #FEF6E7; border-color: #F3E2BD; }
.split .s.oat { background: #EEF4FE; border-color: #D6E4FA; }
.split .s .st { font-size: 7.4pt; font-weight: 700; letter-spacing: .3px; }
.split .s .sp { font-size: 16pt; font-weight: 700; }
.split .s .sl { font-size: 6.8pt; color: #6B7280; }
.split .s .sr { font-size: 7.6pt; color: #4B5563; margin-top: 1mm; }

.mat .mrow { margin-bottom: 1.6mm; }
.mat .mtop { display: flex; justify-content: space-between; font-size: 7.6pt; margin-bottom: .6mm; }
.mat .mtop .ml { font-weight: 600; color: #14171C; }
.mat .mbar { height: 1.6mm; background: #F0F2F5; border-radius: 1mm; overflow: hidden; }
.mat .mbar .f { height: 100%; }
.mat .msub { display: flex; justify-content: space-between; font-size: 6.4pt; color: #9AA2AD; margin-top: .3mm; }

/* Prochaines émissions */
.upc { flex: none; }
.upc .urow { display: grid; grid-template-columns: 16mm 14mm 1fr 22mm; align-items: center; gap: 2mm; padding: 1mm 0; border-bottom: 1px solid #ECEEF1; font-size: 8pt; }
.upc .urow .ud { font-weight: 700; }
.upc .urow .ui { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .3px; color: #6B7280; font-weight: 700; }
.upc .urow .ua { text-align: right; font-weight: 700; }

/* Analyse (commentaire) */
.analysis { flex: 1; min-height: 0; }
.analysis p { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.6; color: #14171C; text-align: justify; }
.analysis.muted p { color: #8A93A0; font-style: italic; }

/* Cover — éditoriale claire (rapport institutionnel) */
.cover { flex: 1; position: relative; display: flex; flex-direction: column; background: #fff; overflow: hidden; }
.cover-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.cover-bg .cmap { position: absolute; top: 66mm; left: 50%; width: 158mm; transform: translateX(-34%); }
.cover-bg .csky { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; display: block; }
.cover > .cv-head, .cover > .cv-rule, .cover > .cv-body, .cover > .cv-foot { position: relative; z-index: 1; }
.cv-head { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 16mm 16mm 0; }
.cv-head .azlogo { height: 13mm; width: auto; }
.cv-rule { flex: none; height: 1.8px; background: #0E2A55; margin: 5mm 16mm 0; }
.cv-body { flex: 1; min-height: 0; padding: 16mm 16mm 0; }
.cv-kick { border-left: 3px solid #1E92C9; padding-left: 4.5mm; margin-bottom: 8mm; }
.cv-kick .k1 { font-size: 10pt; letter-spacing: 3.4px; text-transform: uppercase; color: #1E92C9; font-weight: 700; }
.cv-kick .k2 { font-size: 8.5pt; letter-spacing: 2.4px; text-transform: uppercase; color: #5A6B7B; font-weight: 700; margin-top: 2.4mm; }
.cv-title { font-family: Georgia, "Times New Roman", serif; font-size: 46pt; line-height: 1.02; font-weight: 700; color: #0E2A55; }
.cv-date { display: inline-flex; align-items: center; gap: 3mm; margin-top: 9mm; background: #E8F2FA; color: #0E2A55; border-radius: 2mm; padding: 2.6mm 4.5mm; font-size: 11.5pt; font-weight: 600; }
.cv-date svg { width: 5mm; height: 5mm; flex: none; }
.cv-foot { flex: none; margin: 0 16mm; border-top: 1px solid #C9D2DC; padding: 3mm 0 10mm; display: flex; align-items: center; justify-content: space-between; font-size: 8.5pt; color: #5A6B7B; font-weight: 600; }
.cv-foot .fl { color: #0E2A55; }
/* Sommaire de la page de garde — entre la carte (filigrane) et la skyline. */
.cv-toc { position: relative; z-index: 1; margin: 0 16mm 48mm; }
.cv-toc .toc-h { font-size: 8pt; letter-spacing: 2.8px; text-transform: uppercase; color: #1E92C9; font-weight: 700; margin-bottom: 3.4mm; }
.cv-toc .toc-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14mm; row-gap: 1.9mm; }
.cv-toc .ti { display: flex; align-items: baseline; font-size: 8.6pt; color: #2A3744; }
.cv-toc .ti.full { grid-column: 1 / -1; }
.cv-toc .ti .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cv-toc .ti .t .flag { width: 4.6mm; height: 3.4mm; margin-right: 1.6mm; }
.cv-toc .ti .dots { flex: 1; border-bottom: 1px dotted #B6C2CF; margin: 0 2mm 1.1mm; min-width: 4mm; }
.cv-toc .ti .pg { font-weight: 700; color: #0E2A55; font-variant-numeric: tabular-nums; }

/* Dernière page — visuel de fond du PPT */
.thanks { flex: 1; background-position: center; background-size: cover; background-repeat: no-repeat; color: #fff; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center; padding: 0 24mm 22mm; }
.contacts { display: flex; gap: 16mm; margin-bottom: 9mm; }
.contact .ico { font-size: 15pt; }
.contact .lbl { font-size: 8pt; color: #60A5FA; font-weight: 700; letter-spacing: .5px; margin: 2mm 0 1mm; }
.contact .val { font-size: 9.5pt; }
.disclaimer { font-size: 7.5pt; color: #CBD5E1; max-width: 150mm; line-height: 1.5; }
`;

function flag(code: string): string {
  return `<img class="flag" src="${flagUri(code)}" alt="${esc(code)}">`;
}

function mast(): string {
  return `<div class="mast">
    <img class="logo" src="${logoColorUri()}" alt="AzimutFinance">
    <span class="kicker">Hebdomadaire · Marché des titres publics</span>
  </div><div class="mast-rule"></div>`;
}

function foot(page: number, total: number, asOfFr: string): string {
  return `<div class="foot"><span>AzimutFinance</span><span>Arrêté au ${esc(asOfFr)} · Page ${page} / ${total}</span></div>`;
}

function maturityBlock(rows: MaturityBucket[], color: string, color2: string): string {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const grad = `linear-gradient(90deg, ${color}, ${color2})`;
  const body = rows
    .map((r) => {
      const w = r.count > 0 ? (r.amount / max) * 100 : 0;
      return `<div class="mrow">
        <div class="mtop"><span class="ml">${esc(r.label)}</span><span class="num">${r.count > 0 ? amt(r.amount) : "—"}</span></div>
        <div class="mbar"><div class="f" style="width:${w.toFixed(1)}%;background:${grad}"></div></div>
        <div class="msub"><span>${r.count} émission${r.count > 1 ? "s" : ""}</span><span class="num">${r.count > 0 ? pct(r.yieldRate) : ""}</span></div>
      </div>`;
    })
    .join("");
  return `<div class="mat">${body}</div>`;
}

function weekStrip(c: CountryWeekly): string {
  if (c.weekCount === 0) {
    return `<div class="week">
      <div class="wl">Activité de la semaine</div>
      <div class="quiet">Aucune adjudication cette semaine — l'émetteur est resté à l'écart du guichet UMOA-Titres.</div>
    </div>`;
  }
  return `<div class="week">
    <div class="wl">Activité de la semaine — ${c.weekCount} adjudication${c.weekCount > 1 ? "s" : ""}</div>
    <div class="cells">
      <div class="c"><div class="k">Montant retenu</div><div class="v num">${amt(c.weekAmount)}</div></div>
      <div class="c"><div class="k">Soumissions</div><div class="v num">${amt(c.weekSubmitted)}</div></div>
      <div class="c"><div class="k">Couverture</div><div class="v num">${pct(c.weekCoverage)}</div></div>
      <div class="c"><div class="k">Rdt pondéré</div><div class="v num">${pct(c.weekYield)}</div></div>
    </div>
  </div>`;
}

function upcomingBlock(c: CountryWeekly): string {
  if (c.upcoming.length === 0) return "";
  const rows = c.upcoming
    .map((u) => {
      const matLbl =
        u.maturityMonths > 0
          ? u.maturityMonths >= 12
            ? `${(u.maturityMonths / 12).toFixed(u.maturityMonths % 12 === 0 ? 0 : 1)} ans`
            : `${u.maturityMonths} mois`
          : "—";
      return `<div class="urow">
        <span class="ud num">${dmShort(u.date)}</span>
        <span class="ui">${esc(u.instrument || "—")}</span>
        <span class="num" style="color:#6B7280">${matLbl}</span>
        <span class="ua num">${u.amount > 0 ? amt(u.amount) : "n.c."}</span>
      </div>`;
    })
    .join("");
  return `<div class="upc">
    <div class="rowlabel">Prochaines émissions annoncées</div>
    ${rows}
  </div>`;
}

function countryPage(
  c: CountryWeekly,
  page: number,
  total: number,
  asOfFr: string,
  status: CommentaryStatus,
): string {
  const first = c.monthly[0];
  const last = c.monthly[c.monthly.length - 1];
  const analysis = c.commentary
    ? `<div class="analysis"><div class="rowlabel">Analyse de la semaine</div><p>${esc(c.commentary)}</p></div>`
    : `<div class="analysis muted"><div class="rowlabel">Analyse de la semaine</div><p>${esc(commentaryFallback(status))}</p></div>`;

  const batShare = c.amount12m > 0 ? (c.batAmount / c.amount12m) * 100 : 0;
  const oatShare = c.amount12m > 0 ? (c.oatAmount / c.amount12m) * 100 : 0;

  return `<section class="page">
  ${mast()}
  <div class="content">
    <div class="cphead">
      <div>
        <div class="eyebrow">${flag(c.code)}Rang ${c.rank} / ${c.totalCountries} · ${nf1.format(c.sharePct)} % du marché UEMOA · capitale ${esc(c.capital)}</div>
        <div class="cpname serif">${esc(c.name)}</div>
      </div>
      <div class="yield">
        <div class="yv num">${pct(c.yield12m)} <span class="unit">rdt pondéré 12 m</span></div>
        <div class="yt num ${rateCls(c.yieldTrendBps)}">${rateTri(c.yieldTrendBps)}${bpsLabel(c.yieldTrendBps)} <span class="muted">sur 3 mois</span></div>
      </div>
    </div>

    ${weekStrip(c)}

    ${chartBlock(c.monthly, c.color, c.color2, c.code, first ? first.label : "", last ? last.label : "")}

    <div class="cells-row">
      <div class="rowlabel">Indicateurs clés — 12 mois glissants</div>
      <div class="cells">
        <div class="c"><div class="k">Émissions</div><div class="v num">${c.count12m}</div></div>
        <div class="c"><div class="k">Montant retenu</div><div class="v num">${amt(c.amount12m)}</div></div>
        <div class="c"><div class="k">Couverture</div><div class="v num">${pct(c.coverage12m)}</div></div>
        <div class="c"><div class="k">Maturité moy.</div><div class="v num">${nf1.format(c.avgMaturity)} ans</div></div>
        <div class="c"><div class="k">ISIN distincts</div><div class="v num">${c.uniqIsins}</div></div>
      </div>
    </div>

    <div class="two">
      <div>
        <div class="rowlabel">Court terme / moyen-long terme</div>
        <div class="split">
          <div class="s bat">
            <div class="st" style="color:#92660A">BAT · court terme</div>
            <div class="sp num">${nf0.format(batShare)} %</div>
            <div class="sl">${c.batCount} émission${c.batCount > 1 ? "s" : ""} · ${amt(c.batAmount)}</div>
            <div class="sr num">Rdt pondéré ${pct(c.batYield)}</div>
          </div>
          <div class="s oat">
            <div class="st" style="color:#1D4ED8">OAT · moyen-long terme</div>
            <div class="sp num">${nf0.format(oatShare)} %</div>
            <div class="sl">${c.oatCount} émission${c.oatCount > 1 ? "s" : ""} · ${amt(c.oatAmount)}</div>
            <div class="sr num">Rdt pondéré ${pct(c.oatYield)}</div>
          </div>
        </div>
      </div>
      <div>
        <div class="rowlabel">Répartition par maturité (12 m)</div>
        ${maturityBlock(c.maturityRows, c.color, c.color2)}
      </div>
    </div>

    ${upcomingBlock(c)}

    ${analysis}
  </div>
  ${foot(page, total, asOfFr)}
</section>`;
}

function rankingBars(countries: CountryWeekly[]): string {
  const max = Math.max(...countries.map((c) => c.amount12m), 1);
  const body = countries
    .map((c) => {
      const w = (c.amount12m / max) * 100;
      return `<div class="rkrow">
        <div class="rknm">${flag(c.code)}${esc(c.name)}</div>
        <div class="rkbar"><div class="f" style="width:${w.toFixed(1)}%;background:linear-gradient(90deg, ${c.color}, ${c.color2})"></div></div>
        <div class="rkval num">${amt(c.amount12m)}</div>
      </div>`;
    })
    .join("");
  return `<div class="rank">${body}</div>`;
}

function synthesisRows(countries: CountryWeekly[]): string {
  return countries
    .map(
      (c) => `<tr>
      <td class="l rk">${c.rank}</td>
      <td class="l name">${flag(c.code)}${esc(c.name)}</td>
      <td class="num">${c.weekCount > 0 ? c.weekCount : "—"}</td>
      <td class="num">${c.weekCount > 0 ? amt(c.weekAmount) : "—"}</td>
      <td class="num">${pct(c.weekYield)}</td>
      <td class="num">${pct(c.yield12m)}</td>
      <td class="num ${rateCls(c.yieldTrendBps)}">${rateTri(c.yieldTrendBps)}${bpsLabel(c.yieldTrendBps)}</td>
    </tr>`,
    )
    .join("");
}

function calendarBlock(data: MoneyMarketWeeklyData): string {
  if (data.calendar.length === 0) {
    return `<div class="calnote">Aucune adjudication annoncée pour la semaine à venir au moment de l'arrêté.</div>`;
  }
  const rows = data.calendar
    .map(
      (it) => `<div class="calrow">
      <span class="cd num">${dmShort(it.date)}</span>
      <span>${flag(it.code)}${esc(it.name)}</span>
      <span class="ci">${esc(it.instrument || "—")}</span>
      <span class="ca num">${it.amount > 0 ? amt(it.amount) : "n.c."}</span>
    </div>`,
    )
    .join("");
  return `<div class="cal">${rows}</div>`;
}

// Skyline financière (silhouette de tours + bâtiment classique) en bas de page.
const COVER_SKYLINE = `<svg class="csky" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax meet">
  <g fill="#E6EEF7">
    <rect x="34" y="116" width="72" height="184"/>
    <rect x="128" y="86" width="56" height="214"/>
    <rect x="250" y="108" width="82" height="192"/>
    <rect x="686" y="98" width="62" height="202"/>
    <rect x="800" y="78" width="72" height="222"/>
    <rect x="902" y="112" width="84" height="188"/>
  </g>
  <g fill="#D3E0EF">
    <rect x="0" y="160" width="58" height="140"/>
    <rect x="62" y="118" width="46" height="182"/>
    <rect x="150" y="150" width="62" height="150"/>
    <rect x="300" y="134" width="50" height="166"/>
    <rect x="354" y="170" width="62" height="130"/>
    <rect x="612" y="138" width="48" height="162"/>
    <rect x="664" y="176" width="60" height="124"/>
    <rect x="742" y="128" width="46" height="172"/>
    <rect x="866" y="150" width="54" height="150"/>
    <rect x="952" y="176" width="48" height="124"/>
  </g>
  <g fill="#C6D6E8">
    <polygon points="414,150 500,108 586,150"/>
    <rect x="420" y="150" width="160" height="14"/>
    <rect x="430" y="164" width="140" height="124"/>
    <g fill="#DCE6F2">
      <rect x="442" y="174" width="14" height="104"/>
      <rect x="466" y="174" width="14" height="104"/>
      <rect x="490" y="174" width="14" height="104"/>
      <rect x="514" y="174" width="14" height="104"/>
      <rect x="538" y="174" width="14" height="104"/>
    </g>
    <rect x="404" y="288" width="192" height="12"/>
  </g>
</svg>`;

/** Document HTML complet (A4 portrait) du rapport hebdo marché des titres publics. */
export function renderMoneyMarketWeeklyHtml(data: MoneyMarketWeeklyData): string {
  const total = 2 + data.countries.length + 1;
  const [yy, mm, dd] = data.asOf.split("-");
  const asOfFr = data.asOf ? `${dd}/${mm}/${yy}` : "";

  // Page de garde — éditoriale claire : logo, kickers, titre serif, pastille de
  // date, fond carte UEMOA + skyline financière.
  const cover = `<section class="page">
  <div class="cover">
    <div class="cover-bg">${uemoaMapSvg()}${COVER_SKYLINE}</div>
    <div class="cv-head">
      <img class="azlogo" src="${logoHorizontalUri()}" alt="AzimutFinance">
    </div>
    <div class="cv-rule"></div>
    <div class="cv-body">
      <div class="cv-kick">
        <div class="k1">Édition hebdomadaire</div>
        <div class="k2">Marché monétaire · UEMOA</div>
      </div>
      <div class="cv-title">Marché des<br>titres publics</div>
      <div class="cv-date">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0E2A55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>
        Semaine ${esc(data.weekLabel)}
      </div>
    </div>
    <div class="cv-toc">
      <div class="toc-h">Au sommaire</div>
      <div class="toc-grid">
        <div class="ti full"><span class="t">Synthèse régionale de la semaine</span><span class="dots"></span><span class="pg">2</span></div>
        ${data.countries
          .map(
            (c, i) =>
              `<div class="ti"><span class="t">${flag(c.code)}${esc(c.name)}</span><span class="dots"></span><span class="pg">${3 + i}</span></div>`,
          )
          .join("")}
      </div>
    </div>
    <div class="cv-foot"><span class="fl">AzimutFinance</span><span>${esc(asOfFr)}</span></div>
  </div>
</section>`;

  // Page synthèse régionale.
  const globalLead = data.globalCommentary
    ? `<p class="lead">${esc(data.globalCommentary)}</p>`
    : `<p class="lead muted">${esc(
        (data.commentaryStatus === "no_key" ? NO_KEY_MSG : ERROR_MSG) +
          " Les chiffres ci-dessous restent fondés sur les adjudications UMOA-Titres.",
      )}</p>`;

  const synthesis = `<section class="page">
  ${mast()}
  <div class="content">
    <div class="rowlabel">Synthèse de la semaine — ${data.countries.length} États de l'UEMOA</div>
    ${globalLead}
    <div class="kpis">
      <div class="k"><div class="kl">Adjudications</div><div class="kv num">${data.weekTotalCount}</div><div class="kh">cette semaine</div></div>
      <div class="k"><div class="kl">Montant retenu</div><div class="kv num">${amt(data.weekTotalAmount)}</div><div class="kh">total UEMOA</div></div>
      <div class="k"><div class="kl">Couverture</div><div class="kv num">${pct(data.weekCoverage)}</div><div class="kh">soumis / proposé</div></div>
      <div class="k"><div class="kl">Rdt pondéré</div><div class="kv num">${pct(data.weekYield)}</div><div class="kh">toutes maturités</div></div>
    </div>

    <div class="cells-row">
      <div class="rowlabel" style="margin-top:1mm">Activité par État</div>
      <table>
        <thead><tr>
          <th class="l">#</th><th class="l">État émetteur</th><th>Adj. sem.</th><th>Montant sem.</th><th>Rdt sem.</th><th>Rdt 12 m</th><th>Tend. 3 m</th>
        </tr></thead>
        <tbody>${synthesisRows(data.countries)}</tbody>
      </table>
    </div>

    <div class="two">
      <div>
        <div class="rowlabel">Classement par montant levé — 12 mois (${amt(data.total12mAmount)} au total)</div>
        ${rankingBars(data.countries)}
      </div>
      <div>
        <div class="rowlabel">Calendrier de la semaine à venir</div>
        ${calendarBlock(data)}
      </div>
    </div>
  </div>
  ${foot(2, total, asOfFr)}
</section>`;

  const pages = data.countries
    .map((c, i) => countryPage(c, 3 + i, total, asOfFr, data.commentaryStatus))
    .join("\n");

  const back = `<section class="page">
  <div class="thanks" style="background-image:url('${lastPageBgUri()}')">
    <div class="contacts">
      <div class="contact"><div class="ico">✉</div><div class="lbl">EMAIL</div><div class="val">contact@azimutfinance.com</div></div>
      <div class="contact"><div class="ico">☎</div><div class="lbl">TÉLÉPHONE</div><div class="val">+225 07 78 88 62 25</div></div>
      <div class="contact"><div class="ico">⌂</div><div class="lbl">SITE WEB</div><div class="val">www.azimutfinance.com</div></div>
    </div>
    <div class="disclaimer">Ce document est fourni à titre informatif uniquement et ne constitue ni une offre ni une recommandation d'investissement. Données issues d'UMOA-Titres / Agence UMOA-Titres, jugées fiables mais non garanties. Montants en FCFA. © ${yy || ""} AzimutFinance — Tous droits réservés.</div>
  </div>
</section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
${cover}
${synthesis}
${pages}
${back}
</body></html>`;
}
