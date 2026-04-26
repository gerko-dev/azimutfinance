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
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { FundRatios, FundTitre, StatementLine, FormatEtats } from "@/lib/fundamentals";

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
  };
};

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
  if (v === null || !isFinite(v) || v === 0) return "text-slate-700";
  return v > 0 ? "text-green-700" : "text-red-700";
}

/**
 * Handlers à appliquer sur les wrappers contenant les tableaux pour empêcher la
 * copie utilisateur (sélection texte, clic droit, glisser-déposer, raccourcis).
 * Mesure de protection raisonnable côté client : un utilisateur déterminé peut
 * toujours scrapper le DOM, mais ça empêche la copie ad-hoc.
 *
 * À utiliser avec la classe `select-none` sur le même élément.
 */
const protectProps = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
} as const;

export default function FundamentalsView({ ticker, fundTitre, ratios, statements }: Props) {
  const isBank: FormatEtats = fundTitre?.formatEtats === "Bancaire" ? "Bancaire" : "SYSCOHADA";

  // Garde uniquement les exercices avec activité
  const activeRatios = useMemo(
    () => ratios.filter((r) => r.ca !== 0 || r.totalActif !== 0),
    [ratios]
  );

  const lastRatio = activeRatios[activeRatios.length - 1] ?? null;
  const previousRatios = activeRatios.slice(-6, -1).reverse(); // 5 derniers avant le dernier
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

  if (!fundTitre || !lastRatio) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Données fondamentales indisponibles
        </h3>
        <p className="text-sm text-slate-500">
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
    <div className="space-y-4 md:space-y-6">
      {/* === HEADER === */}
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200 p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-medium">Fondamentaux</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              États financiers · Format {fundTitre.formatEtats} ·{" "}
              {activeRatios.length} exercices · Dernière publication :{" "}
              <strong>{lastRatio.exercice}</strong>
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Source : états annuels publiés
          </div>
        </div>
      </div>

      {/* === SYNTHÈSE — Cards === */}
      <section>
        <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
          Synthèse · Exercice {lastRatio.exercice}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-3">
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
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* CA + RN sur 10 ans */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <h4 className="text-sm font-medium mb-3">
            {caLabel} et résultat net · 10 ans
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={caData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="annee" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => formatBig(Number(v)).replace(" Mds", "Md").replace(" T", "T")}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const label = name === "ca" ? caLabel : "Résultat net";
                    return [formatBig(Number(value)) + " FCFA", label];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ca" fill="#185FA5" name={caLabel} />
                <Bar dataKey="rnet" fill="#16a34a" name="Résultat net" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Marges + ROE/ROA */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <h4 className="text-sm font-medium mb-3">
            {isBank === "Bancaire" ? "Coefficient d'exploitation & rentabilité" : "Marges & rentabilité"} · 10 ans
          </h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratiosLineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="annee" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => {
                    const v = Number(value);
                    return [`${v.toFixed(1).replace(".", ",")}%`, ""];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {isBank === "Bancaire" ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="roe"
                      stroke="#185FA5"
                      strokeWidth={2}
                      name="ROE %"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="roa"
                      stroke="#854F0B"
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
                      stroke="#185FA5"
                      strokeWidth={2}
                      name="Marge opérationnelle %"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="margeNette"
                      stroke="#16a34a"
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
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100">
          <h4 className="text-sm font-medium">Ratios · 6 derniers exercices</h4>
        </div>
        <div className="overflow-x-auto select-none" {...protectProps}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
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
            <tbody className="text-slate-700">
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

      {/* === ÉTATS FINANCIERS === */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium">États financiers détaillés</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Bilan, compte de résultat et flux de trésorerie · format{" "}
              {fundTitre.formatEtats} · <strong>en millions de FCFA</strong>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-500">Exercice</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white"
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
              className="px-2 py-1 border border-slate-300 rounded-md bg-white"
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
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <StatementTable
            title={isBank === "Bancaire" ? "Bilan · Actif" : "Bilan · Actif"}
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
    <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4">
      <div className="text-xs text-slate-500 truncate">{label}</div>
      <div className="text-lg md:text-xl font-semibold mt-1">
        {value}
        {unit && <span className="text-xs text-slate-400 ml-1.5">{unit}</span>}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${subColor || "text-slate-500"}`}>{sub}</div>
      )}
    </div>
  );
}

function RatioGroup({ label }: { label: string }) {
  return (
    <tr className="bg-slate-50">
      <td
        colSpan={20}
        className="px-4 py-1.5 text-xs font-medium text-slate-600 uppercase tracking-wide"
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
    return v > 0 ? "text-green-700" : "text-red-700";
  }

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-4 py-2 text-slate-600">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`text-right px-3 py-2 font-medium ${
            i > 0 ? "hidden md:table-cell text-slate-500" : ""
          } ${color(v)}`}
        >
          {fmt(v)}
        </td>
      ))}
    </tr>
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
      <div className="px-4 md:px-5 py-3 bg-slate-50 border-b border-slate-100">
        <h5 className="text-xs font-medium uppercase tracking-wide text-slate-700">
          {title}
        </h5>
      </div>
      <div className="overflow-x-auto select-none" {...protectProps}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-100">
              <th className="text-left px-4 py-2 font-medium">Poste</th>
              {years.map((y, i) => (
                <th key={y} className="text-right px-3 py-2 font-medium">
                  {y}
                  {i > 0 && (
                    <span className="block text-[10px] text-slate-400 font-normal">
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
              const isTotal = l.typeValeur === "Total" || l.typeValeur === "SIG";
              const v0 = l.values[years[0]] ?? 0;
              const v1 = years.length > 1 ? l.values[years[1]] ?? 0 : null;
              const variation =
                v1 !== null && v1 !== 0 ? (v0 - v1) / Math.abs(v1) : null;
              return (
                <tr
                  key={l.codePoste + "_" + l.ordre}
                  className={`border-b border-slate-50 last:border-0 ${
                    isTotal ? "bg-slate-50/60 font-medium text-slate-900" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-slate-700">{l.libelle}</td>
                  {years.map((y) => (
                    <td
                      key={y}
                      className="text-right px-3 py-2 font-mono text-xs whitespace-nowrap"
                    >
                      {formatMillions(l.values[y] ?? 0)}
                    </td>
                  ))}
                  {years.length > 1 && (
                    <td
                      className={`text-right px-3 py-2 text-xs hidden md:table-cell ${pctColor(
                        variation
                      )}`}
                    >
                      {variation !== null
                        ? formatPct(variation, 1)
                        : "—"}
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
