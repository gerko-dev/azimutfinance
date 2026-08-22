"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type {
  FundRatios,
  FundTitre,
  StatementLine,
  StatementLevel,
  FormatEtats,
  PeriodicStatements,
} from "@/lib/fundamentals";
import ProPeriodicStatements from "./ProPeriodicStatements";

type Props = {
  ticker: string;
  fundTitre: FundTitre | null;
  ratios: FundRatios[]; // exercices croissants
  statements: {
    exercices: number[];
    bilanActif: StatementLine[];
    bilanPassif: StatementLine[];
    compteResultat: StatementLine[];
    flux: StatementLine[];
    periodic: PeriodicStatements;
  };
};

type RatiosPeriod = "3A" | "MAX";

function formatBig(v: number): string {
  if (v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2).replace(".", ",")} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2).replace(".", ",")} Mds`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)} M`;
  return `${sign}${Math.round(abs).toLocaleString("fr-FR").replace(/,/g, " ")}`;
}

/**
 * Format des cellules d'états financiers : valeur en FCFA bruts → millions de FCFA.
 * Affiche 0 décimale si ≥ 100 M, 1 décimale sinon (pour préserver la lisibilité
 * des petits postes). Les zéros restent "—".
 */
function formatMillions(v: number): string {
  if (v === 0) return "—";
  const m = v / 1e6;
  const abs = Math.abs(m);
  const decimals = abs >= 100 ? 0 : 1;
  return m
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatPct(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatPctNeutral(v: number | null, decimals = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
}

function formatNum(v: number | null, decimals = 2): string {
  if (v === null || !isFinite(v)) return "—";
  return v.toFixed(decimals).replace(".", ",");
}

function pctColor(v: number | null): string {
  if (v === null || !isFinite(v) || v === 0) return "text-slate-300";
  return v > 0 ? "text-emerald-400" : "text-red-400";
}

export default function ProFundamentalsTab({
  ticker,
  fundTitre,
  ratios,
  statements,
}: Props) {
  const isBank: FormatEtats = fundTitre?.formatEtats === "Bancaire" ? "Bancaire" : "SYSCOHADA";

  // Periode du tableau ratios : 3 ans ou Max (toutes deux libres sur le terminal Pro).
  const [ratiosPeriod, setRatiosPeriod] = useState<RatiosPeriod>("3A");

  // Garde uniquement les exercices avec activité
  const activeRatios = useMemo(
    () => ratios.filter((r) => r.ca !== 0 || r.totalActif !== 0),
    [ratios]
  );

  const lastRatio = activeRatios[activeRatios.length - 1] ?? null;
  // 3 ans = lastRatio + 2 precedents ; Max = tous les exercices.
  const previousRatios = useMemo(() => {
    if (ratiosPeriod === "MAX") {
      return activeRatios.slice(0, -1).reverse();
    }
    return activeRatios.slice(-3, -1).reverse(); // 2 precedents = 3 dernieres avec lastRatio
  }, [activeRatios, ratiosPeriod]);
  const allDisplayed = useMemo(() => activeRatios.slice(-10), [activeRatios]); // 10 dernières années pour graphes

  // Sélecteur d'exercice pour les états financiers
  const availableYears = statements.exercices
    .filter((y) => activeRatios.some((r) => r.exercice === y))
    .sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState<number>(
    availableYears[0] ?? statements.exercices[statements.exercices.length - 1] ?? 0
  );
  const [compareYear, setCompareYear] = useState<number | null>(
    availableYears[1] ?? null
  );

  // Export Excel des états financiers (tous les exercices, toutes les sections).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadExcel() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(
        `/pros/titre/${encodeURIComponent(ticker)}/fundamentals/xlsx`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etats-financiers-${ticker}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : "Échec de la génération de l'Excel."
      );
    } finally {
      setExporting(false);
    }
  }

  if (!fundTitre || !lastRatio) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-10 text-center text-slate-400">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-medium text-slate-200 mb-2">
          Données fondamentales indisponibles
        </h3>
        <p className="text-sm text-slate-400">
          Les états financiers de {ticker} ne sont pas dans notre base.
        </p>
      </div>
    );
  }

  const caLabel = isBank === "Bancaire" ? "Produit Net Bancaire" : "Chiffre d'affaires";
  const ebeLabel = isBank === "Bancaire" ? "Résultat brut d'exploitation" : "EBE";

  // Données graphiques
  const caData = allDisplayed.map((r) => ({
    annee: String(r.exercice),
    ca: r.ca,
    rnet: r.resultatNet,
  }));

  // Données du second graphe : selon SYSCOHADA / Bancaire on affiche
  // marges ou ROE/ROA. Format unifié pour rester compatible avec Recharts.
  const ratiosLineData = allDisplayed.map((r) => ({
    annee: String(r.exercice),
    margeOp: r.margeOperationnelle !== null ? r.margeOperationnelle * 100 : null,
    margeNette: r.margeNette !== null ? r.margeNette * 100 : null,
    roe: r.roe !== null ? r.roe * 100 : null,
    roa: r.roa !== null ? r.roa * 100 : null,
  }));

  const yearsToShow = [selectedYear, ...(compareYear !== null ? [compareYear] : [])];

  return (
    <div className="space-y-4">
      {/* === HEADER === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-medium text-white">Fondamentaux</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              États financiers · Format {fundTitre.formatEtats} ·{" "}
              {activeRatios.length} exercices · Dernière publication :{" "}
              <strong className="text-slate-200">{lastRatio.exercice}</strong>
            </p>
          </div>
        </div>
      </section>

      {/* === SYNTHÈSE — Cards === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Synthèse · Exercice {lastRatio.exercice}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            label={caLabel}
            value={formatBig(lastRatio.ca)}
            unit="FCFA"
            sub={
              lastRatio.croissanceCA !== null
                ? `vs N-1 ${formatPct(lastRatio.croissanceCA)}`
                : undefined
            }
            subColor={pctColor(lastRatio.croissanceCA)}
          />
          <Card
            label="Résultat net"
            value={formatBig(lastRatio.resultatNet)}
            unit="FCFA"
            sub={
              lastRatio.croissanceRNet !== null
                ? `vs N-1 ${formatPct(lastRatio.croissanceRNet)}`
                : undefined
            }
            subColor={pctColor(lastRatio.croissanceRNet)}
          />
          <Card
            label={ebeLabel}
            value={formatBig(lastRatio.ebe)}
            unit="FCFA"
            sub={
              lastRatio.margeOperationnelle !== null
                ? `Marge op. ${formatPctNeutral(lastRatio.margeOperationnelle)}`
                : undefined
            }
          />
          <Card
            label="Capitaux propres"
            value={formatBig(lastRatio.capitauxPropres)}
            unit="FCFA"
            sub={
              lastRatio.totalActif > 0
                ? `${formatPctNeutral(
                    lastRatio.capitauxPropres / lastRatio.totalActif
                  )} du bilan`
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <Card
            label="ROE"
            value={formatPctNeutral(lastRatio.roe)}
            sub="Rentabilité fonds propres"
          />
          <Card
            label="ROA"
            value={formatPctNeutral(lastRatio.roa)}
            sub="Rentabilité de l'actif"
          />
          <Card
            label="BPA"
            value={lastRatio.bpa !== null ? formatNum(lastRatio.bpa, 0) : "—"}
            unit={lastRatio.bpa !== null ? "FCFA" : ""}
            sub="Bénéfice par action"
          />
          <Card
            label="Dividende / action"
            value={lastRatio.dpa > 0 ? formatNum(lastRatio.dpa, 0) : "—"}
            unit={lastRatio.dpa > 0 ? "FCFA" : ""}
            sub={
              lastRatio.dividendYield !== null && lastRatio.dividendYield > 0
                ? `Yield ${formatPctNeutral(lastRatio.dividendYield, 2)}`
                : undefined
            }
          />
        </div>
      </section>

      {/* === GRAPHIQUES === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CA + RN sur 10 ans */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            {caLabel} et résultat net · 10 ans
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={caData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="annee" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => formatBig(Number(v)).replace(" Mds", "Md").replace(" T", "T")}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#e2e8f0",
                  }}
                  formatter={(value, name) => {
                    const label = name === "ca" ? caLabel : "Résultat net";
                    return [formatBig(Number(value)) + " FCFA", label];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                <Bar dataKey="ca" fill="#60a5fa" name={caLabel} />
                <Bar dataKey="rnet" fill="#34d399" name="Résultat net" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Marges + ROE/ROA */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            {isBank === "Bancaire" ? "Coefficient d'exploitation & rentabilité" : "Marges & rentabilité"} · 10 ans
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratiosLineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="annee" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#e2e8f0",
                  }}
                  formatter={(value) => {
                    const v = Number(value);
                    return [`${v.toFixed(1).replace(".", ",")}%`, ""];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                {isBank === "Bancaire" ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="roe"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      name="ROE %"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="roa"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      name="ROA %"
                      connectNulls
                    />
                  </>
                ) : (
                  <>
                    <Line
                      type="monotone"
                      dataKey="margeOp"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      name="Marge opérationnelle %"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="margeNette"
                      stroke="#34d399"
                      strokeWidth={2}
                      name="Marge nette %"
                      connectNulls
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* === RATIOS · DERNIERS EXERCICES === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Ratios
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {ratiosPeriod === "MAX"
                ? `Tous les exercices disponibles (${activeRatios.length})`
                : "3 derniers exercices"}
            </p>
          </div>
          <div className="inline-flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setRatiosPeriod("3A")}
              aria-pressed={ratiosPeriod === "3A"}
              className={`px-2.5 py-1 rounded-md border transition ${
                ratiosPeriod === "3A"
                  ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              3 ans
            </button>
            <button
              type="button"
              onClick={() => setRatiosPeriod("MAX")}
              aria-pressed={ratiosPeriod === "MAX"}
              className={`px-2.5 py-1 rounded-md border transition ${
                ratiosPeriod === "MAX"
                  ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Max
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 bg-slate-900/60 border-b border-slate-700">
                <th className="text-left px-4 py-2 font-medium">Ratio</th>
                <th className="text-right px-3 py-2 font-medium">
                  {lastRatio.exercice}
                </th>
                {previousRatios.map((r) => (
                  <th
                    key={r.exercice}
                    className="text-right px-3 py-2 font-medium hidden md:table-cell"
                  >
                    {r.exercice}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Rentabilité */}
              <RatioGroup label="Rentabilité" />
              <RatioRow
                label="ROE"
                values={[lastRatio, ...previousRatios].map((r) => r.roe)}
                format="pct"
              />
              <RatioRow
                label="ROA"
                values={[lastRatio, ...previousRatios].map((r) => r.roa)}
                format="pct"
              />
              {isBank !== "Bancaire" && (
                <>
                  <RatioRow
                    label="Marge opérationnelle"
                    values={[lastRatio, ...previousRatios].map((r) => r.margeOperationnelle)}
                    format="pct"
                  />
                  <RatioRow
                    label="Marge nette"
                    values={[lastRatio, ...previousRatios].map((r) => r.margeNette)}
                    format="pct"
                  />
                  <RatioRow
                    label="Marge sur valeur ajoutée"
                    values={[lastRatio, ...previousRatios].map((r) => r.margeVA)}
                    format="pct"
                  />
                </>
              )}
              {isBank === "Bancaire" && (
                <>
                  <RatioRow
                    label="Coefficient d'exploitation"
                    values={[lastRatio, ...previousRatios].map((r) => r.coefficientExploitation)}
                    format="pct"
                  />
                  <RatioRow
                    label="Coût du risque / PNB"
                    values={[lastRatio, ...previousRatios].map((r) => r.coutRisqueSurPNB)}
                    format="pct"
                  />
                </>
              )}

              {/* Solvabilité / Endettement */}
              <RatioGroup label="Solvabilité & endettement" />
              {isBank !== "Bancaire" && (
                <>
                  <RatioRow
                    label="Gearing"
                    values={[lastRatio, ...previousRatios].map((r) => r.gearing)}
                    format="pct"
                  />
                  <RatioRow
                    label="Autonomie financière"
                    values={[lastRatio, ...previousRatios].map((r) => r.autonomieFinanciere)}
                    format="ratio"
                  />
                  <RatioRow
                    label="Capacité de remboursement (années)"
                    values={[lastRatio, ...previousRatios].map((r) => r.capaciteRemb)}
                    format="ratio"
                  />
                </>
              )}
              {isBank === "Bancaire" && (
                <RatioRow
                  label="Solvabilité"
                  values={[lastRatio, ...previousRatios].map((r) => r.solvabilite)}
                  format="pct"
                />
              )}

              {/* Liquidité — SYSCOHADA seulement */}
              {isBank !== "Bancaire" && (
                <>
                  <RatioGroup label="Liquidité" />
                  <RatioRow
                    label="Liquidité générale"
                    values={[lastRatio, ...previousRatios].map((r) => r.liquiditeGenerale)}
                    format="ratio"
                  />
                  <RatioRow
                    label="Liquidité réduite"
                    values={[lastRatio, ...previousRatios].map((r) => r.liquiditeReduite)}
                    format="ratio"
                  />
                  <RatioRow
                    label="Liquidité immédiate"
                    values={[lastRatio, ...previousRatios].map((r) => r.liquiditeImmediate)}
                    format="ratio"
                  />
                </>
              )}

              {/* Activité — SYSCOHADA seulement */}
              {isBank !== "Bancaire" && (
                <>
                  <RatioGroup label="Activité" />
                  <RatioRow
                    label="Rotation stocks (jours)"
                    values={[lastRatio, ...previousRatios].map((r) => r.rotationStocks)}
                    format="days"
                  />
                  <RatioRow
                    label="Rotation clients (jours)"
                    values={[lastRatio, ...previousRatios].map((r) => r.rotationClients)}
                    format="days"
                  />
                  <RatioRow
                    label="Rotation fournisseurs (jours)"
                    values={[lastRatio, ...previousRatios].map((r) => r.rotationFournisseurs)}
                    format="days"
                  />
                </>
              )}

              {/* Croissance */}
              <RatioGroup label="Croissance (vs N-1)" />
              <RatioRow
                label={`Croissance ${caLabel}`}
                values={[lastRatio, ...previousRatios].map((r) => r.croissanceCA)}
                format="pct"
                colorize
              />
              <RatioRow
                label="Croissance résultat d'exploitation"
                values={[lastRatio, ...previousRatios].map((r) => r.croissanceRExp)}
                format="pct"
                colorize
              />
              <RatioRow
                label="Croissance résultat net"
                values={[lastRatio, ...previousRatios].map((r) => r.croissanceRNet)}
                format="pct"
                colorize
              />

              {/* Marché */}
              <RatioGroup label="Marché" />
              <RatioRow
                label="PER"
                values={[lastRatio, ...previousRatios].map((r) => r.per)}
                format="ratio"
              />
              <RatioRow
                label="BPA (FCFA)"
                values={[lastRatio, ...previousRatios].map((r) => r.bpa)}
                format="bpa"
              />
              <RatioRow
                label="Dividende / action (FCFA)"
                values={[lastRatio, ...previousRatios].map((r) =>
                  r.dpa > 0 ? r.dpa : null
                )}
                format="bpa"
              />
              <RatioRow
                label="Dividend Yield"
                values={[lastRatio, ...previousRatios].map((r) =>
                  r.dividendYield !== null && r.dividendYield > 0 ? r.dividendYield : null
                )}
                format="pct"
              />
              <RatioRow
                label="Taux de distribution"
                values={[lastRatio, ...previousRatios].map((r) =>
                  r.tauxDistribution !== null && r.tauxDistribution > 0
                    ? r.tauxDistribution
                    : null
                )}
                format="pct"
              />
              <RatioRow
                label="Capi / CA (P/Sales)"
                values={[lastRatio, ...previousRatios].map((r) => r.capiSurCA)}
                format="ratio"
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* === ÉTATS FINANCIERS PÉRIODIQUES === */}
      <ProPeriodicStatements
        periodic={statements.periodic}
        isBank={isBank === "Bancaire"}
      />

      {/* === ÉTATS FINANCIERS DÉTAILLÉS === */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg">
        <div className="p-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              États financiers détaillés
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Bilan, compte de résultat et flux de trésorerie · format{" "}
              {fundTitre.formatEtats} ·{" "}
              <strong className="text-slate-200">en millions de FCFA</strong>
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <LevelBadge niveau="sous-total" />
                sous-total
              </span>
              <span className="inline-flex items-center gap-1">
                <LevelBadge niveau="total" />
                total de section
              </span>
              <span className="inline-flex items-center gap-1">
                <LevelBadge niveau="total-general" />
                total général
              </span>
              <span className="inline-flex items-center gap-1">
                <LevelBadge niveau="solde" />
                soldes (SIG)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                produit
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                charge
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-500">Exercice</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-md text-slate-200 text-xs"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <label className="text-slate-500 ml-2">vs</label>
            <select
              value={compareYear ?? ""}
              onChange={(e) =>
                setCompareYear(e.target.value === "" ? null : Number(e.target.value))
              }
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-md text-slate-200 text-xs"
            >
              <option value="">—</option>
              {availableYears
                .filter((y) => y !== selectedYear)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={downloadExcel}
              disabled={exporting}
              title="Télécharger tous les états financiers (tous les exercices) au format Excel"
              className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-50 disabled:cursor-wait transition"
            >
              {exporting ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1z" />
                  <path d="M3 14a1 1 0 011 1v2h12v-2a1 1 0 112 0v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a1 1 0 011-1z" />
                </svg>
              )}
              {exporting ? "Export…" : "Excel"}
            </button>
          </div>
        </div>
        {exportError && (
          <div className="px-4 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/20">
            {exportError}
          </div>
        )}

        <div className="divide-y divide-slate-700">
          <StatementTable
            title="Bilan · Actif"
            lines={statements.bilanActif}
            years={yearsToShow}
          />
          <StatementTable
            title="Bilan · Passif"
            lines={statements.bilanPassif}
            years={yearsToShow}
          />
          <StatementTable
            title="Compte de résultat"
            lines={statements.compteResultat}
            years={yearsToShow}
          />
          {statements.flux.length > 0 && (
            <StatementTable
              title="Tableau des flux"
              lines={statements.flux}
              years={yearsToShow}
            />
          )}
        </div>
      </section>
    </div>
  );
}

// === Sous-composants ===

function Card({
  label,
  value,
  unit,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-500 truncate">{label}</div>
      <div className="text-lg font-semibold mt-1 text-white">
        {value}
        {unit && <span className="text-xs text-slate-500 ml-1.5">{unit}</span>}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${subColor || "text-slate-500"}`}>{sub}</div>
      )}
    </div>
  );
}

function RatioGroup({ label }: { label: string }) {
  return (
    <tr className="bg-slate-800/60">
      <td
        colSpan={20}
        className="px-4 py-1.5 text-xs font-medium text-slate-300 uppercase tracking-wide"
      >
        {label}
      </td>
    </tr>
  );
}

function RatioRow({
  label,
  values,
  format,
  colorize,
}: {
  label: string;
  values: (number | null)[];
  format: "pct" | "ratio" | "days" | "bpa";
  colorize?: boolean;
}) {
  function fmt(v: number | null): string {
    if (v === null || !isFinite(v)) return "—";
    switch (format) {
      case "pct":
        return formatPctNeutral(v, 1);
      case "ratio":
        return v.toFixed(2).replace(".", ",");
      case "days":
        return Math.round(v) + " j";
      case "bpa":
        return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
    }
  }
  function color(v: number | null): string {
    if (!colorize) return "";
    if (v === null || !isFinite(v) || v === 0) return "";
    return v > 0 ? "text-emerald-400" : "text-red-400";
  }

  return (
    <tr className="border-b border-slate-800 last:border-0">
      <td className="px-4 py-2 text-slate-400">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`text-right px-3 py-2 ${
            i > 0
              ? "hidden md:table-cell text-slate-400"
              : "text-slate-100 font-medium"
          } ${color(v)}`}
        >
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}

// Styles de chaque niveau hiérarchique : fond/filet de ligne, libellé,
// indentation (les détails sont décalés sous leur sous-total) et couleur des
// valeurs. Trois designs distincts pour sous-total < total < total général.
function levelStyle(niveau: StatementLevel): {
  row: string;
  label: string;
  pad: string;
  valueClass: (v: number) => string;
} {
  switch (niveau) {
    case "total-general":
      return {
        row: "border-t-2 border-blue-500/60 bg-blue-900/30",
        label: "font-bold text-white border-l-2 border-blue-400",
        pad: "pl-3",
        valueClass: () => "text-white font-bold",
      };
    case "total":
      return {
        row: "border-t-2 border-slate-600 bg-slate-800/70",
        label: "font-semibold text-white border-l-2 border-slate-500",
        pad: "pl-3",
        valueClass: () => "text-white font-semibold",
      };
    case "sous-total":
      return {
        row: "border-t border-slate-700/50 bg-slate-800/30",
        label: "font-medium text-slate-100",
        pad: "pl-5",
        valueClass: () => "text-slate-100 font-medium",
      };
    case "solde":
      return {
        row: "bg-blue-500/10",
        label: "font-semibold text-blue-100 border-l-2 border-blue-400",
        pad: "pl-5",
        valueClass: (v) =>
          `font-semibold ${v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "text-slate-200"}`,
      };
    default: // produit, charge, detail
      return {
        row: "border-b border-slate-800",
        label: "text-slate-300",
        pad: "pl-8",
        valueClass: () => "text-slate-200",
      };
  }
}

/** Pastille de niveau (réutilisée dans la légende et les lignes de tableau). */
function LevelBadge({ niveau }: { niveau: StatementLevel }) {
  const map: Partial<Record<StatementLevel, { label: string; cls: string }>> = {
    "sous-total": {
      label: "Sous-total",
      cls: "bg-slate-700/50 text-slate-300 border-slate-600",
    },
    total: {
      label: "Total",
      cls: "bg-slate-600/60 text-slate-200 border-slate-500/40",
    },
    "total-general": {
      label: "Total général",
      cls: "bg-blue-500/25 text-blue-200 border-blue-400/50",
    },
    solde: {
      label: "Solde",
      cls: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
  };
  const m = map[niveau];
  if (!m) return null;
  return (
    <span
      className={`text-[8px] uppercase tracking-wider px-1 py-px rounded border shrink-0 ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function StatementTable({
  title,
  lines,
  years,
}: {
  title: string;
  lines: StatementLine[];
  years: number[];
}) {
  if (lines.length === 0) return null;

  return (
    <div>
      <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-700">
        <h5 className="text-xs font-medium uppercase tracking-wide text-slate-300">
          {title}
        </h5>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-700">
              <th className="text-left px-4 py-2 font-medium">Poste</th>
              {years.map((y, i) => (
                <th key={y} className="text-right px-3 py-2 font-medium">
                  {y}
                  {i > 0 && (
                    <span className="block text-[10px] text-slate-500 font-normal">
                      Comparaison
                    </span>
                  )}
                </th>
              ))}
              {years.length > 1 && (
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">
                  Δ
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const st = levelStyle(l.niveau);
              const v0 = l.values[years[0]] ?? 0;
              const v1 = years.length > 1 ? l.values[years[1]] ?? 0 : null;
              const variation =
                v1 !== null && v1 !== 0 ? (v0 - v1) / Math.abs(v1) : null;

              return (
                <tr key={l.codePoste + "_" + l.ordre} className={`last:border-0 ${st.row}`}>
                  <td className={`pr-4 py-2 ${st.pad} ${st.label}`}>
                    <span className="inline-flex items-center gap-2">
                      {l.niveau === "produit" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" title="Produit" />
                      )}
                      {l.niveau === "charge" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400/80 shrink-0" title="Charge" />
                      )}
                      <span>{l.libelle}</span>
                      <LevelBadge niveau={l.niveau} />
                    </span>
                  </td>
                  {years.map((y) => {
                    const v = l.values[y] ?? 0;
                    return (
                      <td
                        key={y}
                        className={`text-right px-3 py-2 font-mono text-xs whitespace-nowrap ${st.valueClass(v)}`}
                      >
                        {formatMillions(v)}
                      </td>
                    );
                  })}
                  {years.length > 1 && (
                    <td
                      className={`text-right px-3 py-2 text-xs hidden md:table-cell ${pctColor(variation)}`}
                    >
                      {variation !== null ? formatPct(variation, 1) : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
