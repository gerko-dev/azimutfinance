// Helpers de formatage admin

import { fmtFCFAShort } from "@/lib/format";

export function fmtDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Rendu FCFA abrégé variante "admin" (M 1 déc. / k, pas de palier Md) —
// centralisé dans @/lib/format, ré-exporté ici pour les imports `./format`.
export function fmtFCFA(v: number): string {
  return fmtFCFAShort(v, "admin");
}

export function fmtNumber(v: number): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("fr-FR");
}
