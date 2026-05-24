import "server-only";

import type { CommoditiesWeeklyData, CommodityWeekly } from "./commoditiesWeekly";
import { bannerLogoUri, lastPageBgUri } from "./assets";

// ── Formatage fr-FR ──────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (n: number) => (Math.abs(n) >= 1000 ? nf0 : nf2).format(n);
const signedPct = (v: number | null) =>
  v == null || !isFinite(v) ? "n.d." : (v >= 0 ? "+" : "") + nf2.format(v) + " %";
const cls = (v: number | null) =>
  v == null || Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
const arrow = (v: number | null) =>
  v == null || Math.abs(v) < 1e-9 ? "→" : v > 0 ? "▲" : "▼";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MOIS_ABBR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthTag = (iso: string) => {
  const [, m, y] = [iso.slice(0, 4), iso.slice(5, 7), iso.slice(0, 4)];
  void m;
  const mm = Number(iso.slice(5, 7));
  return `${MOIS_ABBR[mm - 1]} ${y.slice(2)}`;
};

const CATEGORY: Record<string, { label: string; color: string }> = {
  agri: { label: "Agricole", color: "#16A34A" },
  energy: { label: "Énergie", color: "#334155" },
  metal: { label: "Métal précieux", color: "#CA8A04" },
};

