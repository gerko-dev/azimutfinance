import Link from "next/link";
import Header from "@/components/Header";
import CommoditiesAnalyzer from "@/components/macro/CommoditiesAnalyzer";
import {
  COMMODITIES,
  COMMODITY_IMPACTS,
  buildNormalizedSeries,
  buildUemoaPressureIndex,
  computeCommodityStats,
  computeCorrelationMatrix,
  computeDirectionConsistency,
  computeFavorability,
  getLatestCommodityDate,
  loadCommodityHistory,
  periodToFromDate,
  type BrvmTickerExposure,
  type CommoditySlug,
  type DirectionConsistency,
  type ExposureDirection,
  type Favorability,
} from "@/lib/commodities";
import { loadPriceHistory, loadStocks } from "@/lib/dataLoader";
import { fetchUserRole } from "@/lib/auth/userRole";

export const metadata = {
  title: "Matières premières — AzimutFinance",
  description:
    "Cours, performances et impact sur la BRVM des 8 matières premières structurantes pour l'UEMOA : cacao, café, brent, WTI, or, huile de palme, sucre, caoutchouc. Comparateur, corrélations et indice de pression macro.",
};

export const dynamic = "force-dynamic";

const ALL_PERIODS = ["1M", "3M", "6M", "YTD", "1A", "3A", "5A", "MAX"] as const;
type Period = (typeof ALL_PERIODS)[number];

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

