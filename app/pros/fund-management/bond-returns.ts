// Calcul des rendements des composantes obligataires du benchmark (portage sur
// une fenêtre). Module serveur pur (sans "use server") partagé entre
// benchmark-actions et attribution-actions.
import { loadUmoaEmissions, loadListedBonds } from "@/lib/dataLoader";
import { countryName } from "./benchmark-refs";

type Emissions = ReturnType<typeof loadUmoaEmissions>;
type Bonds = ReturnType<typeof loadListedBonds>;

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

// Moyenne souveraine pondérée (par montant) sur une fenêtre, en décimal.
export function sovAvg(
  emissions: Emissions,
  d1: string,
  d2: string,
  opts: { field: "yield" | "coupon"; countryCode?: string; band?: [number, number] },
): number | null {
  const cname =
    opts.countryCode && opts.countryCode !== "UEMOA" ? countryName(opts.countryCode) : null;
  const val = (e: Emissions[number]) =>
    opts.field === "yield" ? e.weightedAvgYield : e.couponRate;
  const match = (e: Emissions[number]) =>
    (!cname || e.country === cname || e.countryName === cname) &&
    (!opts.band || (e.maturity > opts.band[0] && e.maturity <= opts.band[1]));

  let win = emissions.filter((e) => e.date && e.date >= d1 && e.date <= d2 && match(e));
  if (win.length === 0) {
    win = emissions
      .filter((e) => e.date && e.date <= d2 && match(e))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }
  let num = 0;
  let den = 0;
  for (const e of win) {
    const v = val(e);
    if (v == null || !e.amount) continue;
    num += v * e.amount;
    den += e.amount;
  }
  return den > 0 ? num / den : null;
}

// Rendement (coupon) pondéré par l'encours des obligations cotées d'un pays.
export function listedYield(bonds: Bonds, countryCode: string): number | null {
  const arr = countryCode === "UEMOA" ? bonds : bonds.filter((b) => b.country === countryCode);
  let num = 0;
  let den = 0;
  for (const b of arr) {
    if (b.couponRate == null || !b.outstanding) continue;
    num += b.couponRate * b.outstanding;
    den += b.outstanding;
  }
  return den > 0 ? num / den : null;
}

export function matBand(n: number): [number, number] {
  return [n - 0.5, n + 0.5];
}

// Rendement (%) d'une composante OBLIGATAIRE sur [d1,d2] (portage), ou null.
export function bondRefReturn(
  ref: string,
  d1: string,
  d2: string,
  emissions: Emissions,
  bonds: Bonds,
): number | null {
  const days = daysBetween(d1, d2);
  const accrual = (rate: number | null) =>
    rate == null || !Number.isFinite(days) ? null : rate * (days / 365) * 100;

  if (ref.startsWith("sovy:")) {
    const [, pays, n] = ref.split(":");
    return accrual(sovAvg(emissions, d1, d2, { field: "yield", countryCode: pays, band: matBand(Number(n)) }));
  }
  if (ref.startsWith("sovc:")) {
    const [, pays, n] = ref.split(":");
    return accrual(sovAvg(emissions, d1, d2, { field: "coupon", countryCode: pays, band: matBand(Number(n)) }));
  }
  if (ref.startsWith("oblcote:")) {
    const [, pays] = ref.split(":");
    return accrual(listedYield(bonds, pays));
  }
  if (ref.startsWith("obldefaut")) {
    const rateStr = ref.split(":")[1];
    if (rateStr && rateStr.trim() !== "") {
      const rate = Number(rateStr.replace(",", ".")) / 100;
      return Number.isFinite(rate) ? accrual(rate) : null;
    }
    return accrual(sovAvg(emissions, d1, d2, { field: "yield" }));
  }
  // Rétrocompat.
  if (ref === "Rendement souverain UMOA-Titres" || ref === "Obligations cotées BRVM")
    return accrual(sovAvg(emissions, d1, d2, { field: "yield" }));
  if (ref === "Rendement souverain UMOA 3 ans")
    return accrual(sovAvg(emissions, d1, d2, { field: "yield", band: matBand(3) }));

  return null;
}
