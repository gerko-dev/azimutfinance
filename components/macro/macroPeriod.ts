// Constantes/helpers de période — partagés entre Server Component (page) et
// Client Component (MacroPeriodSelector). Ne pas mettre "use client" ici sinon
// l'import depuis le serveur deviendrait une référence proxy.

export const PERIOD_OPTIONS = [
  { id: "5", label: "5 A", years: 5 },
  { id: "10", label: "10 A", years: 10 },
  { id: "15", label: "15 A", years: 15 },
  { id: "25", label: "25 A", years: 25 },
  { id: "max", label: "Max", years: null as number | null },
] as const;

export type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];

export const DEFAULT_PERIOD: PeriodId = "15";

/** Convertit une PeriodId en nombre d'observations à conserver pour une série
 *  selon sa fréquence (annuelle ou mensuelle). null = max. */
export function periodToWindow(
  period: PeriodId,
  periodicity: "yearly" | "monthly",
): number | null {
  const opt = PERIOD_OPTIONS.find((p) => p.id === period) ?? PERIOD_OPTIONS[2];
  if (opt.years === null) return null;
  return periodicity === "monthly" ? opt.years * 12 : opt.years;
}
