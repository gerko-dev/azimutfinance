"use client";

import Link from "next/link";
import { LineChart, Line, YAxis } from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import LivePriceBadge from "./LivePriceBadge";
import IndicesEvolutionChart, {
  type IndicesEvolutionSeries,
} from "./IndicesEvolutionChart";
import type { BrvmLiveIndex } from "@/lib/brvm/liveIndices";
import type { UserRole } from "@/lib/auth/userRole";

const INDEX_DESCRIPTIONS: Record<string, string> = {
  BRVMC:
    "Indice phare de la BRVM. Pondéré par la capitalisation flottante de toutes les sociétés cotées sur le marché.",
  BRVM30:
    "Panier des 30 valeurs les plus actives, sélectionnées sur la liquidité, la capitalisation flottante et la fréquence des transactions.",
  BRVMPA:
    "Compartiment principal : sociétés répondant aux critères standards de cotation continue.",
  BRVMPR:
    "Compartiment Prestige : exigences renforcées de transparence, gouvernance et liquidité (équivalent SBF 120 / Premium).",
  "BRVM-CB":
    "Indice sectoriel : entreprises agroalimentaires et de biens de consommation courante.",
  "BRVM-CD":
    "Indice sectoriel : distribution, automobile, biens de consommation discrétionnaire.",
  "BRVM-EN": "Indice sectoriel : exploration, raffinage et distribution d'énergie.",
  "BRVM-IN":
    "Indice sectoriel : industries manufacturières, BTP, équipements industriels.",
  "BRVM-SF":
    "Indice sectoriel : banques, assurances, intermédiation financière (le secteur le plus capitalisé).",
  "BRVM-SP":
    "Indice sectoriel : services publics — eau, électricité, transport public.",
  "BRVM-TEL":
    "Indice sectoriel : opérateurs télécoms et services de communication.",
  "BRVMC-TR":
    "Variante du Composite intégrant le réinvestissement des dividendes (Total Return).",
};

type Sparkline = { date: string; value: number }[];

type Props = {
  indices: BrvmLiveIndex[];
  sparklines: Record<string, Sparkline>;
  /** Series complets pour le chart d'evolution multi-periodes / multi-indices. */
  indicesSeries: IndicesEvolutionSeries[];
  /**
   * YTD recalcule depuis l'historique CSV (cours live vs cours 31/12 N-1).
   * `null` = historique indisponible, on retombe sur la valeur scrapee BRVM.
   */
  ytdComputed: Record<string, number | null>;
  userRole: UserRole;
  session: {
    fetchedAt: string;
    sessionLabel: string | null;
    isClosed: boolean | null;
  };
};

/** YTD effectif pour un indice : prefere la valeur calculee CSV au scraping BRVM */
function effectiveYtd(
  index: BrvmLiveIndex,
  ytdMap: Record<string, number | null>,
): number {
  const computed = ytdMap[index.code];
  return computed !== null && computed !== undefined ? computed : index.ytdPct;
}

