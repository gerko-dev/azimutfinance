import { UEMOA_COUNTRY_LABELS, type BrokerageStats, type UemoaCountryCode } from "@/lib/comptetitre/types";
import { fmtNumber } from "./format";

export default function BrokerageStatsCards({ stats }: { stats: BrokerageStats }) {
  const countryEntries = Object.entries(stats.accountsByCountry).sort(
    (a, b) => b[1] - a[1],
  );
  const brokerEntries = Object.entries(stats.accountsByBroker).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Comptes" value={fmtNumber(stats.totalAccounts)} />
        <KPI label="Utilisateurs" value={fmtNumber(stats.totalUsers)} />
        <KPI label="Transactions" value={fmtNumber(stats.totalTransactions)} />
        <KPI label="Positions ouvertes" value={fmtNumber(stats.totalOpenPositions)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DistributionCard
          title="Comptes par pays SGI"
          entries={countryEntries}
          formatKey={(k) =>
            k === "inconnu"
              ? "—"
              : (UEMOA_COUNTRY_LABELS[k as UemoaCountryCode] ?? k.toUpperCase())
          }
        />
        <DistributionCard
          title="Top SGI"
          entries={brokerEntries}
          formatKey={(k) => (k === "inconnu" ? "—" : k)}
          limit={10}
        />
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1 text-slate-900">
        {value}
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  entries,
  formatKey,
  limit,
}: {
  title: string;
  entries: [string, number][];
  formatKey: (k: string) => string;
  limit?: number;
}) {
  const items = limit ? entries.slice(0, limit) : entries;
  const max = items.reduce((m, [, v]) => Math.max(m, v), 0);
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
          {title}
        </div>
        <div className="text-xs text-slate-400 text-center py-3">
          Aucune donnée pour le moment.
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map(([k, v]) => (
          <li key={k} className="text-xs">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-slate-700 truncate pr-2">{formatKey(k)}</span>
              <span className="tabular-nums text-slate-900 font-semibold">
                {fmtNumber(v)}
              </span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-700"
                style={{ width: max > 0 ? `${(v / max) * 100}%` : 0 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
