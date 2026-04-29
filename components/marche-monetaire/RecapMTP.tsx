import Link from "next/link";
import type { EmissionUMOA } from "@/lib/listedBondsTypes";
import Flag from "@/components/Flag";
import MonthlyChart from "./MonthlyChart";
import { buildMonthlyPoints, sovereignBondHref } from "./mtpStats";

type Props = {
  emissions: EmissionUMOA[];
};

const COUNTRY_LABEL: Record<string, { label: string }> = {
  CI: { label: "Côte d'Ivoire" },
  SN: { label: "Sénégal" },
  BJ: { label: "Bénin" },
  TG: { label: "Togo" },
  BF: { label: "Burkina Faso" },
  ML: { label: "Mali" },
  NE: { label: "Niger" },
  GW: { label: "Guinée-Bissau" },
};

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

const MATURITY_BUCKETS = [
  { label: "≤ 6 mois", min: 0, max: 0.5 },
  { label: "6 mois – 1 an", min: 0.5, max: 1 },
  { label: "1 – 3 ans", min: 1, max: 3 },
  { label: "3 – 5 ans", min: 3, max: 5 },
  { label: "5 – 7 ans", min: 5, max: 7 },
  { label: "7 – 10 ans", min: 7, max: 10 },
  { label: "> 10 ans", min: 10, max: Infinity },
];

