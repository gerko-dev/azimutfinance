import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Flag from "@/components/Flag";
import MonthlyChart from "@/components/marche-monetaire/MonthlyChart";
import {
  buildMonthlyPoints,
  filterRecentMonths,
  sovereignBondHref,
} from "@/components/marche-monetaire/mtpStats";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import type { EmissionUMOA } from "@/lib/listedBondsTypes";

export const dynamic = "force-static";

const COUNTRIES: Record<
  string,
  { code: string; label: string; capital: string }
> = {
  ci: { code: "CI", label: "Côte d'Ivoire", capital: "Abidjan / Yamoussoukro" },
  sn: { code: "SN", label: "Sénégal", capital: "Dakar" },
  bj: { code: "BJ", label: "Bénin", capital: "Porto-Novo / Cotonou" },
  tg: { code: "TG", label: "Togo", capital: "Lomé" },
  bf: { code: "BF", label: "Burkina Faso", capital: "Ouagadougou" },
  ml: { code: "ML", label: "Mali", capital: "Bamako" },
  ne: { code: "NE", label: "Niger", capital: "Niamey" },
  gw: { code: "GW", label: "Guinée-Bissau", capital: "Bissau" },
};

const MATURITY_BUCKETS = [
  { label: "≤ 6 mois", min: 0, max: 0.5 },
  { label: "6 mois – 1 an", min: 0.5, max: 1 },
  { label: "1 – 3 ans", min: 1, max: 3 },
  { label: "3 – 5 ans", min: 3, max: 5 },
  { label: "5 – 7 ans", min: 5, max: 7 },
  { label: "7 – 10 ans", min: 7, max: 10 },
  { label: "> 10 ans", min: 10, max: Infinity },
];

export async function generateStaticParams() {
  return Object.keys(COUNTRIES).map((country) => ({ country }));
}

type Params = Promise<{ country: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { country } = await params;
  const meta = COUNTRIES[country];
  if (!meta) return { title: "Pays inconnu — AzimutFinance" };
  return {
    title: `MTP ${meta.label} — AzimutFinance`,
    description: `Récapitulatif des adjudications UMOA-Titres pour ${meta.label} : émissions, montants, rendements, maturités.`,
  };
}

