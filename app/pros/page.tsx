import Link from "next/link";
import Flag from "@/components/Flag";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadAllActionsEnriched,
  getActionsMarketStats,
  getTopGainers,
  getTopLosers,
  getIndexStats,
  loadUmoaEmissions,
  loadUmoaEmissionsAVenir,
  loadListedBonds,
  loadListedBondEvents,
  type ActionRow,
} from "@/lib/dataLoader";
import { getBrvmIndicesSnapshot } from "@/lib/brvm/liveIndices";
import {
  preloadTauxData,
  getLatest,
  getDelta,
} from "@/lib/tauxLoader";
import { computeFxStats } from "@/lib/fx";
import { pageMetadata } from "@/lib/seo";
import { bondHref } from "@/lib/listedBondsTypes";

export const metadata = pageMetadata({
  title: "Tableau de bord — Pro Terminal",
  path: "/pros",
});

// Indices mis en avant : Composite (general), BRVM 30 (large caps), Prestige
// (compartiment principal), Services Financiers (driver de la cote). Codes
// internes alignes sur lib/brvm/liveIndices.normalizeIndexCode.
const KEY_INDICES = ["BRVMC", "BRVM30", "BRVMPR", "BRVM-SF"];

const KEY_INDEX_NAMES: Record<string, string> = {
  BRVMC: "BRVM Composite",
  BRVM30: "BRVM 30",
  BRVMPR: "BRVM Prestige",
  "BRVM-SF": "BRVM Services Financiers",
};


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

/**
 * Formate un taux en % avec 2 decimales et virgule francaise.
 * Convertit automatiquement les valeurs en decimal (0.035) vers 3,50 %.
 * La convention varie selon les seriesBCEAO (parfois %, parfois decimal) :
 * on detecte via la magnitude — au-dessus de 1, on suppose deja en %.
 */
