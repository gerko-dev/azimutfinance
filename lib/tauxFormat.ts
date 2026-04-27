// Helpers de formatage purs — utilisables côté server ET client.

export function fmtPct(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + " %";
}

export function fmtPP(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  const s = v >= 0 ? "+" : "";
  return s + (v * 100).toFixed(digits).replace(".", ",") + " pp";
}

export function fmtBp(v: number): string {
  if (!isFinite(v)) return "—";
  const bp = Math.round(v * 10000);
  return (bp >= 0 ? "+" : "") + bp + " bp";
}

export function fmtMdsFCFA(v: number): string {
  if (!isFinite(v)) return "—";
  return (
    v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/,/g, " ") +
    " Mds"
  );
}

export function fmtMFCFA(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1000)
    return (v / 1000).toFixed(1).replace(".", ",") + " Mds";
  return (
    v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/,/g, " ") +
    " M"
  );
}

export function fmtRate(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  return v.toFixed(digits).replace(".", ",");
}

export function fmtRatio(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  return v.toFixed(digits).replace(".", ",") + "×";
}

export function fmtNum(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  return v.toFixed(digits).replace(".", ",");
}
