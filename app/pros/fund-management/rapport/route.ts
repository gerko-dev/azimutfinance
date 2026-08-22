import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeAnalysisBundleAction } from "../attribution-actions";
import {
  computeSectorAllocationAction,
  computeSectorRebalancingAction,
  computeTopFlopStocksAction,
  computeTopFlopBondsAction,
} from "../sector-actions";
import { loadAnalysisSettings } from "../analysis-settings";
import { loadNavHistory } from "../nav-data";
import type { NavPoint } from "../nav-types";
import { PptxReport, type TableDef } from "../pptx-fill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Formatage fr-FR.
const fMt = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("fr-FR"));
const fPct = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

function perfYtdFromNav(nav: NavPoint[]): number | null {
  const pts = nav.filter((p) => p.vl != null && p.vl > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length === 0) return null;
  const last = pts[pts.length - 1];
  const target = `${Number(last.date.slice(0, 4)) - 1}-12-31`;
  let start: NavPoint | null = null;
  for (const p of pts) {
    if (p.date <= target) start = p;
    else break;
  }
  if (!start || !start.vl || !last.vl) return null;
  return (last.vl / start.vl - 1) * 100;
}

// Ordre/labels du tableau TRO par classe (slide 36, tableau natif).
const TRO_ROWS = [
  { label: "Obligations", classe: "Obligations" },
  { label: "Actions", classe: "Actions" },
  { label: "Part d'OPC", classe: "OPCVM" },
  { label: "Dépôts et investissements liquides", classe: "DAT" },
  { label: "Liquidités", classe: "Liquidité" },
];

