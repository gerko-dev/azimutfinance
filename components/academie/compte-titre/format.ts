// === Helpers de formatage : Suivi de compte titre ===

// Rendu « montant entier FCFA » — centralisé dans @/lib/format.
// Ré-exporté ici pour ne pas toucher aux imports `./format` des composants.
export { fmtFCFAExact as fmtFCFA } from "@/lib/format";

export function fmtPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits).replace(".", ",")} %`;
}

export function fmtNum(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "—";
  return v
    .toLocaleString("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    .replace(/ /g, " ");
}

export function fmtDateFr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function pnlColor(v: number): string {
  if (v > 0) return "text-emerald-700";
  if (v < 0) return "text-rose-700";
  return "text-slate-700";
}