// ── Graphique en aire (SVG inline) ───────────────────────────────────────────
function areaChart(points: { date: string; value: number }[], color: string, height = "44mm"): string {
  if (points.length < 2) return "";
  const W = 800;
  const H = 300;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const base = (padT + innerH).toFixed(1);
  const area = `${padL.toFixed(1)},${base} ${line} ${(padL + innerW).toFixed(1)},${base}`;
  const gid = "g" + Math.abs(hashStr(color + points.length)).toString(36);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${height};display:block">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function sparkline(points: { date: string; value: number }[], color: string): string {
  if (points.length < 2) return "";
  const W = 200;
  const H = 48;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => 3 + (1 - (v - min) / range) * (H - 6);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:9mm;display:block">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// ── CSS (A4 portrait) ─────────────────────────────────────────────────────────
const STYLE = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; background: #fff; page-break-after: always; }
.page:last-child { page-break-after: auto; }

/* Bandeau */
.banner { background: #0A2A5E; color: #fff; padding: 7mm 14mm; display: flex; justify-content: space-between; align-items: center; gap: 6mm; }
.banner .logo { height: 11mm; width: auto; flex: none; }
.banner .heading { text-align: right; }
.banner .heading .t { font-size: 13pt; font-weight: 800; letter-spacing: .4px; }
.banner .heading .s { font-size: 8.5pt; color: #93C5FD; font-weight: 600; margin-top: .5mm; }
.accent { height: 1.6mm; background: #2563EB; }
.content { padding: 8mm 14mm 0; }
.footer { position: absolute; bottom: 6mm; left: 14mm; right: 14mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 2mm; }

/* Cover */
.cover { position: absolute; inset: 0; background: #0A2A5E; color: #fff; display: flex; flex-direction: column; padding: 26mm 22mm; }
.cover::after { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 80% at 80% 110%, rgba(37,99,235,.22), transparent 60%); pointer-events: none; }
.cover > * { position: relative; z-index: 1; }
.cover .logo { height: 16mm; width: auto; }
.cover .mid { margin-top: auto; margin-bottom: auto; }
.cover .kicker { font-size: 10pt; letter-spacing: 3px; color: #60A5FA; font-weight: 700; text-transform: uppercase; }
.cover h1 { font-size: 34pt; font-weight: 800; line-height: 1.08; margin: 4mm 0 3mm; }
.cover .sub { font-size: 13pt; color: #CBD5E1; font-weight: 500; }
.cover .rule { width: 40mm; height: 3px; background: #2563EB; margin: 8mm 0; }
.cover .week { display: inline-block; background: rgba(37,99,235,.18); border: 1px solid #2563EB; color: #DBEAFE; font-weight: 700; font-size: 12pt; padding: 2.5mm 7mm; border-radius: 30px; }
.cover .foot { font-size: 9pt; color: #93A4C4; display: flex; justify-content: space-between; align-items: end; }

/* Récap */
.lead { font-size: 9.5pt; line-height: 1.55; color: #1E293B; background: #F8FAFC; border-left: 4px solid #2563EB; border-radius: 6px; padding: 4mm 5mm; margin-bottom: 5mm; }
.lead .lbl { display: block; font-size: 8pt; font-weight: 800; color: #2563EB; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 1.5mm; }
.section-title { font-size: 11pt; font-weight: 800; margin: 0 0 2.5mm; color: #0F172A; }
table { border-collapse: collapse; width: 100%; font-size: 8.8pt; }
th { background: #0F172A; color: #fff; text-align: left; padding: 2mm 2.5mm; font-size: 7.8pt; font-weight: 700; }
td { padding: 2mm 2.5mm; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
tbody tr:nth-child(even) td { background: #F8FAFC; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.up { color: #16A34A; font-weight: 700; } .down { color: #DC2626; font-weight: 700; } .flat { color: #64748B; }
.bold { font-weight: 700; }
.dot { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 50%; margin-right: 2mm; vertical-align: middle; box-shadow: inset 0 0 0 1px rgba(15,23,42,.25); }

/* Page MP */
.mp-head { display: flex; align-items: baseline; gap: 3mm; border-bottom: 2px solid #E2E8F0; padding-bottom: 3mm; }
.mp-head h2 { font-size: 19pt; font-weight: 800; }
.cat { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: #fff; padding: 1mm 2.5mm; border-radius: 4px; }
.mp-meta { margin-left: auto; text-align: right; font-size: 8pt; color: #64748B; }
.priceRow { display: flex; align-items: flex-end; gap: 6mm; margin: 4mm 0; }
.priceRow .px { font-size: 26pt; font-weight: 800; line-height: 1; }
.priceRow .unit { font-size: 9pt; color: #64748B; font-weight: 600; }
.priceRow .wk { font-size: 14pt; font-weight: 800; }
.priceRow .wklbl { font-size: 7.5pt; color: #94A3B8; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; }
.chartwrap { border: 1px solid #E2E8F0; border-radius: 8px; padding: 3mm 3mm 1.5mm; background: #F8FAFC; }
.chartwrap .axis { display: flex; justify-content: space-between; font-size: 7pt; color: #94A3B8; margin-top: .5mm; }
.statgrid { display: flex; gap: 0; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin: 4mm 0; }
.statgrid .cell { flex: 1; padding: 2.8mm 3mm; border-right: 1px solid #E2E8F0; text-align: center; }
.statgrid .cell:last-child { border-right: none; }
.statgrid .k { font-size: 7pt; color: #94A3B8; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
.statgrid .v { font-size: 11pt; font-weight: 800; margin-top: .8mm; }
.brvm { background: #F1F5F9; border-radius: 8px; padding: 3.5mm 4mm; margin-bottom: 4mm; font-size: 8.6pt; line-height: 1.5; }
.brvm .lbl { font-size: 7.5pt; font-weight: 800; color: #2563EB; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 1.5mm; }
.badges { margin-top: 2mm; }
.badge { display: inline-block; font-size: 7.5pt; font-weight: 700; background: #fff; border: 1px solid #CBD5E1; color: #334155; padding: .8mm 2mm; border-radius: 4px; margin: 0 1.5mm 1.5mm 0; }
.comment { border: 1px solid #DBEAFE; background: #EFF6FF; border-radius: 8px; padding: 4mm 5mm; }
.comment .lbl { font-size: 8pt; font-weight: 800; color: #1D4ED8; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2mm; display: flex; align-items: center; gap: 2mm; }
.comment p { font-size: 9.5pt; line-height: 1.6; color: #1E293B; }
.comment.muted { border-color: #E2E8F0; background: #F8FAFC; }
.comment.muted p { color: #94A3B8; font-style: italic; }

/* Dernière page */
.thanks { position: absolute; inset: 0; background-position: center; background-size: cover; background-repeat: no-repeat; color: #fff; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center; padding: 0 24mm 22mm; }
.contacts { display: flex; gap: 14mm; margin-bottom: 9mm; }
.contact .ico { font-size: 15pt; }
.contact .lbl { font-size: 8pt; color: #60A5FA; font-weight: 700; letter-spacing: .5px; margin: 2mm 0 1mm; }
.contact .val { font-size: 9.5pt; }
.disclaimer { font-size: 7.5pt; color: #CBD5E1; max-width: 150mm; line-height: 1.5; }
.sources { font-size: 6.8pt; color: #64748B; max-width: 150mm; line-height: 1.4; margin-top: 5mm; }
`;

function banner(): string {
  return `<div class="banner">
    <img class="logo" src="${bannerLogoUri()}" alt="AzimutFinance">
    <div class="heading"><div class="t">HEBDO MATIÈRES PREMIÈRES</div><div class="s">BRVM · UEMOA — Afrique de l'Ouest</div></div>
  </div><div class="accent"></div>`;
}

function footer(page: number, total: number, asOfFr: string): string {
  return `<div class="footer"><span>Données arrêtées au ${esc(asOfFr)}</span><span>Page ${page} / ${total} &nbsp;|&nbsp; AzimutFinance</span></div>`;
}

function recapRows(commodities: CommodityWeekly[]): string {
  return commodities
    .map((c) => {
      return `<tr>
      <td class="bold"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</td>
      <td class="num">${num(c.last)}</td>
      <td class="num ${cls(c.weekChangePct)}">${signedPct(c.weekChangePct)}</td>
      <td class="num ${cls(c.returns.YTD)}">${signedPct(c.returns.YTD)}</td>
      <td class="num ${cls(c.returns["1A"])}">${signedPct(c.returns["1A"])}</td>
      <td style="width:26mm">${sparkline(c.history1Y, c.color)}</td>
    </tr>`;
    })
    .join("");
}

function statCell(k: string, v: string, c?: string): string {
  return `<div class="cell"><div class="k">${k}</div><div class="v ${c ?? ""}">${v}</div></div>`;
}

function commodityPage(
  c: CommodityWeekly,
  page: number,
  total: number,
  asOfFr: string,
  commentaryAvailable: boolean,
): string {
  const cat = CATEGORY[c.category] ?? { label: c.category, color: "#475569" };
  const range52 =
    c.low52w != null && c.high52w != null
      ? `${num(c.low52w)} – ${num(c.high52w)}`
      : "n.d.";
  const first = c.history1Y[0];
  const last = c.history1Y[c.history1Y.length - 1];

  const commentHtml = c.commentary
    ? `<div class="comment"><div class="lbl">🔍 Ce qui a bougé cette semaine</div><p>${esc(c.commentary)}</p></div>`
    : `<div class="comment muted"><div class="lbl">Ce qui a bougé cette semaine</div><p>${
        commentaryAvailable
          ? "Commentaire indisponible pour cette matière première."
          : "Commentaire automatique indisponible (clé API Claude non configurée)."
      }</p></div>`;

  return `<section class="page">
  ${banner()}
  <div class="content">
    <div class="mp-head">
      <h2>${esc(c.name)}</h2>
      <span class="cat" style="background:${cat.color}">${esc(cat.label)}</span>
      <div class="mp-meta">${esc(c.exchange)}<br>${esc(c.unit)}</div>
    </div>

    <div class="priceRow">
      <div>
        <div class="px">${num(c.last)} <span class="unit">${esc(c.unit.replace(/^USD\s*/, "$"))}</span></div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="wklbl">Variation semaine</div>
        <div class="wk ${cls(c.weekChangePct)}">${arrow(c.weekChangePct)} ${signedPct(c.weekChangePct)}</div>
      </div>
    </div>

    <div class="chartwrap">
      ${areaChart(c.history1Y, c.color, "48mm")}
      <div class="axis"><span>${first ? monthTag(first.date) : ""}</span><span>${last ? monthTag(last.date) : ""} · 1 an</span></div>
    </div>

    <div class="statgrid">
      ${statCell("YTD", signedPct(c.returns.YTD), cls(c.returns.YTD))}
      ${statCell("1 mois", signedPct(c.returns["1M"]), cls(c.returns["1M"]))}
      ${statCell("3 mois", signedPct(c.returns["3M"]), cls(c.returns["3M"]))}
      ${statCell("1 an", signedPct(c.returns["1A"]), cls(c.returns["1A"]))}
      ${statCell("Volatilité 1A", c.volatility1Y != null ? nf0.format(c.volatility1Y) + " %" : "n.d.")}
      ${statCell("Plage 52 sem.", range52)}
    </div>

    <div class="brvm">
      <div class="lbl">Enjeu BRVM / UEMOA</div>
      ${esc(c.brvmRelevance)}
      <div class="badges">
        ${c.exposedCountries.map((p) => `<span class="badge">${esc(p)}</span>`).join("")}
        ${c.brvmTickers.map((t) => `<span class="badge" style="border-color:#2563EB;color:#1D4ED8">${esc(t)}</span>`).join("")}
      </div>
    </div>

    ${commentHtml}
  </div>
  ${footer(page, total, asOfFr)}
</section>`;
}

/** Document HTML complet (A4 portrait) du rapport hebdo matières premières. */
export function renderCommoditiesWeeklyHtml(data: CommoditiesWeeklyData): string {
  const total = 2 + data.commodities.length + 1;
  const [yy, mm, dd] = data.asOf.split("-");
  const asOfFr = data.asOf ? `${dd}/${mm}/${yy}` : "";

  // Page de garde
  const cover = `<section class="page">
  <div class="cover">
    <img class="logo" src="${bannerLogoUri()}" alt="AzimutFinance">
    <div class="mid">
      <div class="kicker">Rapport hebdomadaire</div>
      <h1>Matières<br>premières</h1>
      <div class="sub">Marché mondial &amp; lecture BRVM / UEMOA</div>
      <div class="rule"></div>
      <span class="week">Semaine ${esc(data.weekLabel)}</span>
    </div>
    <div class="foot"><span>AzimutFinance — Données financières BRVM / UEMOA</span><span>${esc(asOfFr)}</span></div>
  </div>
</section>`;

  // Page récap
  const recap = `<section class="page">
  ${banner()}
  <div class="content">
    <div class="section-title">Synthèse de la semaine</div>
    ${
      data.globalCommentary
        ? `<div class="lead"><span class="lbl">🔍 Vue d'ensemble</span>${esc(data.globalCommentary)}</div>`
        : `<div class="lead"><span class="lbl">Vue d'ensemble</span>Commentaire automatique indisponible (clé API Claude non configurée). Le tableau ci-dessous reste basé sur les données de marché.</div>`
    }
    <div class="section-title">Récapitulatif — ${data.commodities.length} matières premières</div>
    <table>
      <thead><tr>
        <th>Matière première</th><th class="num">Dernier</th><th class="num">Semaine</th>
        <th class="num">YTD</th><th class="num">1 an</th><th>Évolution 1 an</th>
      </tr></thead>
      <tbody>${recapRows(data.commodities)}</tbody>
    </table>
  </div>
  ${footer(2, total, asOfFr)}
</section>`;

  const pages = data.commodities
    .map((c, i) => commodityPage(c, 3 + i, total, asOfFr, data.commentaryAvailable))
    .join("\n");

  const sourcesHtml =
    data.sources.length > 0
      ? `<div class="sources">Sources consultées : ${esc(data.sources.slice(0, 12).join(" · "))}</div>`
      : "";

  const back = `<section class="page">
  <div class="thanks" style="background-image:url('${lastPageBgUri()}')">
    <div class="contacts">
      <div class="contact"><div class="ico">✉</div><div class="lbl">EMAIL</div><div class="val">contact@azimutfinance.com</div></div>
      <div class="contact"><div class="ico">☎</div><div class="lbl">TÉLÉPHONE</div><div class="val">+225 07 10 41 12 00</div></div>
      <div class="contact"><div class="ico">⌂</div><div class="lbl">SITE WEB</div><div class="val">www.azimutfinance.com</div></div>
    </div>
    <div class="disclaimer">Ce document est fourni à titre informatif uniquement et ne constitue ni une offre ni une recommandation d'investissement. Les commentaires sont générés automatiquement à partir de recherches web et de sources jugées fiables, sans garantie d'exactitude. © ${yy || ""} AzimutFinance — Tous droits réservés.</div>
    ${sourcesHtml}
  </div>
</section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
${cover}
${recap}
${pages}
${back}
</body></html>`;
}
