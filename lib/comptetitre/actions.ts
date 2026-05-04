"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeAvailability,
  computeFees,
} from "./engine";
import type {
  ActionResult,
  BrokerageAccount,
  BrokerageTxnType,
  RecurringFee,
  RecurringFrequency,
  SecurityType,
  UemoaCountryCode,
} from "./types";
import { UEMOA_COUNTRY_LIST } from "./types";
import { getMarketFees, getTpsRates } from "./queries";

const TXN_TYPES: BrokerageTxnType[] = [
  "deposit",
  "withdrawal",
  "buy",
  "sell",
  "dividend",
  "fee",
  "interest",
  "split",
];
const SECURITY_TYPES: SecurityType[] = ["stock", "bond", "fcp", "other"];
const FREQUENCIES: RecurringFrequency[] = ["monthly", "quarterly", "biannual", "annual"];

async function ensureUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connexion requise." };
  return { ok: true, userId: user.id };
}

function strField(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}
function numField(fd: FormData, name: string): number {
  const v = strField(fd, name).replace(/\s/g, "").replace(",", ".");
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function nullableNumField(fd: FormData, name: string): number | null {
  const v = strField(fd, name).replace(/\s/g, "").replace(",", ".");
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseRecurringFees(raw: string): RecurringFee[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const o = item as Partial<RecurringFee>;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const amount = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? 0));
        const frequency =
          typeof o.frequency === "string" && FREQUENCIES.includes(o.frequency as RecurringFrequency)
            ? (o.frequency as RecurringFrequency)
            : null;
        const startDate = typeof o.startDate === "string" ? o.startDate : "";
        if (!label || !(amount > 0) || !frequency || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          return null;
        }
        return { label, amount, frequency, startDate };
      })
      .filter((x): x is RecurringFee => x !== null);
  } catch {
    return [];
  }
}

// =============================================================================
// COMPTES
// =============================================================================

type AccountPayload = {
  name: string;
  broker: string;
  currency: string;
  openingDate: string;
  initialCash: number;
  defaultFeePct: number;
  defaultFeeMin: number;
  sgiCountry: UemoaCountryCode | null;
  recurringFees: RecurringFee[];
  notes: string;
};

function parseAccountPayload(
  fd: FormData,
): { ok: true; data: AccountPayload } | { ok: false; error: string } {
  const name = strField(fd, "name");
  const broker = strField(fd, "broker");
  const openingDate = strField(fd, "opening_date");
  const currency = strField(fd, "currency") || "XOF";
  const initialCash = numField(fd, "initial_cash");
  const defaultFeePct = numField(fd, "default_fee_pct") / 100;
  const defaultFeeMin = numField(fd, "default_fee_min");
  const sgiCountryRaw = strField(fd, "sgi_country").toLowerCase();
  const sgiCountry =
    UEMOA_COUNTRY_LIST.includes(sgiCountryRaw as UemoaCountryCode)
      ? (sgiCountryRaw as UemoaCountryCode)
      : null;
  const recurringFees = parseRecurringFees(strField(fd, "recurring_fees_json"));
  const notes = strField(fd, "notes");

  if (!name) return { ok: false, error: "Nom du compte obligatoire." };
  if (!openingDate || !/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) {
    return { ok: false, error: "Date d'ouverture invalide." };
  }
  if (currency !== "XOF") {
    return { ok: false, error: "Seul le FCFA (XOF) est supporté pour l'instant." };
  }
  if (initialCash < 0) {
    return { ok: false, error: "Le dépôt initial doit être positif ou nul." };
  }
  if (defaultFeePct < 0 || defaultFeePct > 0.2) {
    return { ok: false, error: "Frais courtage % entre 0 et 20." };
  }
  if (defaultFeeMin < 0) {
    return { ok: false, error: "Le minimum doit être positif ou nul." };
  }
  if (!sgiCountry) {
    return { ok: false, error: "Pays UEMOA de la SGI obligatoire (pour la TPS)." };
  }

  return {
    ok: true,
    data: {
      name,
      broker,
      currency,
      openingDate,
      initialCash,
      defaultFeePct,
      defaultFeeMin,
      sgiCountry,
      recurringFees,
      notes,
    },
  };
}

