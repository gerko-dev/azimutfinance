// === Types partages : Suivi de compte titre (real money) ===
//
// Comptes-titres reels d'un utilisateur (BRVM, FCFA).
// Importable cote server ET client.

export type BrokerageTxnType =
  | "deposit"
  | "withdrawal"
  | "buy"
  | "sell"
  | "dividend"
  | "fee"
  | "interest"
  | "split";

export type SecurityType = "stock" | "bond" | "fcp" | "other";

export type RecurringFrequency = "monthly" | "quarterly" | "biannual" | "annual";

/** Frais SGI fixes recurrents (droit de garde, abonnement, etc.) */
export type RecurringFee = {
  label: string;
  amount: number; // FCFA
  frequency: RecurringFrequency;
  startDate: string; // YYYY-MM-DD
};

/** Frais marche (BRVM / DCBR), administres globalement */
export type MarketFee = {
  code: "BRVM" | "DCBR";
  label: string;
  feePct: number; // ex 0.0085 = 0,85 %
  minAmount: number; // FCFA
  description: string;
  updatedAt: string;
};

export type UemoaCountryCode = "ci" | "sn" | "bj" | "tg" | "bf" | "ml" | "ne" | "gw";

/** Taux TPS (Taxe sur Prestation de Services) par pays UEMOA, applique au courtage SGI */
export type TpsRate = {
  country: UemoaCountryCode;
  rate: number; // ex 0.10 = 10 %
  description: string;
  updatedAt: string;
};

export type BrokerageAccount = {
  id: string;
  userId: string;
  name: string;
  broker: string;
  currency: string; // 'XOF'
  openingDate: string;
  initialCash: number;
  defaultFeePct: number; // courtage SGI parametrable
  defaultFeeMin: number; // courtage SGI : minimum FCFA
  /** Pays de la SGI — sert a determiner le taux TPS applicable */
  sgiCountry: UemoaCountryCode | null;
  recurringFees: RecurringFee[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BrokerageAccountRow = {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  currency: string;
  opening_date: string;
  initial_cash: string | number;
  default_fee_pct: string | number;
  default_fee_min: string | number;
  sgi_country: UemoaCountryCode | null;
  recurring_fees: RecurringFee[] | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type BrokerageTransaction = {
  id: string;
  accountId: string;
  userId: string;
  txnDate: string;
  type: BrokerageTxnType;
  securityCode: string | null;
  securityName: string | null;
  securityType: SecurityType | null;
  quantity: number | null;
  price: number | null;
  grossAmount: number;
  feesCourtage: number;
  feesBrvm: number;
  feesDcbr: number;
  feesTps: number;
  feesOther: number;
  /** Total des frais : courtage + brvm + dcbr + tps + other */
  totalFees: number;
  netAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BrokerageTransactionRow = {
  id: string;
  account_id: string;
  user_id: string;
  txn_date: string;
  type: BrokerageTxnType;
  security_code: string | null;
  security_name: string | null;
  security_type: SecurityType | null;
  quantity: string | number | null;
  price: string | number | null;
  gross_amount: string | number;
  fees_courtage: string | number;
  fees_brvm: string | number;
  fees_dcbr: string | number;
  fees_tps: string | number;
  fees_other: string | number;
  net_amount: string | number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type AccountPosition = {
  code: string;
  name: string;
  securityType: SecurityType;
  sector: string;
  units: number;
  avgCost: number;
  costBasis: number;
  currentPrice: number;
  priceDate: string | null;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  weightPct: number;
};

export type AccountSnapshot = {
  account: BrokerageAccount;
  cash: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividends: number;
  totalFeesCourtage: number;
  totalFeesBrvm: number;
  totalFeesDcbr: number;
  totalFeesTps: number;
  totalFeesOther: number;
  totalFees: number;
  positions: AccountPosition[];
  marketValue: number;
  totalValue: number;
  netInvested: number;
  realizedPL: number;
  unrealizedPL: number;
  totalReturnPct: number;
  allocationByType: { type: SecurityType | "cash"; value: number; pct: number }[];
  allocationBySector: { sector: string; value: number; pct: number }[];
};

export type EquityPoint = {
  date: string;
  value: number;
  netInvested: number;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Resultat d'un calcul de frais pour une transaction */
export type FeeBreakdown = {
  courtage: number;
  brvm: number;
  dcbr: number;
  tps: number;
  /** Somme des frais auto-calcules (hors fees_other) */
  total: number;
};

export type BrokerageStats = {
  totalAccounts: number;
  totalUsers: number;
  totalTransactions: number;
  totalOpenPositions: number;
  accountsByCountry: Record<string, number>;
  accountsByBroker: Record<string, number>;
};

// =============================================================================
// METADATA
// =============================================================================

export const TXN_TYPE_LABELS: Record<BrokerageTxnType, { label: string; sign: "+" | "-" | "0" }> = {
  deposit:    { label: "Dépôt",          sign: "+" },
  withdrawal: { label: "Retrait",        sign: "-" },
  buy:        { label: "Achat",          sign: "-" },
  sell:       { label: "Vente",          sign: "+" },
  dividend:   { label: "Dividende",      sign: "+" },
  fee:        { label: "Frais / commission", sign: "-" },
  interest:   { label: "Intérêts perçus", sign: "+" },
  split:      { label: "Split / regroupement", sign: "0" },
};

export const SECURITY_TYPE_LABELS: Record<SecurityType, string> = {
  stock: "Action",
  bond: "Obligation",
  fcp: "FCP / OPCVM",
  other: "Autre",
};

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  biannual: "Semestriel",
  annual: "Annuel",
};

export const FREQUENCY_INTERVAL_DAYS: Record<RecurringFrequency, number> = {
  monthly: 30,
  quarterly: 91,
  biannual: 182,
  annual: 365,
};

export const UEMOA_COUNTRY_LABELS: Record<UemoaCountryCode, string> = {
  ci: "Côte d'Ivoire",
  sn: "Sénégal",
  bj: "Bénin",
  tg: "Togo",
  bf: "Burkina Faso",
  ml: "Mali",
  ne: "Niger",
  gw: "Guinée-Bissau",
};

export const UEMOA_COUNTRY_LIST: UemoaCountryCode[] = [
  "ci", "sn", "bj", "tg", "bf", "ml", "ne", "gw",
];