function fmtRate(value: number): string {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(2).replace(".", ",")} %`;
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

  // Cours actions live BRVM (scrape ~5 min) avec fallback historique Sika —
  // meme source que la home /, /marches/actions etc.
  const actions = await loadAllActionsEnriched();
  const stats = getActionsMarketStats(actions);
  const gainers = getTopGainers(actions, 5);
  const losers = getTopLosers(actions, 5);
  const topVolume: ActionRow[] = [...actions]
    .filter((a) => a.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  // Indices : on prefere le snapshot live (meme source que la home et
  // /marches/indices) ; fallback sur l'historique CSV si le scrape echoue
  // (ex. pendant le week-end, BRVM down).
  const indicesSnapshot = await getBrvmIndicesSnapshot();
  const liveIndexByCode = new Map(
    indicesSnapshot.indices.map((i) => [i.code, i]),
  );
  const indices = KEY_INDICES.map((code) => {
    const live = liveIndexByCode.get(code);
    if (live) {
      return {
        code,
        name: KEY_INDEX_NAMES[code] || live.name || code,
        latestValue: live.value,
        // sessionLabel = libelle texte BRVM ("Lundi, 4 mai, 2026 - 14:22").
        // Pas ISO -> on l'affiche tel quel, fmtDate ne le mangle pas (cf. dateDisplay).
        dateDisplay: indicesSnapshot.sessionLabel || "",
        variationPct: live.variationPct,
      };
    }
    const fallback = getIndexStats(code);
    if (!fallback) return null;
    return {
      code: fallback.code,
      name: KEY_INDEX_NAMES[code] || fallback.name,
      latestValue: fallback.latestValue,
      dateDisplay: fmtDate(fallback.latestDate),
      variationPct: fallback.variationPct,
    };
  }).filter((i): i is NonNullable<typeof i> => i !== null);

  const emissions = loadUmoaEmissions();
  const recentEmissions = [...emissions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const listedBonds = loadListedBonds();

  // ─── Indicateurs UEMOA (memes sources que /marche-monetaire) ──────────
  // tauxLoader = parsing du PDF Bulletin BCEAO (le PDF est rebatch via mtime
  // donc preloadTauxData est idempotent et tres rapide en steady state).
  await preloadTauxData();
  const pension = getLatest("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
  const pensionDelta = getDelta("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
  const inflation = getLatest("4_Inflation_pays_UEMOA", "IPC glissement annuel", "UEMOA");
  const inflationDelta = getDelta("4_Inflation_pays_UEMOA", "IPC glissement annuel", "UEMOA");
  const eurFcfa = getLatest("7_Change_EUR", "EUR/FCFA", "EUR/FCFA");
  // USD/XOF n'est pas dans le PDF BCEAO -> on prend le scrape Investing
  // (meme source que /macro/devises et la home).
  const usdXofStats = computeFxStats("USD_XOF");

  // ─── Calendrier (memes sources que /marches/obligations/calendrier) ──
  const todayISO = new Date().toISOString().slice(0, 10);
  const upcomingAuctions = loadUmoaEmissionsAVenir()
    .filter((e) => e.dateOperation && e.dateOperation >= todayISO)
    .sort((a, b) => a.dateOperation.localeCompare(b.dateOperation))
    .slice(0, 3);
  const isinToBond = new Map(listedBonds.map((b) => [b.isin, b]));
  const upcomingBondEvents = loadListedBondEvents()
    .filter((e) => e.date >= todayISO && (e.eventType === "coupon" || e.eventType === "amortissement" || e.eventType === "remboursement"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

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
            date={idx.dateDisplay}
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
              <QuickLink href="/pros/actions" label="Actions BRVM" />
              <QuickLink href="/marches/obligations" label="Obligations" />
              <QuickLink href="/marches/fcp" label="FCP / OPCVM" />
              <QuickLink href="/pros/ytm" label="Simulateur YTM" />
              <QuickLink href="/pros/screener" label="Screener" />
              <QuickLink href="/marche-monetaire" label="Taux BCEAO" />
            </div>
          </Card>

          <Card title="Indicateurs UEMOA">
            <div className="p-3 space-y-2 text-xs">
              <MacroRow
                label="Taux pension BCEAO"
                value={pension ? fmtRate(pension.value) : "—"}
                hint={pension?.label}
                tone={
                  pensionDelta && pensionDelta.delta > 0
                    ? "up"
                    : pensionDelta && pensionDelta.delta < 0
                      ? "down"
                      : "neutral"
                }
              />
              <MacroRow
                label="Inflation UEMOA (YoY)"
                value={inflation ? fmtRate(inflation.value) : "—"}
                hint={inflation?.label}
                tone={
                  inflationDelta && inflationDelta.delta > 0
                    ? "up"
                    : inflationDelta && inflationDelta.delta < 0
                      ? "down"
                      : "neutral"
                }
              />
              <MacroRow
                label="EUR / FCFA"
                value={eurFcfa ? fmtNum(eurFcfa.value, 4) : "—"}
                hint="Parité fixe"
                tone="neutral"
              />
              <MacroRow
                label="USD / XOF"
                value={usdXofStats ? fmtNum(usdXofStats.last, 2) : "—"}
                hint={usdXofStats?.lastDate}
                tone={
                  usdXofStats?.changeDayPct == null
                    ? "neutral"
                    : usdXofStats.changeDayPct > 0
                      ? "up"
                      : usdXofStats.changeDayPct < 0
                        ? "down"
                        : "neutral"
                }
              />
              <div className="pt-2 text-[10px] text-slate-500 border-t border-slate-700">
                Sources : BCEAO (Bulletin officiel), Investing (FX).
              </div>
            </div>
          </Card>

          <Card title="À venir" subtitle="Calendrier">
            <div className="p-3 space-y-3 text-xs">
              {upcomingAuctions.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Adjudications UMOA-Titres
                  </div>
                  <ul className="space-y-1">
                    {upcomingAuctions.map((e, idx) => (
                      <li key={`${e.country}-${e.dateOperation}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Flag code={e.country} size="sm" className="rounded-sm border border-slate-700" />
                          <span className="truncate text-slate-300">
                            {e.instrument || "OAT"} · {e.countryName}
                          </span>
                        </span>
                        <span className="text-slate-500 font-mono shrink-0">{fmtDate(e.dateOperation)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {upcomingBondEvents.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Coupons / amortissements
                  </div>
                  <ul className="space-y-1">
                    {upcomingBondEvents.map((e, idx) => {
                      const bond = isinToBond.get(e.isin);
                      return (
                        <li key={`${e.isin}-${e.date}-${idx}`} className="flex items-center justify-between gap-2">
                          <Link
                            href={bondHref(bond ?? { isin: e.isin })}
                            className="truncate text-slate-300 hover:text-blue-300 min-w-0"
                          >
                            {bond?.name || e.isin}
                          </Link>
                          <span className="text-slate-500 font-mono shrink-0">{fmtDate(e.date)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {upcomingAuctions.length === 0 && upcomingBondEvents.length === 0 && (
                <div className="text-slate-500">Aucun événement à venir.</div>
              )}
            </div>
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
  /** Texte deja formate (sessionLabel live BRVM ou date ISO -> JJ/MM/AA). */
  date: string;
}) {
  const up = change >= 0;
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-400 truncate">{name}</div>
        <div className="text-[10px] text-slate-500 truncate max-w-[55%]" title={date}>
          {date}
        </div>
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
                  href={`/pros/titre/${r.code}`}
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
                href={`/pros/titre/${r.code}`}
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
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "up" | "down" | "neutral";
}) {
  const colorClass: Record<string, string> = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-slate-200",
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 min-w-0 truncate">{label}</span>
      <span className="text-right shrink-0">
        <span className={`font-mono ${colorClass[tone]}`}>{value}</span>
        {hint && (
          <span className="block text-[9px] text-slate-500 font-mono">{hint}</span>
        )}
      </span>
    </div>
  );
}
