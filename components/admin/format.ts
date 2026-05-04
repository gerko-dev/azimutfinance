// Helpers de formatage admin

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

export function fmtFCFA(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
}

export function fmtNumber(v: number): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("fr-FR");
}
