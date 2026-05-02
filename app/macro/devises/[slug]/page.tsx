import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CommodityDetailView from "@/components/macro/CommodityDetailView";
import {
  EUR_XOF_PEG,
  FX_BY_SLUG,
  FX_PAIRS,
  buildDrawdownSeries,
  buildMovingAverage,
  buildSeasonalityMatrix,
  computeFxStats,
  loadFxHistory,
  periodToFromDate,
  type FxSlug,
} from "@/lib/fx";

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
  global: "Major / Indice",
  "fcfa-major": "FCFA — majeur",
  "fcfa-emerging": "FCFA — émergent",
  africa: "Afrique",
};

export function generateStaticParams() {
  return FX_PAIRS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = FX_BY_SLUG[slug as FxSlug];
  if (!meta) return { title: "Devise — AzimutFinance" };
  return {
    title: `${meta.pair} — Cours, performances & analyse FX`,
    description: `Suivi de la paire ${meta.pair} (${meta.name}) : performances multi-horizons, volatilité, drawdown, saisonnalité 10 ans et impact UEMOA.`,
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

export default async function FxPairPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = FX_BY_SLUG[slug as FxSlug];
  if (!meta) notFound();

  const stats = computeFxStats(meta.slug);
  if (!stats) notFound();

  const history = loadFxHistory(meta.slug);
  const firstDate = history[0]?.date ?? "";
  const lastDate = stats.lastDate;

  const dailyByPeriod: Record<Period, ReturnType<typeof loadFxHistory>> =
    {} as Record<Period, ReturnType<typeof loadFxHistory>>;
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

  const seasonality = buildSeasonalityMatrix(meta.slug, 10);

  const otherPairs = FX_PAIRS.filter((p) => p.slug !== meta.slug);

  // Indication peg pour les paires XOF
  const isXofPair = meta.quote === "XOF";
  const isUsdXof = meta.slug === "USD_XOF";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
          <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-700">Accueil</Link>
            <span>›</span>
            <Link href="/macro/devises" className="hover:text-slate-700">Devises &amp; FX</Link>
            <span>›</span>
            <span className="text-slate-700">{meta.pair}</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full"
                  style={{ background: meta.color }} />
                <span className="text-[11px] text-slate-500 uppercase tracking-wide">
                  {CATEGORY_LABEL[meta.category]} · {meta.base} / {meta.quote}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                {meta.pair}{" "}
                <span className="text-base font-normal text-slate-500">— {meta.name}</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1.5 max-w-2xl">
                {meta.uemoaRelevance}
              </p>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500">
                {fmtDateFr(stats.lastDate)}{" "}
                {meta.unitSuffix ? `· ${meta.unitSuffix} pour 1 ${meta.base}` : ""}
              </div>
              <div className="text-3xl md:text-4xl font-semibold tabular-nums text-slate-900 mt-0.5">
                {fmtNum(stats.last, meta.decimals)}
              </div>
              <div className="flex items-center gap-2 justify-end mt-0.5">
                <span className={`text-sm tabular-nums font-medium ${
                  (stats.changeDayPct ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}>
                  {fmtPct(stats.changeDayPct, 2)}
                </span>
                <span className="text-[11px] text-slate-500">jour</span>
              </div>
            </div>
          </div>

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
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Performances multi-horizons
                </h2>
                <span className="text-[10px] text-slate-400">
                  historique : {fmtDateFr(firstDate)} → {fmtDateFr(lastDate)}
                </span>
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
                <SmallStat label="Plus haut 52 sem."
                  value={stats.high52w === null ? "—" : fmtNum(stats.high52w, meta.decimals)} />
                <SmallStat label="Plus bas 52 sem."
                  value={stats.low52w === null ? "—" : fmtNum(stats.low52w, meta.decimals)} />
                <SmallStat label="z-score (1A)"
                  value={stats.zScore1Y === null ? "—" : (stats.zScore1Y > 0 ? "+" : "") + stats.zScore1Y.toFixed(2).replace(".", ",")}
                  accent={
                    stats.zScore1Y === null ? undefined :
                      Math.abs(stats.zScore1Y) > 1.5 ? (stats.zScore1Y > 0 ? "text-emerald-700" : "text-rose-700") : undefined
                  } />
                <SmallStat label="Variation jour" value={fmtPct(stats.changeDayPct, 2)}
                  accent={(stats.changeDayPct ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"} />
              </div>
            </section>

            {/* Vue interactive : prix + MA + drawdown + saisonnalite */}
            <CommodityDetailView
              slug={meta.slug}
              name={meta.pair}
              unit={meta.unitSuffix ? `${meta.unitSuffix} / ${meta.base}` : meta.pair}
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

            {/* Bloc peg pour les paires XOF */}
            {isXofPair && (
              <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
                <h2 className="text-sm font-semibold text-slate-900">Peg EUR/XOF</h2>
                <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                  Le FCFA est arrimé à l&apos;euro à <strong>{fmtNum(EUR_XOF_PEG, 3)} XOF</strong> pour
                  1 EUR depuis le 1ᵉʳ janvier 1999. Toutes les paires X/XOF cotées ici sont donc des
                  cross dérivés via X/EUR :
                </p>
                <p className="text-xs text-slate-700 mt-1.5 font-mono bg-slate-50 rounded p-2">
                  {meta.pair} ≈ {fmtNum(EUR_XOF_PEG, 3)} ÷ ({meta.base}/EUR cours marché)
                </p>
                {isUsdXof && (
                  <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                    Cas particulier USD/XOF : la paire est mécaniquement liée à EUR/USD. Une appréciation
                    du dollar (EUR/USD baisse) = USD/XOF monte. Suivre la paire revient à suivre l&apos;inverse
                    de l&apos;EUR/USD.
                  </p>
                )}
              </section>
            )}

            {/* Impact UEMOA */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
              <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                <h2 className="text-sm font-semibold text-slate-900">Impact UEMOA &amp; BRVM</h2>
                <DirectionBadge direction={meta.rvmDirection} />
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{meta.uemoaRelevance}</p>
              <div className="mt-3 text-[11px] text-slate-500">
                Sens d&apos;impact d&apos;une hausse de la paire :{" "}
                <span className="font-medium text-slate-700">
                  {meta.rvmDirection === "positive"
                    ? "favorable BRVM / UEMOA"
                    : meta.rvmDirection === "negative"
                    ? "défavorable BRVM / UEMOA"
                    : "mixte selon le canal de transmission"}
                </span>
              </div>
            </section>

            {/* Methodologie */}
            <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold mb-2">À propos de cette paire</h3>
              <div className="text-xs text-slate-600 space-y-1.5">
                <p>
                  <strong>Paire :</strong> {meta.pair} — cours quotidien de clôture depuis Investing.com.
                  Convention : {meta.unitSuffix} pour 1 {meta.base}.
                </p>
                <p>
                  <strong>Performance :</strong> calculée du dernier cours (date_max − N jours
                  calendaires). YTD = depuis le 1ᵉʳ janvier de l&apos;année du dernier cours.
                </p>
                <p>
                  <strong>Volatilité 1A :</strong> écart-type des log-rendements quotidiens sur 1 an,
                  annualisé par √252.
                </p>
                <p>
                  <strong>Drawdown :</strong> recul depuis le dernier plus haut atteint sur la fenêtre.
                </p>
                <p>
                  <strong>z-score :</strong> écart entre le cours actuel et la moyenne 1 an, exprimé en
                  écarts-types. |z| &gt; 2 = niveau extrême statistiquement.
                </p>
                <p>
                  <strong>Saisonnalité :</strong> rendement mensuel close-to-close sur les 10 dernières
                  années, agrégé en moyenne et hit rate par mois calendaire.
                </p>
              </div>
            </section>
          </div>

          {/* Side : autres paires */}
          <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-2">
              Autres paires
            </div>
            {otherPairs.map((p) => {
              const s = computeFxStats(p.slug);
              const ytd = s?.returns.YTD ?? null;
              return (
                <Link
                  key={p.slug}
                  href={`/macro/devises/${p.slug}`}
                  className="block border border-slate-200 rounded-lg p-2.5 bg-white hover:border-slate-300 hover:shadow-sm transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: p.color }} />
                      <span className="text-xs font-medium text-slate-900 truncate">{p.pair}</span>
                    </div>
                    <span className={`text-[10px] tabular-nums font-medium ${
                      ytd === null ? "text-slate-300" : ytd >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {fmtPct(ytd, 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {s ? fmtNum(s.last, p.decimals) : "—"} {p.unitSuffix}
                  </div>
                </Link>
              );
            })}
            <Link href="/macro/devises"
              className="block text-center text-[11px] text-slate-600 hover:text-slate-900 px-2 py-2 border border-dashed border-slate-200 rounded-lg">
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
