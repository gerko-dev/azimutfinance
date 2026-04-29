import type { EmissionUMOA } from "@/lib/listedBondsTypes";
import type { MonthlyPoint } from "./MonthlyChart";

const FRENCH_MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const monthIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  return `${FRENCH_MONTHS_SHORT[monthIdx]} ${y.slice(2)}`;
}

/**
 * Agrege les emissions par mois calendaire :
 *  - amountMds  : somme des montants retenus (en milliards FCFA)
 *  - yieldPct   : taux moyen pondere par les montants retenus, en pourcentage
 *  - count      : nombre d'adjudications
 *
 * Le resultat est trie par mois croissant. Les mois sans emission sont omis.
 */
export function buildMonthlyPoints(emissions: EmissionUMOA[]): MonthlyPoint[] {
  const acc = new Map<
    string,
    { amount: number; weighted: number; count: number }
  >();

  for (const e of emissions) {
    const month = e.date.slice(0, 7);
    if (!month) continue;
    const stat = acc.get(month) ?? { amount: 0, weighted: 0, count: 0 };
    stat.amount += e.amount;
    stat.weighted += e.weightedAvgYield * e.amount;
    stat.count += 1;
    acc.set(month, stat);
  }

  return Array.from(acc.entries())
    .map(([month, s]) => ({
      month,
      monthLabel: formatMonthLabel(month),
      amountMds: s.amount / 1000,
      yieldPct: s.amount > 0 ? (s.weighted / s.amount) * 100 : 0,
      count: s.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Filtre les emissions a une fenetre temporelle de N mois glissants
 * a partir de la date la plus recente du dataset.
 */
export function filterRecentMonths(
  emissions: EmissionUMOA[],
  nMonths: number
): EmissionUMOA[] {
  if (emissions.length === 0) return [];
  const sorted = [...emissions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = new Date(sorted[0].date);
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - nMonths);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return sorted.filter((e) => e.date >= cutoffISO);
}

/**
 * Construit le lien vers la fiche detail d'un titre souverain non cote.
 *
 * - OAT : id == ISIN, donc /souverain/{isin}
 * - BAT : id synthetique calque sur aggregateSovereignBonds() :
 *         BAT-{country}-{date}-{maturity}-{Math.round(amount)}
 *
 * Retourne null si l'emission ne peut pas etre liee (OAT sans ISIN valide,
 * ou cas pathologique).
 */
export function sovereignBondHref(e: EmissionUMOA): string | null {
  if (e.type === "OAT") {
    if (!e.isin || e.isin === "--" || e.isin.trim() === "") return null;
    return `/souverain/${encodeURIComponent(e.isin)}`;
  }
  if (!e.country || !e.date || !(e.maturity > 0) || !(e.amount > 0)) return null;
  const id = `BAT-${e.country}-${e.date}-${e.maturity}-${Math.round(e.amount)}`;
  return `/souverain/${encodeURIComponent(id)}`;
}