export default async function Page() {
  // ---- Gating Premium pour la section Impact BRVM ----
  const userRole = await fetchUserRole();
  const isPremium = userRole === "premium" || userRole === "pro";

  // ---- Stats ----
  const stats = COMMODITIES.map((c) => computeCommodityStats(c.slug)).filter(
    (s): s is NonNullable<ReturnType<typeof computeCommodityStats>> => s !== null,
  );

  // ---- Map code BRVM -> nom long (pour les tickers pure-players dans le bloc Impact) ----
  const tickerNames = new Map<string, string>();
  for (const s of loadStocks()) {
    if (s.code) tickerNames.set(s.code, s.name || s.code);
  }

  // ---- Sanity-check direction : corrélation observée vs direction structurelle ----
  // Pré-charge les historiques de cours des tickers exposés, calcule la consistency.
  const consistencyByPair = new Map<string, DirectionConsistency>();
  for (const c of COMMODITY_IMPACTS) {
    for (const t of c.brvmTickers) {
      const key = `${c.slug}:${t.code}`;
      const history = loadPriceHistory(t.code);
      consistencyByPair.set(
        key,
        computeDirectionConsistency(c.slug, t.direction, history),
      );
    }
  }

  const latestDate = getLatestCommodityDate();
  const allSlugs = stats.map((s) => s.slug);

  // ---- Series base 100 + correlations pour CHAQUE periode ----
  const normalizedByPeriod = {} as Record<
    Period,
    { period: Period; points: { date: string; [k: string]: number | string }[]; bases: Record<string, number> }
  >;
  const correlationByPeriod = {} as Record<
    Period,
    { period: Period; matrix: (number | null)[][]; labels: string[]; slugs: CommoditySlug[] }
  >;
  for (const p of ALL_PERIODS) {
    const from = periodToFromDate(p, latestDate);
    const norm = buildNormalizedSeries(allSlugs, from);
    normalizedByPeriod[p] = { period: p, ...norm };
    const corr = computeCorrelationMatrix(allSlugs, from);
    correlationByPeriod[p] = { period: p, ...corr, slugs: allSlugs };
  }

  // ---- Indice de pression UEMOA (5 ans) ----
  const pressure5y = buildUemoaPressureIndex(periodToFromDate("5A", latestDate));
  const pressureLast = pressure5y[pressure5y.length - 1]?.value ?? null;
  const pressureFirst = pressure5y[0]?.value ?? null;
  const pressureChange =
    pressureLast !== null && pressureFirst
      ? ((pressureLast - 100) as number)
      : null;
  // Variation 1A de l'indice
  const oneYearAgoIso = periodToFromDate("1A", latestDate);
  const pressure1yAgo =
    pressure5y.find((p) => p.date >= oneYearAgoIso)?.value ?? null;
  const pressure1YChange =
    pressureLast !== null && pressure1yAgo
      ? ((pressureLast - pressure1yAgo) / pressure1yAgo) * 100
      : null;

  // ---- KPIs hero ----
  // Top hausses & baisses YTD
  const topGainers = [...stats]
    .filter((s) => s.returns.YTD !== null)
    .sort((a, b) => (b.returns.YTD ?? 0) - (a.returns.YTD ?? 0))
    .slice(0, 3);
  const topLosers = [...stats]
    .filter((s) => s.returns.YTD !== null)
    .sort((a, b) => (a.returns.YTD ?? 0) - (b.returns.YTD ?? 0))
    .slice(0, 3);

  // Mini sparkline 1A pour chaque MP (sur cards)
  const sparklines = new Map<CommoditySlug, { date: string; value: number }[]>();
  for (const s of stats) {
    const h = loadCommodityHistory(s.slug);
    const oneY = h.filter((p) => p.date >= oneYearAgoIso).map((p) => ({
      date: p.date,
      value: p.close,
    }));
    sparklines.set(s.slug, oneY);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs text-slate-400 mb-2">
            Accueil &rsaquo; Macro &rsaquo; Matières premières
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-white">
                Matières premières
              </h1>
              <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-3xl">
                Cours, performances et impact sur l&apos;économie UEMOA des 8 sous-jacents
                structurants pour la BRVM. Mise à jour au {fmtDateFr(latestDate)}.
              </p>
            </div>
          </div>

          {/* Hero stats : indice de pression + top movers */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <div className="md:col-span-2 border border-slate-200 rounded-lg p-4 bg-gradient-to-br from-blue-50 via-white to-emerald-50">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-slate-500">Indice de pression UEMOA · 5 ans</div>
                  <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">
                    {pressureLast !== null ? fmtNum(pressureLast, 1) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">vs il y a 1 an</div>
                  <div
                    className={`text-base font-semibold tabular-nums ${
                      (pressure1YChange ?? 0) >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {fmtPct(pressure1YChange, 1)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">vs début (base 100)</div>
                  <div
                    className={`text-base font-semibold tabular-nums ${
                      (pressureChange ?? 0) >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {fmtPct(pressureChange, 1)}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-snug">
                Indice synthétique pondéré : hausse = environnement de prix favorable à la zone
                UEMOA (exports clés en hausse, énergie en baisse). Cacao, or, palme, caoutchouc,
                café et sucre comptent positivement ; le brent négativement.
              </p>
              <PressureSpark history={pressure5y} />
            </div>

            {/* Top hausses */}
            <KpiList
              title="Top hausses YTD"
              accent="text-emerald-700"
              items={topGainers.map((g) => ({
                label: g.name,
                value: fmtPct(g.returns.YTD, 1),
                color: g.color,
              }))}
            />
            {/* Top baisses */}
            <KpiList
              title="Top baisses YTD"
              accent="text-rose-700"
              items={topLosers.map((g) => ({
                label: g.name,
                value: fmtPct(g.returns.YTD, 1),
                color: g.color,
              }))}
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Cards par MP */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Vue d&apos;ensemble
            </h2>
            <span className="text-[11px] text-slate-400">
              Dernier cours · variation jour · 1 mois · YTD
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <CommodityCard
                key={s.slug}
                slug={s.slug}
                name={s.name}
                unit={s.unit}
                last={s.last}
                lastDate={s.lastDate}
                changeDayPct={s.changeDayPct}
                returns1M={s.returns["1M"]}
                returnsYTD={s.returns.YTD}
                color={s.color}
                spark={sparklines.get(s.slug) ?? []}
              />
            ))}
          </div>
        </section>

        {/* Studio analyse interactif */}
        <section>
          <CommoditiesAnalyzer
            initialPeriod="1A"
            stats={stats}
            normalizedByPeriod={normalizedByPeriod}
            correlationByPeriod={correlationByPeriod}
            defaultSelection={["cacao", "or", "brent", "palmoil", "tsr"]}
          />
        </section>

        {/* Impact BRVM — gated Premium (titre toujours visible, contenu flouté) */}
        <section>
          <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="mb-3">
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                Impact BRVM &amp; UEMOA
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pure-players ≥70 % d&apos;exposition CA uniquement.
              </p>
            </div>
            <div className="relative">
              <div
                className={isPremium ? "" : "blur-[4px] pointer-events-none select-none"}
                aria-hidden={isPremium ? undefined : true}
              >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {COMMODITY_IMPACTS.map((c) => {
                const stat = stats.find((s) => s.slug === c.slug);
                const trend3M = stat?.returns["3M"] ?? null;
                return (
                  <div
                    key={c.slug}
                    className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                        <DirectionBadge direction={c.rvmDirection} />
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Importance UEMOA :{" "}
                        <span className="font-medium text-slate-800">{c.uemoaImportance}/100</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                      {c.brvmRationale}
                    </p>

                    {/* Tendance 3M */}
                    <div className="mt-2 flex items-baseline gap-2 text-[11px]">
                      <span className="text-slate-500">Tendance 3 mois :</span>
                      <TrendChip value={trend3M} />
                      {stat?.volatility1Y !== null && stat?.volatility1Y !== undefined && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500">vol :</span>
                          <span className="tabular-nums text-slate-700">
                            {stat.volatility1Y.toFixed(0)} %
                          </span>
                        </>
                      )}
                    </div>

                    {c.brvmTickers.length > 0 && (
                      <ul className="mt-2.5 border-t border-slate-100 pt-2 space-y-1">
                        {c.brvmTickers.map((t) => (
                          <TickerImpactRow
                            key={t.code}
                            ticker={t}
                            name={tickerNames.get(t.code) ?? t.code}
                            favorability={computeFavorability(trend3M, t.direction)}
                            consistency={consistencyByPair.get(`${c.slug}:${t.code}`) ?? null}
                          />
                        ))}
                      </ul>
                    )}

                    {/* Pays exposés */}
                    {c.exposedCountries.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Pays exposés :</span>
                        {c.exposedCountries.map((cc) => (
                          <span
                            key={cc}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium"
                          >
                            {cc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                          Pure-players cotés exposés (≥70 % CA) avec favorabilité dynamique calculée
                          sur la tendance 3 mois et sanity-check de corrélation 3 ans. Disponible
                          avec l&apos;abonnement Premium.
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
          </div>
        </section>

      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS (server)
// =============================================================================

function CommodityCard({
  slug,
  name,
  unit,
  last,
  lastDate,
  changeDayPct,
  returns1M,
  returnsYTD,
  color,
  spark,
}: {
  slug: CommoditySlug;
  name: string;
  unit: string;
  last: number;
  lastDate: string;
  changeDayPct: number | null;
  returns1M: number | null;
  returnsYTD: number | null;
  color: string;
  spark: { date: string; value: number }[];
}) {
  const min = spark.length ? Math.min(...spark.map((p) => p.value)) : 0;
  const max = spark.length ? Math.max(...spark.map((p) => p.value)) : 1;
  const range = max - min || 1;
  const W = 200;
  const H = 38;
  const path = spark
    .map((p, i) => {
      const x = (i / Math.max(1, spark.length - 1)) * W;
      const y = H - ((p.value - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const dayClass =
    changeDayPct === null
      ? "text-slate-400"
      : changeDayPct >= 0
      ? "text-emerald-600"
      : "text-rose-600";

  return (
    <Link
      href={`/macro/matieres-premieres/${slug}`}
      className="block border border-slate-200 rounded-lg p-3 bg-white hover:shadow-sm hover:border-slate-300 transition"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{name}</div>
          <div className="text-[10px] text-slate-400">{unit}</div>
        </div>
        <span
          className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
            (changeDayPct ?? 0) >= 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {fmtPct(changeDayPct, 2)}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">
          {fmtNum(last, last >= 1000 ? 0 : 2)}
        </span>
        <span className="text-[10px] text-slate-400">{fmtDateFr(lastDate)}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1.5">
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums">
        <span className="text-slate-500">
          1M{" "}
          <span className={returns1M !== null && returns1M >= 0 ? "text-emerald-700" : "text-rose-700"}>
            {fmtPct(returns1M, 1)}
          </span>
        </span>
        <span className="text-slate-500">
          YTD{" "}
          <span className={returnsYTD !== null && returnsYTD >= 0 ? "text-emerald-700" : "text-rose-700"}>
            {fmtPct(returnsYTD, 1)}
          </span>
        </span>
      </div>
      <div className={`text-[10px] mt-0.5 ${dayClass}`}></div>
    </Link>
  );
}

function KpiList({
  title,
  items,
  accent,
}: {
  title: string;
  items: { label: string; value: string; color: string }[];
  accent: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className={`text-[11px] font-medium ${accent}`}>{title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 && (
          <li className="text-[11px] text-slate-400">—</li>
        )}
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-700">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: it.color }}
              />
              {it.label}
            </span>
            <span className={`tabular-nums font-medium ${accent}`}>{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendChip({ value }: { value: number | null }) {
  if (value === null || !isFinite(value)) {
    return <span className="text-[11px] text-slate-400">—</span>;
  }
  const abs = Math.abs(value);
  const flat = abs < 5;
  const up = value > 0;
  const cls = flat
    ? "text-slate-500"
    : up
    ? "text-emerald-700"
    : "text-rose-700";
  const arrow = flat ? "→" : up ? "↑" : "↓";
  return (
    <span className={`tabular-nums font-medium ${cls}`}>
      {arrow} {fmtPct(value, 1)}
    </span>
  );
}

function ExposureIcon({ direction }: { direction: ExposureDirection }) {
  if (direction === "positive") {
    return (
      <span
        className="text-[10px] text-emerald-700 font-medium"
        title="Bénéficie d'une hausse de la matière première"
      >
        ↑ pos
      </span>
    );
  }
  if (direction === "negative") {
    return (
      <span
        className="text-[10px] text-rose-700 font-medium"
        title="Pénalisé par une hausse de la matière première"
      >
        ↓ neg
      </span>
    );
  }
  return (
    <span
      className="text-[10px] text-amber-700 font-medium"
      title="Sens d'impact non tranché"
    >
      ↕ mixte
    </span>
  );
}

const FAVORABILITY_STYLE: Record<
  Favorability,
  { label: string; cls: string }
> = {
  favorable: { label: "favorable", cls: "bg-emerald-100 text-emerald-800" },
  defavorable: { label: "défavorable", cls: "bg-rose-100 text-rose-800" },
  neutre: { label: "neutre", cls: "bg-slate-100 text-slate-700" },
  a_surveiller: { label: "à surveiller", cls: "bg-amber-100 text-amber-800" },
  indisponible: { label: "—", cls: "bg-slate-50 text-slate-400" },
};

function FavorabilityBadge({ value }: { value: Favorability }) {
  const s = FAVORABILITY_STYLE[value];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}

function TickerImpactRow({
  ticker,
  name,
  favorability,
  consistency,
}: {
  ticker: BrvmTickerExposure;
  name: string;
  favorability: Favorability;
  consistency: DirectionConsistency | null;
}) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <Link
        href={`/titre/${ticker.code}`}
        className="font-mono font-semibold text-slate-900 hover:underline shrink-0"
        style={{ minWidth: 48 }}
      >
        {ticker.code}
      </Link>
      <span className="text-slate-600 truncate flex-1" title={ticker.rationale ?? name}>
        {name}
      </span>
      <ExposureIcon direction={ticker.direction} />
      <FavorabilityBadge value={favorability} />
      <DivergenceWarning consistency={consistency} expected={ticker.direction} />
    </li>
  );
}

function DivergenceWarning({
  consistency,
  expected,
}: {
  consistency: DirectionConsistency | null;
  expected: ExposureDirection;
}) {
  if (!consistency || consistency.status !== "divergent") return null;
  const corr = consistency.observedCorrelation;
  const corrFmt = corr === null ? "—" : corr.toFixed(2).replace(".", ",");
  return (
    <span
      className="text-[10px] text-amber-700 cursor-help"
      title={`Corrélation observée 3A : ${corrFmt} (n=${consistency.sampleSize}). Contredit la direction structurelle '${expected}'. Le business model a pu évoluer — à revoir.`}
    >
      ⚠
    </span>
  );
}

function DirectionBadge({ direction }: { direction: "positive" | "negative" | "mixte" }) {
  if (direction === "positive") {
    return (
      <span
        title="Direction macro UEMOA : hausse de la MP = favorable pour l'économie globale (recettes fiscales, balance courante, refinancement souverain). Voir la favorabilité par ticker pour l'impact spécifique entreprise."
        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium cursor-help"
      >
        ↑ favorable
      </span>
    );
  }
  if (direction === "negative") {
    return (
      <span
        title="Direction macro UEMOA : hausse de la MP = défavorable pour l'économie globale (inflation importée, déficit énergétique). Voir la favorabilité par ticker pour l'impact spécifique entreprise."
        className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium cursor-help"
      >
        ↓ défavorable
      </span>
    );
  }
  return (
    <span
      title="Direction macro UEMOA : effet net ambigu sur l'économie globale (canaux favorables et défavorables qui se compensent). La favorabilité par ticker reflète l'impact spécifique entreprise et peut diverger."
      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium cursor-help"
    >
      ↕ mixte
    </span>
  );
}

function PressureSpark({ history }: { history: { date: string; value: number }[] }) {
  if (history.length < 2) return null;
  const W = 400;
  const H = 60;
  const min = Math.min(...history.map((p) => p.value));
  const max = Math.max(...history.map((p) => p.value));
  const range = max - min || 1;
  const path = history
    .map((p, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - ((p.value - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Ligne 100
  const y100 = H - ((100 - min) / range) * H;
  const lastVal = history[history.length - 1].value;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="mt-2 block">
      <line
        x1={0}
        y1={y100}
        x2={W}
        y2={y100}
        stroke="#94a3b8"
        strokeDasharray="3 3"
        strokeWidth={0.6}
      />
      <path
        d={path}
        fill="none"
        stroke={lastVal >= 100 ? "#059669" : "#dc2626"}
        strokeWidth={1.5}
      />
    </svg>
  );
}
