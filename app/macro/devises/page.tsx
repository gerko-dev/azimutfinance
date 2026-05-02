import Link from "next/link";
import Header from "@/components/Header";
import FxAnalyzer from "@/components/macro/FxAnalyzer";
import {
  EUR_XOF_PEG,
  FCFA_BASKET,
  FX_PAIRS,
  buildFcfaTradeWeightedIndex,
  buildNormalizedSeries,
  computeCorrelationMatrix,
  computeFxStats,
  getLatestFxDate,
  loadFxHistory,
  periodToFromDate,
  type FxSlug,
} from "@/lib/fx";

export const metadata = {
  title: "Devises & FX — AzimutFinance",
  description:
    "Cours, performances et analyses des 13 paires FX clés pour la zone UEMOA : USD/XOF, EUR/USD, DXY, NGN/XOF, GBP/XOF, JPY/XOF, ZAR/XOF, CAD/XOF, AED/XOF, TRY/XOF, BRL/XOF, USD/CNY. Indice de force du FCFA, comparateur, corrélations et cross-rates synthétiques.",
};

export const dynamic = "force-static";

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

const CATEGORY_LABEL: Record<string, string> = {
  global: "Majors / Indices",
  "fcfa-major": "FCFA — majeurs",
  "fcfa-emerging": "FCFA — émergents",
  africa: "Afrique",
};

