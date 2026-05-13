import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CommodityDetailView from "@/components/macro/CommodityDetailView";
import CommodityAdvancedChart from "@/components/macro/CommodityAdvancedChart";
import { fetchUserRole } from "@/lib/auth/userRole";
import type { OhlcPoint } from "@/components/charting/KlineChart";
import {
  COMMODITIES,
  COMMODITIES_BY_SLUG,
  COMMODITY_IMPACTS,
  buildDrawdownSeries,
  buildMovingAverage,
  buildSeasonalityMatrix,
  computeCommodityStats,
  loadCommodityHistory,
  periodToFromDate,
  type CommoditySlug,
} from "@/lib/commodities";
import { computeApromacStats, loadApromacHistory } from "@/lib/apromac";
import { computeChphPalmeStats, loadChphPalmeHistory } from "@/lib/chphPalme";

const ALL_PERIODS = ["1M", "3M", "6M", "YTD", "1A", "3A", "5A", "MAX"] as const;
type Period = (typeof ALL_PERIODS)[number];

const RETURN_HORIZONS = ["1S", "1M", "3M", "6M", "YTD", "1A", "3A", "5A"] as const;

const HORIZON_LABELS: Record<(typeof RETURN_HORIZONS)[number], string> = {
  "1S": "1 sem.",
  "1M": "1 mois",
  "3M": "3 mois",
  "6M": "6 mois",
  YTD: "YTD",
  "1A": "1 an",
  "3A": "3 ans",
  "5A": "5 ans",
};

const CATEGORY_LABEL: Record<string, string> = {
  agri: "Agricole",
  energy: "Énergie",
  metal: "Métal",
};

export function generateStaticParams() {
  return COMMODITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = COMMODITIES_BY_SLUG[slug as CommoditySlug];
  if (!meta) return { title: "Matière première — AzimutFinance" };
  return {
    title: `${meta.name} — Cours, performances & impact BRVM`,
    description: `Suivi du cours du ${meta.name} (${meta.exchange}) : performances multi-horizons, volatilité, drawdown, saisonnalité 10 ans et impact sur la zone UEMOA / BRVM.`,
  };
}

const fmtNum = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (v: number | null, dec = 1) =>
  v === null || !isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

