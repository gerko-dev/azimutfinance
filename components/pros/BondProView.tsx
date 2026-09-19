"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import CountryFlag from "../CountryFlag";
import LivePriceBadge from "../LivePriceBadge";
import type { ListedBond } from "@/lib/listedBondsTypes";
import { bondHref } from "@/lib/listedBondsTypes";

// ============================================================================
// TYPES
// ============================================================================
export type SerializedCashflow = {
  date: string;
  daysFromNow: number;
  coupon: number;
  amort: number;
  totalFlow: number;
  outstandingBefore: number;
  outstandingAfter: number;
};

export type BondProData = {
  bond: ListedBond;
  market: {
    cleanPrice: number;
    dirtyPrice: number;
    accruedInterest: number;
    couponCouruLive: number;
    ytm: number;
    macaulay: number | null;
    modified: number | null;
    convexity: number | null;
    bpv: number | null;
    hasQuote: boolean;
    isLive: boolean;
    operationDate: string;
    theoreticalPrice: number | null;
    theoreticalYtm: number | null;
    signatureSpread: number | null;
  };
  cashflows: SerializedCashflow[];
  observedPrices: Array<{
    date: string;
    cleanPrice: number;
    dirtyPrice: number;
    volume: number;
  }>;
  theoreticalHistory: Array<{ date: string; theoreticalPrice: number; ytm: number }>;
  eventsCount: number;
  similarBonds: Array<{
    isin: string;
    code: string;
    name: string;
    country: string;
    couponRate: number;
    yearsToMaturity: number;
  }>;
  session: { sessionLabel: string | null; isClosed: boolean | null };
};

type Tab = "synthese" | "echeancier" | "cotations" | "simulateur";

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
function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M";
  return formatFCFA(value);
}
function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
function amortLabel(type: string): string {
  return type === "IF" ? "In fine" : type === "ACD" ? "Constant différé" : "Constant";
}
function freqLabel(f: number): string {
  return f === 1 ? "Annuel" : f === 2 ? "Semestriel" : f === 4 ? "Trimestriel" : `${f}×/an`;
}

