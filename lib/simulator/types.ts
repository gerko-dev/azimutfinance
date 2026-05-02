// === Types partagés simulateur de portefeuille ===
//
// Ces types sont importables côté server ET client (pas de "use server" /
// "use client" dans ce fichier).

export type SeasonStatus = "upcoming" | "active" | "ended";

export type Season = {
  id: string;
  name: string;
  starts_at: string; // YYYY-MM-DD
  ends_at: string; // YYYY-MM-DD
  initial_capital: number; // FCFA
  transaction_fee_pct: number; // ex 0.01 = 1 %
  status: SeasonStatus;
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
