import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

import type {
  BandeAnticipation,
  LigneAction,
  LigneIndice,
  LigneObligation,
  RapportComite,
} from "./types";

// === Rapport du comité d'investissement — rendu HTML ===
//
// Rendu en A4 PAYSAGE, une section par page, pour retrouver la lecture du
// template PowerPoint dont le comité a l'habitude. Chaque page porte en haut à
// droite le numéro de slide correspondant du template : c'est le repère de
// relecture du comité.
//
// Le HTML est AUTONOME — CSS inline, images en data URI. Chromium le rend via
// setContent(), sans base URL ni serveur : toute ressource réseau échouerait
// silencieusement et laisserait un trou dans le PDF.

// ── Formatage fr-FR (mêmes conventions que lib/reports/cotationReportHtml.ts)
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const frInt = (n: number | null) => (n === null ? "—" : nf0.format(Math.round(n)));
const fr1 = (n: number | null) => (n === null ? "—" : nf1.format(n));
const fr2 = (n: number | null) => (n === null ? "—" : nf2.format(n));
const pct = (v: number | null, d = 2) =>
  v === null ? "—" : (d === 1 ? nf1 : nf2).format(v) + " %";
const pctSigne = (v: number | null, d = 2) =>
  v === null ? "—" : (v >= 0 ? "+" : "") + (d === 1 ? nf1 : nf2).format(v) + " %";
/** Un taux stocké en décimal (0,0615) affiché en pourcentage. */
const tauxDec = (v: number | null) => (v === null ? "—" : nf2.format(v * 100) + " %");
/** Millions de FCFA → milliards, l'unité dans laquelle le comité raisonne. */
const mds = (millions: number | null) =>
  millions === null ? "—" : nf1.format(millions / 1000) + " Mds";

const sens = (v: number | null) =>
  v === null || Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const dateFr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "—");
};

const dateLongueFr = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dateFr(iso);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// ── Logo NSIA Asset Management, embarqué ─────────────────────────────────────
// Extrait du template PowerPoint fourni (ppt/media/image7.png, variante fond
// clair). Le logo du dossier logo/ du dépôt est celui d'AzimutFinance : ce
// rapport sort au nom de la société de gestion, pas du portail.
let _logo: string | null = null;
function logoNsia(): string {
  if (_logo === null) {
    const buf = readFileSync(
      join(process.cwd(), "public", "nsia", "nsia-asset-management.png"),
    );
    _logo = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return _logo;
}

// ── Charpente ────────────────────────────────────────────────────────────────

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1b2437;
  background: #fff;
  -webkit-print-color-adjust: exact;
}
.page {
  position: relative;
  width: 297mm;
  height: 210mm;
  padding: 11mm 13mm 14mm;
  page-break-after: always;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }

