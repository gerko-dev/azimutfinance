export type WatchlistTargetType =
  | "stock"
  | "bond"
  | "index"
  | "currency"
  | "commodity";

export const TARGET_TYPE_LABEL: Record<WatchlistTargetType, string> = {
  stock: "Action BRVM",
  bond: "Obligation",
  index: "Indice",
  currency: "Devise",
  commodity: "Matière première",
};

export type Watchlist = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type WatchlistItem = {
  id: string;
  watchlist_id: string;
  target_type: WatchlistTargetType;
  target_code: string;
  target_label: string | null;
  note: string | null;
  added_at: string;
};

export type WatchlistWithCount = Watchlist & { item_count: number };

export type WatchlistWithItems = Watchlist & { items: WatchlistItem[] };

/**
 * Détermine l'URL canonique de fiche détail d'un item watchlist.
 */
export function targetHref(t: WatchlistTargetType, code: string): string {
  const c = code.toLowerCase();
  switch (t) {
    case "stock":
      return `/titre/${c}`;
    case "bond":
      return `/obligation/${c}`;
    case "index":
      return `/marches/indices/${c}`;
    case "currency":
      return `/macro/devises/${c}`;
    case "commodity":
      return `/macro/matieres-premieres/${c}`;
  }
}