export default function RecapMTP({ emissions }: Props) {
  if (emissions.length === 0) return null;

  // Tri desc par date pour reutilisation
  const sorted = [...emissions].sort((a, b) => b.date.localeCompare(a.date));

  // Filtre 12 mois glissants depuis l'emission la plus recente
  const latestDate = new Date(sorted[0].date);
  const cutoff = new Date(latestDate);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const recent = sorted.filter((e) => e.date >= cutoffISO);

  // ---- KPIs ----
  const totalCount = recent.length;
  const totalAmount = recent.reduce((s, e) => s + e.amount, 0);
  const totalSubmitted = recent.reduce((s, e) => s + e.amountSubmitted, 0);
  const totalIssued = recent.reduce((s, e) => s + e.amountIssued, 0);
  const coverageRatio = totalIssued > 0 ? totalSubmitted / totalIssued : 0;

  const bat = recent.filter((e) => e.type === "BAT");
  const oat = recent.filter((e) => e.type === "OAT");
  const batAmount = bat.reduce((s, e) => s + e.amount, 0);
  const oatAmount = oat.reduce((s, e) => s + e.amount, 0);

  const weightedYield =
    totalAmount > 0
      ? recent.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / totalAmount
      : 0;
  const batYield =
    batAmount > 0
      ? bat.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / batAmount
      : 0;
  const oatYield =
    oatAmount > 0
      ? oat.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / oatAmount
      : 0;

  // ---- Vue par pays ----
  const countryAcc = new Map<
    string,
    { count: number; amount: number; submitted: number; issued: number; weightedYieldNum: number }
  >();
  for (const e of recent) {
    const stat = countryAcc.get(e.country) ?? {
      count: 0,
      amount: 0,
      submitted: 0,
      issued: 0,
      weightedYieldNum: 0,
    };
    stat.count += 1;
    stat.amount += e.amount;
    stat.submitted += e.amountSubmitted;
    stat.issued += e.amountIssued;
    stat.weightedYieldNum += e.weightedAvgYield * e.amount;
    countryAcc.set(e.country, stat);
  }
  const countryRows = Array.from(countryAcc.entries())
    .map(([code, s]) => ({
      code,
      label: COUNTRY_LABEL[code]?.label ?? code,
      count: s.count,
      amount: s.amount,
      coverage: s.issued > 0 ? s.submitted / s.issued : 0,
      yieldRate: s.amount > 0 ? s.weightedYieldNum / s.amount : 0,
      sharePct: totalAmount > 0 ? (s.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ---- Distribution par maturite ----
  const maturityRows = MATURITY_BUCKETS.map((b) => {
    const items = recent.filter((e) => e.maturity > b.min && e.maturity <= b.max);
    const amount = items.reduce((s, e) => s + e.amount, 0);
    const yieldRate =
      amount > 0
        ? items.reduce((s, e) => s + e.weightedAvgYield * e.amount, 0) / amount
        : 0;
    return { label: b.label, count: items.length, amount, yieldRate };
  });
  const maxMatAmount = Math.max(...maturityRows.map((r) => r.amount), 1);

  // ---- Serie mensuelle pour le graphique ----
  const monthly = buildMonthlyPoints(recent);

  // ---- 15 dernieres adjudications ----
  const lastAuctions = sorted.slice(0, 15);

  // ---- Periode affichee ----
  const firstISO = recent[recent.length - 1]?.date ?? "";
  const lastISO = recent[0]?.date ?? "";

  return (
    <section id="recap-mtp" className="scroll-mt-20">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-slate-500">
          Période analysée :{" "}
          <span className="font-mono text-slate-700">
            {fmtDate(firstISO)} → {fmtDate(lastISO)}
          </span>{" "}
          · {totalCount} adjudication{totalCount > 1 ? "s" : ""}
        </div>
        <div className="text-xs text-slate-400">Source : UMOA-Titres</div>
      </div>

      {/* Tuiles pays : navigation rapide vers la fiche detaillee */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Sélectionner un émetteur
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {countryRows.map((r) => (
            <Link
              key={r.code}
              href={`/marche-monetaire/mtp/${r.code.toLowerCase()}`}
              className="group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-lg p-3 text-center transition"
            >
              <div className="flex justify-center mb-1.5">
                <Flag
                  code={r.code}
                  size="xl"
                  className="rounded-sm shadow-sm border border-slate-200"
                  title={r.label}
                />
              </div>
              <div className="text-xs font-medium text-slate-900 group-hover:text-blue-700 truncate">
                {r.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {fmtMillions(r.amount)} · {r.count} ém.
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
        Indicateurs clés
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPI
          label="Émissions"
          value={totalCount.toLocaleString("fr-FR")}
          hint="12 derniers mois"
        />
        <KPI label="Montant retenu" value={fmtMillions(totalAmount)} hint="FCFA" />
        <KPI
          label="Taux de couverture"
          value={`${(coverageRatio * 100).toFixed(0)} %`}
          hint="soumis / proposé"
        />
        <KPI
          label="Rdt moyen pondéré"
          value={fmtPct(weightedYield)}
          hint="toutes maturités"
        />
        <KPI
          label="Rdt moyen BAT"
          value={fmtPct(batYield)}
          hint={`${bat.length} émission${bat.length > 1 ? "s" : ""}`}
        />
        <KPI
          label="Rdt moyen OAT"
          value={fmtPct(oatYield)}
          hint={`${oat.length} émission${oat.length > 1 ? "s" : ""}`}
        />
      </div>

      {/* Graphique : levees mensuelles + taux moyens ponderes */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-medium text-slate-900">
              Levées mensuelles &amp; taux moyens pondérés
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Volumes en milliards FCFA (barres) · Taux pondéré par les
              montants retenus (ligne)
            </p>
          </div>
          <div className="text-xs text-slate-400">
            {monthly.length} mois consécutif{monthly.length > 1 ? "s" : ""}
          </div>
        </div>
        <MonthlyChart data={monthly} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Tableau par pays */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-900">
              Activité par émetteur souverain
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Trié par montant total levé · {countryRows.length} pays actifs
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th align="left">Pays</Th>
                  <Th align="right">Nb</Th>
                  <Th align="right">Mt retenu</Th>
                  <Th align="right">Part</Th>
                  <Th align="right">Couv.</Th>
                  <Th align="right">Rdt pond.</Th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((r) => (
                  <tr
                    key={r.code}
                    className="border-t border-slate-100 hover:bg-slate-50 transition"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/marche-monetaire/mtp/${r.code.toLowerCase()}`}
                        className="inline-flex items-center gap-2 text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        <Flag
                          code={r.code}
                          size="md"
                          className="rounded-sm border border-slate-200"
                        />
                        <span>{r.label}</span>
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-slate-400"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {r.count}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-900 font-medium">
                      {fmtMillions(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      {r.sharePct.toFixed(1)} %
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {(r.coverage * 100).toFixed(0)} %
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {fmtPct(r.yieldRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                  <td className="px-3 py-2 text-slate-900">Total UEMOA</td>
                  <td className="px-3 py-2 text-right font-mono">{totalCount}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMillions(totalAmount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">100,0 %</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(coverageRatio * 100).toFixed(0)} %
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtPct(weightedYield)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Distribution par maturite */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-900">
              Répartition par maturité
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Montants retenus, pondérés
            </p>
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
                      width: b.count > 0 ? `${(b.amount / maxMatAmount) * 100}%` : "0%",
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
      </div>

      {/* Repartition BAT vs OAT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <SegmentCard
          title="Bons d'Assimilation du Trésor"
          subtitle="BAT · court terme (≤ 2 ans)"
          tone="amber"
          count={bat.length}
          amount={batAmount}
          totalAmount={totalAmount}
          yieldRate={batYield}
        />
        <SegmentCard
          title="Obligations Assimilables du Trésor"
          subtitle="OAT · moyen / long terme"
          tone="blue"
          count={oat.length}
          amount={oatAmount}
          totalAmount={totalAmount}
          yieldRate={oatYield}
        />
      </div>

      {/* 15 dernieres adjudications */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-900">
              15 dernières adjudications
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Du plus récent au plus ancien</p>
          </div>
          <div className="text-xs text-slate-400">Source : UMOA-Titres</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th align="left">Date</Th>
                <Th align="left">Pays</Th>
                <Th align="left">Type</Th>
                <Th align="left">ISIN</Th>
                <Th align="right">Maturité</Th>
                <Th align="right">Mt retenu</Th>
                <Th align="right">Couv.</Th>
                <Th align="right">Rdt pond.</Th>
              </tr>
            </thead>
            <tbody>
              {lastAuctions.map((e, i) => (
                <tr
                  key={`${e.isin}-${e.date}-${i}`}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                    {fmtDate(e.date)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Flag
                        code={e.country}
                        size="sm"
                        className="rounded-sm border border-slate-200"
                      />
                      <span className="text-xs text-slate-700">
                        {e.country.toUpperCase()}
                      </span>
                    </span>
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
                      if (!href) return <span className="text-slate-500">{label}</span>;
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
                  <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                    {e.maturity.toFixed(1)} ans
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-900">
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

      <p className="mt-3 text-[11px] text-slate-400 text-right">
        Données mises à jour à partir de UMOA-Titres / Agence UMOA-Titres.
        Les montants sont en millions / milliards de FCFA.
      </p>
    </section>
  );
}

// ----------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------

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

function SegmentCard({
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
  const bgTone = tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
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
          <div className="text-sm font-mono font-medium text-slate-900">{count}</div>
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
