import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import FCPDetailView from "@/components/FCPDetailView";
import PremiumPaywall from "@/components/PremiumPaywall";
import { fetchUserRole } from "@/lib/auth/userRole";
import {
  loadFunds,
  listQuarterEnds,
  getReferenceQuarter,
  getLatestVLDate,
  subtractCalendarDays,
  aumAt,
  categoryAt,
} from "@/lib/fcp";
import {
  perfWindow,
  perfYTD,
  cohortMedianRebasedSeries,
  excessVsCategory,
  aumGrowthDecomposition,
  publicationCadence,
  marketShareHistory,
  quartileHistory,
  quartileInCohort,
  aumDecomposition,
  statsRisque,
  comparatifPerformances,
  fenetresGlissantes,
  nuageRisqueRendement,
} from "@/lib/fcpMath";
import { benchmarkPourCategorie } from "@/lib/fcpBenchmarks";
import { pageMetadata } from "@/lib/seo";

// userRole lu via cookies → rendu dynamique requis pour le gating premium.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fund = loadFunds().find((f) => f.id === slug);
  if (!fund) {
    return pageMetadata({
      title: "Fonds introuvable — AzimutFinance",
      path: `/fcp/${slug}`,
    });
  }
  return pageMetadata({
    title: `${fund.nom} — Fiche fonds OPCVM (${fund.gestionnaire})`,
    description: `Analyse du fonds ${fund.nom} géré par ${fund.gestionnaire} — catégorie ${fund.categorie} : performance vs médiane catégorie, quartiles historiques, encours, peers et cadence de publication.`,
    path: `/fcp/${slug}`,
  });
}

