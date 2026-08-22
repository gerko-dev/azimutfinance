import ProPageHeader from "@/components/pros/ProPageHeader";
import FCPProView, { type FCPProData } from "@/components/pros/FCPProView";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  getLatestBocDate,
  countFundsWithFreshBoc,
  subtractCalendarDays,
  aumAt,
  categoryAt,
  managerSlug,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  aggregateByCategory,
  aggregateByManager,
  aumTimelineByCategory,
  quarterlyPerfHeatmap,
  aumGrowthDecomposition,
  quartileInCohort,
  publicationCadence,
} from "@/lib/fcpMath";

export const metadata = {
  title: "Marché FCP — Pro Terminal",
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) / 2;
  return s.length % 2 ? s[i] : (s[Math.floor(i)] + s[Math.ceil(i)]) / 2;
}

export default function FCPProPage() {
  const funds = loadFunds();
  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(funds);
  const latestVLGlobal = getLatestVLDate(funds);
  const latestBoc = getLatestBocDate(funds);
  const freshBocCount = countFundsWithFreshBoc("", funds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  const refIdx = quarterEnds.indexOf(refQuarter);
  const prevQuarter = refIdx > 0 ? quarterEnds[refIdx - 1] : "";

  // === COHORTES 1Y PAR CATEGORIE (pour quartiles + excès) ===
  const cohort1YByCat = new Map<string, number[]>();
  for (const f of funds) {
    const v = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(v) || v === 0) continue;
    const list = cohort1YByCat.get(f.categorie) || [];
    list.push(v);
    cohort1YByCat.set(f.categorie, list);
  }
  const catMedian1Y = new Map<string, number | null>();
  for (const [cat, list] of cohort1YByCat) catMedian1Y.set(cat, median(list));

  // === KPIs MARCHE ===
  const totalAUM = funds.reduce((s, f) => s + (f.latestQuarter?.aum ?? 0), 0);
  const managersSet = new Set(funds.map((f) => f.gestionnaire));
  const all1Y = funds
    .map((f) => perfWindow(f, 1, "1Y").totalReturn)
    .filter((v) => Number.isFinite(v) && v !== 0);
  const allYTD = funds
    .map((f) => perfYTD(f))
    .filter((p) => p.available)
    .map((p) => p.totalReturn);
  const staleCount = stalenessCutoff
    ? funds.filter((f) => (f.latestVL?.date ?? "") < stalenessCutoff && f.latestVL).length
    : 0;

  // === SERIES & AGREGATS ===
  const categoryAgg = aggregateByCategory(funds);
  const managerAgg = aggregateByManager(funds)
    .slice(0, 25)
    .map((m) => ({ ...m, slug: managerSlug(m.gestionnaire) }));
  const timelineFull = aumTimelineByCategory(funds, quarterEnds);
  const aumTimeline = timelineFull.slice(-13); // ~3 ans
  const catKeys = categoryAgg.map((c) => c.categorie);

  // === DECOMPOSITION COLLECTE (dernier trimestre, par catégorie) ===
  const flowMap = new Map<
    string,
    { perfEffect: number; netFlow: number; startAUM: number; endAUM: number; n: number }
  >();
  if (prevQuarter) {
    for (const f of funds) {
      const g = aumGrowthDecomposition(f, prevQuarter, refQuarter);
      if (g.perfEffect == null || g.netFlow == null || g.startAUM == null || g.endAUM == null)
        continue;
      const acc = flowMap.get(f.categorie) || {
        perfEffect: 0,
        netFlow: 0,
        startAUM: 0,
        endAUM: 0,
        n: 0,
      };
      acc.perfEffect += g.perfEffect;
      acc.netFlow += g.netFlow;
      acc.startAUM += g.startAUM;
      acc.endAUM += g.endAUM;
      acc.n += 1;
      flowMap.set(f.categorie, acc);
    }
  }
  const flows = Array.from(flowMap.entries())
    .map(([categorie, v]) => ({ categorie, ...v }))
    .sort((a, b) => b.endAUM - a.endAUM);

  // === HEATMAP PERF TRIMESTRIELLE × CATEGORIE (8 derniers trimestres) ===
  const heatmapRaw = quarterlyPerfHeatmap(funds, quarterEnds);
  const heatQuarters = Array.from(new Set(heatmapRaw.map((h) => h.date))).slice(-8);
  const heatCells: Record<string, number | null> = {};
  for (const h of heatmapRaw) {
    if (heatQuarters.includes(h.date)) heatCells[`${h.date}|${h.categorie}`] = h.perf;
  }

  // === LIGNES FONDS (explorateur + leaderboard) ===
  const rows = funds.map((f) => {
    const aum = f.latestQuarter?.aum ?? aumAt(f, refQuarter);
    const catRef = categoryAt(f, refQuarter) ?? f.categorie;
    const y1 = perfWindow(f, 1, "1Y");
    const ytd = perfYTD(f);
    const tr1Y = y1.available ? y1.totalReturn : null;
    const quartile =
      tr1Y != null ? quartileInCohort(tr1Y, cohort1YByCat.get(f.categorie) || []) : null;
    const catMed = catMedian1Y.get(f.categorie) ?? null;
    const excess1Y = tr1Y != null && catMed != null ? tr1Y - catMed : null;
    const cadence = publicationCadence(f, latestVLGlobal || refQuarter, quarterEnds);
    const vlDate = f.latestVL?.date ?? "";
    return {
      id: f.id,
      nom: f.nom,
      gestionnaire: f.gestionnaire,
      categorie: catRef,
      type: f.type,
      aum,
      vl: f.latestVL?.vl ?? null,
      vlDate,
      isStale: stalenessCutoff !== "" && vlDate !== "" && vlDate < stalenessCutoff,
      cadence: cadence.kind,
      ytd: ytd.available ? ytd.totalReturn : null,
      y1: tr1Y,
      quartile,
      excess1Y,
    };
  });

  const data: FCPProData = {
    asOf: { refQuarter, prevQuarter, latestVL: latestVLGlobal, latestBoc, freshBocCount },
    kpis: {
      totalAUM,
      nbFunds: funds.length,
      nbManagers: managersSet.size,
      nbCategories: categoryAgg.length,
      medianYTD: median(allYTD),
      median1Y: median(all1Y),
      staleCount,
    },
    categories: categoryAgg,
    managers: managerAgg,
    aumTimeline,
    catKeys,
    flows,
    heatmap: { quarters: heatQuarters, categories: catKeys, cells: heatCells },
    funds: rows,
  };

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Marché FCP / OPCVM"
        subtitle={`Encours, collecte nette, dispersion et classement des gérants · ${funds.length} fonds · ${managersSet.size} sociétés de gestion · zone UEMOA`}
        breadcrumb={[{ label: "Pro Terminal", href: "/pros" }, { label: "Marché FCP" }]}
        badge="Premium"
      />
      <div className="pro-tool">
        <FCPProView data={data} />
      </div>
    </div>
  );
}
