"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Line,
  LineChart,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Cell,
} from "recharts";
import type {
  ReturnsMatrix,
  RiskMetrics,
  Quadrant,
  AdvancedStatsSnapshot,
} from "@/lib/stockStats";

type Props = {
  ticker: string;
  quadrant: Quadrant | null;
  returnsMatrix: ReturnsMatrix;
  riskMetrics: RiskMetrics;
  advanced: AdvancedStatsSnapshot;
};

// === Formatters ===

function formatPct(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatPctSigned(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatNum(v: number | null, decimals = 2): string {
  if (v === null || !isFinite(v)) return "—";
  return v.toFixed(decimals).replace(".", ",");
}

function formatScientific(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  if (Math.abs(v) < 0.0001 && v !== 0) return v.toExponential(2);
  return v.toFixed(4).replace(".", ",");
}

function pctColor(v: number | null): string {
  if (v === null || !isFinite(v) || v === 0) return "text-slate-700";
  return v > 0 ? "text-green-700" : "text-red-700";
}

const QUADRANT_INFO: Record<
  Quadrant,
  { emoji: string; name: string; desc: string; cls: string }
> = {
  cashcow: {
    emoji: "🎯",
    name: "Cash cow",
    desc: "Rendement élevé pour une volatilité faible.",
    cls: "bg-green-50 border-green-200 text-green-900",
  },
  hiddengem: {
    emoji: "💎",
    name: "Hidden gem",
    desc: "Rendement élevé mais volatilité élevée.",
    cls: "bg-purple-50 border-purple-200 text-purple-900",
  },
  defensive: {
    emoji: "🛡️",
    name: "Defensive",
    desc: "Rendement faible et volatilité faible.",
    cls: "bg-blue-50 border-blue-200 text-blue-900",
  },
  speculative: {
    emoji: "⚡",
    name: "Spéculative",
    desc: "Rendement faible et volatilité élevée.",
    cls: "bg-amber-50 border-amber-200 text-amber-900",
  },
};

const PERIOD_LABELS: Record<keyof ReturnsMatrix, string> = {
  "1M": "1 mois",
  "3M": "3 mois",
  "6M": "6 mois",
  YTD: "Depuis le 1er janvier",
  "1A": "1 an",
  "3A": "3 ans",
  "5A": "5 ans",
  depuis: "Depuis cotation",
};

const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sept",
  "Oct",
  "Nov",
  "Déc",
];

export default function AdvancedStatsView({
  ticker,
  quadrant,
  returnsMatrix,
  riskMetrics,
  advanced,
}: Props) {
  const { descriptive, normality, histogram, qqPlot, risk, regression, autocorr, monthlyReturns } =
    advanced;

  const hasData = descriptive !== null && descriptive.n >= 30;

  // === Heatmap mensuelle : matrice année × mois ===
  const heatmap = useMemo(() => {
    const years = Array.from(new Set(monthlyReturns.map((m) => m.year))).sort();
    const grid: Record<number, Record<number, number>> = {};
    for (const y of years) grid[y] = {};
    for (const m of monthlyReturns) grid[m.year][m.month] = m.ret;
    // Annual total = produit
    const yearTotal: Record<number, number | null> = {};
    for (const y of years) {
      let prod = 1;
      let count = 0;
      for (let mo = 1; mo <= 12; mo++) {
        if (grid[y][mo] !== undefined) {
          prod *= 1 + grid[y][mo];
          count++;
        }
      }
      yearTotal[y] = count > 0 ? prod - 1 : null;
    }
    return { years, grid, yearTotal };
  }, [monthlyReturns]);

  if (!hasData) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
        <div className="text-4xl mb-3">📈</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Historique insuffisant pour des statistiques avancées
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {ticker} ne dispose pas d&apos;assez d&apos;observations (minimum 30 séances)
          pour calculer les tests de normalité, VaR et régression.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === BANDEAU QUADRANT === */}
      {quadrant && (
        <div
          className={`rounded-lg border p-4 md:p-5 ${QUADRANT_INFO[quadrant].cls}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                Classification Azimut
              </div>
              <div className="text-xl md:text-2xl font-semibold mt-1">
                {QUADRANT_INFO[quadrant].emoji} {QUADRANT_INFO[quadrant].name}
              </div>
              <p className="text-sm mt-1 opacity-80 max-w-xl">
                {QUADRANT_INFO[quadrant].desc}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* === DESCRIPTIVES & PERFORMANCE === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Performances */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-4">Performances</h3>
          <table className="w-full text-sm">
            <tbody>
              {(Object.keys(PERIOD_LABELS) as (keyof ReturnsMatrix)[]).map((k) => (
                <tr
                  key={k}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-2 text-slate-500">{PERIOD_LABELS[k]}</td>
                  <td className={`py-2 text-right font-medium ${pctColor(returnsMatrix[k])}`}>
                    {formatPctSigned(returnsMatrix[k], 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Statistiques descriptives */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-4">
            Distribution des rendements journaliers
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Observations" value={descriptive!.n.toString()} />
            <Stat
              label="Moyenne quotidienne"
              value={formatPctSigned(descriptive!.mean, 3)}
              colorClass={pctColor(descriptive!.mean)}
            />
            <Stat
              label="Médiane"
              value={formatPctSigned(descriptive!.median, 3)}
              colorClass={pctColor(descriptive!.median)}
            />
            <Stat
              label="Écart-type quotidien"
              value={formatPct(descriptive!.stdev, 3)}
            />
            <Stat
              label="Moyenne annualisée"
              value={formatPctSigned(descriptive!.meanAnnualized, 1)}
              colorClass={pctColor(descriptive!.meanAnnualized)}
            />
            <Stat
              label="Volatilité annualisée"
              value={formatPct(descriptive!.stdevAnnualized, 1)}
            />
            <Stat
              label="Skewness"
              value={formatNum(descriptive!.skewness)}
              hint={
                descriptive!.skewness < -0.5
                  ? "Asymétrie négative (queues à gauche)"
                  : descriptive!.skewness > 0.5
                  ? "Asymétrie positive (queues à droite)"
                  : "Quasi-symétrique"
              }
            />
            <Stat
              label="Excess kurtosis"
              value={formatNum(descriptive!.excessKurtosis)}
              hint={
                descriptive!.excessKurtosis > 1
                  ? "Queues épaisses (leptokurtique)"
                  : descriptive!.excessKurtosis < -0.5
                  ? "Queues fines"
                  : "Proche d'une normale"
              }
            />
            <Stat
              label="Plus mauvaise séance"
              value={formatPctSigned(descriptive!.min, 2)}
              colorClass="text-red-700"
            />
            <Stat
              label="Plus belle séance"
              value={formatPctSigned(descriptive!.max, 2)}
              colorClass="text-green-700"
            />
            <Stat label="1er quartile" value={formatPctSigned(descriptive!.q1, 2)} />
            <Stat label="3e quartile" value={formatPctSigned(descriptive!.q3, 2)} />
          </div>
        </div>
      </section>

      {/* === TEST DE NORMALITÉ === */}
      {normality && (
        <NormalityCard
          ticker={ticker}
          normality={normality}
          histogram={histogram}
          qqPlot={qqPlot}
        />
      )}

      {/* === RISQUE AVANCÉ === */}
      {risk && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-base font-medium">Risque avancé</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                VaR, Expected Shortfall, ratios de risque ajusté
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat
              label="VaR 95% (historique)"
              value={`-${formatPct(risk.varHistorical95, 2)}`}
              colorClass="text-red-700"
              hint="Perte max attendue en 1 séance avec 95% de confiance"
            />
            <Stat
              label="VaR 99% (historique)"
              value={`-${formatPct(risk.varHistorical99, 2)}`}
              colorClass="text-red-700"
              hint="Perte max attendue en 1 séance avec 99% de confiance"
            />
            <Stat
              label="VaR 95% (paramétrique)"
              value={`-${formatPct(risk.varParametric95, 2)}`}
              hint="Hypothèse normale — comparer à la VaR historique"
            />
            <Stat
              label="VaR 99% (paramétrique)"
              value={`-${formatPct(risk.varParametric99, 2)}`}
              hint="Hypothèse normale"
            />
            <Stat
              label="CVaR 95% (Expected Shortfall)"
              value={`-${formatPct(risk.cvar95, 2)}`}
              colorClass="text-red-700"
              hint="Perte moyenne dans les 5% pires séances"
            />
            <Stat
              label="CVaR 99%"
              value={`-${formatPct(risk.cvar99, 2)}`}
              colorClass="text-red-700"
            />
            <Stat
              label="Sortino Ratio"
              value={formatNum(risk.sortinoRatio)}
              hint="Rendement / risque baissier seul"
            />
            <Stat
              label="Calmar Ratio"
              value={formatNum(risk.calmarRatio)}
              hint="Rendement / max drawdown"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <Stat
              label="% séances positives"
              value={formatPct(risk.positiveDays, 1)}
            />
            <Stat
              label="Hausse moyenne"
              value={formatPct(risk.avgPositive, 2)}
              colorClass="text-green-700"
            />
            <Stat
              label="Baisse moyenne"
              value={formatPct(risk.avgNegative, 2)}
              colorClass="text-red-700"
            />
            <Stat
              label="Downside dev (annualisée)"
              value={formatPct(risk.downsideDeviation, 1)}
            />
          </div>
        </section>
      )}

      {/* === RÉGRESSION VS BRVMC === */}
      {regression && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-base font-medium">Régression vs BRVM Composite</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Modèle linéaire des rendements journaliers — {regression.observations} observations
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Beta"
              value={formatNum(regression.beta)}
              hint={
                regression.beta > 1.1
                  ? "Plus volatile que le marché"
                  : regression.beta < 0.9
                  ? "Plus stable que le marché"
                  : "Aligné sur le marché"
              }
            />
            <Stat
              label="Alpha (annualisé)"
              value={formatPctSigned(regression.alpha, 2)}
              colorClass={pctColor(regression.alpha)}
              hint="Surperformance résiduelle non expliquée par le beta"
            />
            <Stat
              label="R²"
              value={formatPct(regression.rSquared, 1)}
              hint="Part de la variance expliquée par BRVMC"
            />
            <Stat
              label="Corrélation"
              value={formatNum(regression.correlation)}
            />
            <Stat
              label="Tracking error"
              value={formatPct(regression.trackingError, 2)}
              hint="Volatilité de l'écart de rendement vs BRVMC, annualisée"
            />
            <Stat
              label="Up-capture"
              value={formatPct(regression.upCapture, 1)}
              hint=">100% capture mieux les hausses"
              colorClass={
                regression.upCapture > 1 ? "text-green-700" : "text-slate-700"
              }
            />
            <Stat
              label="Down-capture"
              value={formatPct(regression.downCapture, 1)}
              hint="<100% subit moins les baisses"
              colorClass={
                regression.downCapture < 1 ? "text-green-700" : "text-red-700"
              }
            />
            <Stat
              label="Capture spread"
              value={formatPctSigned(
                regression.upCapture - regression.downCapture,
                1
              )}
              hint="Up - Down. Positif = profil asymétrique favorable"
              colorClass={pctColor(regression.upCapture - regression.downCapture)}
            />
          </div>
        </section>
      )}

      {/* === AUTOCORRÉLATION === */}
      {autocorr && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-base font-medium">Autocorrélation des rendements</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Test Ljung-Box sur les lags 1, 2, 5, 10, 22 séances
              </p>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded border ${
                autocorr.hasSignificantAutocorr5
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {autocorr.hasSignificantAutocorr5
                ? "⚠ Autocorrélation significative (p < 5%)"
                : "✓ Indépendance non rejetée"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={autocorr.lags}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="lag"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => `Lag ${v}`}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => Number(v).toFixed(2)}
                      domain={[-0.5, 0.5]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [
                        Number(value).toFixed(3).replace(".", ","),
                        "ρ",
                      ]}
                      labelFormatter={(v) => `Lag ${v}`}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="rho" fill="#185FA5" isAnimationActive={false}>
                      {autocorr.lags.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            Math.abs(autocorr.lags[i].rho) > 0.1
                              ? "#dc2626"
                              : "#185FA5"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2">
              <Stat
                label="Statistique Ljung-Box"
                value={formatNum(autocorr.ljungBoxStatistic)}
              />
              <Stat
                label="p-value"
                value={formatScientific(autocorr.ljungBoxPValue)}
              />
              <p className="text-xs text-slate-500 leading-relaxed mt-3">
                {autocorr.hasSignificantAutocorr5
                  ? "Les rendements ne sont pas indépendants — un mouvement passé conditionne partiellement le suivant. Indice d'inefficience qu'un modèle ARMA pourrait exploiter."
                  : "Les rendements semblent indépendants : pas de mémoire détectable, marche aléatoire compatible avec l'efficience faible."}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* === HEATMAP MENSUELLE === */}
      {heatmap.years.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-base font-medium">Rendements mensuels</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Heatmap par mois et par année — performance simple ouverture/clôture
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-slate-500">
                    Année
                  </th>
                  {MONTH_LABELS.map((m) => (
                    <th
                      key={m}
                      className="text-center px-1 py-1.5 font-medium text-slate-500 min-w-[44px]"
                    >
                      {m}
                    </th>
                  ))}
                  <th className="text-right px-2 py-1.5 font-medium text-slate-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {heatmap.years.map((y) => (
                  <tr key={y}>
                    <td className="px-2 py-0.5 font-mono font-medium text-slate-700">
                      {y}
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
                      const r = heatmap.grid[y][mo];
                      return (
                        <td
                          key={mo}
                          className="px-1 py-0.5 text-center"
                          title={
                            r !== undefined
                              ? `${MONTH_LABELS[mo - 1]} ${y} : ${formatPctSigned(r, 2)}`
                              : "Pas de données"
                          }
                        >
                          {r !== undefined ? (
                            <span
                              className={`inline-block w-full px-1 py-0.5 rounded font-mono ${heatmapColor(r)}`}
                            >
                              {formatPctSigned(r, 1)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-right">
                      {heatmap.yearTotal[y] !== null ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono font-semibold ${heatmapColor(
                            heatmap.yearTotal[y]!
                          )}`}
                        >
                          {formatPctSigned(heatmap.yearTotal[y], 1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* === RISQUE BASIQUE (legacy) + MÉTHODOLOGIE === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-4">Risque (synthèse)</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Volatilité 12 mois (annualisée)</dt>
              <dd className="font-medium">{formatPct(riskMetrics.volatility1A)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Max drawdown 12 mois</dt>
              <dd
                className={`font-medium ${
                  riskMetrics.maxDrawdown1A && riskMetrics.maxDrawdown1A < 0
                    ? "text-red-700"
                    : ""
                }`}
              >
                {formatPct(riskMetrics.maxDrawdown1A)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Max drawdown historique</dt>
              <dd
                className={`font-medium ${
                  riskMetrics.maxDrawdownAll && riskMetrics.maxDrawdownAll < 0
                    ? "text-red-700"
                    : ""
                }`}
              >
                {formatPct(riskMetrics.maxDrawdownAll)}
              </dd>
            </div>
            <div className="flex justify-between pt-3 border-t border-slate-100">
              <dt className="text-slate-500">Ratio de Sharpe (1 an)</dt>
              <dd className="font-medium">{formatNum(riskMetrics.sharpe1A)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Beta vs BRVM Composite</dt>
              <dd className="font-medium">{formatNum(riskMetrics.beta)}</dd>
            </div>
          </dl>
        </div>

        <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 md:p-4 border border-slate-100">
          <strong>Méthodologie :</strong> log-returns Act/252, taux sans risque
          3,5% (~taux directeur BCEAO), outliers {">"} 30% en 1 jour filtrés,
          régression OLS sur l&apos;historique aligné avec BRVMC. La VaR
          historique se base sur les quantiles empiriques 5%/1%, la VaR
          paramétrique sur l&apos;hypothèse normale (μ - z×σ). Test de normalité :
          Jarque-Bera (statistique JB suit χ²(2)). Ljung-Box pour
          l&apos;autocorrélation. Heatmap mensuelle = (cours fin de mois / cours
          début de mois - 1).
        </div>
      </section>
    </div>
  );
}

// === Sous-composants ===

function Stat({
  label,
  value,
  hint,
  colorClass,
}: {
  label: string;
  value: string;
  hint?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-slate-50/50 rounded-md border border-slate-100 p-2.5">
      <div className="text-xs text-slate-500 truncate" title={label}>
        {label}
      </div>
      <div
        className={`text-base font-semibold mt-0.5 font-mono ${
          colorClass || "text-slate-900"
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function NormalityCard({
  ticker,
  normality,
  histogram,
  qqPlot,
}: {
  ticker: string;
  normality: NonNullable<AdvancedStatsSnapshot["normality"]>;
  histogram: AdvancedStatsSnapshot["histogram"];
  qqPlot: AdvancedStatsSnapshot["qqPlot"];
}) {
  const [view, setView] = useState<"histogram" | "qq">("histogram");
  const verdictColor = normality.isNormal5
    ? "bg-green-50 border-green-200 text-green-900"
    : "bg-red-50 border-red-200 text-red-900";

  // Préparer données histogramme — densité observée + densité normale
  const histData = histogram.map((b) => ({
    bin: b.binMid,
    density: b.density,
    normal: b.normalDensity,
  }));

  // Pour le Q-Q plot : ajouter une diagonale de référence
  const qqMin = qqPlot.length > 0 ? Math.min(qqPlot[0].theoretical, qqPlot[0].observed) : 0;
  const qqMax =
    qqPlot.length > 0
      ? Math.max(
          qqPlot[qqPlot.length - 1].theoretical,
          qqPlot[qqPlot.length - 1].observed
        )
      : 0;
  const qqWithLine = qqPlot.map((p) => ({
    theoretical: p.theoretical,
    observed: p.observed,
    reference: p.theoretical, // identité parfaite
  }));

  return (
    <section className={`rounded-lg border p-4 md:p-6 ${verdictColor}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">
            Test de normalité (Jarque-Bera)
          </div>
          <div className="text-xl md:text-2xl font-semibold mt-1">
            {normality.isNormal5
              ? "✓ Distribution normale"
              : "✗ Distribution non-normale"}
          </div>
          <div className="text-sm mt-1 opacity-90">
            Statistique JB ={" "}
            <span className="font-mono font-medium">
              {normality.jbStatistic.toFixed(2).replace(".", ",")}
            </span>
            {" · "}
            p-value{" "}
            <span className="font-mono font-medium">
              {normality.pValue < 0.0001
                ? normality.pValue.toExponential(2)
                : normality.pValue.toFixed(4).replace(".", ",")}
            </span>
            {" · "}
            seuil 5% :{" "}
            {normality.isNormal5 ? "non rejeté" : "rejeté"}
          </div>
        </div>
        <div className="text-xs px-3 py-1 rounded-full bg-white/60 border border-current/30">
          {ticker}
        </div>
      </div>

      <p className="text-sm leading-relaxed mb-4 opacity-90">
        {normality.interpretation}
      </p>

      {/* Toggle histogramme / Q-Q plot */}
      <div className="bg-white rounded-md border border-slate-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setView("histogram")}
              className={`text-xs px-3 py-1 rounded-md border transition ${
                view === "histogram"
                  ? "bg-blue-50 border-blue-300 text-blue-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Histogramme
            </button>
            <button
              type="button"
              onClick={() => setView("qq")}
              className={`text-xs px-3 py-1 rounded-md border transition ${
                view === "qq"
                  ? "bg-blue-50 border-blue-300 text-blue-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Q-Q plot
            </button>
          </div>
          <div className="text-[11px] text-slate-500">
            {view === "histogram"
              ? "Distribution observée vs courbe normale théorique"
              : "Quantiles observés vs quantiles d'une normale ajustée — alignement = normalité"}
          </div>
        </div>

        <div className="h-56">
          {view === "histogram" ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={histData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="bin"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
                />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const v = Number(value);
                    return [
                      v.toFixed(2),
                      name === "density" ? "Observé" : "Normale théorique",
                    ];
                  }}
                  labelFormatter={(v) => `Rendement ${(Number(v) * 100).toFixed(2)}%`}
                />
                <Bar
                  dataKey="density"
                  fill="#185FA5"
                  fillOpacity={0.6}
                  isAnimationActive={false}
                  name="density"
                />
                <Line
                  type="monotone"
                  dataKey="normal"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  name="normal"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="theoretical"
                  name="Théorique"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
                  domain={[qqMin, qqMax]}
                />
                <YAxis
                  type="number"
                  dataKey="observed"
                  name="Observé"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
                  domain={[qqMin, qqMax]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => [
                    `${(Number(value) * 100).toFixed(2)}%`,
                    name === "observed" ? "Observé" : "Théorique",
                  ]}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <ReferenceLine
                  segment={[
                    { x: qqMin, y: qqMin },
                    { x: qqMax, y: qqMax },
                  ]}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                />
                <Scatter
                  data={qqWithLine}
                  fill="#185FA5"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

// Couleur Tailwind pour la heatmap mensuelle.
// On clamp à ±10% pour avoir une palette lisible.
function heatmapColor(r: number): string {
  if (r === 0) return "bg-slate-100 text-slate-600";
  const clamped = Math.max(-0.1, Math.min(0.1, r));
  const intensity = Math.abs(clamped) / 0.1; // 0..1
  if (r > 0) {
    if (intensity > 0.66) return "bg-green-500 text-white";
    if (intensity > 0.33) return "bg-green-200 text-green-900";
    return "bg-green-50 text-green-800";
  } else {
    if (intensity > 0.66) return "bg-red-500 text-white";
    if (intensity > 0.33) return "bg-red-200 text-red-900";
    return "bg-red-50 text-red-800";
  }
}
