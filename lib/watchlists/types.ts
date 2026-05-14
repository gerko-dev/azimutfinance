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
 * Met en forme un target_code pour l'affichage. Pour les matières premières,
 * convertit le slug (ex: "huile-de-palme") en nom lisible ("Huile de palme") :
 * remplace les tirets par des espaces et capitalise la première lettre.
 * Les autres types sont retournés tels quels (les tickers BRVM et symboles
 * bonds sont déjà en majuscules).
 */
export function formatTargetCode(t: WatchlistTargetType | string, code: string): string {
  if (!code || code === "*") return code;
  if (t === "commodity") {
    const spaced = code.replace(/-/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return code;
}

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
