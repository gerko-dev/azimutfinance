"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import CountryFlag from "../CountryFlag";
import type { SovereignBond } from "@/lib/listedBondsTypes";
import {
  getSovereignCashflows,
  calculateSovereignActuarialMetrics,
} from "@/lib/listedBondsTypes";

// ============================================================================
// TYPES
// ============================================================================
export type SovereignProData = {
  bond: SovereignBond;
  spread: number | null;
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  interCountrySpreads: Array<{
    country: string;
    ytm: number;
    spread: number;
    isTarget: boolean;
  }>;
  related: Array<{
    id: string;
    isin: string;
    country: string;
    type: "OAT" | "BAT";
    maturity: number;
    lastYield: number;
    outstandingEstimate: number;
  }>;
};

type Tab = "synthese" | "adjudications" | "echeancier" | "risque";

// ============================================================================
// FORMATAGE
// ============================================================================
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}
function formatFCFA2(value: number): string {
  return value
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// Les montants UMOA-Titres sont stockés en MILLIONS de FCFA.
function formatBigFCFA(millions: number): string {
  const fcfa = millions * 1_000_000;
  if (fcfa >= 1e12) return (fcfa / 1e12).toFixed(2).replace(".", ",") + " T";
  if (fcfa >= 1e9) return (fcfa / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (fcfa >= 1e6) return (fcfa / 1e6).toFixed(0) + " M";
  return formatFCFA(fcfa);
}
function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
function formatDateShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
}
function fmtPct(n: number, digits = 2): string {
  return `${n.toFixed(digits).replace(".", ",")}%`;
}
function fmtSpread(decimal: number | null): string {
  if (decimal === null || !isFinite(decimal)) return "—";
  const bp = decimal * 10000;
  const sign = bp > 0 ? "+" : "";
  return `${sign}${Math.round(bp)} pb`;
}
function formatMaturity(years: number): string {
  if (years <= 0) return "échu";
  if (years < 1) return `${Math.round(years * 12)} mois`;
  return `${years.toFixed(1).replace(".", ",")} ans`;
}
function residualMaturityYears(maturityDate: string, nowMs: number): number {
  const mat = new Date(maturityDate).getTime();
  if (isNaN(mat) || mat <= nowMs) return 0;
  return (mat - nowMs) / (365.25 * 24 * 60 * 60 * 1000);
}

// ============================================================================
// REPRICING CLIENT (sur les flux futurs sérialisés)
// ============================================================================
type FutureCf = { daysFromNow: number; amount: number };

function priceAtYtm(cfs: FutureCf[], accrued: number, y: number): { dirty: number; clean: number } {
  let dirty = 0;
  for (const cf of cfs) dirty += cf.amount * Math.pow(1 + y, -cf.daysFromNow / 365);
  return { dirty, clean: dirty - accrued };
}
function ytmAtClean(cfs: FutureCf[], accrued: number, targetClean: number): number {
  if (targetClean <= 0 || cfs.length === 0) return NaN;
  let lo = -0.5;
  let hi = 2;
  const f = (y: number) => priceAtYtm(cfs, accrued, y).clean - targetClean;
  if (f(lo) * f(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const d = priceAtYtm(cfs, accrued, mid).clean - targetClean;
    if (Math.abs(d) < 1e-4) return mid;
    if (d > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function SovereignProView({ data }: { data: SovereignProData }) {
  const { bond, spread, theoreticalHistory, interCountrySpreads, related } = data;
  const [tab, setTab] = useState<Tab>("synthese");

  // Date stabilisée au montage (purity react-hooks).
  const [now] = useState(() => new Date());
  const nowMs = now.getTime();

  const residual = residualMaturityYears(bond.maturityDate, nowMs);
  const isExpired = residual <= 0;

  // Le React Compiler mémoïse ces dérivations ; pas de useMemo manuel (qui
  // déclencherait preserve-manual-memoization sur les chaînages).
  const cashflows = getSovereignCashflows(bond);
  const futureCashflows = cashflows.filter(
    (cf) => new Date(cf.date).getTime() > nowMs
  );
  // Métriques actuarielles au YTM marché = rendement du dernier round cash.
  const metrics = isExpired
    ? null
    : calculateSovereignActuarialMetrics(bond, now, bond.lastYield);

  const lastAdj = bond.adjudications[bond.adjudications.length - 1];
  const cashAbsorption = bond.cashSubmitted > 0 ? bond.cashAmount / bond.cashSubmitted : 0;

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4">
        <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
          <Link href="/pros" className="hover:text-slate-300 transition">
            Pro Terminal
          </Link>
          <span className="text-slate-700">›</span>
          <Link href="/pros/souverains" className="hover:text-slate-300 transition">
            Souverains UMOA-Titres
          </Link>
          <span className="text-slate-700">›</span>
          <span className="text-slate-400">
            {bond.type} {bond.country}
          </span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <CountryFlag country={bond.country} size={28} />
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-white flex items-center gap-2 flex-wrap">
                {bond.type} {bond.countryName} · {formatMaturity(bond.maturity)}
                <span
                  className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                    bond.type === "OAT"
                      ? "bg-blue-500/15 text-blue-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {bond.type}
                </span>
                {bond.nbRounds > 1 && (
                  <span className="text-[11px] px-2 py-0.5 bg-purple-500/15 text-purple-300 rounded font-medium">
                    ×{bond.nbRounds} rounds
                  </span>
                )}
                {isExpired && (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded font-medium">
                    Échu
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Trésor de {bond.countryName} · UMOA-Titres ·{" "}
                <span className="font-mono">{bond.isin || bond.id}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {bond.lastUrl && (
              <a
                href={bond.lastUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] px-2.5 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
                title="Fiche UMOA-Titres du dernier round"
              >
                UMOA-Titres ↗
              </a>
            )}
            <Link
              href={`/souverain/${encodeURIComponent(bond.id)}`}
              className="text-[11px] px-2.5 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
              title="Voir la fiche publique"
            >
              Fiche publique ↗
            </Link>
          </div>
        </div>
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Kpi
          label="Rdt dernier round"
          value={fmtPct(bond.lastYield * 100)}
          sub={`pondéré · ${formatDateShort(bond.lastIssueDate)}`}
          tone="up"
        />
        <Kpi
          label="Coupon"
          value={bond.couponRate != null ? fmtPct(bond.couponRate * 100) : "Zéro-c."}
          sub={bond.couponRate != null ? "annuel" : "BAT précompté"}
        />
        <Kpi
          label="Maturité résid."
          value={formatMaturity(residual)}
          sub={`éch. ${formatDateShort(bond.maturityDate)}`}
        />
        <Kpi
          label="Duration mod."
          value={metrics ? metrics.modified.toFixed(2).replace(".", ",") : "—"}
          sub="années"
        />
        <Kpi
          label="Spread courbe"
          value={fmtSpread(spread)}
          sub="vs courbe pays"
          tone={spread == null ? "neutral" : spread > 0 ? "up" : "down"}
        />
        <Kpi
          label="Prix actuariel"
          value={metrics ? formatFCFA(metrics.cleanPrice) : "—"}
          sub="pied de coupon"
        />
        <Kpi label="Cash levé" value={formatBigFCFA(bond.cashAmount)} sub="FCFA cumulé" />
        <Kpi label="Encours est." value={formatBigFCFA(bond.outstandingEstimate)} sub="FCFA net" />
      </div>

      {/* ====== TABS ====== */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {(
          [
            ["synthese", "Synthèse"],
            ["adjudications", `Adjudications (${bond.nbRounds})`],
            ["echeancier", "Échéancier & flux"],
            ["risque", "Pricing & risque"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              tab === key
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "synthese" && (
        <SyntheseTab
          bond={bond}
          metrics={metrics}
          spread={spread}
          residual={residual}
          theoreticalHistory={theoreticalHistory}
          interCountrySpreads={interCountrySpreads}
          related={related}
          cashAbsorption={cashAbsorption}
          lastAdj={lastAdj}
        />
      )}
      {tab === "adjudications" && <AdjudicationsTab bond={bond} />}
      {tab === "echeancier" && (
        <EcheancierTab bond={bond} cashflows={cashflows} nowMs={nowMs} />
      )}
      {tab === "risque" && (
        <RisqueTab bond={bond} metrics={metrics} futureCashflows={futureCashflows} nowMs={nowMs} />
      )}
    </div>
  );
}

// ============================================================================
// ONGLET SYNTHESE
// ============================================================================
function SyntheseTab({
  bond,
  metrics,
  spread,
  residual,
  theoreticalHistory,
  interCountrySpreads,
  related,
  cashAbsorption,
  lastAdj,
}: {
  bond: SovereignBond;
  metrics: ReturnType<typeof calculateSovereignActuarialMetrics>;
  spread: number | null;
  residual: number;
  theoreticalHistory: SovereignProData["theoreticalHistory"];
  interCountrySpreads: SovereignProData["interCountrySpreads"];
  related: SovereignProData["related"];
  cashAbsorption: number;
  lastAdj: SovereignBond["adjudications"][number] | undefined;
}) {
  const pricingSeries = useMemo(
    () =>
      theoreticalHistory
        .map((t) => ({ date: t.date, theoretical: t.theoreticalPrice }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [theoreticalHistory]
  );

  const amortLabel =
    bond.type === "BAT"
      ? "Zéro-coupon (bullet)"
      : bond.amortizationType || "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Caractéristiques */}
        <Card title="Caractéristiques">
          <dl className="divide-y divide-slate-800">
            <Row label="Émetteur" value={`Trésor de ${bond.countryName}`} />
            <Row label="Pays" value={bond.country} />
            <Row label="Type" value={bond.type === "OAT" ? "OAT (obligation)" : "BAT (bon)"} />
            <Row label="ISIN" value={bond.isin || "—"} mono />
            <Row label="Nominal / titre" value={`${formatFCFA(bond.nominalValue)} FCFA`} />
            <Row
              label="Coupon nominal"
              value={bond.couponRate != null ? fmtPct(bond.couponRate * 100) : "Zéro-coupon"}
            />
            <Row label="Amortissement" value={amortLabel} />
            {bond.graceYears > 0 && (
              <Row label="Différé" value={`${bond.graceYears} an${bond.graceYears > 1 ? "s" : ""}`} />
            )}
            <Row label="1re émission" value={formatDate(bond.firstIssueDate)} />
            <Row label="Dernière émission" value={formatDate(bond.lastIssueDate)} />
            <Row label="Échéance" value={formatDate(bond.maturityDate)} />
            <Row label="Maturité résiduelle" value={formatMaturity(residual)} />
            <Row label="Nombre de rounds" value={String(bond.nbRounds)} />
          </dl>
        </Card>

        {/* Valorisation & marché */}
        <Card title="Valorisation & marché" subtitle="YTM marché = dernier round cash">
          <dl className="divide-y divide-slate-800">
            <Row
              label="Rendement dernier round"
              value={fmtPct(bond.lastYield * 100)}
              valueClass="text-white font-semibold"
            />
            <Row label="Rdt moyen pondéré (cash)" value={fmtPct(bond.avgYield * 100)} />
            <Row
              label="Prix pied de coupon"
              value={metrics ? `${formatFCFA(metrics.cleanPrice)} FCFA` : "—"}
            />
            <Row
              label="Coupon couru"
              value={metrics ? `${formatFCFA2(metrics.accruedInterest)} FCFA` : "—"}
            />
            <Row
              label="Prix plein (dirty)"
              value={metrics ? `${formatFCFA2(metrics.dirtyPrice)} FCFA` : "—"}
            />
            <Row
              label="Spread vs courbe pays"
              value={fmtSpread(spread)}
              valueClass={
                spread == null
                  ? "text-slate-300"
                  : spread > 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <Row
              label="Duration Macaulay"
              value={metrics ? `${metrics.macaulay.toFixed(2).replace(".", ",")} ans` : "—"}
            />
            <Row
              label="Duration modifiée"
              value={metrics ? `${metrics.modified.toFixed(2).replace(".", ",")} ans` : "—"}
            />
            <Row
              label="Convexité"
              value={metrics ? metrics.convexity.toFixed(2).replace(".", ",") : "—"}
            />
            <Row
              label="BPV / DV01 (par titre)"
              value={metrics ? `${formatFCFA(metrics.bpv)} FCFA / pb` : "—"}
            />
            <Row label="Cash levé cumulé" value={`${formatBigFCFA(bond.cashAmount)} FCFA`} />
            <Row
              label="Taux d'absorption moyen"
              value={cashAbsorption > 0 ? fmtPct(cashAbsorption * 100) : "—"}
            />
            {lastAdj && (
              <Row label="Dernière adjudication" value={formatDate(lastAdj.tradeDate)} />
            )}
          </dl>
        </Card>
      </div>

      {/* Prix théorique */}
      {pricingSeries.length > 1 && (
        <Card title="Prix théorique" subtitle="courbe primaire UMOA-Titres · pied de coupon">
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pricingSeries}>
                <defs>
                  <linearGradient id="sovProPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(d) => formatDateShort(String(d))}
                  minTickGap={40}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  domain={["auto", "auto"]}
                  width={50}
                  tickFormatter={(v) => formatFCFA(Number(v))}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(v) => [`${formatFCFA(Number(v))} FCFA`, "Prix théorique"]}
                />
                <ReferenceLine
                  y={bond.nominalValue}
                  stroke="#475569"
                  strokeDasharray="4 4"
                  label={{ value: "Pair", fill: "#64748b", fontSize: 10, position: "right" }}
                />
                <Area
                  type="monotone"
                  dataKey="theoretical"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#sovProPrice)"
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Spreads inter-pays */}
        {interCountrySpreads.length > 1 && (
          <Card title="Spreads inter-pays" subtitle={`à maturité résiduelle ${formatMaturity(residual)}`}>
            <div className="divide-y divide-slate-800">
              {interCountrySpreads.map((s) => (
                <div
                  key={s.country}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    s.isTarget ? "bg-slate-800/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CountryFlag country={s.country} size={16} />
                    <span className={s.isTarget ? "text-white font-medium" : "text-slate-300"}>
                      {s.country}
                      {s.isTarget && <span className="ml-1.5 text-[10px] text-blue-400">cible</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="text-slate-400">{fmtPct(s.ytm * 100)}</span>
                    <span
                      className={`w-16 text-right ${
                        s.isTarget
                          ? "text-slate-500"
                          : s.spread > 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {s.isTarget ? "—" : fmtSpread(s.spread)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Titres comparables */}
        {related.length > 0 && (
          <Card title="Titres comparables" subtitle="même pays · maturité proche">
            <div className="divide-y divide-slate-800">
              {related.map((s) => (
                <Link
                  key={s.id}
                  href={`/pros/souverain/${encodeURIComponent(s.id)}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/40 transition text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        s.type === "OAT" ? "bg-blue-500/15 text-blue-300" : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {s.type}
                    </span>
                    <span className="text-slate-200 truncate font-mono text-xs">
                      {s.isin || s.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-400 shrink-0">
                    <span>{formatMaturity(s.maturity)}</span>
                    <span className="text-emerald-400">{fmtPct(s.lastYield * 100)}</span>
                    <span className="text-slate-600">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ONGLET ADJUDICATIONS
// ============================================================================
function AdjudicationsTab({ bond }: { bond: SovereignBond }) {
  const orderedAdjudications = useMemo(
    () =>
      bond.adjudications
        .slice()
        .sort((a, b) => a.valueDate.localeCompare(b.valueDate))
        .map((a, i) => ({ ...a, roundIndex: i + 1 })),
    [bond.adjudications]
  );

  const roundsChartData = useMemo(
    () =>
      orderedAdjudications.map((a) => ({
        round: `R${a.roundIndex}`,
        date: a.valueDate,
        yield: a.yield * 100,
      })),
    [orderedAdjudications]
  );

  return (
    <div className="space-y-4">
      {orderedAdjudications.length > 1 && (
        <Card title="Évolution du rendement par round" subtitle="rendement moyen pondéré · trait = coupon nominal">
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={roundsChartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="round" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  unit="%"
                  domain={[
                    (dataMin: number) => Math.max(0, Math.floor(dataMin - 0.5)),
                    (dataMax: number) => Math.ceil(dataMax + 0.5),
                  ]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  formatter={(v) => [`${Number(v).toFixed(2).replace(".", ",")}%`, "Rendement"]}
                  labelFormatter={(round, payload) => {
                    const d = payload?.[0]?.payload?.date as string;
                    return `${round} · ${formatDate(d)}`;
                  }}
                />
                {bond.couponRate != null && (
                  <ReferenceLine y={bond.couponRate * 100} stroke="#475569" strokeDasharray="3 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="yield"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#60a5fa" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card
        title="Historique des adjudications"
        subtitle={`${bond.nbRounds} round${bond.nbRounds > 1 ? "s" : ""} · cumul ${formatBigFCFA(bond.totalAmount)} FCFA`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-3 py-2.5 text-left font-medium">#</th>
                <th className="px-3 py-2.5 text-left font-medium">Date opér.</th>
                <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Date valeur</th>
                <th className="px-3 py-2.5 text-left font-medium">Nature</th>
                <th className="px-3 py-2.5 text-right font-medium">Rdt</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Marginal</th>
                <th className="px-3 py-2.5 text-right font-medium hidden lg:table-cell">Prix moyen</th>
                <th className="px-3 py-2.5 text-right font-medium">Soumis</th>
                <th className="px-3 py-2.5 text-right font-medium">Retenu</th>
                <th className="px-3 py-2.5 text-right font-medium">Absorp.</th>
              </tr>
            </thead>
            <tbody>
              {orderedAdjudications.map((a) => (
                <tr
                  key={`${a.valueDate}-${a.roundIndex}`}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 text-slate-400">
                    R{a.roundIndex}
                    {a.roundIndex === 1 && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 bg-blue-500/15 text-blue-300 rounded">
                        init.
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-300">{formatDateShort(a.tradeDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell text-slate-400">
                    {formatDateShort(a.valueDate)}
                  </td>
                  <td className="px-3 py-2">
                    {a.kind === "cash_auction" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">Cash</span>
                    ) : a.kind === "swap" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Swap</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Rachat</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                    {fmtPct(a.yield * 100)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400 hidden md:table-cell">
                    {a.marginalYield != null ? fmtPct(a.marginalYield * 100) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400 hidden lg:table-cell">
                    {a.weightedAvgPrice != null ? formatFCFA(a.weightedAvgPrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{formatBigFCFA(a.amountSubmitted)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{formatBigFCFA(a.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        a.absorption >= 0.9
                          ? "bg-emerald-500/15 text-emerald-300"
                          : a.absorption >= 0.6
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {fmtPct(a.absorption * 100)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
          <span className="text-blue-300">Cash</span> = adjudication compétitive (cash neuf, entre dans la
          calibration de courbe) · <span className="text-amber-300">Swap</span> = échange/rachat simultané
          (rendement mécanique) · <span className="text-slate-300">Rachat</span> = sortie de dette.
          Absorption = retenu / soumis.
        </p>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET ECHEANCIER & FLUX
// ============================================================================
function EcheancierTab({
  bond,
  cashflows,
  nowMs,
}: {
  bond: SovereignBond;
  cashflows: ReturnType<typeof getSovereignCashflows>;
  nowMs: number;
}) {
  const chartData = useMemo(
    () =>
      cashflows.map((cf) => ({
        date: cf.date,
        coupon: cf.type === "coupon" ? Math.round(cf.amount) : 0,
        amort: cf.type !== "coupon" ? Math.round(cf.amount) : 0,
      })),
    [cashflows]
  );

  const totals = useMemo(
    () =>
      cashflows.reduce(
        (acc, cf) => {
          if (cf.type === "coupon") acc.coupon += cf.amount;
          else acc.amort += cf.amount;
          acc.total += cf.amount;
          return acc;
        },
        { coupon: 0, amort: 0, total: 0 }
      ),
    [cashflows]
  );

  const futureCount = cashflows.filter((cf) => new Date(cf.date).getTime() > nowMs).length;
  const pastCount = cashflows.length - futureCount;

  const exportCsv = () => {
    const header = ["Date", "Statut", "Type", "Montant_par_titre", "Capital_restant"];
    const lines = cashflows.map((cf) => {
      const isPast = new Date(cf.date).getTime() <= nowMs;
      return [
        cf.date,
        isPast ? "Versé" : "À venir",
        cf.type,
        cf.amount.toFixed(2).replace(".", ","),
        cf.outstandingAfter.toFixed(2).replace(".", ","),
      ].join(";");
    });
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeId = (bond.isin || bond.id).replace(/[^A-Za-z0-9-]/g, "_");
    a.download = `echeancier-${safeId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (cashflows.length === 0) {
    return (
      <Card title="Échéancier des flux">
        <div className="p-10 text-center text-sm text-slate-500">
          Aucun flux n&apos;a pu être généré (données incomplètes ou titre échu).
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Flux par titre" subtitle="coupons + amortissements">
        <div className="p-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={10}
                tickFormatter={(d) => formatDateShort(String(d))}
                minTickGap={30}
              />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => formatFCFA(Number(v))} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                labelFormatter={(d) => formatDate(String(d))}
                formatter={(v, n) => [`${formatFCFA(Number(v))} FCFA`, n === "coupon" ? "Coupon" : "Amortissement"]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
              <Bar dataKey="coupon" name="Coupon" stackId="a" fill="#60a5fa" />
              <Bar dataKey="amort" name="Amortissement" stackId="a" fill="#fbbf24" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Échéancier détaillé"
        subtitle={`${cashflows.length} flux · ${pastCount} versés · ${futureCount} à venir`}
        right={
          <button
            type="button"
            onClick={exportCsv}
            className="text-[11px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition"
          >
            ⬇ Export CSV
          </button>
        }
      >
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900">
                <th className="px-4 py-2.5 text-left font-medium">Statut</th>
                <th className="px-3 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Montant / titre</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Capital restant</th>
              </tr>
            </thead>
            <tbody>
              {cashflows.map((cf, i) => {
                const isPast = new Date(cf.date).getTime() <= nowMs;
                return (
                  <tr
                    key={i}
                    className={`border-b border-slate-800 last:border-0 hover:bg-slate-800/40 ${
                      isPast ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isPast ? "bg-slate-700 text-slate-400" : "bg-blue-500/15 text-blue-300"
                        }`}
                      >
                        {isPast ? "Versé" : "À venir"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{formatDate(cf.date)}</td>
                    <td className="px-3 py-2">
                      {cf.type === "coupon" ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">Coupon</span>
                      ) : cf.type === "amortissement" ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded">Amortissement</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded">Remb. final</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{formatFCFA(cf.amount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">
                      {formatFCFA(cf.outstandingAfter)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600 bg-slate-800/70 font-semibold text-slate-100">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFCFA2(totals.total)}</td>
                <td className="px-3 py-2.5 hidden md:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
          Valeurs par titre (nominal {formatFCFA(bond.nominalValue)} FCFA) · convention UMOA-Titres,
          coupon annuel sur capital restant dû.
        </p>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET PRICING & RISQUE
// ============================================================================
function RisqueTab({
  bond,
  metrics,
  futureCashflows,
  nowMs,
}: {
  bond: SovereignBond;
  metrics: ReturnType<typeof calculateSovereignActuarialMetrics>;
  futureCashflows: ReturnType<typeof getSovereignCashflows>;
  nowMs: number;
}) {
  // Flux futurs → repricing client (jours depuis aujourd'hui).
  const cfs: FutureCf[] = useMemo(
    () =>
      futureCashflows.map((cf) => ({
        daysFromNow: (new Date(cf.date).getTime() - nowMs) / (24 * 60 * 60 * 1000),
        amount: cf.amount,
      })),
    [futureCashflows, nowMs]
  );

  const accrued = metrics?.accruedInterest ?? 0;
  const baseYtm = bond.lastYield;

  const [mode, setMode] = useState<"price" | "ytm">("ytm");
  const [priceInput, setPriceInput] = useState<string>(
    metrics ? String(Math.round(metrics.cleanPrice)) : ""
  );
  const [ytmInput, setYtmInput] = useState<string>((baseYtm * 100).toFixed(2).replace(".", ","));

  const result = useMemo(() => {
    if (cfs.length === 0) return null;
    if (mode === "price") {
      const clean = Number(priceInput.replace(",", "."));
      if (!Number.isFinite(clean) || clean <= 0) return null;
      const y = ytmAtClean(cfs, accrued, clean);
      if (!Number.isFinite(y)) return null;
      return { clean, dirty: clean + accrued, ytm: y };
    }
    const y = Number(ytmInput.replace(",", ".")) / 100;
    if (!Number.isFinite(y)) return null;
    const { clean, dirty } = priceAtYtm(cfs, accrued, y);
    return { clean, dirty, ytm: y };
  }, [mode, priceInput, ytmInput, cfs, accrued]);

  // Stress test : choc parallèle sur le YTM marché.
  const baseClean = useMemo(
    () => (cfs.length > 0 ? priceAtYtm(cfs, accrued, baseYtm).clean : 0),
    [cfs, accrued, baseYtm]
  );
  const stress = useMemo(() => {
    const shocks = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
    return shocks.map((bp) => {
      const y = baseYtm + bp / 10000;
      const { clean } = priceAtYtm(cfs, accrued, y);
      const deltaPct = baseClean > 0 ? ((clean - baseClean) / baseClean) * 100 : 0;
      return { bp, ytm: y, clean, deltaPct };
    });
  }, [cfs, accrued, baseYtm, baseClean]);

  if (!metrics || cfs.length === 0) {
    return (
      <Card title="Pricing & risque">
        <div className="p-10 text-center text-sm text-slate-500">
          Titre échu ou échéancier indisponible — pas de métriques actuarielles.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sensibilité */}
      <Card title="Sensibilité au taux" subtitle={`au YTM marché ${fmtPct(baseYtm * 100)} · prix ${formatFCFA(metrics.cleanPrice)} FCFA`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          <Stat label="Duration Macaulay" value={`${metrics.macaulay.toFixed(2).replace(".", ",")} ans`} hint="maturité moyenne pondérée" />
          <Stat label="Duration modifiée" value={`${metrics.modified.toFixed(2).replace(".", ",")} ans`} hint="−ΔP/Δy en %" />
          <Stat label="Convexité" value={metrics.convexity.toFixed(2).replace(".", ",")} hint="second ordre" />
          <Stat label="BPV / DV01" value={`${formatFCFA(metrics.bpv)} FCFA`} hint="par titre · +1 pb" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Convertisseur prix ⇄ YTM */}
        <Card title="Convertisseur prix ⇄ YTM" subtitle="repricing ACT/365 sur flux futurs">
          <div className="p-4 space-y-4">
            <div className="inline-flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("price")}
                className={`px-3 py-1.5 rounded-md border transition ${
                  mode === "price"
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                Prix → YTM
              </button>
              <button
                type="button"
                onClick={() => setMode("ytm")}
                className={`px-3 py-1.5 rounded-md border transition ${
                  mode === "ytm"
                    ? "bg-blue-600/20 text-blue-300 border-blue-500/40"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                YTM → Prix
              </button>
            </div>

            {mode === "price" ? (
              <label className="block">
                <span className="text-xs text-slate-400">Cours pied de coupon (FCFA)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </label>
            ) : (
              <label className="block">
                <span className="text-xs text-slate-400">YTM cible (%)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={ytmInput}
                  onChange={(e) => setYtmInput(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </label>
            )}

            {result ? (
              <dl className="divide-y divide-slate-800 border-t border-slate-800">
                <Row
                  label={mode === "price" ? "YTM actuariel" : "Cours pied de coupon"}
                  value={mode === "price" ? fmtPct(result.ytm * 100) : `${formatFCFA2(result.clean)} FCFA`}
                  valueClass="text-white font-semibold"
                />
                <Row label="Cours plein (dirty)" value={`${formatFCFA2(result.dirty)} FCFA`} />
                <Row label="Coupon couru" value={`${formatFCFA2(accrued)} FCFA`} />
              </dl>
            ) : (
              <div className="text-xs text-red-400 border-t border-slate-800 pt-3">
                Valeur invalide ou hors bornes actuarielles.
              </div>
            )}
          </div>
        </Card>

        {/* Stress test */}
        <Card title="Stress test de taux" subtitle="choc parallèle sur le YTM marché">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                  <th className="px-4 py-2.5 text-left font-medium">Choc</th>
                  <th className="px-3 py-2.5 text-right font-medium">YTM</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cours</th>
                  <th className="px-3 py-2.5 text-right font-medium">Δ Prix</th>
                </tr>
              </thead>
              <tbody>
                {stress.map((s) => {
                  const isBase = s.bp === 0;
                  return (
                    <tr
                      key={s.bp}
                      className={`border-b border-slate-800 last:border-0 ${
                        isBase ? "bg-slate-800/60" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className={`px-4 py-2 font-mono ${isBase ? "text-white font-semibold" : "text-slate-300"}`}>
                        {s.bp > 0 ? "+" : ""}
                        {s.bp} pb
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtPct(s.ytm * 100)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{formatFCFA2(s.clean)}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-medium ${
                          isBase ? "text-slate-500" : s.deltaPct > 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {isBase ? "—" : `${s.deltaPct > 0 ? "+" : ""}${s.deltaPct.toFixed(2).replace(".", ",")}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <p className="text-[10px] text-slate-500 px-1">
        Repricing actuariel ACT/365 par bissection sur l&apos;échéancier réel (coupons + amortissements).
        YTM marché = rendement du dernier round cash ({fmtPct(baseYtm * 100)}). Valeurs par titre.
      </p>
    </div>
  );
}

// ============================================================================
// SOUS-COMPOSANTS PARTAGES
// ============================================================================
function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const subColor =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-slate-500";
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className="text-base md:text-lg font-semibold text-white font-mono mt-1">{value}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${subColor} truncate`}>{sub}</div>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-white font-mono mt-1">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        {subtitle && <span className="text-[10px] text-slate-500">· {subtitle}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  valueClass = "text-slate-200",
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""} ${valueClass}`}>{value}</dd>
    </div>
  );
}