export async function createBrokerageAccount(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = parseAccountPayload(formData);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("brokerage_accounts")
    .insert({
      user_id: auth.userId,
      name: p.name,
      broker: p.broker,
      currency: p.currency,
      opening_date: p.openingDate,
      initial_cash: p.initialCash,
      default_fee_pct: p.defaultFeePct,
      default_fee_min: p.defaultFeeMin,
      sgi_country: p.sgiCountry,
      recurring_fees: p.recurringFees,
      notes: p.notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (p.initialCash > 0) {
    await supabase.from("brokerage_transactions").insert({
      account_id: account.id,
      user_id: auth.userId,
      txn_date: p.openingDate,
      type: "deposit",
      gross_amount: p.initialCash,
      fees_courtage: 0,
      fees_brvm: 0,
      fees_dcbr: 0,
      fees_tps: 0,
      fees_other: 0,
      net_amount: p.initialCash,
      notes: "Dépôt initial à l'ouverture du compte",
    });
  }

  revalidatePath("/academie/compte-titre");
  return { ok: true, data: { id: account.id as string } };
}

export async function updateBrokerageAccount(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = parseAccountPayload(formData);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  // Note : on ne re-cree pas le depot initial sur update — il est cree une seule fois.
  const { error } = await supabase
    .from("brokerage_accounts")
    .update({
      name: p.name,
      broker: p.broker,
      currency: p.currency,
      opening_date: p.openingDate,
      initial_cash: p.initialCash,
      default_fee_pct: p.defaultFeePct,
      default_fee_min: p.defaultFeeMin,
      sgi_country: p.sgiCountry,
      recurring_fees: p.recurringFees,
      notes: p.notes,
    })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/academie/compte-titre");
  revalidatePath(`/academie/compte-titre/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteBrokerageAccount(id: string): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brokerage_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/academie/compte-titre");
  return { ok: true, data: undefined };
}

// =============================================================================
// TRANSACTIONS
// =============================================================================

type TxnPayload = {
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
  netAmount: number;
  notes: string;
};

function computeNetAmount(p: {
  type: BrokerageTxnType;
  grossAmount: number;
  totalFees: number;
}): number {
  switch (p.type) {
    case "deposit":
    case "interest":
      return p.grossAmount - p.totalFees;
    case "withdrawal":
      return -(p.grossAmount + p.totalFees);
    case "buy":
      return -(p.grossAmount + p.totalFees);
    case "sell":
      return p.grossAmount - p.totalFees;
    case "dividend":
      return p.grossAmount - p.totalFees;
    case "fee":
      return -(p.grossAmount + p.totalFees);
    case "split":
      return 0;
  }
}

async function parseAndValidateTxn(
  account: BrokerageAccount,
  fd: FormData,
  excludeTxnId: string | null,
): Promise<{ ok: true; data: TxnPayload } | { ok: false; error: string }> {
  const txnDate = strField(fd, "txn_date");
  const typeRaw = strField(fd, "type") as BrokerageTxnType;
  const securityCodeRaw = strField(fd, "security_code").toUpperCase();
  const securityNameRaw = strField(fd, "security_name");
  const securityTypeRaw = strField(fd, "security_type") as SecurityType | "";
  const quantity = nullableNumField(fd, "quantity");
  const price = nullableNumField(fd, "price");
  const feesOther = numField(fd, "fees_other");
  let grossAmount = numField(fd, "gross_amount");
  const notes = strField(fd, "notes");

  if (!txnDate || !/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return { ok: false, error: "Date invalide." };
  }
  if (!TXN_TYPES.includes(typeRaw)) {
    return { ok: false, error: "Type de transaction invalide." };
  }
  if (feesOther < 0) {
    return { ok: false, error: "Les frais doivent être positifs." };
  }

  let securityCode: string | null = null;
  let securityName: string | null = null;
  let securityType: SecurityType | null = null;

  const needsSecurity = ["buy", "sell", "dividend", "split"].includes(typeRaw);
  if (needsSecurity) {
    if (!securityCodeRaw) {
      return { ok: false, error: "Code valeur (ticker) obligatoire." };
    }
    securityCode = securityCodeRaw;
    securityName = securityNameRaw || null;
    securityType =
      securityTypeRaw && SECURITY_TYPES.includes(securityTypeRaw as SecurityType)
        ? (securityTypeRaw as SecurityType)
        : "stock";
  }

  let feesCourtage = 0;
  let feesBrvm = 0;
  let feesDcbr = 0;
  let feesTps = 0;

  if (typeRaw === "buy" || typeRaw === "sell") {
    if (!(quantity && quantity > 0)) {
      return { ok: false, error: "Quantité obligatoire et positive." };
    }
    if (!(price && price > 0)) {
      return { ok: false, error: "Prix unitaire obligatoire et positif." };
    }
    grossAmount = quantity * price;
    // Calcul automatique des 4 frais (courtage SGI + BRVM + DCBR + TPS)
    const [marketFees, tpsRates] = await Promise.all([getMarketFees(), getTpsRates()]);
    const breakdown = computeFees(grossAmount, account, marketFees, tpsRates);
    feesCourtage = breakdown.courtage;
    feesBrvm = breakdown.brvm;
    feesDcbr = breakdown.dcbr;
    feesTps = breakdown.tps;
  } else if (typeRaw === "split") {
    if (!(quantity && quantity > 0)) {
      return { ok: false, error: "Ratio de split (>0) obligatoire." };
    }
    grossAmount = 0;
  } else if (typeRaw === "fee") {
    if (grossAmount <= 0) {
      return { ok: false, error: "Montant des frais obligatoire." };
    }
  } else {
    if (grossAmount <= 0) {
      return { ok: false, error: "Montant brut obligatoire et positif." };
    }
  }

  const totalFees = feesCourtage + feesBrvm + feesDcbr + feesTps + feesOther;
  const netAmount = computeNetAmount({ type: typeRaw, grossAmount, totalFees });

  // ============ Validation : pas de vente a decouvert + cash suffisant ============
  if (typeRaw === "sell" || typeRaw === "withdrawal" || typeRaw === "buy") {
    // Recharger les transactions actuelles pour calculer la dispo
    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from("brokerage_transactions")
      .select("*")
      .eq("account_id", account.id);
    if (excludeTxnId) q = q.neq("id", excludeTxnId);
    const { data: existingRaw } = await q;
    const existing = (existingRaw ?? []).map((r) => ({
      id: r.id as string,
      accountId: r.account_id as string,
      userId: r.user_id as string,
      txnDate: r.txn_date as string,
      type: r.type as BrokerageTxnType,
      securityCode: r.security_code as string | null,
      securityName: r.security_name as string | null,
      securityType: r.security_type as SecurityType | null,
      quantity:
        r.quantity === null || r.quantity === undefined
          ? null
          : typeof r.quantity === "number"
            ? r.quantity
            : parseFloat(String(r.quantity)),
      price:
        r.price === null || r.price === undefined
          ? null
          : typeof r.price === "number"
            ? r.price
            : parseFloat(String(r.price)),
      grossAmount: typeof r.gross_amount === "number" ? r.gross_amount : parseFloat(String(r.gross_amount ?? 0)),
      feesCourtage: typeof r.fees_courtage === "number" ? r.fees_courtage : parseFloat(String(r.fees_courtage ?? 0)),
      feesBrvm: typeof r.fees_brvm === "number" ? r.fees_brvm : parseFloat(String(r.fees_brvm ?? 0)),
      feesDcbr: typeof r.fees_dcbr === "number" ? r.fees_dcbr : parseFloat(String(r.fees_dcbr ?? 0)),
      feesTps: typeof r.fees_tps === "number" ? r.fees_tps : parseFloat(String(r.fees_tps ?? 0)),
      feesOther: typeof r.fees_other === "number" ? r.fees_other : parseFloat(String(r.fees_other ?? 0)),
      totalFees: 0,
      netAmount: typeof r.net_amount === "number" ? r.net_amount : parseFloat(String(r.net_amount ?? 0)),
      notes: r.notes as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const avail = computeAvailability(account, existing, today);

    if (typeRaw === "sell" && securityCode && quantity) {
      const have = avail.unitsByCode.get(securityCode) ?? 0;
      if (quantity > have + 1e-9) {
        return {
          ok: false,
          error: `Vente à découvert interdite : vous détenez ${have} ${securityCode}, vous tentez d'en vendre ${quantity}.`,
        };
      }
    }
    if (typeRaw === "withdrawal") {
      if (grossAmount + totalFees > avail.cash + 1e-9) {
        return {
          ok: false,
          error: `Cash espèce insuffisant : disponible ${Math.round(avail.cash).toLocaleString("fr-FR")} FCFA, retrait demandé ${Math.round(grossAmount + totalFees).toLocaleString("fr-FR")} FCFA (frais inclus).`,
        };
      }
    }
    if (typeRaw === "buy") {
      if (grossAmount + totalFees > avail.cash + 1e-9) {
        return {
          ok: false,
          error: `Cash espèce insuffisant : disponible ${Math.round(avail.cash).toLocaleString("fr-FR")} FCFA, achat demandé ${Math.round(grossAmount + totalFees).toLocaleString("fr-FR")} FCFA (frais inclus).`,
        };
      }
    }
  }

  return {
    ok: true,
    data: {
      txnDate,
      type: typeRaw,
      securityCode,
      securityName,
      securityType,
      quantity,
      price,
      grossAmount,
      feesCourtage,
      feesBrvm,
      feesDcbr,
      feesTps,
      feesOther,
      netAmount,
      notes,
    },
  };
}

