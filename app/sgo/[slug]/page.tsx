import { notFound } from "next/navigation";
import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Ticker from "@/components/Ticker";
import SGODetailView from "@/components/SGODetailView";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  getManagerBySlug,
  listManagers,
  getLatestBocDate,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  categoryBreakdownForManager,
  managerQualityScore,
  managerAumGrowthDecomposition,
  managerCadenceMix,
  managerPerfHeatmap,
  aumTimelineByCategory,
  quartileInCohort,
} from "@/lib/fcpMath";
import { pageMetadata } from "@/lib/seo";

// userRole lu via cookies → rendu dynamique requis pour le gating premium.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = getManagerBySlug(slug);
  if (!result) {
    return pageMetadata({
      title: "Société de gestion — AzimutFinance",
      path: `/sgo/${slug}`,
      noindex: true,
    });
  }
  const { manager } = result;
  // noindex : la fiche est gatee Premium, le contenu visible aux bots est un
  // paywall — pas de valeur SEO et risque de "soft 404".
  return pageMetadata({
    title: `${manager.name} — Société de gestion UEMOA (FCP, AUM, performances)`,
    description: `Fiche société de gestion ${manager.name} : encours sous gestion, fonds gérés, performances pondérées, qualité et part de marché en zone UEMOA.`,
    path: `/sgo/${slug}`,
    noindex: true,
  });
}

