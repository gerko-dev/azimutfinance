// Helpers de formatage partages par les composants simulateur

// Rendus FCFA centralisés dans @/lib/format.
// Ré-exportés ici pour ne pas toucher aux imports `./format` des composants :
//  - fmtFCFA      : abrégé variante "simulator" (Md / M 2 déc., entier sous 1 M)
//  - fmtFCFAExact : montant entier arrondi
import { fmtFCFAShort } from "@/lib/format";

export { fmtFCFAExact } from "@/lib/format";

export const fmtFCFA = (v: number): string => fmtFCFAShort(v, "simulator");

export const fmtPct = (v: number | null, dec = 1): string => {
  if (v === null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec).replace(".", ",")} %`;
};

export const fmtDateFr = (iso: string): string => {
  if (!iso || iso.length < 10) return iso || "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const fmtDateTimeFr = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
};

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
