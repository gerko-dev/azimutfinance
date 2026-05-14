import { redirect } from "next/navigation";
import PerformanceChart from "@/components/academie/simulateur/PerformanceChart";
import SimulatorShell from "@/components/academie/simulateur/SimulatorShell";
import { computePerformanceAttribution } from "@/lib/simulator/performance";
import { computeRiskMetrics } from "@/lib/simulator/risk";
import { getEquityCurve, getTransactions } from "@/lib/simulator/queries";
import { loadShellContext } from "@/lib/simulator/shellContext";
import { fmtFCFAPlain as fmtFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance — Ligue Azimut" };

const fmtPct = (v: number, dec = 2) =>
  `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;

export default async function Page() {
  const result = await loadShellContext();
  if (!result.ok) redirect("/academie/simulateur");
  const { ctx } = result;

  const transactions = await getTransactions(ctx.snapshot.portfolio.id);
  const perf = computePerformanceAttribution(
    transactions,
    ctx.snapshot.positions,
    ctx.snapshot.totalValue,
  );
  const equityCurve = await getEquityCurve(
    ctx.snapshot.portfolio,
    ctx.snapshot.initialCapital,
    transactions,
  );
  const risk = computeRiskMetrics(equityCurve, transactions);

  const totalReturnPct =
    ctx.snapshot.initialCapital > 0
      ? ((ctx.snapshot.totalValue - ctx.snapshot.initialCapital) /
          ctx.snapshot.initialCapital) *
        100
      : 0;

  return (
    <SimulatorShell
      season={ctx.season}
      cash={ctx.snapshot.cash}
      marketValue={ctx.snapshot.marketValue}
      totalValue={ctx.snapshot.totalValue}
      initialCapital={ctx.snapshot.initialCapital}
      myRank={ctx.myRank}
      totalPlayers={ctx.totalPlayers}
      openOrdersCount={ctx.openOrdersCount}
      realizedPL={ctx.snapshot.realizedPL}
      unrealizedPL={ctx.snapshot.unrealizedPL}
    >
      <div className="p-4 md:p-6 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Performance
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Attribution par titre
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Décomposition du P&amp;L par valeur · réalisé sur ventes + latent sur positions ouvertes.
          </p>
        </div>

        {/* KPIs grands */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigKpi
            label="P&L total"
            value={`${perf.totalPL >= 0 ? "+" : ""}${fmtFCFA(perf.totalPL)} FCFA`}
            subValue={fmtPct(totalReturnPct)}
            accent={perf.totalPL >= 0 ? "emerald" : "rose"}
          />
          <BigKpi
            label="Réalisé"
            value={`${perf.totalRealizedPL >= 0 ? "+" : ""}${fmtFCFA(perf.totalRealizedPL)}`}
            subValue={`${perf.attributions.reduce((s, a) => s + a.sells, 0)} ventes`}
          />
          <BigKpi
            label="Latent"
            value={`${perf.totalUnrealizedPL >= 0 ? "+" : ""}${fmtFCFA(perf.totalUnrealizedPL)}`}
            subValue={`${ctx.snapshot.positions.length} positions ouvertes`}
          />
          <BigKpi
            label="Frais payés"
            value={`-${fmtFCFA(perf.totalFees)} FCFA`}
            subValue={`Turnover ${fmtFCFA(perf.totalTurnover)}`}
            accent="slate"
          />
        </div>

        {/* Risque & ratios */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-900">Risque &amp; ratios</h3>
            <span className="text-[10px] text-slate-500">
              {risk.weeksTracked} semaine{risk.weeksTracked > 1 ? "s" : ""} suivie{risk.weeksTracked > 1 ? "s" : ""} · {risk.sellCount} vente{risk.sellCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
            <RiskKpi
              label="Volatilité annualisée"
              value={`${risk.annualVolPct.toFixed(1).replace(".", ",")} %`}
              hint={`${risk.weeklyVolPct.toFixed(2).replace(".", ",")} % / semaine`}
            />
            <RiskKpi
              label="Max drawdown"
              value={`${risk.maxDrawdownPct.toFixed(2).replace(".", ",")} %`}
              hint={`${fmtFCFA(Math.round(risk.maxDrawdownAbs))} FCFA`}
              accent={risk.maxDrawdownPct < -5 ? "rose" : "slate"}
            />
            <RiskKpi
              label="Sharpe (rf=0)"
              value={risk.sharpe.toFixed(2).replace(".", ",")}
              hint={
                risk.sharpe >= 1
                  ? "Très bon"
                  : risk.sharpe >= 0.5
                  ? "Correct"
                  : risk.sharpe >= 0
                  ? "Faible"
                  : "Négatif"
              }
              accent={risk.sharpe > 0 ? "emerald" : "rose"}
            />
            <RiskKpi
              label="Hit rate"
              value={`${risk.hitRatePct.toFixed(0)} %`}
              hint={`${Math.round((risk.hitRatePct / 100) * risk.sellCount)} gagnant${risk.sellCount > 1 ? "s" : ""} / ${risk.sellCount}`}
              accent={risk.hitRatePct >= 50 ? "emerald" : "rose"}
            />
            <RiskKpi
              label="Meilleure semaine"
              value={fmtPct(risk.bestWeekPct)}
              accent="emerald"
            />
            <RiskKpi
              label="Pire semaine"
              value={fmtPct(risk.worstWeekPct)}
              accent="rose"
            />
            <RiskKpi
              label="Gain moyen"
              value={`+${fmtFCFA(Math.round(risk.avgWinAbs))}`}
              hint="par vente gagnante"
              accent="emerald"
            />
            <RiskKpi
              label="Perte moyenne"
              value={fmtFCFA(Math.round(risk.avgLossAbs))}
              hint={
                risk.winLossRatio > 0
                  ? `Ratio gain/perte ${risk.winLossRatio.toFixed(2).replace(".", ",")}`
                  : "par vente perdante"
              }
              accent="rose"
            />
          </div>
        </section>

        {/* Bar chart attribution */}
        <PerformanceChart attributions={perf.attributions} />

        {/* Winners / Losers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WinLossCard
            title="Top contributeurs"
            entries={perf.winners}
            tone="emerald"
            emptyMsg="Pas encore de gain réalisé."
          />
          <WinLossCard
            title="Pires contributeurs"
            entries={perf.losers}
            tone="rose"
            emptyMsg="Aucune perte enregistrée — bien joué."
          />
        </div>

        {/* Tableau complet */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">
              Détail par titre ({perf.attributions.length} titre{perf.attributions.length > 1 ? "s" : ""})
            </h3>
          </div>
          {perf.attributions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aucune transaction enregistrée pour cette saison.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-500 bg-slate-50/50">
                    <th className="text-left font-semibold px-3 py-2">Code</th>
                    <th className="text-right font-semibold px-3 py-2">Units</th>
                    <th className="text-right font-semibold px-3 py-2">PRU</th>
                    <th className="text-right font-semibold px-3 py-2">Cours</th>
                    <th className="text-right font-semibold px-3 py-2">Valorisation</th>
                    <th className="text-right font-semibold px-3 py-2">Réalisé</th>
                    <th className="text-right font-semibold px-3 py-2">Latent</th>
                    <th className="text-right font-semibold px-3 py-2">Total P&amp;L</th>
                    <th className="text-right font-semibold px-3 py-2">Contrib.</th>
                    <th className="text-right font-semibold px-3 py-2">Poids</th>
                    <th className="text-right font-semibold px-3 py-2">Frais</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.attributions.map((a) => (
                    <tr
                      key={a.code}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-900">
                        {a.code}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {a.units.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {a.avgCost > 0 ? Math.round(a.avgCost).toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {a.currentPrice > 0
                          ? Math.round(a.currentPrice).toLocaleString("fr-FR")
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtFCFA(a.marketValue)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                          a.realizedPL >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {a.realizedPL >= 0 ? "+" : ""}
                        {fmtFCFA(Math.round(a.realizedPL))}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                          a.unrealizedPL >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {a.unrealizedPL >= 0 ? "+" : ""}
                        {fmtFCFA(Math.round(a.unrealizedPL))}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                          a.totalPL >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {a.totalPL >= 0 ? "+" : ""}
                        {fmtFCFA(Math.round(a.totalPL))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {fmtPct(a.contributionPct, 1)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {a.weightPct.toFixed(1).replace(".", ",")} %
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                        -{fmtFCFA(a.feesPaid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
          <strong>Méthodologie :</strong> P&amp;L réalisé calculé en rejouant les
          transactions en ordre chronologique avec un PRU FIFO simplifié (réduction
          proportionnelle du PRU sur chaque vente). P&amp;L latent =
          (cours_actuel − PRU) × unités courantes. Contribution = part du P&amp;L
          total signé représentée par ce titre. Frais payés inclus à part dans
          le calcul du réalisé sur chaque vente.
        </div>
      </div>
    </SimulatorShell>
  );
}

function BigKpi({
  label,
  value,
  subValue,
  accent = "slate",
}: {
  label: string;
  value: string;
  subValue?: string;
  accent?: "emerald" | "rose" | "slate";
}) {
  const bg =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-200"
      : accent === "rose"
      ? "bg-rose-50 border-rose-200"
      : "bg-white border-slate-200";
  const txt =
    accent === "emerald"
      ? "text-emerald-900"
      : accent === "rose"
      ? "text-rose-900"
      : "text-slate-900";
  return (
    <div className={`rounded-lg p-3 border ${bg}`}>
      <div className="text-[10px] uppercase font-semibold text-slate-600">
        {label}
      </div>
      <div className={`text-lg md:text-xl font-bold tabular-nums mt-0.5 ${txt}`}>
        {value}
      </div>
      {subValue && <div className="text-[10px] text-slate-500 mt-0.5">{subValue}</div>}
    </div>
  );
}

function RiskKpi({
  label,
  value,
  hint,
  accent = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "rose" | "slate";
}) {
  const txt =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "rose"
      ? "text-rose-700"
      : "text-slate-900";
  return (
    <div className="bg-white p-3">
      <div className="text-[10px] uppercase font-semibold text-slate-500">
        {label}
      </div>
      <div className={`text-base md:text-lg font-bold tabular-nums mt-0.5 ${txt}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function WinLossCard({
  title,
  entries,
  tone,
  emptyMsg,
}: {
  title: string;
  entries: ReturnType<typeof computePerformanceAttribution>["winners"];
  tone: "emerald" | "rose";
  emptyMsg: string;
}) {
  const accent =
    tone === "emerald"
      ? "text-emerald-700 bg-emerald-50/40 border-emerald-200"
      : "text-rose-700 bg-rose-50/40 border-rose-200";
  return (
    <div className={`rounded-lg border ${accent} overflow-hidden`}>
      <div className="px-4 py-2 border-b border-current/20">
        <h4 className="text-sm font-bold">{title}</h4>
      </div>
      {entries.length === 0 ? (
        <div className="p-4 text-xs text-slate-500">{emptyMsg}</div>
      ) : (
        <ul className="divide-y divide-current/10">
          {entries.map((e) => (
            <li
              key={e.code}
              className="px-4 py-2 flex items-center justify-between text-sm"
            >
              <div>
                <div className="font-mono font-semibold text-slate-900">{e.code}</div>
                <div className="text-[10px] text-slate-500">
                  {e.buys} achat(s) · {e.sells} vente(s) · {e.units.toLocaleString("fr-FR")} u. ouvertes
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-bold tabular-nums ${
                    e.totalPL >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {e.totalPL >= 0 ? "+" : ""}
                  {fmtFCFA(Math.round(e.totalPL))} FCFA
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {fmtPct(e.contributionPct, 1)} du P&amp;L
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