/* Bandeau de tête : rappelle le fil du template (famille de marché + titre). */
.tete { display: flex; align-items: flex-end; justify-content: space-between;
  border-bottom: 2px solid #1b2f5e; padding-bottom: 4mm; margin-bottom: 6mm; }
.fil { font-size: 8pt; letter-spacing: .12em; text-transform: uppercase;
  color: #9aa4bb; font-weight: 600; }
.titre { font-size: 17pt; font-weight: 700; color: #1b2f5e; line-height: 1.15;
  margin-top: 1mm; }
.slide { font-size: 8pt; color: #9aa4bb; text-align: right; white-space: nowrap; }
.slide b { display: block; font-size: 13pt; color: #1b2f5e; }

.pied { position: absolute; left: 13mm; right: 13mm; bottom: 6mm;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 7.5pt; color: #9aa4bb; border-top: 1px solid #e6e9f0; padding-top: 2mm; }

table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
th { background: #1b2f5e; color: #fff; font-weight: 600; text-align: right;
  padding: 2mm 2.4mm; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
td { padding: 1.7mm 2.4mm; text-align: right; border-bottom: 1px solid #eceff5;
  font-variant-numeric: tabular-nums; }
tbody tr:nth-child(even) td { background: #f7f9fc; }
.up { color: #067a4b; font-weight: 600; }
.down { color: #c0303b; font-weight: 600; }
.flat { color: #6b7488; }
.mono { font-weight: 600; color: #1b2f5e; }
.sub { font-size: 7.5pt; color: #8b94a8; font-weight: 400; }

.grille2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
.grille3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
.bloc-titre { font-size: 9.5pt; font-weight: 700; color: #1b2f5e;
  margin-bottom: 2.5mm; text-transform: uppercase; letter-spacing: .04em; }

.tuiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm;
  margin-bottom: 6mm; }
.tuile { border: 1px solid #e2e7f0; border-left: 3px solid #c8a33c;
  border-radius: 2px; padding: 3mm 3.5mm; }
.tuile .lib { font-size: 7.5pt; color: #8b94a8; text-transform: uppercase;
  letter-spacing: .06em; }
.tuile .val { font-size: 14pt; font-weight: 700; color: #1b2f5e; margin-top: 1mm;
  font-variant-numeric: tabular-nums; }
.tuile .det { font-size: 7.5pt; color: #8b94a8; margin-top: .5mm; }

.methode { background: #f7f9fc; border: 1px solid #e2e7f0; border-radius: 2px;
  padding: 4mm; font-size: 8pt; line-height: 1.55; color: #47506a;
  white-space: pre-line; }
.avert { background: #fdf6e6; border: 1px solid #e8d69a; border-radius: 2px;
  padding: 3mm 4mm; font-size: 8pt; color: #6b551b; margin-bottom: 5mm; }
.badge { display: inline-block; padding: .4mm 1.6mm; border-radius: 2px;
  font-size: 7pt; font-weight: 700; }
.badge.sous { background: #e2f4ea; color: #067a4b; }
.badge.sur { background: #fbe8ea; color: #c0303b; }
.badge.neutre { background: #eef1f6; color: #6b7488; }
.vide { font-size: 8.5pt; color: #8b94a8; font-style: italic; padding: 6mm 0; }

/* Couverture */
.couv { display: flex; flex-direction: column; justify-content: space-between;
  background: #1b2f5e; color: #fff; }
.couv .logo { background: #fff; padding: 5mm 7mm; border-radius: 3px;
  align-self: flex-start; }
.couv .logo img { height: 20mm; display: block; }
.couv h1 { font-size: 30pt; font-weight: 700; margin: 0 0 3mm; line-height: 1.1; }
.couv .st { font-size: 12pt; color: #c8a33c; font-weight: 600;
  letter-spacing: .08em; text-transform: uppercase; }
.couv .bornes { display: flex; gap: 12mm; margin-top: 9mm; }
.couv .borne .l { font-size: 8pt; color: #93a2c4; text-transform: uppercase;
  letter-spacing: .1em; }
.couv .borne .v { font-size: 15pt; font-weight: 700; margin-top: 1mm; }
.couv .bas { font-size: 8.5pt; color: #93a2c4; }
`;

let _numPage = 0;

/** Une page du rapport. `slide` reporte le numéro du template PowerPoint. */
function page(
  fil: string,
  titre: string,
  slide: string,
  corps: string,
  periodeLabel: string,
): string {
  _numPage++;
  return `<section class="page">
  <div class="tete">
    <div>
      <div class="fil">${esc(fil)}</div>
      <div class="titre">${esc(titre)}</div>
    </div>
    <div class="slide">Template<b>${esc(slide)}</b></div>
  </div>
  ${corps}
  <div class="pied">
    <span>Comité d'investissement · NSIA Asset Management</span>
    <span>${esc(periodeLabel)}</span>
    <span>${_numPage}</span>
  </div>
</section>`;
}

function tuile(lib: string, val: string, det = ""): string {
  return `<div class="tuile"><div class="lib">${esc(lib)}</div>
    <div class="val">${val}</div>
    ${det ? `<div class="det">${esc(det)}</div>` : ""}</div>`;
}

// ── Sections ─────────────────────────────────────────────────────────────────

function tableIndices(lignes: LigneIndice[], avecSocietes: boolean): string {
  if (lignes.length === 0) {
    return `<p class="vide">Aucun indice coté sur la période.</p>`;
  }
  return `<table>
  <thead><tr>
    <th>Indice</th>
    ${avecSocietes ? "<th>Sociétés</th>" : ""}
    <th>Début</th><th>Intermédiaire</th><th>Fin</th>
    <th>Var. période</th><th>Var. YTD</th>
  </tr></thead>
  <tbody>${lignes
    .map(
      (l) => `<tr>
      <td><span class="mono">${esc(l.code)}</span> <span class="sub">${esc(l.libelle)}</span></td>
      ${avecSocietes ? `<td>${l.nbSocietes ?? "—"}</td>` : ""}
      <td>${fr2(l.niveauDebut)}</td>
      <td>${fr2(l.niveauIntermediaire)}</td>
      <td>${fr2(l.niveauFin)}</td>
      <td class="${sens(l.varPeriode)}">${pctSigne(l.varPeriode)}</td>
      <td class="${sens(l.varYtd)}">${pctSigne(l.varYtd)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function tableActions(lignes: LigneAction[]): string {
  if (lignes.length === 0) return `<p class="vide">Aucune valeur cotée sur la période.</p>`;
  return `<table>
  <thead><tr>
    <th>Symb.</th><th>Secteur</th><th>Cours début</th><th>Cours fin</th>
    <th>Var. période</th><th>Var. YTD</th>
  </tr></thead>
  <tbody>${lignes
    .map(
      (l) => `<tr>
      <td><span class="mono">${esc(l.code)}</span> <span class="sub">${esc(l.nom)}</span></td>
      <td style="text-align:left">${esc(l.secteur)}</td>
      <td>${frInt(l.coursDebut)}</td>
      <td>${frInt(l.coursFin)}</td>
      <td class="${sens(l.varPeriode)}">${pctSigne(l.varPeriode)}</td>
      <td class="${sens(l.varYtd)}">${pctSigne(l.varYtd)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function tableObligations(lignes: LigneObligation[], champ: "varPeriode" | "varYtd"): string {
  if (lignes.length === 0) return `<p class="vide">Aucune cotation sur la période.</p>`;
  return `<table>
  <thead><tr><th>Titre</th><th>Coupon</th><th>Cours fin</th><th>Évolution</th></tr></thead>
  <tbody>${lignes
    .map(
      (l) => `<tr>
      <td><span class="mono">${esc(l.code)}</span> <span class="sub">${esc(l.emetteur)}</span></td>
      <td>${tauxDec(l.couponRate)}</td>
      <td>${fr2(l.coursFin)}</td>
      <td class="${sens(l[champ])}">${pctSigne(l[champ])}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function tableBandes(bandes: BandeAnticipation[]): string {
  if (bandes.length === 0) {
    return `<p class="vide">Aucune adjudication sur la fenêtre d'observation.</p>`;
  }
  return `<table>
  <thead><tr>
    <th>Bande de maturité</th><th>Obs.</th><th>Taux début</th><th>Taux fin</th>
    <th>Pente</th><th>R²</th><th>Projection 3 mois</th><th>Absorption</th>
  </tr></thead>
  <tbody>${bandes
    .map(
      (b) => `<tr>
      <td class="mono">${esc(b.libelle)}</td>
      <td>${b.nbObservations}</td>
      <td>${tauxDec(b.tauxMoyenDebut)}</td>
      <td>${tauxDec(b.tauxMoyenFin)}</td>
      <td class="${sens(b.penteBpsParMois)}">${
        b.penteBpsParMois === null ? "—" : pctSigne(b.penteBpsParMois, 1).replace(" %", " pb/mois")
      }</td>
      <td>${b.r2 === null ? "—" : nf2.format(b.r2)}</td>
      <td class="${b.projection3Mois === null ? "flat" : "mono"}">${
        b.projection3Mois === null
          ? `<span class="sub">R² insuffisant</span>`
          : tauxDec(b.projection3Mois)
      }</td>
      <td>${b.tauxAbsorption === null ? "—" : pct(b.tauxAbsorption * 100, 0)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

// ── Document ─────────────────────────────────────────────────────────────────

export function renderRapportComiteHtml(r: RapportComite): string {
  _numPage = 0;
  const p = r.periode;
  const periodeLabel = `${dateFr(p.debut)} – ${dateFr(p.fin)}`;
  const pages: string[] = [];

  // Couverture
  pages.push(`<section class="page couv">
  <div class="logo"><img src="${logoNsia()}" alt="NSIA Asset Management" /></div>
  <div>
    <div class="st">Analyse de marché</div>
    <h1>Rapport du comité<br/>d'investissement</h1>
    <div class="bornes">
      <div class="borne"><div class="l">Début de période</div><div class="v">${dateFr(p.debut)}</div></div>
      <div class="borne"><div class="l">Point intermédiaire</div><div class="v">${dateFr(p.intermediaire)}</div></div>
      <div class="borne"><div class="l">Fin de période</div><div class="v">${dateFr(p.fin)}</div></div>
    </div>
  </div>
  <div class="bas">
    Marché financier régional BRVM / UEMOA · document généré le ${esc(dateLongueFr(r.genereLe))}
    ${r.avertissements.length > 0 ? ` · ${r.avertissements.length} réserve(s) signalée(s) en fin de rapport` : ""}
  </div>
</section>`);

  // Slide 43 — indices principaux
  const moteurs = r.top10.slice(0, 3);
  pages.push(
    page(
      "Analyse du marché · Actions",
      "Indices principaux",
      "43",
      `<div class="tuiles">
        ${r.indicesPrincipaux
          .slice(0, 4)
          .map((i) =>
            tuile(
              i.code,
              `<span class="${sens(i.varPeriode)}">${pctSigne(i.varPeriode)}</span>`,
              `${fr2(i.niveauFin)} pts · YTD ${pctSigne(i.varYtd)}`,
            ),
          )
          .join("")}
      </div>
      ${tableIndices(r.indicesPrincipaux, false)}
      ${
        moteurs.length > 0
          ? `<p class="sub" style="margin-top:5mm">Moteurs de la période :
             ${moteurs
               .map((m) => `<b>${esc(m.code)}</b> (${pctSigne(m.varPeriode)})`)
               .join(", ")}.</p>`
          : ""
      }`,
      periodeLabel,
    ),
  );

  // Slide 42 — indices sectoriels
  pages.push(
    page(
      "Analyse du marché · Actions",
      "Indices sectoriels",
      "42",
      tableIndices(r.indicesSectoriels, true),
      periodeLabel,
    ),
  );

  // Slides 44 et 45 — top / flop
  pages.push(
    page(
      "Analyse du marché · Actions",
      "Performances individuelles — Top 10",
      "44",
      tableActions(r.top10),
      periodeLabel,
    ),
  );
  pages.push(
    page(
      "Analyse du marché · Actions",
      "Performances individuelles — Flop 10",
      "45",
      tableActions(r.flop10),
      periodeLabel,
    ),
  );

  // Slides 23 à 40 — publications, paginées
  //
  // La page a une hauteur FIXE et `overflow: hidden` : une liste trop longue
  // n'était pas coupée proprement, elle disparaissait sous le pied de page.
  // Constaté en exécution sur un semestre — 62 publications, dont une vingtaine
  // perdues en silence. On découpe donc en blocs d'une hauteur qui tient, deux
  // blocs par page.
  if (r.publications.total === 0) {
    pages.push(
      page(
        "Analyse du marché · Actions",
        "Publications officielles sur la période",
        "23-40",
        `<p class="vide">Aucune publication recensée entre le ${dateFr(p.debut)} et le ${dateFr(p.fin)}.</p>`,
        periodeLabel,
      ),
    );
  } else {
    const PAR_COLONNE = 19;
    type Bloc = {
      libelle: string;
      total: number;
      suite: boolean;
      lignes: { ticker: string; nom: string; date: string; exercice: string }[];
    };
    const blocs: Bloc[] = [];
    for (const g of r.publications.parType) {
      for (let i = 0; i < g.lignes.length; i += PAR_COLONNE) {
        blocs.push({
          libelle: g.libelle,
          total: g.lignes.length,
          suite: i > 0,
          lignes: g.lignes.slice(i, i + PAR_COLONNE),
        });
      }
    }

    const rendreBloc = (b: Bloc) => `<div>
      <div class="bloc-titre">${esc(b.libelle)}
        <span class="sub">(${b.total})${b.suite ? " — suite" : ""}</span></div>
      <table><tbody>${b.lignes
        .map(
          (l) => `<tr>
          <td><span class="mono">${esc(l.ticker)}</span> <span class="sub">${esc(l.nom)}</span></td>
          <td>${esc(l.exercice)}</td>
          <td>${dateFr(l.date)}</td>
        </tr>`,
        )
        .join("")}</tbody></table></div>`;

    const nbPagesPub = Math.ceil(blocs.length / 2);
    for (let i = 0; i < blocs.length; i += 2) {
      const numero = i / 2 + 1;
      pages.push(
        page(
          "Analyse du marché · Actions",
          `Publications officielles sur la période${nbPagesPub > 1 ? ` (${numero}/${nbPagesPub})` : ""}`,
          "23-40",
          `${
            numero === 1
              ? `<p class="sub" style="margin-bottom:4mm">${r.publications.total} publication(s) recensée(s) entre le ${dateFr(p.debut)} et le ${dateFr(p.fin)}.</p>`
              : ""
          }
          <div class="grille2">${blocs
            .slice(i, i + 2)
            .map(rendreBloc)
            .join("")}</div>`,
          periodeLabel,
        ),
      );
    }
  }

  // Obligations cotées
  pages.push(
    page(
      "Analyse du marché · Obligations",
      "Récapitulatif des obligations cotées",
      "—",
      `<div class="tuiles">
        ${tuile("Lignes cotées", String(r.obligationsCotees.nbLignes))}
        ${tuile("Encours total", mds(r.obligationsCotees.encoursTotal / 1e6), "millions de FCFA convertis")}
        ${tuile("Coupon moyen pondéré", tauxDec(r.obligationsCotees.couponMoyenPondere))}
        ${tuile("Maturité moyenne pondérée", r.obligationsCotees.maturiteMoyennePonderee === null ? "—" : fr1(r.obligationsCotees.maturiteMoyennePonderee) + " ans")}
      </div>
      <div class="grille2">
        <div><div class="bloc-titre">Top 10 évolution — période</div>
          ${tableObligations(r.obligationsCotees.topPeriode, "varPeriode")}</div>
        <div><div class="bloc-titre">Top 10 évolution — depuis le 1<sup>er</sup> janvier</div>
          ${tableObligations(r.obligationsCotees.topYtd, "varYtd")}</div>
      </div>`,
      periodeLabel,
    ),
  );

  // Slides 49 à 52 — titres publics, vue générale
  const tp = r.titresPublics;
  pages.push(
    page(
      "Analyse du marché · Obligations",
      "Marché des titres publics — montants et taux",
      "49-52",
      `<div class="tuiles">
        ${tuile("Montant retenu", mds(tp.montantRetenuTotal), `${tp.nbOperations} opération(s)`)}
        ${tuile("Taux d'absorption global", tp.tauxAbsorptionGlobal === null ? "—" : pct(tp.tauxAbsorptionGlobal * 100, 0), "retenu / soumis")}
        ${tuile("Prix marginal moyen", frInt(tp.prixMarginalMoyenGeneral), "FCFA")}
        ${tuile("Pays émetteurs", String(tp.parPays.length))}
      </div>
      <div class="grille2">
        <div><div class="bloc-titre">Par pays</div>
        ${
          tp.parPays.length === 0
            ? `<p class="vide">Aucune adjudication.</p>`
            : `<table><thead><tr><th>Pays</th><th>Retenu</th><th>Poids</th><th>Taux moy.</th><th>Absorp.</th></tr></thead>
          <tbody>${tp.parPays
            .map(
              (x) => `<tr><td class="mono">${esc(x.nom)}</td><td>${mds(x.montantRetenu)}</td>
              <td>${pct(x.poids, 1)}</td><td>${tauxDec(x.tauxMoyenPondere)}</td>
              <td>${x.tauxAbsorption === null ? "—" : pct(x.tauxAbsorption * 100, 0)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        }</div>
        <div><div class="bloc-titre">Par maturité</div>
        ${
          tp.parMaturite.length === 0
            ? `<p class="vide">Aucune adjudication.</p>`
            : `<table><thead><tr><th>Maturité</th><th>Retenu</th><th>Taux moy.</th><th>Absorp.</th></tr></thead>
          <tbody>${tp.parMaturite
            .map(
              (x) => `<tr><td class="mono">${x.mois} mois</td><td>${mds(x.montantRetenu)}</td>
              <td>${tauxDec(x.tauxMoyenPondere)}</td>
              <td>${x.tauxAbsorption === null ? "—" : pct(x.tauxAbsorption * 100, 0)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        }</div>
      </div>`,
      periodeLabel,
    ),
  );

  // Slides 53-54 — BAT
  pages.push(
    page(
      "Analyse du marché · Obligations",
      "Marché des titres publics — bons du Trésor (BAT)",
      "53-54",
      `<div class="tuiles">
        ${tuile("Montant retenu BAT", mds(tp.bat.montantRetenu))}
        ${tuile("Absorption moyenne", tp.bat.tauxAbsorptionMoyen === null ? "—" : pct(tp.bat.tauxAbsorptionMoyen * 100, 0))}
        ${tuile("Maturités servies", String(tp.bat.parMaturite.length))}
        ${tuile("Pays émetteurs", String(tp.bat.parPays.length))}
      </div>
      <div class="grille2">
        <div><div class="bloc-titre">Par maturité</div>
        ${
          tp.bat.parMaturite.length === 0
            ? `<p class="vide">Aucune émission de BAT sur la période.</p>`
            : `<table><thead><tr><th>Maturité</th><th>Taux moyen pondéré</th></tr></thead>
          <tbody>${tp.bat.parMaturite
            .map(
              (x) => `<tr><td class="mono">${x.mois} mois</td><td>${tauxDec(x.tauxMoyenPondere)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        }</div>
        <div><div class="bloc-titre">Par pays</div>
        ${
          tp.bat.parPays.length === 0
            ? `<p class="vide">Aucune émission de BAT sur la période.</p>`
            : `<table><thead><tr><th>Pays</th><th>Taux moyen</th><th>Absorption</th></tr></thead>
          <tbody>${tp.bat.parPays
            .map(
              (x) => `<tr><td class="mono">${esc(x.nom)}</td><td>${tauxDec(x.tauxMoyenPondere)}</td>
              <td>${x.tauxAbsorption === null ? "—" : pct(x.tauxAbsorption * 100, 0)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        }</div>
      </div>`,
      periodeLabel,
    ),
  );

  // Slides 56 à 58 — OPCVM
  pages.push(
    page(
      "Analyse du marché · OPCVM",
      "Performances du marché des OPCVM",
      "56-58",
      r.opcvm.length === 0
        ? `<p class="vide">Aucune VL exploitable aux deux bornes de la période.</p>`
        : `<table>
      <thead><tr><th>Type d'OPCVM</th><th>Fonds</th><th>Niveau de risque</th>
        <th>Performance moyenne</th><th>Top 3 de la catégorie</th></tr></thead>
      <tbody>${r.opcvm
        .map(
          (o) => `<tr>
          <td class="mono">${esc(o.categorie)}</td>
          <td>${o.nbFonds}</td>
          <td>${o.niveauRisque === null ? `<span class="sub">non publié</span>` : o.niveauRisque}</td>
          <td class="${sens(o.performanceMoyenne)}">${pctSigne(o.performanceMoyenne)}</td>
          <td style="text-align:left">${
            o.top3.length === 0
              ? "—"
              : o.top3
                  .map(
                    (t) =>
                      `${esc(t.nom)} <b class="${sens(t.performance)}">${pctSigne(t.performance)}</b>`,
                  )
                  .join("<br/>")
          }</td>
        </tr>`,
        )
        .join("")}</tbody></table>`,
      periodeLabel,
    ),
  );

  // Anticipation actions
  const aa = r.anticipationActions;
  const retenues = aa.lignes.filter((l) => l.signal !== "neutre").slice(0, 14);
  pages.push(
    page(
      "Anticipation · Actions",
      "Anticipation des cours et du marché des actions",
      "nouveau",
      `<div class="tuiles">
        ${tuile("PER médian du marché", fr1(aa.perMedianMarche))}
        ${tuile("Rendement médian", pct(aa.rendementMedianMarche))}
        ${tuile("Signaux sous-évalué", String(aa.lignes.filter((l) => l.signal === "sous-évalué").length))}
        ${tuile("Signaux sur-évalué", String(aa.lignes.filter((l) => l.signal === "sur-évalué").length))}
      </div>
      ${
        retenues.length === 0
          ? `<p class="vide">Aucun signal marqué sur la période : toutes les valeurs ressortent neutres.</p>`
          : `<table>
        <thead><tr><th>Symb.</th><th>Cours</th><th>PER</th><th>Écart secteur</th>
          <th>Rendement</th><th>Momentum</th><th>Score</th><th>Signal</th></tr></thead>
        <tbody>${retenues
          .map(
            (l) => `<tr>
            <td><span class="mono">${esc(l.code)}</span> <span class="sub">${esc(l.nom)}</span></td>
            <td>${frInt(l.cours)}</td>
            <td>${fr1(l.per)}</td>
            <td class="${sens(l.ecartPerSecteur === null ? null : -l.ecartPerSecteur)}">${pctSigne(l.ecartPerSecteur, 1)}</td>
            <td>${pct(l.rendement)}</td>
            <td class="${sens(l.momentum)}">${pctSigne(l.momentum, 1)}</td>
            <td class="mono">${l.score > 0 ? "+" : ""}${l.score}</td>
            <td><span class="badge ${l.signal === "sous-évalué" ? "sous" : l.signal === "sur-évalué" ? "sur" : "neutre"}">${esc(l.signal)}</span></td>
          </tr>`,
          )
          .join("")}</tbody></table>`
      }`,
      periodeLabel,
    ),
  );

  // Méthode actions
  pages.push(
    page(
      "Anticipation · Actions",
      "Méthode de notation des actions",
      "nouveau",
      `<div class="methode">${esc(aa.methode)}</div>`,
      periodeLabel,
    ),
  );

  // Anticipation obligations
  const ao = r.anticipationObligations;
  pages.push(
    page(
      "Anticipation · Obligations",
      "Anticipation des rendements obligataires",
      "nouveau",
      `<div class="tuiles">
        ${tuile("Fenêtre d'observation", `${dateFr(ao.fenetre.debut)} → ${dateFr(ao.fenetre.fin)}`, `${ao.fenetre.nbAdjudications} adjudication(s)`)}
        ${tuile("Tendance d'ensemble", ao.tendanceGlobaleBpsParMois === null ? "—" : `${(ao.tendanceGlobaleBpsParMois >= 0 ? "+" : "") + nf1.format(ao.tendanceGlobaleBpsParMois)} pb`, "par mois, toutes maturités")}
        ${tuile("Bandes analysées", String(ao.bandes.length))}
        ${tuile("Projections publiées", String(ao.bandes.filter((b) => b.projection3Mois !== null).length), "R² ≥ 0,30 seulement")}
      </div>
      ${tableBandes(ao.bandes)}
      <p class="sub" style="margin-top:5mm"><b>Lecture :</b> ${esc(ao.commentaire)}</p>`,
      periodeLabel,
    ),
  );

  // Méthode obligations
  pages.push(
    page(
      "Anticipation · Obligations",
      "Méthode d'anticipation des rendements",
      "nouveau",
      `<div class="methode">${esc(ao.methode)}</div>`,
      periodeLabel,
    ),
  );

  // Réserves
  if (r.avertissements.length > 0) {
    pages.push(
      page(
        "Annexe",
        "Réserves sur les données",
        "—",
        `<p class="sub" style="margin-bottom:4mm">Ces points limitent la lecture du
         rapport et sont signalés plutôt que masqués : un tableau vide sans
         explication se lit à tort comme une absence de mouvement.</p>
         ${r.avertissements.map((a) => `<div class="avert">${esc(a)}</div>`).join("")}`,
        periodeLabel,
      ),
    );
  }

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Rapport du comité d'investissement</title>
<style>${CSS}</style></head><body>${pages.join("\n")}</body></html>`;
}
