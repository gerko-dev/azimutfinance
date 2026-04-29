import Link from "next/link";
import Flag from "@/components/Flag";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadAllActions,
  getActionsMarketStats,
  getTopGainers,
  getTopLosers,
  getIndexStats,
  loadUmoaEmissions,
  loadListedBonds,
  type ActionRow,
} from "@/lib/dataLoader";

export const metadata = {
  title: "Tableau de bord — Pro Terminal",
};

const KEY_INDICES = ["BRVMC", "BRVM30", "BRVMPR", "BRVM-SF"];


function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtFCFA(millions: number): string {
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)} Mds`;
  return `${fmtNum(millions, 0)} M`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export default async function ProDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    firstName = profile?.full_name?.split(" ")[0] ?? null;
  }

  const actions = loadAllActions();
  const stats = getActionsMarketStats(actions);
  const gainers = getTopGainers(actions, 5);
  const losers = getTopLosers(actions, 5);
  const topVolume: ActionRow[] = [...actions]
    .filter((a) => a.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  const indices = KEY_INDICES.map((c) => getIndexStats(c)).filter(
    (i): i is NonNullable<typeof i> => i !== null
  );

  const emissions = loadUmoaEmissions();
  const recentEmissions = [...emissions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const listedBonds = loadListedBonds();

  return (
    <div className="space-y-5">
      {/* Salutation */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Bonjour{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Voici la synthèse à la dernière clôture BRVM.
          </p>
        </div>
        <div className="hidden md:flex gap-6 text-xs">
          <KpiInline label="Actions cotées" value={fmtNum(stats.totalActions)} />
          <KpiInline label="Obligations cotées" value={fmtNum(listedBonds.length)} />
          <KpiInline
            label="Capi. totale"
            value={`${fmtNum(stats.totalCapitalization / 1e9, 0)} Mds FCFA`}
          />
        </div>
      </div>

      {/* Bande indices */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {indices.map((idx) => (
          <IndexCard
            key={idx.code}
            name={idx.name}
            value={idx.latestValue}
            change={idx.variationPct}
            date={idx.latestDate}
          />
        ))}
      </div>

      {/* Grille principale 3 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonne 1 : top hausses + top baisses */}
        <div className="space-y-4">
          <Card title="Top hausses du jour" accent="emerald">
            <MoversTable rows={gainers} />
          </Card>
          <Card title="Top baisses du jour" accent="red">
            <MoversTable rows={losers} />
          </Card>
        </div>

        {/* Colonne 2 : top volume + souveraines */}
        <div className="space-y-4">
          <Card title="Plus forts volumes" accent="blue">
            <VolumeTable rows={topVolume} />
          </Card>
          <Card
            title="Émissions souveraines récentes"
            subtitle="UMOA-Titres"
            accent="purple"
          >
            <EmissionsTable rows={recentEmissions} />
          </Card>
        </div>

        {/* Colonne 3 : raccourcis + macro + calendrier */}
        <div className="space-y-4">
          <Card title="Raccourcis">
            <div className="grid grid-cols-2 gap-2 p-3">
              <QuickLink href="/marches/actions" label="Actions BRVM" />
              <QuickLink href="/marches/obligations" label="Obligations" />
              <QuickLink href="/marches/fcp" label="FCP / OPCVM" />
              <QuickLink href="/outils/ytm" label="Simulateur YTM" />
              <QuickLink href="/outils/screener" label="Screener" />
              <QuickLink href="/marche-monetaire" label="Taux BCEAO" />
            </div>
          </Card>

          <Card title="Indicateurs UEMOA">
            <div className="p-3 space-y-2 text-xs">
              <MacroRow label="Taux directeur BCEAO" value="3,50 %" tone="neutral" />
              <MacroRow label="Inflation moyenne" value="2,1 %" tone="neutral" />
              <MacroRow label="EUR / XOF" value="655,96" tone="neutral" />
              <MacroRow label="USD / XOF" value="≈ 605" tone="neutral" />
              <div className="pt-2 text-[10px] text-slate-500 border-t border-slate-700">
                Données de référence — à brancher sur source live.
              </div>
            </div>
          </Card>

          <Card title="À venir cette semaine" subtitle="Calendrier">
            <ul className="p-3 text-xs text-slate-300 space-y-2">
              <li className="flex justify-between">
                <span>Adjudication BCEAO</span>
                <span className="text-slate-500">vendredi</span>
              </li>
              <li className="flex justify-between">
                <span>Coupons attendus</span>
                <span className="text-slate-500">à brancher</span>
              </li>
              <li className="flex justify-between">
                <span>AGE / dividendes</span>
                <span className="text-slate-500">à brancher</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Pied de page */}
      <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-[11px] text-slate-500">
        <div>Données : BRVM, UMOA-Titres, BCEAO. Sources internes mises à jour quotidiennement.</div>
        <div className="hidden md:block">v0.1 · build {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------

function KpiInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-sm font-mono text-slate-200">{value}</div>
    </div>
  );
}

function IndexCard({
  name,
  value,
  change,
  date,
}: {
  name: string;
  value: number;
  change: number;
  date: string;
}) {
  const up = change >= 0;
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-400 truncate">{name}</div>
        <div className="text-[10px] text-slate-500">{fmtDate(date)}</div>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <div className="text-lg font-mono font-semibold text-white">
          {fmtNum(value, 2)}
        </div>
        <div
          className={`text-xs font-mono font-medium ${
            up ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {fmtPct(change)}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "emerald" | "red" | "blue" | "purple";
  children: React.ReactNode;
}) {
  const accentColor: Record<string, string> = {
    emerald: "bg-emerald-400",
    red: "bg-red-400",
    blue: "bg-blue-400",
    purple: "bg-purple-400",
  };
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center gap-2">
        {accent && (
          <span className={`w-1 h-3.5 rounded-full ${accentColor[accent]}`} />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-slate-500">· {subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function MoversTable({ rows }: { rows: ActionRow[] }) {
  if (rows.length === 0) {
    return <div className="p-3 text-xs text-slate-500">Aucun mouvement.</div>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => {
          const up = r.changePercent >= 0;
          return (
            <tr key={r.code} className="border-b border-slate-800 last:border-0">
              <td className="px-3 py-1.5">
                <Link
                  href={`/titre/${r.code}`}
                  className="font-mono text-slate-200 hover:text-blue-300"
                >
                  {r.code}
                </Link>
                <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                  {r.name}
                </div>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-300">
                {fmtNum(r.price, 0)}
              </td>
              <td
                className={`px-3 py-1.5 text-right font-mono font-medium ${
                  up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {fmtPct(r.changePercent)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VolumeTable({ rows }: { rows: ActionRow[] }) {
  if (rows.length === 0) {
    return <div className="p-3 text-xs text-slate-500">Aucun volume.</div>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className="border-b border-slate-800 last:border-0">
            <td className="px-3 py-1.5">
              <Link
                href={`/titre/${r.code}`}
                className="font-mono text-slate-200 hover:text-blue-300"
              >
                {r.code}
              </Link>
              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                {r.name}
              </div>
            </td>
            <td className="px-3 py-1.5 text-right font-mono text-slate-300">
              {fmtNum(r.volume)}
            </td>
            <td
              className={`px-3 py-1.5 text-right font-mono ${
                r.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fmtPct(r.changePercent)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Emission = ReturnType<typeof loadUmoaEmissions>[number];

function EmissionsTable({ rows }: { rows: Emission[] }) {
  if (rows.length === 0) {
    return <div className="p-3 text-xs text-slate-500">Aucune émission récente.</div>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r, idx) => (
          <tr key={`${r.isin}-${idx}`} className="border-b border-slate-800 last:border-0">
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Flag
                  code={r.country}
                  size="sm"
                  className="rounded-sm border border-slate-700"
                />
                <span className="font-mono text-slate-200 text-[11px]">
                  {r.type} · {r.maturity.toFixed(1)} ans
                </span>
              </div>
              <div className="text-[10px] text-slate-500">{fmtDate(r.date)}</div>
            </td>
            <td className="px-3 py-1.5 text-right font-mono text-slate-300">
              {fmtFCFA(r.amount)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono text-purple-300">
              {(r.weightedAvgYield * 100).toFixed(2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center px-2 py-2 text-xs text-slate-300 bg-slate-700/40 hover:bg-slate-700 hover:text-white rounded border border-slate-700 transition"
    >
      {label}
    </Link>
  );
}

function MacroRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "neutral";
}) {
  const colorClass: Record<string, string> = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-slate-200",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${colorClass[tone]}`}>{value}</span>
    </div>
  );
}