function formatNumber(v: number, digits = 2): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPctSigned(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2).replace(".", ",")}%`;
}

function pctClass(v: number): string {
  if (v > 0) return "text-green-700";
  if (v < 0) return "text-red-700";
  return "text-slate-500";
}

export default function IndicesView({
  indices,
  sparklines,
  indicesSeries,
  ytdComputed,
  userRole,
  session,
}: Props) {
  const principal = indices.filter((i) => i.category === "principal");
  const sectoriel = indices.filter((i) => i.category === "sectoriel");
  const totalReturn = indices.filter((i) => i.category === "totalreturn");

  // Stats globales : meilleur/pire indice du jour parmi les sectoriels
  const sortedByDay = [...sectoriel].sort((a, b) => b.variationPct - a.variationPct);
  const bestSector = sortedByDay[0];
  const worstSector = sortedByDay[sortedByDay.length - 1];

  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition">
              Marchés
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Indices BRVM</span>
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-semibold text-white">Indices BRVM</h1>
            <LivePriceBadge
              sessionLabel={session.sessionLabel}
              isClosed={session.isClosed}
              variant="dark"
            />
          </div>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            {indices.length > 0
              ? `${indices.length} indices suivis : ${principal.length} principaux, ${sectoriel.length} sectoriels${totalReturn.length ? `, ${totalReturn.length} Total Return` : ""}.`
              : "Indices indisponibles temporairement."}
          </p>

          {bestSector && worstSector && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-6">
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">
                  Meilleur secteur du jour
                </div>
                <div className="font-semibold">
                  {bestSector.name.replace(/^BRVM\s*[-–—]\s*/i, "")}
                </div>
                <div className={`text-sm font-medium ${pctClass(bestSector.variationPct)}`}>
                  {formatPctSigned(bestSector.variationPct)}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Pire secteur du jour</div>
                <div className="font-semibold">
                  {worstSector.name.replace(/^BRVM\s*[-–—]\s*/i, "")}
                </div>
                <div className={`text-sm font-medium ${pctClass(worstSector.variationPct)}`}>
                  {formatPctSigned(worstSector.variationPct)}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Catégories</div>
                <div className="text-2xl font-semibold">
                  {principal.length + sectoriel.length + totalReturn.length}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Composite, sectoriels &amp; Total Return
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">
        {/* INDICES PRINCIPAUX */}
        {principal.length > 0 && (
          <section>
            <h2 className="text-lg md:text-xl font-semibold mb-4">
              Indices principaux
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {principal.map((i) => (
                <IndexDetailCard
                  key={i.code}
                  index={i}
                  spark={sparklines[i.code] ?? []}
                  ytdValue={effectiveYtd(i, ytdComputed)}
                />
              ))}
            </div>
          </section>
        )}

        {/* INDICES SECTORIELS */}
        {sectoriel.length > 0 && (
          <section>
            <h2 className="text-lg md:text-xl font-semibold mb-4">
              Indices sectoriels
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectoriel.map((i) => (
                <IndexDetailCard
                  key={i.code}
                  index={i}
                  spark={sparklines[i.code] ?? []}
                  ytdValue={effectiveYtd(i, ytdComputed)}
                />
              ))}
            </div>
          </section>
        )}

        {/* TOTAL RETURN */}
        {totalReturn.length > 0 && (
          <section>
            <h2 className="text-lg md:text-xl font-semibold mb-4">
              Total Return (avec dividendes réinvestis)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {totalReturn.map((i) => (
                <IndexDetailCard
                  key={i.code}
                  index={i}
                  spark={sparklines[i.code] ?? []}
                  ytdValue={effectiveYtd(i, ytdComputed)}
                />
              ))}
            </div>
          </section>
        )}

        {/* GRAPHIQUE EVOLUTION MULTI-INDICES */}
        {indicesSeries.length > 0 && (
          <IndicesEvolutionChart series={indicesSeries} userRole={userRole} />
        )}

        {/* TABLEAU RECAP */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <h2 className="text-lg md:text-xl font-semibold">
              Récapitulatif
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium">Indice</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                    Catégorie
                  </th>
                  <th className="text-right px-3 py-3 font-medium">Veille</th>
                  <th className="text-right px-3 py-3 font-medium">Clôture</th>
                  <th className="text-right px-3 py-3 font-medium">Var. jour</th>
                  <th className="text-right px-3 py-3 font-medium">YTD</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((i) => (
                  <tr
                    key={i.code}
                    className="border-b border-slate-100 hover:bg-blue-50/30 transition cursor-pointer"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/marches/indices/${encodeURIComponent(i.code)}`}
                        className="hover:text-blue-700"
                      >
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{i.code}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                          i.category === "principal"
                            ? "bg-blue-100 text-blue-800"
                            : i.category === "sectoriel"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {i.category === "principal"
                          ? "Principal"
                          : i.category === "sectoriel"
                            ? "Sectoriel"
                            : "Total Return"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                      {formatNumber(i.previousValue)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">
                      {formatNumber(i.value)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-medium ${pctClass(i.variationPct)}`}
                    >
                      {formatPctSigned(i.variationPct)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${pctClass(effectiveYtd(i, ytdComputed))}`}
                    >
                      {formatPctSigned(effectiveYtd(i, ytdComputed))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="text-xs text-slate-500 text-center">
          Source : <a href="https://www.brvm.org/fr/indices" target="_blank" rel="noopener noreferrer" className="hover:underline">BRVM</a>{" "}
          · Cours en différé · Mise à jour automatique toutes les 5 minutes.
        </div>
      </main>
    </>
  );
}

// ============================================================================
// INDEX DETAIL CARD : nom, valeur, variation, sparkline
// ============================================================================
function IndexDetailCard({
  index,
  spark,
  ytdValue,
}: {
  index: BrvmLiveIndex;
  spark: Sparkline;
  ytdValue: number;
}) {
  const cardContent = <IndexCardInner index={index} spark={spark} ytdValue={ytdValue} />;
  return (
    <Link
      href={`/marches/indices/${encodeURIComponent(index.code)}`}
      className="block bg-white rounded-lg border border-slate-200 p-4 md:p-5 hover:shadow-sm hover:border-slate-300 transition"
    >
      {cardContent}
    </Link>
  );
}

function IndexCardInner({
  index,
  spark,
  ytdValue,
}: {
  index: BrvmLiveIndex;
  spark: Sparkline;
  ytdValue: number;
}) {
  const positive = index.variationPct > 0;
  const negative = index.variationPct < 0;
  const colorClass = positive
    ? "text-green-700"
    : negative
      ? "text-red-700"
      : "text-slate-500";
  const strokeColor = positive ? "#15803d" : negative ? "#b91c1c" : "#64748b";

  const description = INDEX_DESCRIPTIONS[index.code];

  return (
    <>
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold truncate" title={index.name}>
            {index.name}
          </div>
          <div className="text-xs text-slate-400 font-mono">{index.code}</div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="text-2xl md:text-3xl font-semibold tabular-nums">
          {formatNumber(index.value)}
        </div>
        <div className={`text-sm font-medium ${colorClass}`}>
          {formatPctSigned(index.variationPct)}
        </div>
      </div>

      {spark.length > 1 && (
        <div className="h-12 md:h-14 mb-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex justify-between items-center gap-2 text-xs text-slate-500">
        <span>
          Veille :{" "}
          <span className="tabular-nums text-slate-700">
            {formatNumber(index.previousValue)}
          </span>
        </span>
        <span>
          YTD :{" "}
          <span className={`tabular-nums font-medium ${pctClass(ytdValue)}`}>
            {formatPctSigned(ytdValue)}
          </span>
        </span>
      </div>

      {description && (
        <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
          {description}
        </p>
      )}
    </>
  );
}
