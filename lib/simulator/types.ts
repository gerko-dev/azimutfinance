// === Types partagés simulateur de portefeuille ===
//
// Ces types sont importables côté server ET client (pas de "use server" /
// "use client" dans ce fichier).

export type SeasonStatus = "upcoming" | "intro" | "active" | "ended" | "frozen";

export type Season = {
  id: string;
  name: string;
  starts_at: string; // YYYY-MM-DD (début de la compétition)
  ends_at: string; // YYYY-MM-DD (fin de la compétition)
  initial_capital: number; // FCFA (calculé à l'ouverture de la Course)
  transaction_fee_pct: number; // ex 0.01 = 1 %
  status: SeasonStatus;
  // Ligue Azimut v2 — phase d'inscription distincte de la compétition.
  // Optionnels pour rester compat avec les saisons v1.
  registration_starts_at?: string | null;
  registration_ends_at?: string | null;
  intro_phase_start_at?: string | null; // ISO timestamptz
  intro_phase_end_at?: string | null;   // ISO timestamptz
  total_pool_value?: number | null;
  total_pool_units?: number | null;
  participant_count?: number | null;
};

export type Portfolio = {
  id: string;
  user_id: string;
  season_id: string;
  cash: number;
  joined_at: string;
};

export type TransactionType = "BUY" | "SELL";

export type Transaction = {
  id: string;
  portfolio_id: string;
  type: TransactionType;
  code: string;
  units: number;
  price: number;
  gross_total: number;
  fees: number;
  net_total: number;
  price_date: string; // YYYY-MM-DD
  executed_at: string; // ISO timestamptz
};

/** Position courante (derivee des transactions) */
export type Position = {
  code: string;
  units: number;
  /** Prix de revient moyen (PRU) */
  avgCost: number;
  /** Valeur a l'achat (units * avgCost) */
  costBasis: number;
  /** Prix actuel */
  currentPrice: number;
  /** Valeur actuelle (units * currentPrice) */
  marketValue: number;
  /** Plus-value latente (marketValue - costBasis) */
  unrealizedPL: number;
  /** Plus-value latente en % */
  unrealizedPLPct: number;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  fullName: string | null;
  totalValue: number;
  cash: number;
  marketValue: number;
  totalReturn: number; // %
  txCount: number;
};

/** Snapshot live du portefeuille de l'utilisateur courant */
export type PortfolioSnapshot = {
  portfolio: Portfolio;
  cash: number;
  positions: Position[];
  marketValue: number;
  totalValue: number; // cash + marketValue
  initialCapital: number;
  totalReturn: number; // %
  realizedPL: number; // somme net_total des SELLs - cost basis libere (approx via FIFO simplifié)
  unrealizedPL: number;
};

/** Resultat retourne par les server actions */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Resultat brut de la fonction RPC place_order */
export type PlaceOrderResult = {
  transaction_id: string;
  gross_total: number;
  fees: number;
  net_total: number;
};

// === Carnet d'ordres (S3) ===

export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET" | "STOP_LOSS" | "TAKE_PROFIT";
export type OrderValidity = "DAY" | "GTC" | "GTD";
export type OrderStatus =
  | "open"
  | "partial"
  | "filled"
  | "cancelled"
  | "expired"
  | "reserved";

export type OrderRow = {
  id: string;
  portfolio_id: string;
  season_id: string;
  code: string;
  side: OrderSide;
  order_type: OrderType;
  units: number;
  units_filled: number;
  limit_price: number | null;
  stop_price: number | null;
  min_units: number;
  validity: OrderValidity;
  expires_at: string | null;
  status: OrderStatus;
  reserved_until: string | null;
  placed_at: string;
  updated_at: string;
};

/** Niveau du carnet d'ordres agrégé (1 ligne par prix). */
export type OrderBookLevel = {
  price: number;
  units: number;
  orders: number;
};

export type OrderBookSnapshot = {
  code: string;
  bids: OrderBookLevel[]; // tri DESC
  asks: OrderBookLevel[]; // tri ASC
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
};

/** Résultat de simulator_place_order_v2 */
export type PlaceOrderV2Result = {
  order_id: string;
  fills: number;
  status: OrderStatus;
  units_filled: number;
  units: number;
};