// ============================================================================
// REPRICING CLIENT (à partir de l'échéancier sérialisé) — miroir des fonctions
// actuarielles serveur, pour rendre le simulateur et le stress test réactifs
// sans aller-retour réseau.
// ============================================================================
function priceAtYtm(
  cfs: SerializedCashflow[],
  accrued: number,
  y: number
): { dirty: number; clean: number } {
  let dirty = 0;
  for (const cf of cfs) dirty += cf.totalFlow * Math.pow(1 + y, -cf.daysFromNow / 365);
  return { dirty, clean: dirty - accrued };
}
function ytmAtClean(
  cfs: SerializedCashflow[],
  accrued: number,
  targetClean: number
): number {
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
function durationAtYtm(
  cfs: SerializedCashflow[],
  y: number
): { mac: number; mod: number; cvx: number } {
  let sumPV = 0;
  let sumT = 0;
  let sumT2 = 0;
  for (const cf of cfs) {
    const t = cf.daysFromNow / 365;
    const df = Math.pow(1 + y, -t);
    const pv = cf.totalFlow * df;
    sumPV += pv;
    sumT += t * pv;
    sumT2 += t * (t + 1) * pv;
  }
  if (sumPV === 0) return { mac: 0, mod: 0, cvx: 0 };
  const mac = sumT / sumPV;
  return { mac, mod: mac / (1 + y), cvx: sumT2 / sumPV / Math.pow(1 + y, 2) };
}

// ============================================================================
// VUE PRINCIPALE
// ============================================================================
export default function BondProView({ data }: { data: BondProData }) {
  const { bond, market, cashflows, observedPrices, theoreticalHistory } = data;
  const [tab, setTab] = useState<Tab>("synthese");

  const priceDelta =
    bond.nominalValue > 0
      ? ((market.cleanPrice - bond.nominalValue) / bond.nominalValue) * 100
      : null;
  const theoEcart =
    market.theoreticalPrice != null
      ? market.cleanPrice - market.theoreticalPrice
      : null;

  return (
    <div className="space-y-5">
      {/* ====== EN-TETE ====== */}
      <div className="border-b border-slate-800 pb-4">
        <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 flex-wrap">
          <Link href="/pros" className="hover:text-slate-300 transition">
            Pro Terminal
          </Link>
          <span className="text-slate-700">›</span>
          <Link href="/pros/obligations" className="hover:text-slate-300 transition">
            Obligations cotées
          </Link>
          <span className="text-slate-700">›</span>
          <span className="text-slate-400">{bond.name}</span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <CountryFlag country={bond.country} size={28} />
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-white flex items-center gap-2">
                {bond.greenBond && <span title="Obligation verte">🌱</span>}
                {bond.name}
                {bond.code && (
                  <span className="text-sm text-slate-500 font-normal font-mono">
                    {bond.code}
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {bond.issuer} · {bond.issuerType} · {bond.sector} ·{" "}
                <span className="font-mono">{bond.isin}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LivePriceBadge
              sessionLabel={data.session.sessionLabel}
              isClosed={data.session.isClosed}
              variant="dark"
            />
            <Link
              href={bondHref(bond)}
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
          label="Cours coté"
          value={market.hasQuote ? formatFCFA(market.cleanPrice) : "—"}
          sub={
            market.hasQuote && priceDelta != null
              ? Math.abs(priceDelta) < 0.05
                ? "au pair"
                : `${priceDelta > 0 ? "+" : ""}${priceDelta.toFixed(2).replace(".", ",")}% vs pair`
              : "pas de cote"
          }
          tone={
            !market.hasQuote || priceDelta == null
              ? "neutral"
              : priceDelta > 0
              ? "down"
              : "up"
          }
        />
        <Kpi
          label="YTM"
          value={fmtPct(market.ytm * 100)}
          sub={market.hasQuote ? "actuariel" : "au pair (coupon)"}
          tone={
            !market.hasQuote
              ? "neutral"
              : market.ytm > bond.couponRate
              ? "up"
              : market.ytm < bond.couponRate
              ? "down"
              : "neutral"
          }
        />
        <Kpi label="Coupon" value={fmtPct(bond.couponRate * 100)} sub={freqLabel(bond.couponFrequency)} />
        <Kpi
          label="Maturité"
          value={`${bond.yearsToMaturity.toFixed(1).replace(".", ",")} ans`}
          sub={formatDate(bond.maturityDate)}
        />
        <Kpi
          label="Duration mod."
          value={market.modified != null ? market.modified.toFixed(2).replace(".", ",") : "—"}
          sub="années"
        />
        <Kpi
          label="Spread souv."
          value={fmtSpread(market.signatureSpread)}
          sub="vs courbe UMOA"
          tone={
            market.signatureSpread == null
              ? "neutral"
              : market.signatureSpread > 0
              ? "up"
              : "down"
          }
        />
        <Kpi
          label="BPV / PV01"
          value={market.bpv != null ? market.bpv.toFixed(2).replace(".", ",") : "—"}
          sub="par titre / pb"
        />
        <Kpi label="Encours" value={formatBigFCFA(bond.outstanding)} sub="FCFA" />
      </div>

      {/* ====== TABS ====== */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {(
          [
            ["synthese", "Synthèse"],
            ["echeancier", "Échéancier"],
            ["cotations", "Cotations"],
            ["simulateur", "Simulateur & risque"],
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
          data={data}
          priceDelta={priceDelta}
          theoEcart={theoEcart}
        />
      )}
      {tab === "echeancier" && <EcheancierTab bond={bond} cashflows={cashflows} />}
      {tab === "cotations" && (
        <CotationsTab
          observedPrices={observedPrices}
          theoreticalHistory={theoreticalHistory}
          nominalValue={bond.nominalValue}
        />
      )}
      {tab === "simulateur" && <SimulateurTab data={data} />}
    </div>
  );
}

// ============================================================================
// ONGLET SYNTHESE
// ============================================================================
function SyntheseTab({
  data,
  priceDelta,
  theoEcart,
}: {
  data: BondProData;
  priceDelta: number | null;
  theoEcart: number | null;
}) {
  const { bond, market, theoreticalHistory, observedPrices, similarBonds } = data;

  const chartData = useMemo(
    () => mergePriceSeries(observedPrices, theoreticalHistory),
    [observedPrices, theoreticalHistory]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Caractéristiques */}
        <Card title="Caractéristiques">
          <dl className="divide-y divide-slate-800">
            <Row label="Émetteur" value={bond.issuer} />
            <Row label="Type" value={bond.issuerType} />
            <Row label="Secteur" value={bond.sector || "—"} />
            <Row label="Pays" value={bond.country} />
            <Row label="ISIN" value={bond.isin} mono />
            <Row label="Code BRVM" value={bond.code || "—"} mono />
            <Row
              label="Notation"
              value={bond.rating ? `${bond.rating}${bond.ratingAgency ? ` · ${bond.ratingAgency}` : ""}` : "Non noté"}
            />
            <Row label="Obligation verte" value={bond.greenBond ? "Oui 🌱" : "Non"} />
            <Row
              label="Remboursement anticipé"
              value={bond.callable ? `Callable${bond.callDate ? ` (${formatDate(bond.callDate)})` : ""}` : "Non"}
            />
            <Row label="Devise" value={bond.currency || "XOF"} />
            <Row label="Fréquence coupon" value={freqLabel(bond.couponFrequency)} />
            <Row
              label="Amortissement"
              value={`${amortLabel(bond.amortizationType)}${
                bond.amortizationType !== "IF"
                  ? ` · ${bond.amortizationMode === "N" ? "sur nominal" : "sur titre"}`
                  : ""
              }`}
            />
            <Row label="VN courante / titre" value={`${formatFCFA(bond.nominalValue)} FCFA`} />
            <Row label="Date d'émission" value={formatDate(bond.issueDate)} />
            {bond.amortizationType !== "IF" && bond.firstAmortizationDate && (
              <Row label="1er amortissement" value={formatDate(bond.firstAmortizationDate)} />
            )}
            <Row label="Échéance" value={formatDate(bond.maturityDate)} />
            <Row label="Encours" value={`${formatBigFCFA(bond.outstanding)} FCFA`} />
          </dl>
        </Card>

        {/* Valorisation */}
        <Card title="Valorisation" subtitle={`au ${formatDate(market.operationDate)}`}>
          <dl className="divide-y divide-slate-800">
            <Row
              label="Cours pied de coupon"
              value={market.hasQuote ? `${formatFCFA(market.cleanPrice)} FCFA` : "Pas de cote"}
              valueClass={market.hasQuote ? "text-white" : "text-slate-500"}
            />
            <Row label="Coupon couru" value={`${formatFCFA2(market.couponCouruLive)} FCFA`} />
            <Row label="Cours plein (dirty)" value={`${formatFCFA2(market.dirtyPrice)} FCFA`} />
            <Row
              label="Écart au pair"
              value={
                priceDelta != null
                  ? `${priceDelta > 0 ? "+" : ""}${priceDelta.toFixed(2).replace(".", ",")}%`
                  : "—"
              }
              valueClass={
                priceDelta == null || Math.abs(priceDelta) < 0.05
                  ? "text-slate-300"
                  : priceDelta > 0
                  ? "text-red-400"
                  : "text-emerald-400"
              }
            />
            <Row
              label="YTM actuariel"
              value={fmtPct(market.ytm * 100)}
              valueClass="text-white font-semibold"
            />
            <Row label="Coupon nominal" value={fmtPct(bond.couponRate * 100)} />
            <Row
              label="Prix théorique (courbe UMOA)"
              value={market.theoreticalPrice != null ? `${formatFCFA(market.theoreticalPrice)} FCFA` : "—"}
            />
            <Row
              label="Écart coté − théorique"
              value={theoEcart != null ? `${theoEcart > 0 ? "+" : ""}${formatFCFA2(theoEcart)} FCFA` : "—"}
              valueClass={
                theoEcart == null
                  ? "text-slate-300"
                  : theoEcart > 0
                  ? "text-red-400"
                  : "text-emerald-400"
              }
            />
            <Row
              label="Spread de signature"
              value={fmtSpread(market.signatureSpread)}
              valueClass={
                market.signatureSpread == null
                  ? "text-slate-300"
                  : market.signatureSpread > 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <Row
              label="Duration Macaulay"
              value={market.macaulay != null ? `${market.macaulay.toFixed(2).replace(".", ",")} ans` : "—"}
            />
            <Row
              label="Duration modifiée"
              value={market.modified != null ? `${market.modified.toFixed(2).replace(".", ",")} ans` : "—"}
            />
            <Row
              label="Convexité"
              value={market.convexity != null ? market.convexity.toFixed(2).replace(".", ",") : "—"}
            />
            <Row
              label="BPV / PV01 (par titre)"
              value={market.bpv != null ? `${market.bpv.toFixed(2).replace(".", ",")} FCFA / pb` : "—"}
            />
          </dl>
        </Card>
      </div>

      {/* Prix coté vs théorique */}
      {chartData.length > 1 && (
        <Card title="Prix coté vs théorique" subtitle="24 mois · pied de coupon">
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => formatDateShort(d)} minTickGap={40} />
                <YAxis stroke="#64748b" fontSize={11} domain={["auto", "auto"]} width={50} tickFormatter={(v) => formatFCFA(Number(v))} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(v, n) => [`${formatFCFA(Number(v))} FCFA`, n === "theo" ? "Théorique" : "Coté"]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                <Line type="monotone" dataKey="theo" name="Théorique" stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="observed" name="Coté" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Obligations similaires */}
      {similarBonds.length > 0 && (
        <Card title="Obligations comparables" subtitle="même pays · maturité proche">
          <div className="divide-y divide-slate-800">
            {similarBonds.map((s) => (
              <Link
                key={s.isin}
                href={`/pros${bondHref(s)}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/40 transition text-sm"
              >
                <div className="min-w-0">
                  <div className="text-slate-200 truncate">
                    {s.name}
                    {s.code && <span className="ml-1.5 text-[11px] text-slate-500 font-mono">{s.code}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-400 shrink-0">
                  <span>{fmtPct(s.couponRate * 100)}</span>
                  <span>{s.yearsToMaturity.toFixed(1).replace(".", ",")} ans</span>
                  <span className="text-slate-600">→</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// ONGLET ECHEANCIER
// ============================================================================
function EcheancierTab({
  bond,
  cashflows,
}: {
  bond: ListedBond;
  cashflows: SerializedCashflow[];
}) {
  const totals = useMemo(
    () =>
      cashflows.reduce(
        (acc, cf) => {
          acc.coupon += cf.coupon;
          acc.amort += cf.amort;
          acc.total += cf.totalFlow;
          return acc;
        },
        { coupon: 0, amort: 0, total: 0 }
      ),
    [cashflows]
  );

  const chartData = useMemo(
    () =>
      cashflows.map((cf) => ({
        date: cf.date,
        coupon: Math.round(cf.coupon),
        amort: Math.round(cf.amort),
      })),
    [cashflows]
  );

  const exportCsv = () => {
    const header = ["Date", "Jours", "Coupon", "Amortissement", "Flux_total", "Capital_restant"];
    const lines = cashflows.map((cf) =>
      [
        cf.date,
        Math.round(cf.daysFromNow),
        cf.coupon.toFixed(2).replace(".", ","),
        cf.amort.toFixed(2).replace(".", ","),
        cf.totalFlow.toFixed(2).replace(".", ","),
        cf.outstandingAfter.toFixed(2).replace(".", ","),
      ].join(";")
    );
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echeancier-${bond.code || bond.isin}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (cashflows.length === 0) {
    return (
      <Card title="Échéancier des flux">
        <div className="p-10 text-center text-sm text-slate-500">
          Aucun flux futur (obligation échue ou dates indisponibles).
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Flux futurs par titre" subtitle="coupons + amortissements">
        <div className="p-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => formatDateShort(d)} minTickGap={30} />
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
        subtitle={`${cashflows.length} flux · valeurs par titre (FCFA)`}
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Jours</th>
                <th className="px-3 py-2.5 text-right font-medium">Coupon</th>
                <th className="px-3 py-2.5 text-right font-medium">Amortissement</th>
                <th className="px-3 py-2.5 text-right font-medium">Flux total</th>
                <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Capital restant</th>
              </tr>
            </thead>
            <tbody>
              {cashflows.map((cf, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-300">{formatDate(cf.date)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">
                    {Math.round(cf.daysFromNow)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{formatFCFA2(cf.coupon)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {cf.amort > 0 ? formatFCFA2(cf.amort) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">{formatFCFA2(cf.totalFlow)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">
                    {formatFCFA(cf.outstandingAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600 bg-slate-800/70 font-semibold text-slate-100">
                <td className="px-4 py-2.5" colSpan={2}>
                  <span className="md:hidden">Total</span>
                  <span className="hidden md:inline">Total</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFCFA2(totals.coupon)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFCFA2(totals.amort)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFCFA2(totals.total)}</td>
                <td className="px-3 py-2.5 hidden md:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET COTATIONS
// ============================================================================
function CotationsTab({
  observedPrices,
  theoreticalHistory,
  nominalValue,
}: {
  observedPrices: BondProData["observedPrices"];
  theoreticalHistory: BondProData["theoreticalHistory"];
  nominalValue: number;
}) {
  const chartData = useMemo(
    () => mergePriceSeries(observedPrices, theoreticalHistory),
    [observedPrices, theoreticalHistory]
  );

  return (
    <div className="space-y-4">
      <Card title="Historique des prix" subtitle="coté (BRVM) vs théorique (courbe UMOA)">
        {chartData.length > 1 ? (
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => formatDateShort(d)} minTickGap={40} />
                <YAxis stroke="#64748b" fontSize={11} domain={["auto", "auto"]} width={50} tickFormatter={(v) => formatFCFA(Number(v))} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(v, n) => [`${formatFCFA(Number(v))} FCFA`, n === "theo" ? "Théorique" : "Coté"]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
                <ReferenceLine y={nominalValue} stroke="#475569" strokeDasharray="4 4" label={{ value: "Pair", fill: "#64748b", fontSize: 10, position: "right" }} />
                <Line type="monotone" dataKey="theo" name="Théorique" stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="observed" name="Coté" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            Historique de prix insuffisant pour tracer la série.
          </div>
        )}
      </Card>

      <Card title="Cotations observées" subtitle={`${observedPrices.length} séance${observedPrices.length > 1 ? "s" : ""}`}>
        {observedPrices.length > 0 ? (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900">
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pied de coupon</th>
                  <th className="px-3 py-2.5 text-right font-medium">Plein (dirty)</th>
                  <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...observedPrices].reverse().map((p, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-slate-300">{formatDate(p.date)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{formatFCFA(p.cleanPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{formatFCFA(p.dirtyPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">
                      {p.volume > 0 ? formatFCFA(p.volume) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            Aucune cotation historique enregistrée pour cette ligne.
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// ONGLET SIMULATEUR & RISQUE
// ============================================================================
function SimulateurTab({ data }: { data: BondProData }) {
  const { cashflows, market } = data;
  const accrued = market.accruedInterest;

  const [mode, setMode] = useState<"price" | "ytm">("price");
  const [priceInput, setPriceInput] = useState<string>(
    String(Math.round(market.cleanPrice))
  );
  const [ytmInput, setYtmInput] = useState<string>(
    (market.ytm * 100).toFixed(2).replace(".", ",")
  );

  const result = useMemo(() => {
    if (cashflows.length === 0) return null;
    if (mode === "price") {
      const clean = Number(priceInput.replace(",", "."));
      if (!Number.isFinite(clean) || clean <= 0) return null;
      const y = ytmAtClean(cashflows, accrued, clean);
      if (!Number.isFinite(y)) return null;
      const dur = durationAtYtm(cashflows, y);
      return { clean, dirty: clean + accrued, ytm: y, ...dur };
    }
    const y = Number(ytmInput.replace(",", ".")) / 100;
    if (!Number.isFinite(y)) return null;
    const { clean, dirty } = priceAtYtm(cashflows, accrued, y);
    const dur = durationAtYtm(cashflows, y);
    return { clean, dirty, ytm: y, ...dur };
  }, [mode, priceInput, ytmInput, cashflows, accrued]);

  // Stress test : chocs de taux appliqués au YTM de marché.
  const baseYtm = market.ytm;
  const baseClean = priceAtYtm(cashflows, accrued, baseYtm).clean;
  const shocks = [-100, -50, -25, 0, 25, 50, 100];
  const stress = useMemo(
    () =>
      shocks.map((bp) => {
        const y = baseYtm + bp / 10000;
        const { clean } = priceAtYtm(cashflows, accrued, y);
        const deltaPct = baseClean > 0 ? ((clean - baseClean) / baseClean) * 100 : 0;
        return { bp, ytm: y, clean, deltaPct };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseYtm, baseClean, cashflows, accrued]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Convertisseur prix ⇄ YTM */}
        <Card title="Convertisseur prix ⇄ YTM" subtitle={`au ${formatDate(market.operationDate)}`}>
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
                <Row label="Duration modifiée" value={`${result.mod.toFixed(2).replace(".", ",")} ans`} />
                <Row label="Duration Macaulay" value={`${result.mac.toFixed(2).replace(".", ",")} ans`} />
                <Row label="Convexité" value={result.cvx.toFixed(2).replace(".", ",")} />
                <Row label="BPV / PV01 (par titre)" value={`${(result.mod * result.dirty * 0.0001).toFixed(2).replace(".", ",")} FCFA / pb`} />
              </dl>
            ) : (
              <div className="text-xs text-red-400 border-t border-slate-800 pt-3">
                Valeur invalide ou hors bornes actuarielles.
              </div>
            )}
          </div>
        </Card>

        {/* Stress test de taux */}
        <Card title="Stress test de taux" subtitle="choc parallèle sur le YTM coté">
          {cashflows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Échéancier indisponible.</div>
          ) : (
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
                            isBase
                              ? "text-slate-500"
                              : s.deltaPct > 0
                              ? "text-emerald-400"
                              : "text-red-400"
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
          )}
        </Card>
      </div>
      <p className="text-[10px] text-slate-500 px-1">
        Repricing actuariel ACT/365 par bissection sur l&apos;échéancier réel
        (coupons + amortissements). Le stress test applique un choc parallèle au
        YTM coté courant ; les valeurs sont par titre.
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

// ============================================================================
// UTILITAIRES
// ============================================================================
function formatDateShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

// Fusionne les séries observée et théorique par date (union triée).
function mergePriceSeries(
  observed: Array<{ date: string; cleanPrice: number }>,
  theoretical: Array<{ date: string; theoreticalPrice: number }>
): Array<{ date: string; observed: number | null; theo: number | null }> {
  const map = new Map<string, { observed: number | null; theo: number | null }>();
  for (const t of theoretical) {
    map.set(t.date, { observed: null, theo: t.theoreticalPrice });
  }
  for (const o of observed) {
    const existing = map.get(o.date);
    if (existing) existing.observed = o.cleanPrice;
    else map.set(o.date, { observed: o.cleanPrice, theo: null });
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, observed: v.observed, theo: v.theo }));
}