function fmtDateFr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function CommodityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = COMMODITIES_BY_SLUG[slug as CommoditySlug];
  if (!meta) notFound();

  const stats = computeCommodityStats(meta.slug);
  if (!stats) notFound();

  const userRole = await fetchUserRole();
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";

  // Gating page entière : visible uniquement pour membres et au-dessus
  if (!isMember) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
          <div className="text-xs text-slate-500 mb-4 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-700">Accueil</Link>
            <span>›</span>
            <Link href="/macro/matieres-premieres" className="hover:text-slate-700">
              Matières premières
            </Link>
            <span>›</span>
            <span className="text-slate-700">{meta.name}</span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-8 md:p-12 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Fiche {meta.name} réservée aux membres
            </h1>
            <p className="text-sm md:text-base text-slate-600 mt-3 max-w-xl mx-auto">
              Cours quotidiens sur 20 ans, performances multi-horizons, volatilité, drawdown,
              saisonnalité, graphique avancé avec indicateurs et outils de dessin. Accès
              gratuit avec un compte AzimutFinance.
            </p>
            <div className="mt-6 flex gap-2 justify-center flex-wrap">
              <Link
                href="/auth/login"
                className="px-5 py-2.5 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 transition font-medium"
              >
                Se connecter
              </Link>
              <Link
                href="/auth/signup"
                className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm rounded hover:bg-slate-50 transition font-medium"
              >
                S&apos;inscrire gratuitement
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const history = loadCommodityHistory(meta.slug);
  // OHLC pour KlineChart (timestamps ms)
  const ohlcHistory: OhlcPoint[] = history
    .filter((h) => isFinite(h.open) && isFinite(h.high) && isFinite(h.low) && isFinite(h.close))
    .map((h) => ({
      timestamp: new Date(h.date + "T00:00:00Z").getTime(),
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
      volume: h.volume ?? undefined,
    }));
  const firstDate = history[0]?.date ?? "";
  const lastDate = stats.lastDate;

  // Pour chaque periode : daily history + MA200 + drawdown
  const dailyByPeriod: Record<Period, ReturnType<typeof loadCommodityHistory>> =
    {} as Record<Period, ReturnType<typeof loadCommodityHistory>>;
  const ma200ByPeriod: Record<Period, { date: string; ma: number | null }[]> =
    {} as Record<Period, { date: string; ma: number | null }[]>;
  const drawdownByPeriod: Record<Period, { date: string; drawdown: number }[]> =
    {} as Record<Period, { date: string; drawdown: number }[]>;

  for (const p of ALL_PERIODS) {
    const from = periodToFromDate(p, lastDate);
    dailyByPeriod[p] = history.filter((h) => h.date >= from);
    ma200ByPeriod[p] = buildMovingAverage(meta.slug, from, 200);
    drawdownByPeriod[p] = buildDrawdownSeries(meta.slug, from);
  }

  // Saisonnalite 10 ans
  const seasonality = buildSeasonalityMatrix(meta.slug, 10);

  // Impact BRVM specifique
  const impact = COMMODITY_IMPACTS.find((c) => c.slug === meta.slug);

  // APROMAC : référence officielle CI pour le caoutchouc (uniquement slug tsr)
  const apromacStats = meta.slug === "tsr" ? computeApromacStats() : null;
  const apromacHistory = meta.slug === "tsr" ? loadApromacHistory() : [];

  // CHPH : référence officielle CI pour le palmier à huile (uniquement slug palmoil)
  const chphPalmeStats = meta.slug === "palmoil" ? computeChphPalmeStats() : null;
  const chphPalmeHistory = meta.slug === "palmoil" ? loadChphPalmeHistory() : [];

  // Autres MP (pour navigation laterale)
  const otherCommodities = COMMODITIES.filter((c) => c.slug !== meta.slug);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-white">Accueil</Link>
            <span>›</span>
            <Link href="/macro/matieres-premieres" className="hover:text-white">Matières premières</Link>
            <span>›</span>
            <span className="text-slate-200">{meta.name}</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: meta.color }}
                />
                <span className="text-[11px] text-slate-300 uppercase tracking-wide">
                  {CATEGORY_LABEL[meta.category]} · {meta.exchange}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-white">
                {meta.name}
              </h1>
              <p className="text-xs md:text-sm text-slate-300 mt-1.5 max-w-2xl">
                {meta.brvmRelevance}
              </p>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-400">{fmtDateFr(stats.lastDate)} · {meta.unit}</div>
              <div className="text-3xl md:text-4xl font-semibold tabular-nums text-white mt-0.5">
                {fmtNum(stats.last, stats.last >= 1000 ? 0 : 2)}
              </div>
              <div className="flex items-center gap-2 justify-end mt-0.5">
                <span
                  className={`text-sm tabular-nums font-medium ${
                    (stats.changeDayPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtPct(stats.changeDayPct, 2)}
                </span>
                <span className="text-[11px] text-slate-400">jour</span>
              </div>
            </div>
          </div>

          {/* KPI bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            <HeroStat label="YTD" value={fmtPct(stats.returns.YTD)}
              accent={(stats.returns.YTD ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"} />
            <HeroStat label="1 an" value={fmtPct(stats.returns["1A"])}
              accent={(stats.returns["1A"] ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"} />
            <HeroStat label="Vol. 1A annualisée"
              value={stats.volatility1Y === null ? "—" : `${stats.volatility1Y.toFixed(1).replace(".", ",")} %`} />
            <HeroStat label="Drawdown vs PH 5A"
              value={stats.drawdownFromHigh5Y === null ? "—" : `${stats.drawdownFromHigh5Y.toFixed(1).replace(".", ",")} %`}
              accent={(stats.drawdownFromHigh5Y ?? 0) <= -10 ? "text-rose-700" : "text-slate-900"} />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
          <div className="space-y-6 min-w-0">
            {/* Tableau perfs multi-horizons */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Performances multi-horizons</h2>
                <span className="text-[10px] text-slate-400">historique : {fmtDateFr(firstDate)} → {fmtDateFr(lastDate)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {RETURN_HORIZONS.map((h) => {
                  const v = stats.returns[h];
                  return (
                    <div key={h} className="border border-slate-200 rounded p-2 text-center bg-slate-50/50">
                      <div className="text-[10px] text-slate-500">{HORIZON_LABELS[h]}</div>
                      <div className={`text-sm tabular-nums font-medium mt-0.5 ${
                        v === null ? "text-slate-300" : v >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}>
                        {fmtPct(v, 1)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <SmallStat label="Plus haut 52 sem." value={stats.high52w === null ? "—" : fmtNum(stats.high52w, stats.high52w >= 1000 ? 0 : 2)} />
                <SmallStat label="Plus bas 52 sem." value={stats.low52w === null ? "—" : fmtNum(stats.low52w, stats.low52w >= 1000 ? 0 : 2)} />
                <SmallStat label="z-score (1A)" value={stats.zScore1Y === null ? "—" : (stats.zScore1Y > 0 ? "+" : "") + stats.zScore1Y.toFixed(2).replace(".", ",")}
                  accent={
                    stats.zScore1Y === null ? undefined :
                      Math.abs(stats.zScore1Y) > 1.5 ? (stats.zScore1Y > 0 ? "text-emerald-700" : "text-rose-700") : undefined
                  } />
                <SmallStat label="Variation jour" value={fmtPct(stats.changeDayPct, 2)}
                  accent={(stats.changeDayPct ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"} />
              </div>
            </section>

            {/* Vue interactive : prix + MA + volume + drawdown + saisonnalite */}
            <CommodityDetailView
              slug={meta.slug}
              name={meta.name}
              unit={meta.unit}
              color={meta.color}
              initialPeriod="1A"
              dailyByPeriod={Object.fromEntries(
                Object.entries(dailyByPeriod).map(([k, arr]) => [
                  k,
                  arr.map((h) => ({
                    date: h.date,
                    open: h.open,
                    high: h.high,
                    low: h.low,
                    close: h.close,
                    volume: h.volume,
                  })),
                ]),
              ) as Record<Period, { date: string; open: number; high: number; low: number; close: number; volume: number | null }[]>}
              ma200ByPeriod={ma200ByPeriod}
              drawdownByPeriod={drawdownByPeriod}
              seasonality={seasonality}
            />

            {/* Graphique avancé : chandeliers OHLC + 50+ indicateurs + outils dessin */}
            <CommodityAdvancedChart
              ohlcHistory={ohlcHistory}
              code={meta.slug.toUpperCase()}
              name={meta.name}
              userRole={userRole}
            />

            {/* Impact BRVM — gated Premium (titre toujours visible, contenu flouté) */}
            {impact && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
                <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-slate-900">Impact BRVM &amp; UEMOA</h2>
                  <DirectionBadge direction={impact.rvmDirection} />
                </div>
                <div className="relative">
                <div className={isPremium ? "" : "blur-[4px] pointer-events-none select-none"} aria-hidden={isPremium ? undefined : true}>
                  <p className="text-xs text-slate-700 leading-relaxed">{impact.brvmRationale}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div>
                      <div className="text-[11px] text-slate-500 mb-1.5">Valeurs cotées exposées</div>
                      {impact.brvmTickers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {impact.brvmTickers.map((t) => (
                            <Link
                              key={t.code}
                              href={`/titre/${t.code}`}
                              className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-white font-medium hover:bg-slate-700"
                            >
                              {t.code}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">
                          Pas de pure-player coté à la BRVM ; l&apos;impact est macro (recettes Etat, balance courante).
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 mb-1.5">Pays UEMOA significativement exposés</div>
                      <div className="flex flex-wrap gap-1.5">
                        {impact.exposedCountries.map((cc) => (
                          <span
                            key={cc}
                            className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium"
                          >
                            {cc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Importance pour l&apos;UEMOA :{" "}
                    <span className="font-semibold text-slate-800">{impact.uemoaImportance}/100</span>
                    <span className="text-slate-400 mx-1">·</span>
                    Sens d&apos;impact d&apos;une hausse :{" "}
                    <span className="font-medium text-slate-700">
                      {impact.rvmDirection === "positive"
                        ? "favorable"
                        : impact.rvmDirection === "negative"
                        ? "défavorable"
                        : "mixte"}
                    </span>
                  </div>
                </div>
                {!isPremium && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-amber-200 max-w-md w-full p-5 md:p-6">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="text-2xl shrink-0">🔒</div>
                        <div className="min-w-0">
                          <h4 className="text-base md:text-lg font-semibold text-slate-900">
                            Analyse Impact BRVM Premium
                          </h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Découvrez quelles valeurs cotées BRVM sont exposées au cours du {meta.name},
                            le sens d&apos;impact et les pays UEMOA concernés. Disponible avec l&apos;abonnement Premium.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Link
                          href="/abonnements"
                          className="px-4 py-2 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition font-medium"
                        >
                          Passer Premium
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </section>
            )}

            {/* KPI CHPH Palmier à Huile — référence officielle CI (uniquement palmoil) */}
            {chphPalmeStats && (
              <section className="bg-gradient-to-br from-amber-50 via-white to-amber-50/40 rounded-lg border border-amber-200 p-4 md:p-5">
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      🌴 Prix CHPH Palmier à Huile — Côte d&apos;Ivoire
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Fixation officielle du Conseil Hévéa-Palmier à Huile · Source : conseilheveapalmier.ci
                    </p>
                  </div>
                </div>

                {/* Bloc Huile palme brute */}
                <div className="mb-2 text-[11px] text-slate-500 font-medium uppercase tracking-wide">
                  Huile de palme brute
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <HeroStat label="Mois" value={chphPalmeStats.latest.moisLabel} />
                  <HeroStat
                    label="Prix"
                    value={`${chphPalmeStats.latest.huileBrute.toLocaleString("fr-FR")} F/t`}
                  />
                  <HeroStat
                    label="vs mois précédent"
                    value={fmtPct(chphPalmeStats.changeHuileVsPrevPct, 1)}
                    accent={
                      chphPalmeStats.changeHuileVsPrevPct === null
                        ? undefined
                        : chphPalmeStats.changeHuileVsPrevPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                  <HeroStat
                    label="vs Décembre N-1"
                    value={fmtPct(chphPalmeStats.changeHuileVsDecPrevYearPct, 1)}
                    accent={
                      chphPalmeStats.changeHuileVsDecPrevYearPct === null
                        ? undefined
                        : chphPalmeStats.changeHuileVsDecPrevYearPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                </div>

                {/* Bloc Régime palme bord-champ */}
                <div className="mt-4 mb-2 text-[11px] text-slate-500 font-medium uppercase tracking-wide">
                  Régime de palme bord-champ
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <HeroStat label="Mois" value={chphPalmeStats.latest.moisLabel} />
                  <HeroStat
                    label="Prix"
                    value={`${chphPalmeStats.latest.regimePalme.toLocaleString("fr-FR")} F/t`}
                  />
                  <HeroStat
                    label="vs mois précédent"
                    value={fmtPct(chphPalmeStats.changeRegimeVsPrevPct, 1)}
                    accent={
                      chphPalmeStats.changeRegimeVsPrevPct === null
                        ? undefined
                        : chphPalmeStats.changeRegimeVsPrevPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                  <HeroStat
                    label="vs Décembre N-1"
                    value={fmtPct(chphPalmeStats.changeRegimeVsDecPrevYearPct, 1)}
                    accent={
                      chphPalmeStats.changeRegimeVsDecPrevYearPct === null
                        ? undefined
                        : chphPalmeStats.changeRegimeVsDecPrevYearPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                </div>

                {chphPalmeStats.latest.periodeSource && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Période de fixation :{" "}
                    <span className="font-medium text-slate-700">
                      {chphPalmeStats.latest.periodeSource}
                    </span>
                  </div>
                )}
                <ChphPalmeSparkline history={chphPalmeHistory} />
              </section>
            )}

            {/* KPI APROMAC — référence officielle hévéa CI (uniquement caoutchouc) */}
            {apromacStats && (
              <section className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 rounded-lg border border-emerald-200 p-4 md:p-5">
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      🌿 Prix APROMAC Hévéa — Côte d&apos;Ivoire
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Référence officielle mensuelle pour les producteurs ivoiriens · Source : eagrici.com
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <HeroStat label="Mois" value={apromacStats.latest.moisLabel} />
                  <HeroStat
                    label="Prix APROMAC"
                    value={`${apromacStats.latest.prixApromac} FCFA/kg`}
                  />
                  <HeroStat
                    label="vs mois précédent"
                    value={fmtPct(apromacStats.changeVsPrevPct, 1)}
                    accent={
                      apromacStats.changeVsPrevPct === null
                        ? undefined
                        : apromacStats.changeVsPrevPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                  <HeroStat
                    label="vs Décembre N-1"
                    value={fmtPct(apromacStats.changeVsDecPrevYearPct, 1)}
                    accent={
                      apromacStats.changeVsDecPrevYearPct === null
                        ? undefined
                        : apromacStats.changeVsDecPrevYearPct >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  />
                </div>
                {apromacStats.tendance && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Tendance {apromacStats.tendance.moisLabel} :{" "}
                    <span className="font-medium text-slate-700 tabular-nums">
                      {apromacStats.tendance.prixApromac} FCFA/kg
                    </span>
                    <span className="text-amber-600 ml-1.5 text-[10px] uppercase tracking-wide font-medium">
                      non confirmé
                    </span>
                  </div>
                )}
                <ApromacSparkline history={apromacHistory} />
              </section>
            )}

          </div>

          {/* Side : navigation autres MP */}
          <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-2">
              Autres matières premières
            </div>
            {otherCommodities.map((c) => {
              const s = computeCommodityStats(c.slug);
              const ytd = s?.returns.YTD ?? null;
              return (
                <Link
                  key={c.slug}
                  href={`/macro/matieres-premieres/${c.slug}`}
                  className="block border border-slate-200 rounded-lg p-2.5 bg-white hover:border-slate-300 hover:shadow-sm transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: c.color }}
                      />
                      <span className="text-xs font-medium text-slate-900 truncate">
                        {c.name}
                      </span>
                    </div>
                    <span className={`text-[10px] tabular-nums font-medium ${
                      ytd === null ? "text-slate-300" : ytd >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {fmtPct(ytd, 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {s ? fmtNum(s.last, s.last >= 1000 ? 0 : 2) : "—"} {c.unit.split(" / ")[0]}
                  </div>
                </Link>
              );
            })}
            <Link
              href="/macro/matieres-premieres"
              className="block text-center text-[11px] text-slate-600 hover:text-slate-900 px-2 py-2 border border-dashed border-slate-200 rounded-lg"
            >
              ← Tableau de bord
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}

function HeroStat({
  label, value, accent,
}: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl md:text-2xl font-semibold tabular-nums ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function ChphPalmeSparkline({
  history,
}: {
  history: { date: string; huileBrute: number; regimePalme: number }[];
}) {
  if (history.length < 2) return null;
  const W = 800;
  const H = 100;
  const padTop = 8;
  const padBot = 18;
  const padLeft = 0;
  const padRight = 80;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBot;

  // Indexation base 100 sur le 1er point pour rendre les 2 séries comparables
  // malgré leurs ordres de grandeur différents (huile ~500-620k, régime ~65-80k).
  const huileBase = history[0].huileBrute;
  const regimeBase = history[0].regimePalme;
  const huileIdx = history.map((p) => (p.huileBrute / huileBase) * 100);
  const regimeIdx = history.map((p) => (p.regimePalme / regimeBase) * 100);
  const allVals = [...huileIdx, ...regimeIdx, 100];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const last = history[history.length - 1];
  const lastHuileIdx = huileIdx[huileIdx.length - 1];
  const lastRegimeIdx = regimeIdx[regimeIdx.length - 1];

  const x = (i: number) =>
    padLeft + (i / Math.max(1, history.length - 1)) * plotW;
  const y = (v: number) => padTop + (1 - (v - min) / range) * plotH;

  const pathHuile = history
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(huileIdx[i]).toFixed(1)}`)
    .join(" ");
  const pathRegime = history
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(regimeIdx[i]).toFixed(1)}`)
    .join(" ");

  // Ligne de base 100
  const yBase = y(100);

  const yearTicks: { year: string; xPos: number }[] = [];
  const seenYears = new Set<string>();
  history.forEach((p, i) => {
    const yr = p.date.slice(0, 4);
    if (!seenYears.has(yr)) {
      seenYears.add(yr);
      yearTicks.push({ year: yr, xPos: x(i) });
    }
  });

  // Y des deux labels — décalage anti-collision si trop proches
  const yLabelHuile = y(lastHuileIdx);
  const yLabelRegime = y(lastRegimeIdx);
  const labelGap = Math.abs(yLabelHuile - yLabelRegime);
  const huileLabelY = labelGap < 12
    ? yLabelHuile - 8
    : yLabelHuile + 4;
  const regimeLabelY = labelGap < 12
    ? yLabelRegime + 12
    : yLabelRegime + 4;

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <span className="text-[11px] text-slate-500 font-medium">
          Indice base 100 depuis {history[0].date.slice(0, 4)}
        </span>
        <span className="text-[10px] text-slate-400 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-amber-600" />
            Huile brute
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5"
              style={{
                background:
                  "repeating-linear-gradient(to right,#fb923c 0,#fb923c 3px,transparent 3px,transparent 5px)",
              }}
            />
            Régime palme
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 110 }}>
        {/* Ligne de base 100 */}
        <line x1={padLeft} y1={yBase} x2={padLeft + plotW} y2={yBase}
          stroke="#94a3b8" strokeDasharray="2 3" strokeWidth={0.6} />
        <text x={padLeft + 2} y={yBase - 2} fontSize={8} fill="#94a3b8">100</text>
        {/* Huile brute (continue) */}
        <path d={pathHuile} fill="none" stroke="#d97706" strokeWidth={1.8} />
        {/* Régime palme (pointillé) */}
        <path d={pathRegime} fill="none" stroke="#fb923c" strokeWidth={1.5} strokeDasharray="4 2" />
        {/* Dernier point huile */}
        <circle cx={x(history.length - 1)} cy={yLabelHuile} r={3.2} fill="#d97706" />
        <text x={x(history.length - 1) + 6} y={huileLabelY}
          fontSize={10} fill="#92400e" fontWeight={600}>
          Huile {lastHuileIdx.toFixed(0)} ({(last.huileBrute / 1000).toFixed(0)}k)
        </text>
        {/* Dernier point régime */}
        <circle cx={x(history.length - 1)} cy={yLabelRegime} r={3.2} fill="#fb923c" />
        <text x={x(history.length - 1) + 6} y={regimeLabelY}
          fontSize={10} fill="#9a3412" fontWeight={600}>
          Régime {lastRegimeIdx.toFixed(0)} ({(last.regimePalme / 1000).toFixed(0)}k)
        </text>
        {/* labels années */}
        {yearTicks.map((t) => (
          <text key={t.year} x={t.xPos} y={H - 4} fontSize={9} fill="#94a3b8" textAnchor="middle">
            {t.year}
          </text>
        ))}
      </svg>
    </div>
  );
}

function ApromacSparkline({
  history,
}: {
  history: { date: string; prixApromac: number; confirme: boolean }[];
}) {
  if (history.length < 2) return null;
  const W = 800;
  const H = 90;
  const padTop = 4;
  const padBot = 18;
  const padLeft = 0;
  const padRight = 50;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBot;

  const values = history.map((p) => p.prixApromac);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Index du dernier point confirmé
  let lastConfirmedIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].confirme) {
      lastConfirmedIdx = i;
      break;
    }
  }
  if (lastConfirmedIdx < 0) lastConfirmedIdx = history.length - 1;
  const lastConfirmed = history[lastConfirmedIdx];
  const tendance =
    lastConfirmedIdx < history.length - 1
      ? history[history.length - 1]
      : null;

  const x = (i: number) =>
    padLeft + (i / Math.max(1, history.length - 1)) * plotW;
  const y = (v: number) => padTop + (1 - (v - min) / range) * plotH;

  // Path partie confirmée
  const confirmedSlice = history.slice(0, lastConfirmedIdx + 1);
  const pathConfirmed = confirmedSlice
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.prixApromac).toFixed(1)}`)
    .join(" ");
  // Path tendance : segment du dernier confirmé vers le point tendance
  const pathTendance = tendance
    ? `M${x(lastConfirmedIdx).toFixed(1)},${y(lastConfirmed.prixApromac).toFixed(1)} L${x(history.length - 1).toFixed(1)},${y(tendance.prixApromac).toFixed(1)}`
    : "";
  // Area fill (sur la partie confirmée seulement)
  const areaPath = `${pathConfirmed} L${x(lastConfirmedIdx).toFixed(1)},${(padTop + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const yMin = y(min);
  const yMax = y(max);

  const yearTicks: { year: string; xPos: number }[] = [];
  const seenYears = new Set<string>();
  history.forEach((p, i) => {
    const yr = p.date.slice(0, 4);
    if (!seenYears.has(yr)) {
      seenYears.add(yr);
      yearTicks.push({ year: yr, xPos: x(i) });
    }
  });

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-slate-500 font-medium">
          Historique depuis {history[0].date.slice(0, 4)}
        </span>
        <span className="text-[10px] text-slate-400 tabular-nums">
          min {min} · max {max} FCFA/kg
          {tendance && (
            <>
              {" · "}
              <span className="text-amber-600">tendance pointillée</span>
            </>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 100 }}>
        <defs>
          <linearGradient id="apromac-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* repères horizontaux min/max */}
        <line x1={padLeft} y1={yMax} x2={padLeft + plotW} y2={yMax}
          stroke="#94a3b8" strokeDasharray="2 3" strokeWidth={0.6} />
        <line x1={padLeft} y1={yMin} x2={padLeft + plotW} y2={yMin}
          stroke="#94a3b8" strokeDasharray="2 3" strokeWidth={0.6} />
        {/* area + ligne confirmée */}
        <path d={areaPath} fill="url(#apromac-grad)" />
        <path d={pathConfirmed} fill="none" stroke="#059669" strokeWidth={1.6} />
        {/* dernier point confirmé */}
        <circle cx={x(lastConfirmedIdx)} cy={y(lastConfirmed.prixApromac)} r={3.5} fill="#059669" />
        <text x={x(lastConfirmedIdx) + 6} y={y(lastConfirmed.prixApromac) + 4}
          fontSize={11} fill="#065f46" fontWeight={600}>
          {lastConfirmed.prixApromac}
        </text>
        {/* segment tendance (dashed) + point */}
        {tendance && pathTendance && (
          <>
            <path d={pathTendance} fill="none" stroke="#d97706"
              strokeWidth={1.4} strokeDasharray="4 3" />
            <circle cx={x(history.length - 1)} cy={y(tendance.prixApromac)}
              r={3} fill="white" stroke="#d97706" strokeWidth={1.5} />
            <text x={x(history.length - 1) + 6} y={y(tendance.prixApromac) + 4}
              fontSize={11} fill="#92400e" fontWeight={600}>
              {tendance.prixApromac}
            </text>
          </>
        )}
        {/* labels années */}
        {yearTicks.map((t) => (
          <text key={t.year} x={t.xPos} y={H - 4} fontSize={9} fill="#94a3b8" textAnchor="middle">
            {t.year}
          </text>
        ))}
      </svg>
    </div>
  );
}

function SmallStat({
  label, value, accent,
}: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-slate-200 rounded p-2 bg-slate-50/50">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-sm tabular-nums font-medium mt-0.5 ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: "positive" | "negative" | "mixte" }) {
  if (direction === "positive") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
        ↑ favorable BRVM
      </span>
    );
  }
  if (direction === "negative") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">
        ↓ défavorable BRVM
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
      ↕ impact mixte
    </span>
  );
}