export default async function SGODetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = getManagerBySlug(slug);
  if (!result) notFound();
  const { manager, funds: managerFunds } = result;

  // === GATING PREMIUM : fiche SGO reservee aux abonnes Premium ===
  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";
  if (!isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <Ticker />
        <PremiumPaywall
          breadcrumb={[
            { label: "Marchés", href: "/" },
            { label: "FCP / OPCVM", href: "/marches/fcp" },
            { label: "Sociétés de gestion", href: "/sgo" },
            { label: manager.name },
          ]}
          title={`Fiche détaillée — ${manager.name}`}
          description="Analyse complète d'une société de gestion réservée aux abonnés Premium : encours, répartition par catégorie, position concurrentielle, qualité de la gestion."
          features={[
            "Évolution d'encours agrégé sur 3 ans + décomposition perf / flux",
            "Répartition catégorielle vs marché et score de qualité",
            "League table : position vs toutes les SGO UEMOA",
            "Heatmap de performance par catégorie × trimestre",
            "Cadence de publication des fonds gérés",
          ]}
          isMember={isMember}
          back={{ label: "Retour aux sociétés de gestion", href: "/sgo" }}
        />
      </div>
    );
  }

  const allFunds = loadFunds();
  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(allFunds);
  const latestVLGlobal = getLatestVLDate(allFunds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const ref3YBefore = refIdx >= 12 ? quarterEnds[refIdx - 12] : null;

  // === BLOCK 1 - HEADER ===
  // AUM total marché (pour part de marché)
  const marketTotalAUM = allFunds.reduce(
    (s, f) => s + (aumAt(f, refQuarter) ?? 0),
    0
  );
  const aumYearAgoTotal = refYearAgo
    ? managerFunds.reduce((s, f) => s + (aumAt(f, refYearAgo) ?? 0), 0)
    : 0;
  const aumDelta1Y =
    aumYearAgoTotal > 0 ? manager.aumAtRef / aumYearAgoTotal - 1 : null;
  const marketShare = marketTotalAUM > 0 ? manager.aumAtRef / marketTotalAUM : 0;

  // === BLOCK 2 - REPARTITION CATEGORIE ===
  const breakdown = categoryBreakdownForManager(managerFunds, refQuarter);
  const marketBreakdownTotal = new Map<string, number>();
  for (const f of allFunds) {
    const obs = f.observations.find(
      (o) => o.date === refQuarter && o.kind === "quarter" && o.aum !== null
    );
    if (!obs || obs.aum === null) continue;
    marketBreakdownTotal.set(
      obs.categorie,
      (marketBreakdownTotal.get(obs.categorie) || 0) + obs.aum
    );
  }
  const marketBreakdown = Array.from(marketBreakdownTotal.entries()).map(
    ([categorie, aum]) => ({
      categorie,
      aum,
      share: marketTotalAUM > 0 ? aum / marketTotalAUM : 0,
    })
  );

  // === BLOCK 3 - EVOLUTION AUM SGO ===
  const aumTimeline = aumTimelineByCategory(managerFunds, quarterEnds);

  // === BLOCK 4 - SCORE QUALITE ===
  const quality = managerQualityScore(managerFunds, allFunds);

  // === BLOCK 5 - LISTE DES FONDS ===
  // Cohortes par catégorie pour quartiles
  const cohortByCat = new Map<string, number[]>();
  for (const f of allFunds) {
    const v = perfWindow(f, 1, "1Y").totalReturn;
    if (!Number.isFinite(v) || v === 0) continue;
    const list = cohortByCat.get(f.categorie) || [];
    list.push(v);
    cohortByCat.set(f.categorie, list);
  }
  const fundsList = managerFunds
    .map((f) => {
      const aum = aumAt(f, refQuarter);
      const ytd = perfYTD(f);
      const y1 = perfWindow(f, 1, "1Y");
      const y1tr = y1.available ? y1.totalReturn : null;
      const quartile = y1tr !== null ? quartileInCohort(y1tr, cohortByCat.get(f.categorie) || []) : null;
      const latestVLDate = f.latestVL?.date ?? "";
      const isStale = stalenessCutoff !== "" && latestVLDate < stalenessCutoff;
      return {
        id: f.id,
        nom: f.nom,
        categorie: f.categorie,
        aum,
        ytd: ytd.available ? ytd.totalReturn : null,
        y1: y1tr,
        quartile,
        latestVLDate,
        isStale,
        vlLatest: f.bocSnapshot?.vlActuelle ?? null,
        dayChange: f.bocSnapshot?.dayChange ?? null,
        bocDate: f.bocSnapshot?.bocDate ?? "",
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  // === BLOCK 6 - DECOMPOSITION AUM AGREGEE ===
  const growth1Y = refYearAgo
    ? managerAumGrowthDecomposition(managerFunds, refYearAgo, refQuarter)
    : null;
  const growth3Y = ref3YBefore
    ? managerAumGrowthDecomposition(managerFunds, ref3YBefore, refQuarter)
    : null;

  // === BLOCK 7 - POSITION CONCURRENTIELLE ===
  // League table : toutes les SGO triées par AUM
  const allManagers = listManagers().map((m) => {
    const mFunds = allFunds.filter((f) => f.gestionnaire === m.name);
    const q = managerQualityScore(mFunds, allFunds);
    return {
      slug: m.slug,
      name: m.name,
      nbFunds: m.nbFunds,
      aumAtRef: m.aumAtRef,
      marketShare: marketTotalAUM > 0 ? m.aumAtRef / marketTotalAUM : 0,
      perfWeighted1Y: q.perfWeighted1Y,
      topQuartileShare: q.topQuartileShare,
    };
  });
  const myRank = allManagers.findIndex((m) => m.slug === manager.slug) + 1;

  // === BLOCK 8 - HEATMAP PERF SGO CAT × TRIM ===
  const perfHeatmap = managerPerfHeatmap(managerFunds, quarterEnds);

  // === BLOCK 9 - CADENCE AGREGEE ===
  const cadenceMix = managerCadenceMix(managerFunds, latestVLGlobal || refQuarter, quarterEnds);

  // === BANDEAU BOC : date du dernier scrap ===
  const latestBocDate = getLatestBocDate(allFunds);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <PageHero
        breadcrumb={[
          { label: "Accueil", href: "/" },
          { label: "FCP / OPCVM", href: "/marches/fcp" },
          { label: "Sociétés de gestion", href: "/sgo" },
          { label: manager.name },
        ]}
        title={manager.name}
        subtitle="Société de gestion · OPCVM UEMOA"
      />
      <SGODetailView
        manager={manager}
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        marketTotalAUM={marketTotalAUM}
        marketShare={marketShare}
        aumDelta1Y={aumDelta1Y}
        breakdown={breakdown}
        marketBreakdown={marketBreakdown}
        aumTimeline={aumTimeline}
        quality={quality}
        fundsList={fundsList}
        growth1Y={growth1Y}
        growth3Y={growth3Y}
        allManagers={allManagers}
        myRank={myRank}
        perfHeatmap={perfHeatmap}
        cadenceMix={cadenceMix}
        latestBocDate={latestBocDate}
      />
    </div>
  );
}
