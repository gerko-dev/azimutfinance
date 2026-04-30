// Constantes de palette — partagées entre Server Component et Client Component.
// Ne pas mettre "use client" : sinon les imports depuis le serveur deviennent
// des références client opaques et les valeurs hex sont perdues.

/** Couleurs sémantiques pour les séries (utilisées dans la page serveur). */
export const CHART = {
  blue: "#1d4ed8",
  red: "#dc2626",
  green: "#16a34a",
  orange: "#ea580c",
  purple: "#7c3aed",
  amber: "#f59e0b",
  teal: "#0d9488",
  pink: "#db2777",
  slate: "#475569",
  navy: "#0f172a",
} as const;

/** Palette générale (max-distinguishable) pour les fallback automatiques. */
export const MACRO_PALETTE = [
  "#1d4ed8", // 0 - blue
  "#ea580c", // 1 - orange
  "#16a34a", // 2 - green
  "#dc2626", // 3 - red
  "#7c3aed", // 4 - purple
  "#0d9488", // 5 - teal
  "#db2777", // 6 - pink
  "#a16207", // 7 - amber
  "#475569", // 8 - slate
];

/** Couleur stable par pays UEMOA (cohérente sur tous les charts). */
export const COUNTRY_COLORS: Record<string, string> = {
  CI: "#ea580c", // orange (drapeau)
  SN: "#16a34a", // vert
  BF: "#dc2626", // rouge
  ML: "#eab308", // jaune
  BJ: "#7c3aed", // violet
  TG: "#0d9488", // teal
  NE: "#a16207", // amber/brun
  GW: "#db2777", // rose
  UMOA: "#0f172a", // navy (agrégat)
};
