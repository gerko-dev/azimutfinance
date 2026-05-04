// === Outils de dessin sur graphiques ===
//
// Modele de dessins persistes par cle (typiquement le code de l'indice ou
// du titre). Stocke en localStorage cote client. Les coordonnees sont en
// unites du chart : `x` = date ISO YYYY-MM-DD, `y` = valeur de l'indice.

export type DrawingColor = "#dc2626" | "#16a34a" | "#0ea5e9" | "#f59e0b" | "#8b5cf6" | "#64748b";

export const DRAWING_COLORS: DrawingColor[] = [
  "#dc2626", // rouge
  "#16a34a", // vert
  "#0ea5e9", // bleu
  "#f59e0b", // orange
  "#8b5cf6", // violet
  "#64748b", // gris
];

export type DrawingTool =
  | "cursor"
  | "horizontal"
  | "vertical"
  | "trendline"
  | "rect"
  | "fibonacci"
  | "text";

export type Drawing =
  | {
      id: string;
      type: "horizontal";
      y: number;
      color: DrawingColor;
      label?: string;
    }
  | {
      id: string;
      type: "vertical";
      x: string; // date ISO
      color: DrawingColor;
      label?: string;
    }
  | {
      id: string;
      type: "trendline";
      x1: string;
      y1: number;
      x2: string;
      y2: number;
      color: DrawingColor;
    }
  | {
      id: string;
      type: "rect";
      x1: string;
      y1: number;
      x2: string;
      y2: number;
      color: DrawingColor;
    }
  | {
      id: string;
      type: "fibonacci";
      x1: string;
      y1: number;
      x2: string;
      y2: number;
      color: DrawingColor;
    }
  | {
      id: string;
      type: "text";
      x: string;
      y: number;
      label: string;
      color: DrawingColor;
    };

/** Niveaux Fibonacci standards utilises pour les retracements. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const STORAGE_PREFIX = "azimut.drawings.";

export function storageKey(chartKey: string): string {
  return STORAGE_PREFIX + chartKey;
}

/** Charge les dessins persistes pour `chartKey`. Renvoie [] si SSR ou cle absente. */
export function loadDrawings(chartKey: string): Drawing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(chartKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Drawing[];
  } catch {
    return [];
  }
}

/** Sauvegarde tous les dessins pour `chartKey`. */
export function saveDrawings(chartKey: string, drawings: Drawing[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(chartKey), JSON.stringify(drawings));
  } catch {
    // Quota localStorage depasse ou storage indisponible — silencieusement ignore
  }
}

/** Genere un id unique pour un nouveau dessin. */
export function newDrawingId(): string {
  return Math.random().toString(36).slice(2, 10);
}
