// === TYPES & CONSTANTES POUR LES ACTUALITÉS ===
// Pas de dépendance fs ici — peut être importé depuis un client component.

export type NewsType =
  | "resultats"
  | "dividende"
  | "assemblee"
  | "operation"
  | "communique"
  | "presse";

export const NEWS_TYPES: NewsType[] = [
  "resultats",
  "dividende",
  "assemblee",
  "operation",
  "communique",
  "presse",
];

export const NEWS_TYPE_LABELS: Record<NewsType, string> = {
  resultats: "Résultats",
  dividende: "Dividende",
  assemblee: "Assemblée",
  operation: "Opération",
  communique: "Communiqué",
  presse: "Presse",
};

export type NewsItem = {
  ticker: string;
  date: string; // ISO YYYY-MM-DD
  type: NewsType;
  titre: string;
  source: string;
  url: string;
  resume: string;
};