export default async function Page() {
  const stats = FX_PAIRS.map((p) => computeFxStats(p.slug)).filter(
    (s): s is NonNullable<ReturnType<typeof computeFxStats>> => s !== null,
  );

  const latestDate = getLatestFxDate();
  const allSlugs = stats.map((s) => s.slug);

  // Series base 100 + correlations + close brut pour CHAQUE periode (pre-calcul serveur)
  const normalizedByPeriod = {} as Record<
    Period,
    { period: Period; points: { date: string; [k: string]: number | string }[]; bases: Record<string, number> }
  >;
  const correlationByPeriod = {} as Record<
    Period,
    { period: Period; matrix: (number | null)[][]; labels: string[]; slugs: FxSlug[] }
  >;
  // Donnees brutes (close) par periode pour le cross-rate calculator (XOF pairs only)
  const xofSlugs: FxSlug[] = [
    "USD_XOF", "GBP_XOF", "JPY_XOF", "CAD_XOF", "AED_XOF",
    "TRY_XOF", "BRL_XOF", "ZAR_XOF", "NGN_XOF",
  ];
  const closeByPeriod = {} as Record<
    Period,
    { date: string; [slug: string]: number | string }[]
  >;

  for (const p of ALL_PERIODS) {
    const from = periodToFromDate(p, latestDate);
    const norm = buildNormalizedSeries(allSlugs, from);
    normalizedByPeriod[p] = { period: p, ...norm };
    const corr = computeCorrelationMatrix(allSlugs, from);
    correlationByPeriod[p] = { period: p, ...corr, slugs: allSlugs };

    // Close brut par paire (uniquement les paires XOF + USD_XOF) pour les cross
    const histories = xofSlugs.map((slug) => ({
      slug,
      pts: loadFxHistory(slug).filter((pt) => pt.date >= from),
    }));
    if (histories.every((h) => h.pts.length > 0)) {
      const dateSet = new Set<string>();
      for (const h of histories) for (const pt of h.pts) dateSet.add(pt.date);
      const dates = Array.from(dateSet).sort();
      const lastIdx: Record<string, number> = {};
      for (const h of histories) lastIdx[h.slug] = -1;
      const rows: { date: string; [slug: string]: number | string }[] = [];
      for (const date of dates) {
        const row: { date: string; [slug: string]: number | string } = { date };
        for (const h of histories) {
          while (lastIdx[h.slug] + 1 < h.pts.length && h.pts[lastIdx[h.slug] + 1].date <= date) {
            lastIdx[h.slug]++;
          }
          if (lastIdx[h.slug] >= 0) row[h.slug] = h.pts[lastIdx[h.slug]].close;
        }
        rows.push(row);
      }
      closeByPeriod[p] = rows;
    } else {
      closeByPeriod[p] = [];
    }
  }

  // Indice TWI FCFA sur 5 ans
  const twi5y = buildFcfaTradeWeightedIndex(periodToFromDate("5A", latestDate));
  const twiLast = twi5y[twi5y.length - 1]?.value ?? null;
  const twiChange =
    twiLast !== null ? twiLast - 100 : null;
  const oneYearAgoIso = periodToFromDate("1A", latestDate);
  const twi1yAgo = twi5y.find((p) => p.date >= oneYearAgoIso)?.value ?? null;
  const twi1YChange =
    twiLast !== null && twi1yAgo ? ((twiLast - twi1yAgo) / twi1yAgo) * 100 : null;

  // Top movers 1A
  const topGainers1Y = [...stats]
    .filter((s) => s.returns["1A"] !== null)
    .sort((a, b) => (b.returns["1A"] ?? 0) - (a.returns["1A"] ?? 0))
    .slice(0, 3);
  const topLosers1Y = [...stats]
    .filter((s) => s.returns["1A"] !== null)
    .sort((a, b) => (a.returns["1A"] ?? 0) - (b.returns["1A"] ?? 0))
    .slice(0, 3);

  // Sparklines 1A
  const sparklines = new Map<FxSlug, { date: string; value: number }[]>();
  for (const s of stats) {
    const h = loadFxHistory(s.slug);
    const oneY = h.filter((p) => p.date >= oneYearAgoIso).map((p) => ({
      date: p.date,
      value: p.close,
    }));
    sparklines.set(s.slug, oneY);
  }

  // KPI USD/XOF (mecaniquement lie au peg)
  const usdXof = stats.find((s) => s.slug === "USD_XOF");
  const eurUsd = stats.find((s) => s.slug === "EUR_USD");
  const dxy = stats.find((s) => s.slug === "DXY");
  // EUR/XOF implicite via USD : peg verifie ?
  const impliedEurXof =
    usdXof && eurUsd ? usdXof.last * eurUsd.last : null;

  // Groupes
  const grouped = ["global", "fcfa-major", "fcfa-emerging", "africa"].map(
    (cat) => ({
      cat,
      label: CATEGORY_LABEL[cat],
      items: stats.filter((s) => s.category === cat),
    }),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs text-slate-500 mb-2">
            Accueil &rsaquo; Macro &rsaquo; Devises &amp; FX
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                Devises &amp; FX
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-3xl">
                Force du FCFA, parités majors et indice trade-weighted UEMOA. 13 paires couvrant le
                FCFA, le dollar, l&apos;euro, le yuan, le naira et les principaux partenaires
                commerciaux. Mise à jour au {fmtDateFr(latestDate)}.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              Sources :{" "}
              <span className="font-medium text-slate-700">
                BCEAO · Investing.com · ICE
              </span>
            </div>
          </div>

          {/* KPIs hero : TWI FCFA + USD/XOF + EUR/USD + DXY */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            {/* TWI FCFA — gros card */}
            <div className="md:col-span-2 border border-slate-200 rounded-lg p-4 bg-gradient-to-br from-emerald-50 via-white to-blue-50">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-slate-500">
                    Indice trade-weighted FCFA · 5 ans
                  </div>
                  <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">
                    {twiLast !== null ? fmtNum(twiLast, 1) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">vs il y a 1 an</div>
                  <div className={`text-base font-semibold tabular-nums ${
                    (twi1YChange ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}>
                    {fmtPct(twi1YChange, 1)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">vs début (base 100)</div>
                  <div className={`text-base font-semibold tabular-nums ${
                    (twiChange ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}>
                    {fmtPct(twiChange, 1)}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-snug">
                Indice synthétique de la valeur du FCFA face à un panier de devises pondéré par
                le commerce extérieur de l&apos;UEMOA hors zone euro. Hausse = FCFA s&apos;apprécie en
                termes effectifs nominaux ; baisse = inflation importée probable.
              </p>
              <TwiSpark history={twi5y} />
            </div>

            {/* USD/XOF */}
            {usdXof && (
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] text-slate-500">USD / FCFA</div>
                <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                  {fmtNum(usdXof.last, 2)}
                </div>
                <div className="text-[10px] text-slate-500">FCFA / 1 USD · {fmtDateFr(usdXof.lastDate)}</div>
                <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px] tabular-nums">
                  <KpiPair label="Jour" value={usdXof.changeDayPct} />
                  <KpiPair label="YTD" value={usdXof.returns.YTD} />
                  <KpiPair label="1 an" value={usdXof.returns["1A"]} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">
                  Implicite : EUR/XOF = {impliedEurXof ? fmtNum(impliedEurXof, 2) : "—"} (peg {fmtNum(EUR_XOF_PEG, 3)})
                </div>
              </div>
            )}

            {/* EUR/USD ou DXY */}
            {dxy && (
              <div className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="text-[11px] text-slate-500">DXY · Force du dollar</div>
                <div className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                  {fmtNum(dxy.last, 2)}
                </div>
                <div className="text-[10px] text-slate-500">
                  Indice USD vs panier majors · {fmtDateFr(dxy.lastDate)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px] tabular-nums">
                  <KpiPair label="Jour" value={dxy.changeDayPct} />
                  <KpiPair label="YTD" value={dxy.returns.YTD} />
                  <KpiPair label="1 an" value={dxy.returns["1A"]} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">
                  EUR/USD : {eurUsd ? fmtNum(eurUsd.last, 4) : "—"}
                  {eurUsd && eurUsd.returns["1A"] !== null && (
                    <span className={`ml-1 ${eurUsd.returns["1A"] >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      ({fmtPct(eurUsd.returns["1A"], 1)} 1A)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Top movers 1A */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <KpiList
              title="Top hausses 1 an"
              accent="text-emerald-700"
              items={topGainers1Y.map((g) => ({
                label: g.pair,
                sub: g.name,
                value: fmtPct(g.returns["1A"], 1),
                color: g.color,
              }))}
            />
            <KpiList
              title="Top baisses 1 an"
              accent="text-rose-700"
              items={topLosers1Y.map((g) => ({
                label: g.pair,
                sub: g.name,
                value: fmtPct(g.returns["1A"], 1),
                color: g.color,
              }))}
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Cards par paire, groupees par categorie */}
        {grouped.map(({ cat, label, items }) =>
          items.length === 0 ? null : (
            <section key={cat}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base md:text-lg font-semibold text-slate-900">{label}</h2>
                <span className="text-[11px] text-slate-400">
                  {items.length} paire{items.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {items.map((s) => (
                  <FxCard
                    key={s.slug}
                    slug={s.slug}
                    pair={s.pair}
                    name={s.name}
                    last={s.last}
                    decimals={s.decimals}
                    unitSuffix={s.unitSuffix}
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
          ),
        )}

        {/* Studio analyse interactif */}
        <section>
          <FxAnalyzer
            initialPeriod="1A"
            stats={stats}
            normalizedByPeriod={normalizedByPeriod}
            correlationByPeriod={correlationByPeriod}
            defaultSelection={["USD_XOF", "EUR_USD", "DXY", "NGN_XOF", "USD_CNY"]}
            crossData={{ slugs: xofSlugs, byPeriod: closeByPeriod }}
          />
        </section>

        {/* Impact UEMOA */}
        <section>
          <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
            <div className="mb-3">
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                Impact UEMOA &amp; BRVM
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sens d&apos;impact d&apos;une hausse de la devise base sur la zone et la BRVM, et
                pertinence pour les flux commerciaux et financiers.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FX_PAIRS.map((meta) => {
                const stat = stats.find((s) => s.slug === meta.slug);
                return (
                  <div
                    key={meta.slug}
                    className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full"
                          style={{ background: meta.color }} />
                        <span className="text-sm font-semibold text-slate-900">{meta.pair}</span>
                        <DirectionBadge direction={meta.rvmDirection} />
                      </div>
                      <span className="text-[10px] text-slate-500">{meta.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                      {meta.uemoaRelevance}
                    </p>
                    {stat && stat.returns["1A"] !== null && (
                      <div className="mt-2 flex items-baseline gap-2 text-[11px]">
                        <span className="text-slate-500">1 an :</span>
                        <span className={`tabular-nums font-medium ${
                          (stat.returns["1A"] ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}>
                          {fmtPct(stat.returns["1A"], 1)}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">vol :</span>
                        <span className="tabular-nums text-slate-700">
                          {stat.volatility1Y === null ? "—" : `${stat.volatility1Y.toFixed(0)} %`}
                        </span>
                        <span className="text-slate-300">·</span>
                        <Link href={`/macro/devises/${meta.slug}`}
                          className="text-blue-700 hover:underline font-medium">
                          Détail →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Methodologie + composition TWI */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">Méthodologie</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Données :</strong> historiques quotidiens de clôture diffusés par
              Investing.com pour chaque paire. Mise à jour manuelle.
            </p>
            <p>
              <strong>Peg EUR/XOF :</strong> le FCFA est arrimé à l&apos;euro à 655,957 XOF pour 1 EUR
              depuis le 1ᵉʳ janvier 1999. Cette parité est constante par construction et
              n&apos;apparaît donc pas dans le tableau ; en revanche, USD/XOF dépend mécaniquement
              de EUR/USD via la relation USD/XOF ≈ 655,957 / EUR/USD.
            </p>
            <p>
              <strong>Indice trade-weighted FCFA :</strong> moyenne géométrique pondérée des
              variations de la valeur du FCFA face à un panier de partenaires hors zone euro,
              base 100 au début de la fenêtre. Une valeur supérieure à 100 = FCFA apprécié.
              Composition (poids relatifs) :
            </p>
            <ul className="text-xs text-slate-600 ml-5 list-disc space-y-0.5">
              {FCFA_BASKET.map((b) => (
                <li key={b.slug}>
                  <span className="font-medium text-slate-800">
                    {FX_PAIRS.find((p) => p.slug === b.slug)?.pair ?? b.slug}
                  </span>{" "}
                  · {Math.round(b.weight * 100)} % · {b.rationale}
                </li>
              ))}
            </ul>
            <p>
              <strong>Volatilité 1A :</strong> écart-type des log-rendements quotidiens sur 1 an,
              annualisé par √252.
            </p>
            <p>
              <strong>Drawdown 5A :</strong> recul depuis le plus haut de la fenêtre 5 ans glissants.
            </p>
            <p>
              <strong>Corrélations :</strong> Pearson sur log-rendements quotidiens, intersection des
              dates communes aux séries sélectionnées (≥ 30 observations).
            </p>
            <p>
              <strong>Cross synthétique :</strong> toute paire X/Y dérivée comme (X/XOF) ÷ (Y/XOF).
              Permet de calculer GBP/JPY, NGN/ZAR, etc., sans charger de données supplémentaires.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS (server)
// =============================================================================

function FxCard({
  slug,
  pair,
  name,
  last,
  decimals,
  unitSuffix,
  lastDate,
  changeDayPct,
  returns1M,
  returnsYTD,
  color,
  spark,
}: {
  slug: FxSlug;
  pair: string;
  name: string;
  last: number;
  decimals: number;
  unitSuffix: string;
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

  return (
    <Link
      href={`/macro/devises/${slug}`}
      className="block border border-slate-200 rounded-lg p-3 bg-white hover:shadow-sm hover:border-slate-300 transition"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{pair}</div>
          <div className="text-[10px] text-slate-400 truncate" title={name}>
            {name}
          </div>
        </div>
        <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
          (changeDayPct ?? 0) >= 0
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
        }`}>
          {fmtPct(changeDayPct, 2)}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">
          {fmtNum(last, decimals)}
        </span>
        <span className="text-[10px] text-slate-400">
          {unitSuffix} · {fmtDateFr(lastDate)}
        </span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full">
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
    </Link>
  );
}

function KpiPair({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`font-medium ${
        value === null ? "text-slate-300"
          : value >= 0 ? "text-emerald-700" : "text-rose-700"
      }`}>
        {fmtPct(value, 1)}
      </div>
    </div>
  );
}

function KpiList({
  title,
  items,
  accent,
}: {
  title: string;
  items: { label: string; sub?: string; value: string; color: string }[];
  accent: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className={`text-[11px] font-medium ${accent}`}>{title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 && <li className="text-[11px] text-slate-400">—</li>}
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: it.color }} />
              <span className="font-medium">{it.label}</span>
              {it.sub && <span className="text-slate-400 text-[10px]">{it.sub}</span>}
            </span>
            <span className={`tabular-nums font-medium ${accent}`}>{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: "positive" | "negative" | "mixte" }) {
  if (direction === "positive") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
        ↑ favorable
      </span>
    );
  }
  if (direction === "negative") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">
        ↓ défavorable
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
      ↕ mixte
    </span>
  );
}

function TwiSpark({ history }: { history: { date: string; value: number }[] }) {
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
  const y100 = H - ((100 - min) / range) * H;
  const lastVal = history[history.length - 1].value;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="mt-2 block">
      <line x1={0} y1={y100} x2={W} y2={y100}
        stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={0.6} />
      <path d={path} fill="none"
        stroke={lastVal >= 100 ? "#059669" : "#dc2626"} strokeWidth={1.5} />
    </svg>
  );
}