export default async function FCPDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const funds = loadFunds();
  const fund = funds.find((f) => f.id === slug);
  if (!fund) notFound();

  // === GATING PREMIUM : fiche fonds reservee aux abonnes Premium ===
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
            { label: fund.nom },
          ]}
          title={`Fiche détaillée — ${fund.nom}`}
          description="Analyse complète d'un fonds OPCVM réservée aux abonnés Premium : performance vs catégorie, quartiles, décomposition AUM, peers, cadence de publication."
          features={[
            "Performance 3M / 6M / YTD / 1Y / 3Y vs médiane catégorie",
            "Quartiles historiques et persistance",
            "Décomposition de croissance d'encours (effet perf vs flux nets)",
            "Comparatif fonds peers + autres fonds du gestionnaire",
            "Cadence de publication et fraîcheur de la VL",
          ]}
          isMember={isMember}
          back={{ label: "Retour aux FCP", href: "/marches/fcp" }}
        />
      </div>
    );
  }

  const quarterEnds = listQuarterEnds();
  const refQuarter = getReferenceQuarter(funds);
  const latestVLGlobal = getLatestVLDate(funds);
  const stalenessCutoff = latestVLGlobal
    ? subtractCalendarDays(latestVLGlobal, 15)
    : "";

  // === COHORTE (catégorie courante) ===
  const cohort = funds.filter((f) => f.categorie === fund.categorie);
  const managerPeers = funds.filter(
    (f) => f.gestionnaire === fund.gestionnaire && f.id !== fund.id
  );

  // === BLOCK 1 - HEADER ===
  const aumRef = aumAt(fund, refQuarter);
  const catAtRef = categoryAt(fund, refQuarter) ?? fund.categorie;
  const ytd = perfYTD(fund);
  const cohortYTDPerfs = cohort
    .map((f) => perfYTD(f))
    .filter((p) => p.available)
    .map((p) => p.totalReturn);
  const ytdQuartile = ytd.available ? quartileInCohort(ytd.totalReturn, cohortYTDPerfs) : null;

  // Rang de performance dans la categorie. Le quartile dit « dans le premier
  // quart » ; le rang dit « 12e sur 66 », ce qui n'est pas la meme information
  // pour un fonds en bord de quartile. Les fonds sans YTD exploitable ne sont
  // pas classes, donc pas comptes dans la base.
  const ytdRank = ytd.available
    ? cohortYTDPerfs.filter((p) => p > ytd.totalReturn).length + 1
    : null;
  const ytdRankBase = cohortYTDPerfs.length;

  // Δ AUM 1Y : AUM au refQuarter vs AUM au même trim un an avant (4 trim canoniques)
  const refIdx = quarterEnds.indexOf(refQuarter);
  const refYearAgo = refIdx >= 4 ? quarterEnds[refIdx - 4] : null;
  const aumYearAgo = refYearAgo ? aumAt(fund, refYearAgo) : null;
  const aumDelta1Y =
    aumRef !== null && aumYearAgo !== null && aumYearAgo > 0
      ? aumRef / aumYearAgo - 1
      : null;

  // === BLOCK 3 - SERIE DE VL ===
  // Toutes les obs avec VL non null, du firstObsDate au latestVL. Sert au
  // graphe de la vue d'ensemble, a la reference de marche et au comparatif.
  const vlSeries = fund.observations
    .filter((o) => o.vl !== null)
    .map((o) => ({ date: o.date, vl: o.vl as number, kind: o.kind }));
  const baseObs = vlSeries[0];
  // Médiane catégorie rebasée aux mêmes dates
  const cohortRebased = baseObs
    ? cohortMedianRebasedSeries(
        cohort,
        baseObs.date,
        vlSeries.map((p) => p.date)
      )
    : [];

  // === BLOCK 3 bis - REFERENCE DE MARCHE ===
  // Alignee sur les dates de VL du fonds, pour que le graphe n'ait qu'une
  // ligne par point. null pour les categories sans reference defendable.
  const benchmark = benchmarkPourCategorie(
    fund.categorie,
    vlSeries.map((p) => p.date)
  );

  // === BLOCK 3 ter - COMPARATIF FONDS / CATEGORIE / MARCHE ===
  const comparatif = comparatifPerformances(
    vlSeries,
    cohortRebased,
    benchmark ? benchmark.serie : null,
    fund.bocSnapshot?.vlOrigine && fund.bocSnapshot.dateOrigine
      ? { date: fund.bocSnapshot.dateOrigine, vl: fund.bocSnapshot.vlOrigine }
      : null
  );

  // === BLOCK 2 - TABLEAU DE PERFORMANCE ===
  // Derive du comparatif, et non recalcule : les deux tableaux de la fiche
  // affichaient sinon deux « medianes categorie » differentes pour la meme
  // fenetre — l'un mesurant chaque fonds sur SA propre derniere VL, l'autre
  // tout le monde aux memes bornes. C'est la seconde definition qui vaut pour
  // une comparaison, et elle vaut maintenant partout.
  const perfTable = comparatif.fenetres.map((f) => ({
    label: f.cle === "ytd" ? "YTD" : f.label,
    fromDate: f.fromDate,
    toDate: f.toDate,
    fundValue: f.fonds,
    cohortValue: f.mediane,
    excess: f.fonds !== null && f.mediane !== null ? f.fonds - f.mediane : null,
  }));

  // === BLOCK 3 quater - OUTILS TRANSVERSAUX ===
  // Douze mois glissants : une annee calendaire depend du jour ou l'on coupe.
  const glissantes = fenetresGlissantes(vlSeries, cohortRebased);
  // Nuage risque / rendement de la categorie, fonds courant compris.
  const nuage = nuageRisqueRendement(cohort, fund.id, refQuarter);

  // === BLOCK 4 - FRISE QUARTILES ===
  const quartileFrame = quartileHistory(fund, cohort, quarterEnds.slice(-16));
  const top2Pct =
    quartileFrame.length > 0
      ? quartileFrame.filter((q) => q.quartile === 1 || q.quartile === 2).length /
        quartileFrame.filter((q) => q.quartile !== null).length
      : null;

  // === BLOCK 5 - DECOMPOSITION AUM (par trimestre) ===
  const aumDecomp = aumDecomposition(fund);

  // === BLOCK 6 - EXCES VS CATEGORIE ===
  const excess = excessVsCategory(fund, cohort, quarterEnds);

  // === BLOCK 7 - PEER GROUP CATEGORIE ===
  const peerEntries = cohort
    .filter((f) => f.id !== fund.id)
    .map((f) => {
      const aumF = aumAt(f, refQuarter);
      const ytdF = perfYTD(f);
      const y1F = perfWindow(f, 1, "1Y");
      return {
        id: f.id,
        nom: f.nom,
        gestionnaire: f.gestionnaire,
        aum: aumF,
        ytd: ytdF.available ? ytdF.totalReturn : null,
        y1: y1F.available ? y1F.totalReturn : null,
      };
    })
    .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1))
    .slice(0, 10);

  // === BLOCK 8 - AUTRES FONDS DU GESTIONNAIRE ===
  const managerEntries = managerPeers.map((f) => {
    const aumF = aumAt(f, refQuarter);
    const y1F = perfWindow(f, 1, "1Y");
    const ytdF = perfYTD(f);
    return {
      id: f.id,
      nom: f.nom,
      categorie: f.categorie,
      aum: aumF,
      ytd: ytdF.available ? ytdF.totalReturn : null,
      y1: y1F.available ? y1F.totalReturn : null,
    };
  }).sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1));

  // === BLOCK 9 - PART DE MARCHE DANS LA CATEGORIE ===
  const marketShare = marketShareHistory(fund, cohort, quarterEnds);

  // === BLOCK 11 - CROISSANCE 1A & 3A DECOMPOSEE ===
  const refQ3YBefore = refIdx >= 12 ? quarterEnds[refIdx - 12] : null;
  const growth1Y = refYearAgo
    ? aumGrowthDecomposition(fund, refYearAgo, refQuarter)
    : null;
  const growth3Y = refQ3YBefore
    ? aumGrowthDecomposition(fund, refQ3YBefore, refQuarter)
    : null;

  // === BLOCK 12 - QUALITE DE PUBLICATION ===
  const cadence = publicationCadence(fund, latestVLGlobal || refQuarter, quarterEnds);

  // === BLOCK 14 - STATISTIQUES DE RISQUE ===
  // Calculees sur la serie de VL et non sur les trimestres ; rendent null
  // quand le fonds ne publie pas assez souvent (cf. lib/fcpMath).
  const stats = statsRisque(fund, cohort);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />
      <FCPDetailView
        // header
        fund={{
          id: fund.id,
          nom: fund.nom,
          gestionnaire: fund.gestionnaire,
          type: fund.type,
          categorie: fund.categorie,
          categorieAtRef: catAtRef,
          firstObsDate: fund.firstObsDate,
          depositaire: fund.bocSnapshot?.depositaire ?? "",
          frequenceCalcul: fund.bocSnapshot?.frequenceCalcul ?? "",
          bocDate: fund.bocSnapshot?.bocDate ?? "",
          bocVL: fund.bocSnapshot?.vlActuelle ?? null,
          bocDayChange: fund.bocSnapshot?.dayChange ?? null,
          // Valeur et date de creation du fonds, telles que le BOC les
          // publie — et non le premier releve de notre archive.
          vlOrigine: fund.bocSnapshot?.vlOrigine ?? null,
          dateOrigine: fund.bocSnapshot?.dateOrigine ?? "",
        }}
        refQuarter={refQuarter}
        latestVLGlobal={latestVLGlobal}
        stalenessCutoff={stalenessCutoff}
        aumRef={aumRef}
        aumDelta1Y={aumDelta1Y}
        latestVL={fund.latestVL}
        ytdQuartile={ytdQuartile}
        cohortSize={cohort.length}
        // perf table
        perfTable={perfTable}
        // VL chart
        cohortRebased={cohortRebased}
        vlSeries={vlSeries}
        benchmark={benchmark}
        ytdRank={ytdRank}
        ytdRankBase={ytdRankBase}
        comparatif={comparatif}
        glissantes={glissantes}
        nuage={nuage}
        // quartile frieze
        quartileFrame={quartileFrame}
        top2Pct={top2Pct}
        // AUM decomp
        aumDecomp={aumDecomp}
        // excess
        excess={excess}
        // peers
        peerEntries={peerEntries}
        managerEntries={managerEntries}
        // market share
        marketShare={marketShare}
        // growth
        growth1Y={growth1Y}
        growth3Y={growth3Y}
        // cadence
        cadence={cadence}
        // statistiques de risque
        stats={stats}
      />
    </div>
  );
}
