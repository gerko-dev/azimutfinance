// Formatters fr-FR pour les indicateurs macro UEMOA
import type { KPIUnit } from "./macroTypes";

const NUM_FR = new Intl.NumberFormat("fr-FR");
const NUM_FR_2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM_FR_1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtMdsFCFA(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) {
    return `${NUM_FR_1.format(v / 1_000_000)} bn`;
  }
  if (Math.abs(v) >= 10_000) {
    return `${NUM_FR.format(Math.round(v))} Mds`;
  }
  return `${NUM_FR_1.format(v)} Mds`;
}

export function fmtPctRaw(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return `${v.toFixed(decimals).replace(".", ",")} %`;
}

export function fmtPctDecimal(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")} %`;
}

export function fmtNum(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

export function fmtKPIValue(value: number | null, unit: KPIUnit): string {
  if (value === null || !isFinite(value)) return "—";
  switch (unit) {
    case "Mds_FCFA":
      return fmtMdsFCFA(value);
    case "raw_pct":
      return fmtPctRaw(value, 1);
    case "pct":
      return fmtPctDecimal(value, 2);
    case "raw":
    default:
      if (Math.abs(value) >= 1000) return NUM_FR.format(Math.round(value));
      if (Math.abs(value) >= 10) return NUM_FR_1.format(value);
      return NUM_FR_2.format(value);
  }
}

export function fmtKPIDelta(delta: number | null, unit: KPIUnit): string | null {
  if (delta === null || !isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  switch (unit) {
    case "Mds_FCFA":
      return `${sign}${fmtMdsFCFA(delta)}`;
    case "raw_pct":
      return `${sign}${delta.toFixed(1).replace(".", ",")} pp`;
    case "pct":
      return `${sign}${(delta * 100).toFixed(2).replace(".", ",")} pp`;
    case "raw":
    default:
      return `${sign}${fmtNum(delta, 2)}`;
  }
}

export function fmtValueAuto(v: number, indicator: string, feuille: string): string {
  if (!isFinite(v)) return "—";
  const i = indicator.toLowerCase();
  if (i.includes("(en %)") || i.includes("/ pib") || i.includes("(%)") || i.includes("ratio")) {
    return fmtPctRaw(v, 2);
  }
  if (
    feuille === "Inflation" ||
    feuille === "Taux d'intérêt banques" ||
    feuille === "Marché Mon. & Int."
  ) {
    return fmtPctRaw(v, 2);
  }
  if (feuille === "Taux de change") {
    return fmtNum(v, 4);
  }
  if (Math.abs(v) >= 1000) return NUM_FR.format(Math.round(v));
  if (Math.abs(v) >= 10) return NUM_FR_1.format(v);
  return NUM_FR_2.format(v);
}