export async function GET(req: Request): Promise<Response> {
  const fundId = new URL(req.url).searchParams.get("fundId");
  if (!fundId) return new Response("Paramètre fundId manquant.", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Tu dois être connecté.", { status: 401 });

  try {
    const [bundle, secReb, secAlloc, stocks, bonds, settingsRes, nav] = await Promise.all([
      computeAnalysisBundleAction(fundId),
      computeSectorRebalancingAction(fundId),
      computeSectorAllocationAction(fundId),
      computeTopFlopStocksAction(fundId, 10),
      computeTopFlopBondsAction(fundId, 10),
      loadAnalysisSettings(fundId),
      loadNavHistory(fundId),
    ]);
    const attr = bundle.attr;
    const reb = bundle.reb;
    const opcvm = bundle.opcvm;
    const settings = settingsRes.ok ? settingsRes.data.settings : {};

    const report = await PptxReport.load();
    const perfYtd = perfYtdFromNav(nav);

    // ── Slide 3 : perf globale (commentaire + tableau perf/bench/alpha) ───────
    if (attr.ok && attr.data.rbTotal != null) {
      const bench = attr.data.rbTotal;
      if (perfYtd != null) {
        const alpha = perfYtd - bench;
        const pos = alpha >= 0;
        await report.comment(3, "Performance YTD du fonds", [
          `Alpha ${pos ? "positif" : "négatif"} : Performance YTD du fonds (${fPct(perfYtd)}) ${
            pos ? ">" : "<"
          } Performance benchmark (${fPct(bench)})`,
          "",
          {
            text: pos
              ? "Maintenir l'avance sur le benchmark et consolider la performance du fonds."
              : "Améliorer performance sur le fonds afin de réduire le gap avec le benchmark.",
            bold: true,
          },
        ]);
        const perfTable: TableDef = {
          headers: ["Performance YTD", "Fonds", "Benchmark", "Alpha"],
          rows: [["Fonds vs benchmark", fPct(perfYtd), fPct(bench), fPct(alpha)]],
        };
        await report.replaceOle(3, [perfTable]); // 2e OLE (classement) : pas de données → retiré
      }
    }

    // ── Slide 4 : performance par classe d'actifs (YTD) ──────────────────────
    if (attr.ok) {
      await report.replaceOle(4, [
        {
          headers: ["Classe d'actifs", "Poids", "Performance", "Benchmark", "Alpha"],
          rows: attr.data.rows.map((r) => [
            r.classe,
            fPct(r.poids),
            fPct(r.performance),
            fPct(r.benchmark),
            fPct(r.alpha),
          ]),
        },
      ]);
    }

    // ── Effets Brinson par classe (slides 5 recap, 6 allocation, 7 sélection) ─
    if (attr.ok && attr.data.rbTotal != null) {
      const rbTotal = attr.data.rbTotal;
      const wbByClasse = new Map(attr.data.alloc.map((a) => [a.classe, a.wb]));
      let allocTot = 0;
      let selTot = 0;
      const allocRows: (string | number)[][] = [];
      const selRows: (string | number)[][] = [];
      for (const r of attr.data.rows) {
        const wp = r.poids;
        const wb = wbByClasse.get(r.classe) ?? 0;
        const rp = r.performance;
        const rb = r.benchmark;
        const allocEff = rb != null ? ((wp - wb) / 100) * (rb - rbTotal) : null;
        const selEff = rp != null && rb != null ? (wb / 100) * (rp - rb) : null;
        allocTot += allocEff ?? 0;
        selTot += selEff ?? 0;
        allocRows.push([r.classe, fPct(wp), fPct(wb), fPct(wp - wb), fPct(rb), fPct(allocEff)]);
        selRows.push([
          r.classe,
          fPct(rp),
          fPct(rb),
          fPct(rp != null && rb != null ? rp - rb : null),
          fPct(wb),
          fPct(selEff),
        ]);
      }
      allocRows.push(["TOTAL", "", "", "", "", fPct(allocTot)]);
      selRows.push(["TOTAL", "", "", "", "", fPct(selTot)]);
      await report.replaceOle(6, [
        {
          headers: ["Classe d'actifs", "Poids fonds", "Poids bench.", "Diff. poids", "Perf. bench.", "Effet allocation"],
          rows: allocRows,
          hasTotal: true,
        },
      ]);
      await report.replaceOle(7, [
        {
          headers: ["Classe d'actifs", "Perf. fonds", "Benchmark", "Diff. perf.", "Poids bench.", "Effet sélection"],
          rows: selRows,
          hasTotal: true,
        },
      ]);
      // Recap classe (slide 5).
      const alpha = perfYtd != null ? perfYtd - rbTotal : null;
      const delta = alpha != null ? alpha - allocTot - selTot : null;
      const ctb = (x: number | null) =>
        alpha != null && alpha !== 0 && x != null ? fPct((x / alpha) * 100) : "—";
      await report.replaceOle(5, [
        {
          headers: ["Indicateur", "Valeur", "Contribution"],
          rows: [
            ["Effet allocation", fPct(allocTot), ctb(allocTot)],
            ["Effet sélection", fPct(selTot), ctb(selTot)],
            ["Delta (interaction)", fPct(delta), ctb(delta)],
            ["Alpha", fPct(alpha), "100,00%"],
          ],
          colAligns: ["l", "r", "r"],
        },
      ]);
    }

    // ── Perf par classe (slides 9 Actions, 18 Obligations, 24 OPCVM, 27 DAT) ──
    if (attr.ok) {
      const byClasse = new Map(attr.data.rows.map((r) => [r.classe, r]));
      const perfMini = (classe: string): TableDef | null => {
        const r = byClasse.get(classe);
        if (!r) return null;
        return {
          headers: ["Indicateur", "Fonds", "Benchmark", "Alpha"],
          rows: [["Performance", fPct(r.performance), fPct(r.benchmark), fPct(r.alpha)]],
        };
      };
      const a = perfMini("Actions");
      const o = perfMini("Obligations");
      const p = perfMini("OPCVM");
      const d = perfMini("DAT");
      if (a) await report.replaceOle(9, [a]);
      if (o) await report.replaceOle(18, [o]);
      if (p) await report.replaceOle(24, [p]);
      if (d) await report.replaceOle(27, [d]);
    }

    // ── Effets Brinson sectoriels — Actions (slides 10 recap, 11 alloc, 12 sél) ─
    if (secAlloc.ok && secAlloc.data.rbActions != null && attr.ok) {
      const rbActions = secAlloc.data.rbActions;
      let sAllocTot = 0;
      let sSelTot = 0;
      const sAllocRows: (string | number)[][] = [];
      const sSelRows: (string | number)[][] = [];
      for (const r of secAlloc.data.rows) {
        const diffAlloc = r.rbSector != null ? r.rbSector - rbActions : null;
        const allocEff = diffAlloc != null ? ((r.wp - r.wb) * diffAlloc) / 100 : null;
        const diffSel = r.rpSector != null && r.rbSector != null ? r.rpSector - r.rbSector : null;
        const selEff = diffSel != null ? (r.wb * diffSel) / 100 : null;
        sAllocTot += allocEff ?? 0;
        sSelTot += selEff ?? 0;
        sAllocRows.push([r.secteur, fPct(r.wp), fPct(r.wb), fPct(r.wp - r.wb), fPct(r.rbSector), fPct(allocEff)]);
        sSelRows.push([r.secteur, fPct(r.rpSector), fPct(r.rbSector), fPct(diffSel), fPct(r.wb), fPct(selEff)]);
      }
      sAllocRows.push(["TOTAL", "", "", "", "", fPct(sAllocTot)]);
      sSelRows.push(["TOTAL", "", "", "", "", fPct(sSelTot)]);
      await report.replaceOle(11, [
        {
          headers: ["Secteur", "Poids fonds", "Poids BRVM", "Diff. poids", "Perf. secteur", "Effet allocation"],
          rows: sAllocRows,
          hasTotal: true,
        },
      ]);
      await report.replaceOle(12, [
        {
          headers: ["Secteur", "Perf. fonds", "BRVM", "Diff. perf.", "Poids BRVM", "Effet sélection"],
          rows: sSelRows,
          hasTotal: true,
        },
      ]);
      // Recap Actions (slide 10) : alpha actions = perf Actions − BRVM Composite.
      const rpActions = attr.data.rows.find((r) => r.classe === "Actions")?.performance ?? null;
      const alphaAct = rpActions != null ? rpActions - rbActions : null;
      const deltaAct = alphaAct != null ? alphaAct - sAllocTot - sSelTot : null;
      const ctbA = (x: number | null) =>
        alphaAct != null && alphaAct !== 0 && x != null ? fPct((x / alphaAct) * 100) : "—";
      await report.replaceOle(10, [
        {
          headers: ["Indicateur", "Valeur", "Contribution"],
          rows: [
            ["Effet allocation", fPct(sAllocTot), ctbA(sAllocTot)],
            ["Effet sélection", fPct(sSelTot), ctbA(sSelTot)],
            ["Delta (interaction)", fPct(deltaAct), ctbA(deltaAct)],
            ["Alpha", fPct(alphaAct), "100,00%"],
          ],
          colAligns: ["l", "r", "r"],
        },
      ]);
    }

    // ── Slides 13/14 (période) & 15/16 (YTD) : Top/Flop Actions ──────────────
    if (stocks.ok) {
      const stockCols = ["Sociétés", "Poids", "% Var. cours", "Var. montant", "Contribution"];
      const stockRow = (r: { nom: string; poids: number; varPct: number | null; varMontant: number | null; contribution: number | null }) =>
        [r.nom, fPct(r.poids), fPct(r.varPct), fMt(r.varMontant), fPct(r.contribution)];
      await report.replaceOle(13, [{ headers: stockCols, rows: stocks.data.periode.top.map(stockRow) }]);
      await report.replaceOle(14, [{ headers: stockCols, rows: stocks.data.periode.flop.map(stockRow) }]);
      await report.replaceOle(15, [{ headers: stockCols, rows: stocks.data.ytd.top.map(stockRow) }]);
      await report.replaceOle(16, [{ headers: stockCols, rows: stocks.data.ytd.flop.map(stockRow) }]);
    }

    // ── Slides 19/20 (période) & 21/22 (YTD) : Top/Flop Obligations ──────────
    if (bonds.ok) {
      const bondCols = ["Titres", "Poids", "% Var. cours", "Var. montant", "Décote", "PMV"];
      const bondRow = (r: { nom: string; poids: number; varPct: number | null; varMontant: number | null; decote: number; pmv: number }) =>
        [r.nom, fPct(r.poids), fPct(r.varPct), fMt(r.varMontant), fMt(r.decote), fMt(r.pmv)];
      await report.replaceOle(19, [{ headers: bondCols, rows: bonds.data.periode.top.map(bondRow) }]);
      await report.replaceOle(20, [{ headers: bondCols, rows: bonds.data.periode.flop.map(bondRow) }]);
      await report.replaceOle(21, [{ headers: bondCols, rows: bonds.data.ytd.top.map(bondRow) }]);
      await report.replaceOle(22, [{ headers: bondCols, rows: bonds.data.ytd.flop.map(bondRow) }]);
    }

    // ── Slide 25 : OPCVM détenus ─────────────────────────────────────────────
    if (opcvm.ok && opcvm.data.rows.length > 0) {
      await report.replaceOle(25, [
        {
          headers: ["FCP", "Performance", "Benchmark", "Alpha"],
          rows: opcvm.data.rows.map((r) => [
            r.categorie ? `${r.nom} (${r.categorie})` : r.nom,
            fPct(r.perfFonds),
            fPct(r.perfBenchmark),
            fPct(r.alpha),
          ]),
        },
      ]);
    }

    // ── Slides 27/28 : DAT (perf/bench/alpha = ligne « DAT » de l'attribution) ─
    if (attr.ok && reb.ok) {
      const dat = attr.data.rows.find((r) => r.classe === "DAT");
      const names = reb.data.datNames;
      if (dat && names.length > 0) {
        const datTable: TableDef = {
          headers: ["DAT", "Performance", "Benchmark", "Alpha"],
          rows: names.map((n) => [n, fPct(dat.performance), fPct(dat.benchmark), fPct(dat.alpha)]),
        };
        await report.replaceOle(28, [datTable]);
      }
    }

    // ── Slide 36 : TRO des décisions d'allocation (tableau natif) ────────────
    if (reb.ok) {
      const totalPrec = reb.data.totalPrecedente || 1;
      const totalAct = reb.data.totalActuelle || 1;
      const byClass = new Map(reb.data.rows.map((r) => [r.classe, r]));
      const validee = settings.allocValidee ?? {};
      const rows: Record<number, (string | number | null)[]> = {};
      let sumValidee = 0;
      let sumCible = 0;
      TRO_ROWS.forEach((def, i) => {
        const r = byClass.get(def.classe);
        const vPrec = r?.valeurPrecedente ?? 0;
        const vAct = r?.valeurActuelle ?? 0;
        const vPct = validee[def.classe];
        const wValidee = vPct != null && vPct !== "" ? parseFloat(vPct.replace(",", ".")) || 0 : (vAct / totalAct) * 100;
        const cible = (wValidee / 100) * totalAct;
        const denom = cible - vPrec;
        const tro = denom !== 0 ? ((vAct - vPrec) / denom) * 100 : null;
        sumValidee += wValidee;
        sumCible += cible;
        rows[i + 1] = [null, fMt(vPrec), fPct((vPrec / totalPrec) * 100), fMt(vAct), fPct((vAct / totalAct) * 100), fPct(wValidee), tro == null ? "" : fPct(tro), fMt(cible)];
      });
      rows[TRO_ROWS.length + 1] = [null, fMt(totalPrec), "100,00%", fMt(totalAct), "100,00%", fPct(sumValidee), null, fMt(sumCible)];
      await report.tableRows(36, 0, rows);
    }

    // ══ Commentaires régénérés à partir des chiffres ════════════════════════
    {
      const rowsC = attr.ok ? attr.data.rows : [];
      const rbTotal = attr.ok ? attr.data.rbTotal : null;
      const byC = new Map(rowsC.map((r) => [r.classe, r]));
      const namePct = (items: { name: string; v: number | null }[]) =>
        items.map((x) => `${x.name} (${fPct(x.v)})`).join(", ");

      // Effets par classe.
      const wbBy = new Map(attr.ok ? attr.data.alloc.map((a) => [a.classe, a.wb]) : []);
      let allocTot = 0;
      let selTot = 0;
      const effClass = rowsC.map((r) => {
        const wb = wbBy.get(r.classe) ?? 0;
        const ae = r.benchmark != null && rbTotal != null ? ((r.poids - wb) / 100) * (r.benchmark - rbTotal) : null;
        const se = r.performance != null && r.benchmark != null ? (wb / 100) * (r.performance - r.benchmark) : null;
        allocTot += ae ?? 0;
        selTot += se ?? 0;
        return { classe: r.classe, ae, se };
      });
      const alpha = perfYtd != null && rbTotal != null ? perfYtd - rbTotal : null;
      const delta = alpha != null ? alpha - allocTot - selTot : null;

      // Slide 4 : performance par classe.
      if (attr.ok) {
        const under = rowsC.filter((r) => r.alpha != null && r.alpha < 0);
        await report.comment(4, "Essentiel de la performance du fonds", [
          under.length
            ? `Performance inférieure au benchmark : ${namePct(under.map((r) => ({ name: r.classe, v: r.alpha })))}.`
            : "Toutes les classes surperforment ou égalent leur benchmark.",
          { text: "Améliorer les performances des classes en retard afin de réduire le gap avec le benchmark.", bold: true },
        ]);
      }

      // Slide 5 : récap Brinson classe.
      if (attr.ok && alpha != null) {
        const causes: string[] = [];
        if (alpha !== 0) {
          if (allocTot / alpha > 0) causes.push(`effet allocation (${fPct((allocTot / alpha) * 100)})`);
          if (selTot / alpha > 0) causes.push(`effet sélection (${fPct((selTot / alpha) * 100)})`);
          if (delta != null && delta / alpha > 0) causes.push(`delta (${fPct((delta / alpha) * 100)})`);
        }
        await report.comment(5, "Améliorer delta sur le Fonds", [
          `Effet allocation (${fPct(allocTot)}), effet sélection (${fPct(selTot)}) et delta (${fPct(delta)}).`,
          alpha < 0 && causes.length ? `Principales causes de l'alpha négatif : ${causes.join(", ")}.` : `Alpha du fonds : ${fPct(alpha)}.`,
          { text: "Améliorer le delta et la sélection sur le Fonds.", bold: true },
        ]);
      }

      // Slide 6 : effet allocation classe.
      if (attr.ok) {
        const pos = effClass.filter((x) => x.ae != null && x.ae > 0);
        const neg = effClass.filter((x) => x.ae != null && x.ae < 0);
        await report.comment(6, "Réduire pondérations sur classes Obligations", [
          pos.length ? `Effet allocation positif sur ${pos.length} classe(s) : ${namePct(pos.map((x) => ({ name: x.classe, v: x.ae })))}.` : "Aucun effet allocation positif.",
          neg.length ? `Effet allocation négatif sur ${neg.length} classe(s) : ${namePct(neg.map((x) => ({ name: x.classe, v: x.ae })))}.` : "Aucun effet allocation négatif.",
          { text: "Renforcer les classes à effet positif, réduire celles à effet négatif.", bold: true },
        ]);
      }

      // Slide 7 : effet sélection classe.
      if (attr.ok) {
        const pos = effClass.filter((x) => x.se != null && x.se > 0);
        const neg = effClass.filter((x) => x.se != null && x.se < 0);
        await report.comment(7, "Améliorer les investissements", [
          pos.length ? `Effet sélection positif sur ${pos.length} classe(s) : ${namePct(pos.map((x) => ({ name: x.classe, v: x.se })))}.` : "Aucun effet sélection positif.",
          neg.length ? `Effet sélection négatif sur ${neg.length} classe(s) : ${namePct(neg.map((x) => ({ name: x.classe, v: x.se })))}.` : "Aucun effet sélection négatif.",
          { text: "Améliorer les sélections de titres à l'intérieur des classes.", bold: true },
        ]);
      }

      // Slide 9 : perf classe Actions.
      {
        const a = byC.get("Actions");
        if (a && a.performance != null && a.benchmark != null && a.alpha != null) {
          await report.comment(9, "Rattraper le gap avec le benchmark", [
            `Alpha ${a.alpha >= 0 ? "positif" : "négatif"} (${fPct(a.alpha)}) : performance de ${fPct(a.performance)} contre ${fPct(a.benchmark)} pour le benchmark.`,
            { text: "Rattraper le gap avec le benchmark d'ici la fin de l'année.", bold: true },
          ]);
        }
      }

      // Effets sectoriels (slides 10, 11, 12).
      if (secAlloc.ok && secAlloc.data.rbActions != null) {
        const rbA = secAlloc.data.rbActions;
        let sAllocTot = 0;
        let sSelTot = 0;
        const effSec = secAlloc.data.rows.map((r) => {
          const ae = r.rbSector != null ? ((r.wp - r.wb) * (r.rbSector - rbA)) / 100 : null;
          const se = r.rpSector != null && r.rbSector != null ? (r.wb * (r.rpSector - r.rbSector)) / 100 : null;
          sAllocTot += ae ?? 0;
          sSelTot += se ?? 0;
          return { secteur: r.secteur, ae, se };
        });
        const rpAct = byC.get("Actions")?.performance ?? null;
        const alphaAct = rpAct != null ? rpAct - rbA : null;
        const deltaAct = alphaAct != null ? alphaAct - sAllocTot - sSelTot : null;
        await report.comment(10, "Améliorer delta afin de réduire le gap", [
          `Effet allocation (${fPct(sAllocTot)}), effet sélection (${fPct(sSelTot)}) et delta (${fPct(deltaAct)}).`,
          { text: "Améliorer le delta afin de réduire le gap avec le benchmark.", bold: true },
        ]);
        const posA = effSec.filter((x) => x.ae != null && x.ae > 0);
        const negA = effSec.filter((x) => x.ae != null && x.ae < 0);
        await report.comment(11, "Effet allocation positif sur", [
          posA.length ? `Effet allocation positif sur ${posA.length} secteur(s) : ${namePct(posA.map((x) => ({ name: x.secteur, v: x.ae })))}.` : "Aucun effet allocation sectoriel positif.",
          negA.length ? `Effet allocation négatif sur ${negA.length} secteur(s) : ${namePct(negA.map((x) => ({ name: x.secteur, v: x.ae })))}.` : "Aucun effet allocation sectoriel négatif.",
          { text: "Ajuster les pondérations sectorielles pour améliorer l'effet allocation.", bold: true },
        ]);
        const posS = effSec.filter((x) => x.se != null && x.se > 0);
        const negS = effSec.filter((x) => x.se != null && x.se < 0);
        await report.comment(12, "Effet sélection positif sur", [
          posS.length ? `Effet sélection positif sur ${posS.length} secteur(s) : ${namePct(posS.map((x) => ({ name: x.secteur, v: x.se })))}.` : "Aucun effet sélection sectoriel positif.",
          negS.length ? `Effet sélection négatif sur ${negS.length} secteur(s) : ${namePct(negS.map((x) => ({ name: x.secteur, v: x.se })))}.` : "Aucun effet sélection sectoriel négatif.",
          { text: "Effectuer de meilleures sélections de titres à l'intérieur des secteurs.", bold: true },
        ]);
      }

      // Top/Flop Actions (slides 13-16).
      if (stocks.ok) {
        const top3 = (arr: { nom: string }[]) => arr.slice(0, 3).map((r) => r.nom).join(", ");
        const P = stocks.data.periode;
        const Y = stocks.data.ytd;
        await report.comment(13, "Plus-value totale générée", [
          `Plus-values générées par le TOP 10 : ${fMt(P.totalTop)} FCFA.`,
          P.top.length ? `Principaux contributeurs : ${top3(P.top)}.` : "Aucune plus-value sur la période.",
        ]);
        await report.comment(14, "Ces moins-values ont ralenti le portefeuille", [
          `Moins-values générées par le FLOP 10 : ${fMt(P.totalFlop)} FCFA.`,
          P.flop.length ? `Principales baisses : ${top3(P.flop)}.` : "Aucune moins-value sur la période.",
        ]);
        await report.comment(15, "Plus-value totale générée", [
          `Plus-values générées par le TOP 10 (YTD) : ${fMt(Y.totalTop)} FCFA.`,
          Y.top.length ? `Principaux contributeurs : ${top3(Y.top)}.` : "Aucune plus-value en YTD.",
        ]);
        await report.comment(16, "Ces moins-values ont ralenti le portefeuille", [
          `Moins-values générées par le FLOP 10 (YTD) : ${fMt(Y.totalFlop)} FCFA.`,
          Y.flop.length ? `Principales baisses : ${top3(Y.flop)}.` : "Aucune moins-value en YTD.",
        ]);
      }

      // Obligations (slides 18-22).
      if (attr.ok) {
        const o = byC.get("Obligations");
        if (o && o.alpha != null)
          await report.comment(18, "Montant minimal à générer pour dépasser le benchmark", [
            `Alpha ${o.alpha >= 0 ? "positif" : "négatif"} (${fPct(o.alpha)}) : performance de ${fPct(o.performance)} contre ${fPct(o.benchmark)} pour le benchmark.`,
            { text: "Renforcer le portefeuille obligataire pour dépasser le benchmark en fin d'année.", bold: true },
          ]);
      }
      if (bonds.ok) {
        const bp = bonds.data.periode;
        const by = bonds.data.ytd;
        await report.comment(19, "Total de plus-value générée par la classe", [
          `Décote : ${fMt(bp.totalsTop.decote)} FCFA.`,
          `Total de plus-value générée par la classe : ${fMt(bp.totalsTop.varMontant)} FCFA.`,
        ]);
        await report.comment(20, "Aucune surcote", [
          bp.flop.length ? `Moins-value de la classe : ${fMt(bp.totalsFlop.varMontant)} FCFA.` : "Aucune surcote.",
          bp.flop.length ? "" : "Aucune moins-value.",
        ]);
        await report.comment(21, "Total de plus-value générée par la classe", [
          `Décote (YTD) : ${fMt(by.totalsTop.decote)} FCFA.`,
          `Total de plus-value générée par la classe : ${fMt(by.totalsTop.varMontant)} FCFA.`,
        ]);
        await report.comment(22, "Moins-value générée sur la classe", [
          by.flop.length ? `Moins-value générée sur la classe (YTD) : ${fMt(by.totalsFlop.varMontant)} FCFA.` : "Aucune moins-value en YTD.",
        ]);
      }

      // OPCVM (slides 24, 25).
      if (attr.ok) {
        const p = byC.get("OPCVM");
        if (p && p.alpha != null)
          await report.comment(24, "sur la classe contre", [
            `Performance de ${fPct(p.performance)} sur la classe contre ${fPct(p.benchmark)} pour le benchmark, soit un alpha de ${fPct(p.alpha)}.`,
          ]);
      }
      if (opcvm.ok && opcvm.data.rows.length > 0) {
        const under = opcvm.data.rows.filter((r) => r.alpha != null && r.alpha < 0);
        const over = opcvm.data.rows.filter((r) => r.alpha != null && r.alpha >= 0);
        await report.comment(25, "Prioriser les investissements", [
          under.length ? `Performances inférieures au benchmark : ${namePct(under.map((r) => ({ name: r.nom, v: r.alpha })))}.` : "Tous les FCP surperforment leur catégorie.",
          over.length ? `FCP en avance : ${namePct(over.map((r) => ({ name: r.nom, v: r.alpha })))}.` : "",
          { text: "Prioriser les investissements dans les FCP les plus performants.", bold: true },
        ]);
      }

      // DAT (slides 27, 28).
      if (attr.ok) {
        const d = byC.get("DAT");
        if (d && d.alpha != null)
          await report.comment(27, "sur la classe contre", [
            `Performance de ${fPct(d.performance)} sur la classe contre ${fPct(d.benchmark)} pour le benchmark (alpha ${d.alpha >= 0 ? "positif" : "négatif"} de ${fPct(d.alpha)}).`,
          ]);
        const d2 = byC.get("DAT");
        if (d2 && d2.alpha != null)
          await report.comment(28, "Ne pas investir dans des DAT", [
            `Alpha ${d2.alpha >= 0 ? "positif" : "négatif"} (${fPct(d2.alpha)}) sur les DAT du fonds.`,
            { text: "Ne pas investir dans des DAT à rendement inférieur au taux de marché.", bold: true },
          ]);
      }
    }

    // sectorRebalancing chargé pour usages futurs (slides 37/43) — non encore câblé.
    void secReb;

    const buf = await report.toBuffer();
    const date = attr.ok ? attr.data.dateFin : new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="Rapport_comite_investissement_${date}.pptx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[fund-management/rapport]", err);
    return new Response(
      "Échec de la génération du rapport : " + (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
