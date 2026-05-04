// === Queries server-side : Suivi de compte titre ===

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrices } from "@/lib/simulator/pricing";
import type {
  AccountSnapshot,
  BrokerageAccount,
  BrokerageAccountRow,
  BrokerageStats,
  BrokerageTransaction,
  BrokerageTransactionRow,
  EquityPoint,
  MarketFee,
  RecurringFee,
  TpsRate,
  UemoaCountryCode,
} from "./types";
import { buildEquityCurve, computeAvailability, computeSnapshot } from "./engine";

function num(x: string | number | null | undefined, dflt = 0): number {
  if (x === null || x === undefined) return dflt;
  if (typeof x === "number") return x;
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : dflt;
}

function rowToAccount(r: BrokerageAccountRow): BrokerageAccount {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    broker: r.broker,
    currency: r.currency,
    openingDate: r.opening_date,
    initialCash: num(r.initial_cash),
    defaultFeePct: num(r.default_fee_pct),
    defaultFeeMin: num(r.default_fee_min),
    sgiCountry: r.sgi_country ?? null,
    recurringFees: Array.isArray(r.recurring_fees) ? (r.recurring_fees as RecurringFee[]) : [],
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToTxn(r: BrokerageTransactionRow): BrokerageTransaction {
  const feesCourtage = num(r.fees_courtage);
  const feesBrvm = num(r.fees_brvm);
  const feesDcbr = num(r.fees_dcbr);
  const feesTps = num(r.fees_tps);
  const feesOther = num(r.fees_other);
  return {
    id: r.id,
    accountId: r.account_id,
    userId: r.user_id,
    txnDate: r.txn_date,
    type: r.type,
    securityCode: r.security_code,
    securityName: r.security_name,
    securityType: r.security_type,
    quantity: r.quantity === null || r.quantity === undefined ? null : num(r.quantity),
    price: r.price === null || r.price === undefined ? null : num(r.price),
    grossAmount: num(r.gross_amount),
    feesCourtage,
    feesBrvm,
    feesDcbr,
    feesTps,
    feesOther,
    totalFees: feesCourtage + feesBrvm + feesDcbr + feesTps + feesOther,
    netAmount: num(r.net_amount),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listMyAccounts(): Promise<BrokerageAccount[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("brokerage_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  return ((data as BrokerageAccountRow[] | null) ?? []).map(rowToAccount);
}

export async function getMyAccount(id: string): Promise<BrokerageAccount | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("brokerage_accounts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return rowToAccount(data as BrokerageAccountRow);
}

export async function listAccountTransactions(
  accountId: string,
): Promise<BrokerageTransaction[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brokerage_transactions")
    .select("*")
    .eq("account_id", accountId)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data as BrokerageTransactionRow[] | null) ?? []).map(rowToTxn);
}

export async function getTransactionById(
  txnId: string,
): Promise<BrokerageTransaction | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brokerage_transactions")
    .select("*")
    .eq("id", txnId)
    .maybeSingle();
  if (!data) return null;
  return rowToTxn(data as BrokerageTransactionRow);
}

// =============================================================================
// MARKET FEES (BRVM + DCBR)
// =============================================================================

export async function getMarketFees(): Promise<Map<string, MarketFee>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brokerage_market_fees")
    .select("*");
  const map = new Map<string, MarketFee>();
  for (const row of (data ?? []) as Array<{
    code: string;
    label: string;
    fee_pct: string | number;
    min_amount: string | number;
    description: string;
    updated_at: string;
  }>) {
    map.set(row.code, {
      code: row.code as MarketFee["code"],
      label: row.label,
      feePct: num(row.fee_pct),
      minAmount: num(row.min_amount),
      description: row.description,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export async function listMarketFees(): Promise<MarketFee[]> {
  const map = await getMarketFees();
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

// =============================================================================
// TPS RATES (par pays UEMOA)
// =============================================================================

export async function getTpsRates(): Promise<Map<UemoaCountryCode, TpsRate>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("brokerage_tps_rates").select("*");
  const map = new Map<UemoaCountryCode, TpsRate>();
  for (const row of (data ?? []) as Array<{
    country: UemoaCountryCode;
    rate: string | number;
    description: string;
    updated_at: string;
  }>) {
    map.set(row.country, {
      country: row.country,
      rate: num(row.rate),
      description: row.description,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export async function listTpsRates(): Promise<TpsRate[]> {
  const map = await getTpsRates();
  return Array.from(map.values()).sort((a, b) => a.country.localeCompare(b.country));
}

// =============================================================================
// ADMIN STATS
// =============================================================================

export async function getBrokerageStats(): Promise<BrokerageStats | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_brokerage_stats");
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as {
    total_accounts: number | string;
    total_users: number | string;
    total_transactions: number | string;
    total_open_positions: number | string;
    accounts_by_country: Record<string, number> | null;
    accounts_by_broker: Record<string, number> | null;
  };
  return {
    totalAccounts: num(row.total_accounts),
    totalUsers: num(row.total_users),
    totalTransactions: num(row.total_transactions),
    totalOpenPositions: num(row.total_open_positions),
    accountsByCountry: row.accounts_by_country ?? {},
    accountsByBroker: row.accounts_by_broker ?? {},
  };
}

// =============================================================================
// SNAPSHOT + EQUITY
// =============================================================================

export async function getAccountSnapshot(
  accountId: string,
): Promise<AccountSnapshot | null> {
  const account = await getMyAccount(accountId);
  if (!account) return null;
  const transactions = await listAccountTransactions(accountId);

  const latestArr = getLatestPrices();
  const latest = new Map<string, (typeof latestArr)[number]>();
  for (const p of latestArr) latest.set(p.code, p);

  return computeSnapshot(account, transactions, latest);
}

export async function getAccountAvailability(
  accountId: string,
): Promise<{ cash: number; unitsByCode: Map<string, number> } | null> {
  const account = await getMyAccount(accountId);
  if (!account) return null;
  const transactions = await listAccountTransactions(accountId);
  const today = new Date().toISOString().slice(0, 10);
  return computeAvailability(account, transactions, today);
}

export async function getAccountEquityCurve(
  accountId: string,
): Promise<EquityPoint[]> {
  const account = await getMyAccount(accountId);
  if (!account) return [];
  const transactions = await listAccountTransactions(accountId);
  if (transactions.length === 0) return [];

  const codes = Array.from(
    new Set(transactions.map((t) => t.securityCode).filter((c): c is string => !!c)),
  );
  const { loadPriceHistory } = await import("@/lib/dataLoader");
  const histories = new Map<string, { date: string; value: number }[]>();
  for (const code of codes) {
    const h = loadPriceHistory(code).sort((a, b) => a.date.localeCompare(b.date));
    histories.set(code, h);
  }

  const today = new Date().toISOString().slice(0, 10);
  return buildEquityCurve(account, transactions, histories, today);
}