function fmtMillions(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} Mds`;
  return `${m.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} M`;
}
function fmtPct(decimal: number, digits = 2): string {
  return `${(decimal * 100).toFixed(digits)} %`;
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function fmtFullDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function weightedAvgYield(items: EmissionUMOA[]): number {
  const total = items.reduce((s, e) => s + e.amount, 0);
  if (total === 0) return 0;
  return items.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / total;
}

export default async function CountryMTPPage({ params }: { params: Params }) {
  const { country } = await params;
  const meta = COUNTRIES[country];
  if (!meta) notFound();

  const all = loadUmoaEmissions();
  const emissions = all
    .filter((e) => e.country === meta.code)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (emissions.length === 0) notFound();

  // Periode 12 mois glissants
  const latestDate = new Date(emissions[0].date);
  const cutoff = new Date(latestDate);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const recent = emissions.filter((e) => e.date >= cutoffISO);

  // KPIs 12 mois
  const totalCount = recent.length;
  const totalAmount = recent.reduce((s, e) => s + e.amount, 0);
  const totalSubmitted = recent.reduce((s, e) => s + e.amountSubmitted, 0);
  const totalIssued = recent.reduce((s, e) => s + e.amountIssued, 0);
  const coverage = totalIssued > 0 ? totalSubmitted / totalIssued : 0;
  const yieldAll = weightedAvgYield(recent);

  const bat = recent.filter((e) => e.type === "BAT");
  const oat = recent.filter((e) => e.type === "OAT");
  const yieldBat = weightedAvgYield(bat);
  const yieldOat = weightedAvgYield(oat);

  const uniqIsins = new Set(recent.map((e) => e.isin).filter(Boolean)).size;
  const avgMaturity =
    recent.reduce((s, e) => s + e.maturity, 0) / Math.max(recent.length, 1);
  const minMat = recent.length > 0 ? Math.min(...recent.map((e) => e.maturity)) : 0;
  const maxMat = recent.length > 0 ? Math.max(...recent.map((e) => e.maturity)) : 0;

  // Position vs UEMOA
  const allRecentUEMOA = all.filter((e) => e.date >= cutoffISO);
  const totalUEMOAAmount = allRecentUEMOA.reduce((s, e) => s + e.amount, 0);
  const sharePct = totalUEMOAAmount > 0 ? (totalAmount / totalUEMOAAmount) * 100 : 0;

  // Classement par montant
  const byCountryAmount = new Map<string, number>();
  for (const e of allRecentUEMOA) {
    byCountryAmount.set(e.country, (byCountryAmount.get(e.country) ?? 0) + e.amount);
  }
  const ranking = Array.from(byCountryAmount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
  const rank = ranking.indexOf(meta.code) + 1;
  const totalRanked = ranking.length;

  // Repartition par maturite
  const maturityRows = MATURITY_BUCKETS.map((b) => {
    const items = recent.filter((e) => e.maturity > b.min && e.maturity <= b.max);
    return {
      label: b.label,
      count: items.length,
      amount: items.reduce((s, e) => s + e.amount, 0),
      yieldRate: weightedAvgYield(items),
    };
  });
  const maxMatAmount = Math.max(...maturityRows.map((r) => r.amount), 1);

  // Historique annuel (toutes les annees disponibles)
  const yearAcc = new Map<
    string,
    { count: number; amount: number; weightedYieldNum: number }
  >();
  for (const e of emissions) {
    const year = e.date.slice(0, 4);
    const stat = yearAcc.get(year) ?? { count: 0, amount: 0, weightedYieldNum: 0 };
    stat.count += 1;
    stat.amount += e.amount;
    stat.weightedYieldNum += e.weightedAvgYield * e.amount;
    yearAcc.set(year, stat);
  }
  const yearRows = Array.from(yearAcc.entries())
    .map(([year, s]) => ({
      year,
      count: s.count,
      amount: s.amount,
      yieldRate: s.amount > 0 ? s.weightedYieldNum / s.amount : 0,
    }))
    .sort((a, b) => b.year.localeCompare(a.year));
  const maxYearAmount = Math.max(...yearRows.map((r) => r.amount), 1);

  // Serie mensuelle : 24 mois glissants pour avoir une vraie tendance
  const monthlyEmissions = filterRecentMonths(emissions, 24);
  const monthly = buildMonthlyPoints(monthlyEmissions);

  // Top 30 emissions recentes
  const recentSlice = emissions.slice(0, 30);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            <Link href="/" className="hover:underline">
              Accueil
            </Link>{" "}
            ›{" "}
            <Link href="/marche-monetaire" className="hover:underline">
              Marché monétaire
            </Link>{" "}
            ›{" "}
            <Link href="/marche-monetaire/mtp" className="hover:underline">
              Récapitulatif MTP
            </Link>{" "}
            › {meta.label}
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <Flag
                  code={meta.code}
                  size="xl"
                  className="rounded-sm shadow-sm border border-slate-200"
                />
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                    {meta.label}
                  </h1>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Capitale : {meta.capital} · Code émetteur :{" "}
                    <span className="font-mono">{meta.code}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm md:text-base text-slate-600 mt-3 max-w-2xl">
                Activité d&apos;émission sur le Marché des Titres Publics UEMOA
                (UMOA-Titres). Vue agrégée 12 mois et historique pluriannuel.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {Object.entries(COUNTRIES)
                .filter(([code]) => code !== country)
                .map(([code, c]) => (
                  <Link
                    key={code}
                    href={`/marche-monetaire/mtp/${code}`}
                    title={c.label}
                    className="hover:scale-110 transition"
                  >
                    <Flag
                      code={c.code}
                      size="lg"
                      className="rounded-sm shadow-sm border border-slate-200"
                    />
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Resume positionnement */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap items-center gap-4">
          <div className="text-sm text-blue-900">
            <span className="font-semibold">
              {rank}
              <sup>e</sup>
            </span>{" "}
            émetteur sur {totalRanked} en montant levé · Part UEMOA :{" "}
            <span className="font-semibold">{sharePct.toFixed(1)} %</span>
          </div>
          <div className="text-xs text-blue-700">
            Période : {fmtDate(cutoffISO)} → {fmtDate(emissions[0].date)}
          </div>
        </div>

        {/* KPIs principaux */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Indicateurs clés (12 mois glissants)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Émissions" value={String(totalCount)} hint="adjudications" />
            <KPI label="Montant retenu" value={fmtMillions(totalAmount)} hint="FCFA" />
            <KPI
              label="Couverture"
              value={`${(coverage * 100).toFixed(0)} %`}
              hint="soumis / proposé"
            />
            <KPI label="Rdt pondéré" value={fmtPct(yieldAll)} hint="toutes maturités" />
            <KPI
              label="Maturité moy."
              value={`${avgMaturity.toFixed(1)} ans`}
              hint={`min ${minMat.toFixed(1)} · max ${maxMat.toFixed(1)}`}
            />
            <KPI label="ISIN distincts" value={String(uniqIsins)} hint="lignes émises" />
          </div>
        </div>

        {/* Graphique : levees mensuelles + taux ponderes */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-medium text-slate-900">
                Levées mensuelles &amp; taux moyens pondérés
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1.5">
                <Flag code={meta.code} size="sm" className="rounded-sm" />
                {meta.label} · 24 derniers mois · Volumes (Mds FCFA) et
                rendement pondéré (%)
              </p>
            </div>
            <div className="text-xs text-slate-400">
              {monthly.length} mois actifs
            </div>
          </div>
          <MonthlyChart data={monthly} />
        </div>

        {/* Split BAT / OAT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SplitCard
            title="Bons d'Assimilation du Trésor"
            subtitle="BAT · court terme (≤ 2 ans)"
            tone="amber"
            count={bat.length}
            amount={bat.reduce((s, e) => s + e.amount, 0)}
            yieldRate={yieldBat}
            totalAmount={totalAmount}
          />
          <SplitCard
            title="Obligations Assimilables du Trésor"
            subtitle="OAT · moyen / long terme"
            tone="blue"
            count={oat.length}
            amount={oat.reduce((s, e) => s + e.amount, 0)}
            yieldRate={yieldOat}
            totalAmount={totalAmount}
          />
        </div>

        {/* Maturite + Historique annuel cote a cote */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-medium text-slate-900">
                Répartition par maturité (12 mois)
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {maturityRows.map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-700 font-medium">{b.label}</span>
                    <span className="font-mono text-slate-700">
                      {b.count > 0 ? fmtMillions(b.amount) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{
                        width:
                          b.count > 0 ? `${(b.amount / maxMatAmount) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-0.5 text-[10px] text-slate-400">
                    <span>
                      {b.count} émission{b.count > 1 ? "s" : ""}
                    </span>
                    {b.count > 0 && (
                      <span className="font-mono">{fmtPct(b.yieldRate)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-medium text-slate-900">
                Historique annuel
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toutes années disponibles · {emissions.length} émission
                {emissions.length > 1 ? "s" : ""} au total
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-[440px] overflow-y-auto">
              {yearRows.map((y) => (
                <div key={y.year}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-semibold text-slate-900">
                      {y.year}
                    </span>
                    <span className="font-mono text-slate-700">
                      {fmtMillions(y.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${(y.amount / maxYearAmount) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-0.5 text-[10px] text-slate-400">
                    <span>
                      {y.count} émission{y.count > 1 ? "s" : ""}
                    </span>
                    <span className="font-mono">Rdt pond. {fmtPct(y.yieldRate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tableau des emissions recentes */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">
                30 dernières adjudications
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Du plus récent au plus ancien · {emissions.length} émission
                {emissions.length > 1 ? "s" : ""} dans l&apos;historique total
              </p>
            </div>
            <div className="text-xs text-slate-400">Source : UMOA-Titres</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th align="left">Date valeur</Th>
                  <Th align="left">Type</Th>
                  <Th align="left">ISIN</Th>
                  <Th align="left">Échéance</Th>
                  <Th align="right">Maturité</Th>
                  <Th align="right">Coupon</Th>
                  <Th align="right">Mt soumis</Th>
                  <Th align="right">Mt retenu</Th>
                  <Th align="right">Couv.</Th>
                  <Th align="right">Rdt pond.</Th>
                </tr>
              </thead>
              <tbody>
                {recentSlice.map((e, i) => (
                  <tr
                    key={`${e.isin}-${e.date}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {fmtFullDate(e.date)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide ${
                          e.type === "BAT"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {(() => {
                        const href = sovereignBondHref(e);
                        const label = e.isin || (e.type === "BAT" ? "BAT" : "—");
                        if (!href)
                          return <span className="text-slate-500">{label}</span>;
                        return (
                          <Link
                            href={href}
                            className="text-blue-700 hover:underline"
                          >
                            {label}
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {fmtDate(e.maturityDate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                      {e.maturity.toFixed(1)} ans
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {e.couponRate != null ? fmtPct(e.couponRate) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      {fmtMillions(e.amountSubmitted)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-900 font-medium">
                      {fmtMillions(e.amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {e.amountIssued > 0
                        ? `${((e.amountSubmitted / e.amountIssued) * 100).toFixed(0)} %`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {fmtPct(e.weightedAvgYield)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 text-right">
          Données issues d&apos;UMOA-Titres / Agence UMOA-Titres. Montants en
          millions / milliards de FCFA.
        </div>
      </main>
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900 font-mono mt-0.5">
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function Th({
  align,
  children,
}: {
  align: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={`px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function SplitCard({
  title,
  subtitle,
  tone,
  count,
  amount,
  totalAmount,
  yieldRate,
}: {
  title: string;
  subtitle: string;
  tone: "amber" | "blue";
  count: number;
  amount: number;
  totalAmount: number;
  yieldRate: number;
}) {
  const bgTone =
    tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
  const labelTone = tone === "amber" ? "text-amber-800" : "text-blue-800";
  const sharePct = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;

  return (
    <div className={`border rounded-lg p-4 ${bgTone}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className={`text-sm font-semibold ${labelTone}`}>{title}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900">
          {sharePct.toFixed(0)} %
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/50">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Émissions
          </div>
          <div className="text-sm font-mono font-medium text-slate-900">
            {count}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Mt retenu
          </div>
          <div className="text-sm font-mono font-medium text-slate-900">
            {fmtMillions(amount)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Rdt pond.
          </div>
          <div className="text-sm font-mono font-medium text-slate-900">
            {fmtPct(yieldRate)}
          </div>
        </div>
      </div>
    </div>
  );
}