export async function addBrokerageTransaction(
  accountId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data: accountRow } = await supabase
    .from("brokerage_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!accountRow) return { ok: false, error: "Compte introuvable." };

  const account: BrokerageAccount = {
    id: accountRow.id as string,
    userId: accountRow.user_id as string,
    name: accountRow.name as string,
    broker: accountRow.broker as string,
    currency: accountRow.currency as string,
    openingDate: accountRow.opening_date as string,
    initialCash:
      typeof accountRow.initial_cash === "number"
        ? accountRow.initial_cash
        : parseFloat(String(accountRow.initial_cash ?? 0)),
    defaultFeePct:
      typeof accountRow.default_fee_pct === "number"
        ? accountRow.default_fee_pct
        : parseFloat(String(accountRow.default_fee_pct ?? 0)),
    defaultFeeMin:
      typeof accountRow.default_fee_min === "number"
        ? accountRow.default_fee_min
        : parseFloat(String(accountRow.default_fee_min ?? 0)),
    sgiCountry: (accountRow.sgi_country as UemoaCountryCode | null) ?? null,
    recurringFees: Array.isArray(accountRow.recurring_fees)
      ? (accountRow.recurring_fees as RecurringFee[])
      : [],
    notes: accountRow.notes as string,
    createdAt: accountRow.created_at as string,
    updatedAt: accountRow.updated_at as string,
  };

  const parsed = await parseAndValidateTxn(account, formData, null);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const { data, error } = await supabase
    .from("brokerage_transactions")
    .insert({
      account_id: accountId,
      user_id: auth.userId,
      txn_date: p.txnDate,
      type: p.type,
      security_code: p.securityCode,
      security_name: p.securityName,
      security_type: p.securityType,
      quantity: p.quantity,
      price: p.price,
      gross_amount: p.grossAmount,
      fees_courtage: p.feesCourtage,
      fees_brvm: p.feesBrvm,
      fees_dcbr: p.feesDcbr,
      fees_tps: p.feesTps,
      fees_other: p.feesOther,
      net_amount: p.netAmount,
      notes: p.notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/academie/compte-titre/${accountId}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateBrokerageTransaction(
  txnId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("brokerage_transactions")
    .select("account_id, user_id")
    .eq("id", txnId)
    .maybeSingle();
  if (!existing || (existing as { user_id: string }).user_id !== auth.userId) {
    return { ok: false, error: "Transaction introuvable." };
  }
  const accountId = (existing as { account_id: string }).account_id;

  const { data: accountRow } = await supabase
    .from("brokerage_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (!accountRow) return { ok: false, error: "Compte introuvable." };

  const account: BrokerageAccount = {
    id: accountRow.id as string,
    userId: accountRow.user_id as string,
    name: accountRow.name as string,
    broker: accountRow.broker as string,
    currency: accountRow.currency as string,
    openingDate: accountRow.opening_date as string,
    initialCash:
      typeof accountRow.initial_cash === "number"
        ? accountRow.initial_cash
        : parseFloat(String(accountRow.initial_cash ?? 0)),
    defaultFeePct:
      typeof accountRow.default_fee_pct === "number"
        ? accountRow.default_fee_pct
        : parseFloat(String(accountRow.default_fee_pct ?? 0)),
    defaultFeeMin:
      typeof accountRow.default_fee_min === "number"
        ? accountRow.default_fee_min
        : parseFloat(String(accountRow.default_fee_min ?? 0)),
    sgiCountry: (accountRow.sgi_country as UemoaCountryCode | null) ?? null,
    recurringFees: Array.isArray(accountRow.recurring_fees)
      ? (accountRow.recurring_fees as RecurringFee[])
      : [],
    notes: accountRow.notes as string,
    createdAt: accountRow.created_at as string,
    updatedAt: accountRow.updated_at as string,
  };

  const parsed = await parseAndValidateTxn(account, formData, txnId);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const { error } = await supabase
    .from("brokerage_transactions")
    .update({
      txn_date: p.txnDate,
      type: p.type,
      security_code: p.securityCode,
      security_name: p.securityName,
      security_type: p.securityType,
      quantity: p.quantity,
      price: p.price,
      gross_amount: p.grossAmount,
      fees_courtage: p.feesCourtage,
      fees_brvm: p.feesBrvm,
      fees_dcbr: p.feesDcbr,
      fees_tps: p.feesTps,
      fees_other: p.feesOther,
      net_amount: p.netAmount,
      notes: p.notes,
    })
    .eq("id", txnId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/academie/compte-titre/${accountId}`);
  return { ok: true, data: undefined };
}

export async function deleteBrokerageTransaction(txnId: string): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("brokerage_transactions")
    .select("account_id, user_id")
    .eq("id", txnId)
    .maybeSingle();
  if (!existing || (existing as { user_id: string }).user_id !== auth.userId) {
    return { ok: false, error: "Transaction introuvable." };
  }
  const accountId = (existing as { account_id: string }).account_id;

  const { error } = await supabase
    .from("brokerage_transactions")
    .delete()
    .eq("id", txnId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/academie/compte-titre/${accountId}`);
  return { ok: true, data: undefined };
}

// =============================================================================
// ADMIN : MARKET FEES
// =============================================================================

export async function adminUpdateMarketFee(
  code: string,
  feePct: number,
  minAmount: number,
  description: string,
): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!["BRVM", "DCBR"].includes(code)) {
    return { ok: false, error: "Code de frais invalide." };
  }
  if (feePct < 0 || feePct > 0.5) {
    return { ok: false, error: "Taux invalide (0 à 50 %)." };
  }
  if (minAmount < 0) {
    return { ok: false, error: "Minimum invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_market_fee", {
    p_code: code,
    p_fee_pct: feePct,
    p_min_amount: minAmount,
    p_description: description || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/compte-titre");
  revalidatePath("/academie/compte-titre");
  return { ok: true, data: undefined };
}

export async function adminUpdateTpsRate(
  country: string,
  rate: number,
  description: string,
): Promise<ActionResult> {
  const auth = await ensureUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!UEMOA_COUNTRY_LIST.includes(country.toLowerCase() as UemoaCountryCode)) {
    return { ok: false, error: "Pays UEMOA invalide." };
  }
  if (rate < 0 || rate > 0.5) {
    return { ok: false, error: "Taux invalide (0 à 50 %)." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_tps_rate", {
    p_country: country.toLowerCase(),
    p_rate: rate,
    p_description: description || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/compte-titre");
  revalidatePath("/academie/compte-titre");
  return { ok: true, data: undefined };
}
