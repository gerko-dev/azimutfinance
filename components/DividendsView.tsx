"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { FundRatios } from "@/lib/fundamentals";

type Props = {
  ticker: string;
  currentPrice: number;
  ratios: FundRatios[]; // exercices croissants
};

// Les exercices antérieurs à 2020 contiennent beaucoup de DPA absents qui
// faussent les CAGR et la régularité — l'analyse part donc de 2020.
const DIV_ANALYSIS_START_YEAR = 2020;

// === Helpers de formatage ===

function formatFCFA(v: number): string {
  if (!isFinite(v) || v === 0) return "0";
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBig(v: number): string {
  if (!isFinite(v) || v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2).replace(".", ",")} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2).replace(".", ",")} Mds`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1).replace(".", ",")} k`;
  return `${sign}${Math.round(abs)}`;
}

function formatPct(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatPctSigned(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function pctColor(v: number | null): string {
  if (v === null || !isFinite(v) || v === 0) return "text-slate-700";
  return v > 0 ? "text-green-700" : "text-red-700";
}

function parseFloatLoose(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

// === Métriques calculées ===

type DivYearRow = {
  exercice: number;
  dpa: number;
  bpa: number | null;
  yieldPct: number | null; // décimal — yield au cours de l'exercice
  payout: number | null; // décimal
  cover: number | null; // BPA / DPA
  growth: number | null; // décimal vs N-1
  cours: number;
};

function buildDividendHistory(ratios: FundRatios[]): DivYearRow[] {
  const active = ratios.filter((r) => r.ca !== 0 || r.totalActif !== 0);
  const out: DivYearRow[] = [];
  for (let i = 0; i < active.length; i++) {
    const r = active[i];
    const prev = i > 0 ? active[i - 1] : null;
    const cover =
      r.bpa !== null && r.bpa !== 0 && r.dpa > 0 ? r.bpa / r.dpa : null;
    const growth =
      prev && prev.dpa > 0 && r.dpa > 0 ? r.dpa / prev.dpa - 1 : null;
    out.push({
      exercice: r.exercice,
      dpa: r.dpa,
      bpa: r.bpa,
      yieldPct: r.dividendYield,
      payout: r.tauxDistribution,
      cover,
      growth,
      cours: r.coursFinEx,
    });
  }
  return out;
}

/** CAGR sur les N derniers exercices avec DPA > 0 (au moins 2 points). */
function computeCagr(history: DivYearRow[], maxYears = 5): number | null {
  const withDiv = history.filter((h) => h.dpa > 0);
  if (withDiv.length < 2) return null;
  const slice = withDiv.slice(-maxYears - 1); // pour N années on prend N+1 points
  if (slice.length < 2) return null;
  const first = slice[0].dpa;
  const last = slice[slice.length - 1].dpa;
  if (first <= 0 || last <= 0) return null;
  const n = slice.length - 1;
  return Math.pow(last / first, 1 / n) - 1;
}

/** Plus longue série terminale d'années consécutives avec DPA > 0. */
function consecutivePayingYears(history: DivYearRow[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].dpa > 0) count++;
    else break;
  }
  return count;
}

/** Plus longue série historique d'années avec DPA > 0 (pas seulement terminale). */
function maxConsecutivePaying(history: DivYearRow[]): number {
  let best = 0;
  let cur = 0;
  for (const h of history) {
    if (h.dpa > 0) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}

/** Pourcentage d'années avec dividende sur les N dernières. */
function payingFrequency(history: DivYearRow[], lookback = 5): number {
  const slice = history.slice(-lookback);
  if (slice.length === 0) return 0;
  const paying = slice.filter((h) => h.dpa > 0).length;
  return paying / slice.length;
}

// === Score qualité (sur 100) ===

type ScoreCriterion = {
  label: string;
  passed: boolean | null; // null = donnée indisponible
  detail: string;
  weight: number;
};

function buildQualityScore(
  history: DivYearRow[],
  cagr5: number | null,
  consecutive: number,
  freq5: number
): { score: number; level: "excellent" | "bon" | "moyen" | "faible"; criteria: ScoreCriterion[] } {
  const last = history.filter((h) => h.dpa > 0).slice(-1)[0] ?? null;

  const criteria: ScoreCriterion[] = [
    {
      label: "Versement actuel",
      passed: last !== null && last.dpa > 0,
      detail:
        last && last.dpa > 0
          ? `${formatFCFA(last.dpa)} FCFA en ${last.exercice}`
          : "Pas de dividende récent",
      weight: 20,
    },
    {
      label: "Régularité 5 ans",
      passed: freq5 >= 0.8,
      detail: `${(freq5 * 100).toFixed(0)}% des 5 derniers exercices versent un dividende`,
      weight: 20,
    },
    {
      label: "Croissance 5 ans",
      passed: cagr5 !== null ? cagr5 > 0 : null,
      detail:
        cagr5 !== null
          ? `CAGR ${formatPctSigned(cagr5, 1)}`
          : "Historique insuffisant",
      weight: 20,
    },
    {
      label: "Soutenabilité (payout < 80%)",
      passed:
        last && last.payout !== null
          ? last.payout > 0 && last.payout < 0.8
          : null,
      detail:
        last && last.payout !== null
          ? `Payout dernier exercice : ${formatPct(last.payout)}`
          : "Payout indisponible",
      weight: 20,
    },
    {
      label: "Couverture (BPA/DPA > 1.5)",
      passed: last && last.cover !== null ? last.cover >= 1.5 : null,
      detail:
        last && last.cover !== null
          ? `Couverture ${last.cover.toFixed(2).replace(".", ",")}×`
          : "BPA ou DPA indisponibles",
      weight: 10,
    },
    {
      label: "Série continue ≥ 3 ans",
      passed: consecutive >= 3,
      detail: `${consecutive} année${consecutive > 1 ? "s" : ""} consécutive${
        consecutive > 1 ? "s" : ""
      } de versement`,
      weight: 10,
    },
  ];

  // Score : on additionne les poids des critères passés. Critère null = neutre
  // (on enlève son poids du dénominateur).
  let earned = 0;
  let total = 0;
  for (const c of criteria) {
    if (c.passed === null) continue;
    total += c.weight;
    if (c.passed) earned += c.weight;
  }
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const level: "excellent" | "bon" | "moyen" | "faible" =
    score >= 80 ? "excellent" : score >= 60 ? "bon" : score >= 40 ? "moyen" : "faible";
  return { score, level, criteria };
}

// === Composant principal ===

export default function DividendsView({ ticker, currentPrice, ratios }: Props) {
  const ratiosFromStart = useMemo(
    () => ratios.filter((r) => r.exercice >= DIV_ANALYSIS_START_YEAR),
    [ratios]
  );
  const history = useMemo(
    () => buildDividendHistory(ratiosFromStart),
    [ratiosFromStart]
  );
  const last = useMemo(
    () => history.filter((h) => h.dpa > 0).slice(-1)[0] ?? null,
    [history]
  );
  const cagr5 = useMemo(() => computeCagr(history, 5), [history]);
  const cagr3 = useMemo(() => computeCagr(history, 3), [history]);
  const cagrAll = useMemo(() => computeCagr(history, 99), [history]);
  const consecutive = useMemo(() => consecutivePayingYears(history), [history]);
  const longestStreak = useMemo(() => maxConsecutivePaying(history), [history]);
  const freq5 = useMemo(() => payingFrequency(history, 5), [history]);

  const qualityScore = useMemo(
    () => buildQualityScore(history, cagr5, consecutive, freq5),
    [history, cagr5, consecutive, freq5]
  );

  // === Simulateur ===
  const [investAmount, setInvestAmount] = useState("1000000"); // 1 M FCFA par défaut
  const [horizon, setHorizon] = useState("5");
  const [growthOverride, setGrowthOverride] = useState(""); // % saisi, vide = CAGR historique

  const baseGrowth = cagr5 ?? cagr3 ?? 0;
  const userGrowth = parseFloatLoose(growthOverride);
  const simGrowth = userGrowth !== null ? userGrowth / 100 : baseGrowth;

  const investAmountN = parseFloatLoose(investAmount) ?? 0;
  const horizonN = Math.max(1, Math.min(20, Math.round(parseFloatLoose(horizon) ?? 5)));
  const sharesBought =
    currentPrice > 0 && investAmountN > 0 ? investAmountN / currentPrice : 0;
  const dpaBase = last?.dpa ?? 0;

  const simRows = useMemo(() => {
    const rows: { year: number; dpa: number; income: number; cumulative: number; yieldOnCost: number }[] = [];
    let cumulative = 0;
    for (let t = 1; t <= horizonN; t++) {
      const dpa = dpaBase * Math.pow(1 + simGrowth, t - 1);
      const income = dpa * sharesBought;
      cumulative += income;
      const yieldOnCost = currentPrice > 0 ? dpa / currentPrice : 0;
      rows.push({ year: t, dpa, income, cumulative, yieldOnCost });
    }
    return rows;
  }, [dpaBase, simGrowth, horizonN, sharesBought, currentPrice]);

  const totalIncome = simRows.reduce((s, r) => s + r.income, 0);
  const yieldOnCostFinal = simRows[simRows.length - 1]?.yieldOnCost ?? 0;
  const yieldOnCostInitial = currentPrice > 0 ? dpaBase / currentPrice : 0;

  // === Projection multi-scénarios ===
  const projection = useMemo(() => {
    if (dpaBase <= 0) return [];
    const horizon = 5;
    const optimist = baseGrowth >= 0 ? baseGrowth * 1.3 : Math.abs(baseGrowth) * 0.5;
    const pessimist = baseGrowth >= 0 ? baseGrowth * 0.5 : baseGrowth * 1.3;
    const rows: {
      year: string;
      historique: number;
      pessimiste: number;
      optimiste: number;
    }[] = [];
    const lastYear = last?.exercice ?? new Date().getFullYear();
    rows.push({
      year: String(lastYear),
      historique: dpaBase,
      pessimiste: dpaBase,
      optimiste: dpaBase,
    });
    for (let t = 1; t <= horizon; t++) {
      rows.push({
        year: String(lastYear + t),
        historique: dpaBase * Math.pow(1 + baseGrowth, t),
        pessimiste: dpaBase * Math.pow(1 + pessimist, t),
        optimiste: dpaBase * Math.pow(1 + optimist, t),
      });
    }
    return rows;
  }, [dpaBase, baseGrowth, last]);

  const hasAnyDividend = history.some((h) => h.dpa > 0);

  if (!hasAnyDividend) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
        <div className="text-4xl mb-3">💸</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Aucun versement de dividende renseigné
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {ticker}
          {" "}
          ne dispose pas d&apos;historique de dividende dans notre base. Le
          titre n&apos;a peut-être jamais distribué, ou les données ne sont
          pas encore disponibles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === HEADER + SCORE QUALITÉ === */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Cards synthèse */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <KpiCard
            label="DPA dernier exercice"
            value={last && last.dpa > 0 ? formatFCFA(last.dpa) : "—"}
            unit={last && last.dpa > 0 ? "FCFA" : ""}
            sub={
              last && last.growth !== null
                ? `vs N-1 ${formatPctSigned(last.growth, 1)}`
                : last
                ? `Exercice ${last.exercice}`
                : undefined
            }
            subColor={last ? pctColor(last.growth) : undefined}
          />
          <KpiCard
            label="Yield (au cours d'ex.)"
            value={last && last.yieldPct !== null ? formatPct(last.yieldPct, 2) : "—"}
            sub={last ? `Cours fin d'ex. ${formatFCFA(last.cours)}` : undefined}
          />
          <KpiCard
            label="Payout"
            value={last && last.payout !== null ? formatPct(last.payout, 1) : "—"}
            sub="Dividendes / résultat net"
          />
          <KpiCard
            label="Couverture BPA/DPA"
            value={
              last && last.cover !== null
                ? `${last.cover.toFixed(2).replace(".", ",")}×`
                : "—"
            }
            sub={last && last.bpa !== null ? `BPA ${formatFCFA(last.bpa)}` : undefined}
          />
          <KpiCard
            label="CAGR 5 ans"
            value={cagr5 !== null ? formatPctSigned(cagr5, 1) : "—"}
            valueColor={pctColor(cagr5)}
            sub="Croissance annualisée"
          />
          <KpiCard
            label="CAGR 3 ans"
            value={cagr3 !== null ? formatPctSigned(cagr3, 1) : "—"}
            valueColor={pctColor(cagr3)}
          />
          <KpiCard
            label="Années consécutives"
            value={String(consecutive)}
            sub={
              longestStreak > consecutive
                ? `Plus longue série : ${longestStreak} ans`
                : "Versement ininterrompu"
            }
          />
          <KpiCard
            label="Régularité 5 ans"
            value={`${(freq5 * 100).toFixed(0)}%`}
            sub="% années avec dividende"
          />
        </div>

        {/* Score qualité */}
        <ScoreCard score={qualityScore} />
      </section>

      {/* === HISTORIQUE === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-base font-medium">Historique des dividendes</h3>
          <p className="text-xs text-slate-500">
            DPA (barres) et payout (ligne) — {history.length} exercices · depuis{" "}
            {DIV_ANALYSIS_START_YEAR}
          </p>
        </div>

        <div className="h-64 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history.map((h) => ({
              annee: String(h.exercice),
              dpa: h.dpa > 0 ? h.dpa : null,
              payout: h.payout !== null && h.payout > 0 ? h.payout * 100 : null,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="annee" stroke="#94a3b8" fontSize={11} />
              <YAxis
                yAxisId="dpa"
                stroke="#16a34a"
                fontSize={11}
                tickFormatter={(v) => formatBig(Number(v))}
              />
              <YAxis
                yAxisId="payout"
                orientation="right"
                stroke="#854F0B"
                fontSize={11}
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => {
                  if (value === null) return ["—", String(name)];
                  if (name === "dpa") return [formatFCFA(Number(value)) + " FCFA", "DPA"];
                  if (name === "payout") return [`${Number(value).toFixed(1).replace(".", ",")}%`, "Payout"];
                  return [String(value), String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="dpa"
                dataKey="dpa"
                fill="#16a34a"
                name="DPA"
                isAnimationActive={false}
              />
              <Line
                yAxisId="payout"
                type="monotone"
                dataKey="payout"
                stroke="#854F0B"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Payout %"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Tableau historique */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                <th className="text-left px-3 py-2 font-medium">Exercice</th>
                <th className="text-right px-3 py-2 font-medium">DPA (FCFA)</th>
                <th className="text-right px-3 py-2 font-medium">BPA (FCFA)</th>
                <th className="text-right px-3 py-2 font-medium">Croissance</th>
                <th className="text-right px-3 py-2 font-medium">Yield</th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  Payout
                </th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  Couverture
                </th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.exercice} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2 font-medium">{h.exercice}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.dpa > 0 ? formatFCFA(h.dpa) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {h.bpa !== null && h.bpa !== 0 ? formatFCFA(h.bpa) : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right ${pctColor(h.growth)}`}>
                    {formatPctSigned(h.growth, 1)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {h.yieldPct !== null ? formatPct(h.yieldPct, 2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right hidden md:table-cell">
                    {h.payout !== null && h.payout > 0 ? formatPct(h.payout, 1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right hidden md:table-cell">
                    {h.cover !== null ? `${h.cover.toFixed(2).replace(".", ",")}×` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === SIMULATEUR === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-base font-medium">Simulateur de revenus</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Estime tes dividendes futurs en fonction d&apos;un investissement
              et d&apos;un horizon. Croissance = CAGR 5 ans par défaut, modifiable.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Montant investi (FCFA)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={investAmount}
              onChange={(e) => setInvestAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              ≈{" "}
              {currentPrice > 0
                ? Math.floor(sharesBought).toLocaleString("fr-FR").replace(/,/g, " ")
                : "—"}{" "}
              actions au cours actuel ({formatFCFA(currentPrice)} FCFA)
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Horizon (années)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-1">Entre 1 et 20 ans</div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Croissance annuelle (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={`Défaut : ${formatPctSigned(baseGrowth, 1)}`}
              value={growthOverride}
              onChange={(e) => setGrowthOverride(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Vide = CAGR historique (
              {cagr5 !== null
                ? formatPctSigned(cagr5, 1) + " sur 5 ans"
                : cagr3 !== null
                ? formatPctSigned(cagr3, 1) + " sur 3 ans"
                : "0%"}
              )
            </div>
          </div>
        </div>

        {/* Synthèse simulateur */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="Yield-on-cost initial"
            value={formatPct(yieldOnCostInitial, 2)}
            sub={`Si tu achètes à ${formatFCFA(currentPrice)} FCFA`}
          />
          <KpiCard
            label={`Revenu année ${horizonN}`}
            value={
              simRows.length > 0
                ? formatBig(simRows[simRows.length - 1].income) + " FCFA"
                : "—"
            }
            sub={`DPA projeté : ${
              simRows.length > 0 ? formatFCFA(simRows[simRows.length - 1].dpa) : "—"
            } FCFA`}
          />
          <KpiCard
            label={`Cumul ${horizonN} ans`}
            value={formatBig(totalIncome) + " FCFA"}
            sub={
              investAmountN > 0
                ? `${formatPct(totalIncome / investAmountN, 1)} de l'investissement`
                : undefined
            }
          />
          <KpiCard
            label={`Yield-on-cost à ${horizonN} ans`}
            value={formatPct(yieldOnCostFinal, 2)}
            sub="DPA projeté / cours d'achat"
          />
        </div>

        {/* Tableau année par année */}
        {simRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                  <th className="text-left px-3 py-2 font-medium">Année</th>
                  <th className="text-right px-3 py-2 font-medium">DPA projeté</th>
                  <th className="text-right px-3 py-2 font-medium">Revenu annuel</th>
                  <th className="text-right px-3 py-2 font-medium">Cumulé</th>
                  <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                    Yield-on-cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {simRows.map((r) => (
                  <tr key={r.year} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 font-medium">N+{r.year}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatFCFA(r.dpa)} FCFA
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatFCFA(r.income)} FCFA
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      {formatFCFA(r.cumulative)} FCFA
                    </td>
                    <td className="px-3 py-2 text-right hidden md:table-cell">
                      {formatPct(r.yieldOnCost, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === PROJECTION MULTI-SCÉNARIOS === */}
      {projection.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 className="text-base font-medium">Projection DPA · 5 ans</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Trois scénarios à partir du dernier DPA versé.
              </p>
            </div>
            <div className="flex gap-3 text-[11px] text-slate-500">
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1 align-middle" />
                Pessimiste
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1 align-middle" />
                Historique
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1 align-middle" />
                Optimiste
              </span>
            </div>
          </div>

          <div className="h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => formatBig(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => [
                    formatFCFA(Number(value)) + " FCFA",
                    String(name).charAt(0).toUpperCase() + String(name).slice(1),
                  ]}
                />
                <ReferenceLine
                  x={projection[0].year}
                  stroke="#94a3b8"
                  strokeDasharray="2 4"
                  label={{
                    value: "Aujourd'hui",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#94a3b8",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="pessimiste"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  name="Pessimiste"
                />
                <Line
                  type="monotone"
                  dataKey="historique"
                  stroke="#185FA5"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  name="Historique"
                />
                <Line
                  type="monotone"
                  dataKey="optimiste"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  name="Optimiste"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            <strong>Méthodologie :</strong> Historique = CAGR 5 ans observé.
            Optimiste = CAGR × 1,3 (ou |CAGR|/2 si CAGR négatif). Pessimiste =
            CAGR × 0,5 (ou CAGR × 1,3 si négatif). À titre indicatif — la
            performance passée ne préjuge pas de la performance future.
          </p>
        </section>
      )}

      {/* === MÉTHODOLOGIE & ALL-TIME === */}
      <section className="bg-slate-50 rounded-lg border border-slate-100 p-4 md:p-5 text-xs text-slate-600 leading-relaxed">
        <strong>Métriques détaillées :</strong> CAGR 3 ans{" "}
        {cagr3 !== null ? formatPctSigned(cagr3, 2) : "—"} · CAGR 5 ans{" "}
        {cagr5 !== null ? formatPctSigned(cagr5, 2) : "—"} · CAGR depuis le
        premier versement {cagrAll !== null ? formatPctSigned(cagrAll, 2) : "—"}
        . Plus longue série de versement : {longestStreak} an
        {longestStreak > 1 ? "s" : ""}. <strong>Périmètre :</strong> analyse
        à partir de l&apos;exercice {DIV_ANALYSIS_START_YEAR} (les données
        antérieures sont peu fiables sur le DPA). Un dividende = 0 signifie
        soit pas de versement, soit donnée non publiée.
      </section>
    </div>
  );
}

// === Sous-composants ===

function KpiCard({
  label,
  value,
  unit,
  sub,
  subColor,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subColor?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4">
      <div className="text-xs text-slate-500 truncate">{label}</div>
      <div
        className={`text-lg md:text-xl font-semibold mt-1 ${
          valueColor || "text-slate-900"
        }`}
      >
        {value}
        {unit && <span className="text-xs text-slate-400 ml-1.5">{unit}</span>}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${subColor || "text-slate-500"}`}>{sub}</div>
      )}
    </div>
  );
}

function ScoreCard({
  score,
}: {
  score: ReturnType<typeof buildQualityScore>;
}) {
  const palette: Record<typeof score.level, { bg: string; ring: string; text: string; label: string }> = {
    excellent: {
      bg: "from-green-50 to-white",
      ring: "border-green-300",
      text: "text-green-800",
      label: "Excellent",
    },
    bon: {
      bg: "from-blue-50 to-white",
      ring: "border-blue-300",
      text: "text-blue-800",
      label: "Bon",
    },
    moyen: {
      bg: "from-amber-50 to-white",
      ring: "border-amber-300",
      text: "text-amber-800",
      label: "Moyen",
    },
    faible: {
      bg: "from-red-50 to-white",
      ring: "border-red-300",
      text: "text-red-800",
      label: "Faible",
    },
  };
  const p = palette[score.level];

  return (
    <div
      className={`bg-gradient-to-br ${p.bg} rounded-lg border ${p.ring} p-4 md:p-5`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Score qualité dividende
        </span>
        <span className={`text-xs font-semibold ${p.text}`}>{p.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-4xl font-semibold ${p.text}`}>{score.score}</span>
        <span className="text-sm text-slate-500">/ 100</span>
      </div>
      <ul className="space-y-1.5">
        {score.criteria.map((c) => (
          <li
            key={c.label}
            className="flex items-start gap-2 text-xs"
          >
            <span
              className={`mt-0.5 ${
                c.passed === null
                  ? "text-slate-300"
                  : c.passed
                  ? "text-green-600"
                  : "text-red-500"
              }`}
            >
              {c.passed === null ? "○" : c.passed ? "✓" : "✗"}
            </span>
            <span className="flex-1">
              <span className="font-medium text-slate-700">{c.label}</span>
              <span className="text-slate-500"> · {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
