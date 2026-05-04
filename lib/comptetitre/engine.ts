// === Moteur de calcul : positions, snapshot, courbe d'equity, frais ===

import type {
  AccountPosition,
  AccountSnapshot,
  BrokerageAccount,
  BrokerageTransaction,
  EquityPoint,
  FeeBreakdown,
  MarketFee,
  RecurringFee,
  RecurringFrequency,
  SecurityType,
  TpsRate,
  UemoaCountryCode,
} from "./types";

type LatestPrice = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string;
};

type SecurityState = {
  units: number;
  totalCost: number;
  realizedPL: number;
  securityType: SecurityType;
  name: string;
};

function num(x: number | string | null | undefined, dflt = 0): number {
  if (x === null || x === undefined) return dflt;
  if (typeof x === "number") return x;
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : dflt;
}

// =============================================================================
// CALCUL DES FRAIS DE TRANSACTION
// =============================================================================

/**
 * Calcule les 4 frais (courtage SGI + BRVM + DCBR + TPS) appliques a une transaction
 * d'achat ou de vente, sur la base du brut (qty * prix).
 *
 * - Courtage SGI : feePct du compte (avec minimum eventuel)
 * - BRVM : feePct global (admin)
 * - DCBR : feePct global (admin)
 * - TPS : rate du pays SGI applique au courtage SGI uniquement
 */
export function computeFees(
  grossAmount: number,
  account: BrokerageAccount,
  marketFees: Map<string, MarketFee>,
  tpsRates: Map<UemoaCountryCode, TpsRate>,
): FeeBreakdown {
  const gross = Math.max(0, grossAmount);
  const courtagePct = account.defaultFeePct;
  const courtageMin = account.defaultFeeMin;
  const courtage = Math.max(courtageMin, gross * courtagePct);

  const brvmFee = marketFees.get("BRVM");
  const dcbrFee = marketFees.get("DCBR");
  const brvm = brvmFee
    ? Math.max(brvmFee.minAmount, gross * brvmFee.feePct)
    : 0;
  const dcbr = dcbrFee
    ? Math.max(dcbrFee.minAmount, gross * dcbrFee.feePct)
    : 0;

  // TPS : taxe sur prestation de services appliquee au courtage SGI uniquement
  const tpsRate = account.sgiCountry
    ? tpsRates.get(account.sgiCountry)?.rate ?? 0
    : 0;
  const tps = courtage * tpsRate;

  return {
    courtage: Math.round(courtage),
    brvm: Math.round(brvm),
    dcbr: Math.round(dcbr),
    tps: Math.round(tps),
    total: Math.round(courtage + brvm + dcbr + tps),
  };
}

// =============================================================================
// FRAIS RECURRENTS (DROIT DE GARDE, ABONNEMENT, ETC.)
// =============================================================================

/**
 * A partir d'une liste de frais recurrents et d'un intervalle [from, to],
 * calcule la liste des occurrences (avec leur date d'application).
 */
export function expandRecurringFees(
  recurring: RecurringFee[],
  toDate: string,
): { date: string; label: string; amount: number; frequency: RecurringFrequency }[] {
  const out: {
    date: string;
    label: string;
    amount: number;
    frequency: RecurringFrequency;
  }[] = [];
  const today = toDate;
  for (const rf of recurring) {
    if (!rf.startDate || rf.amount <= 0) continue;
    const start = new Date(rf.startDate + "T00:00:00Z");
    const end = new Date(today + "T00:00:00Z");
    if (start.getTime() > end.getTime()) continue;
    const cursor = new Date(start.getTime());
    let safety = 0;
    while (cursor.getTime() <= end.getTime() && safety < 5000) {
      out.push({
        date: cursor.toISOString().slice(0, 10),
        label: rf.label || "Frais récurrent SGI",
        amount: rf.amount,
        frequency: rf.frequency,
      });
      // Avance
      switch (rf.frequency) {
        case "monthly":
          cursor.setUTCMonth(cursor.getUTCMonth() + 1);
          break;
        case "quarterly":
          cursor.setUTCMonth(cursor.getUTCMonth() + 3);
          break;
        case "biannual":
          cursor.setUTCMonth(cursor.getUTCMonth() + 6);
          break;
        case "annual":
          cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
          break;
      }
      safety++;
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// =============================================================================
// VALIDATION D'UNE NOUVELLE TRANSACTION
// =============================================================================

/**
 * A partir des transactions existantes d'un compte, calcule l'etat courant :
 * cash disponible et quantite par titre (positions ouvertes).
 *
 * Inclut les frais recurrents auto-deduits jusqu'a today.
 */
export function computeAvailability(
  account: BrokerageAccount,
  transactions: BrokerageTransaction[],
  today: string,
): { cash: number; unitsByCode: Map<string, number> } {
  let cash = 0;
  const units = new Map<string, number>();
  const txs = [...transactions].sort((a, b) => {
    const cmp = a.txnDate.localeCompare(b.txnDate);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
  for (const t of txs) {
    cash += num(t.netAmount);
    if (t.type === "buy" && t.securityCode) {
      units.set(t.securityCode, (units.get(t.securityCode) ?? 0) + num(t.quantity));
    } else if (t.type === "sell" && t.securityCode) {
      units.set(t.securityCode, (units.get(t.securityCode) ?? 0) - num(t.quantity));
    } else if (t.type === "split" && t.securityCode) {
      const ratio = num(t.quantity);
      if (ratio > 0) {
        units.set(t.securityCode, (units.get(t.securityCode) ?? 0) * ratio);
      }
    }
  }
  // Frais recurrents auto-deduits (SGI : droit de garde, abonnement, etc.)
  const occurrences = expandRecurringFees(account.recurringFees ?? [], today);
  for (const o of occurrences) {
    cash -= o.amount;
  }
  return { cash, unitsByCode: units };
}

// =============================================================================
// SNAPSHOT
// =============================================================================

export function buildPositionsAndCash(
  account: BrokerageAccount,
  transactions: BrokerageTransaction[],
  latestPrices: Map<string, LatestPrice>,
  today: string,
): {
  cash: number;
  positions: AccountPosition[];
  realizedPL: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividends: number;
  totalFeesCourtage: number;
  totalFeesBrvm: number;
  totalFeesDcbr: number;
  totalFeesTps: number;
  totalFeesOther: number;
} {
  const txs = [...transactions].sort((a, b) => {
    const cmp = a.txnDate.localeCompare(b.txnDate);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let cash = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let totalFeesCourtage = 0;
  let totalFeesBrvm = 0;
  let totalFeesDcbr = 0;
  let totalFeesTps = 0;
  let totalFeesOther = 0;
  let realizedPL = 0;

  const state = new Map<string, SecurityState>();

  function getOrInit(code: string, name: string, st: SecurityType): SecurityState {
    let s = state.get(code);
    if (!s) {
      s = { units: 0, totalCost: 0, realizedPL: 0, securityType: st, name };
      state.set(code, s);
    } else {
      if (name) s.name = name;
      if (st) s.securityType = st;
    }
    return s;
  }

  for (const t of txs) {
    cash += num(t.netAmount);
    totalFeesCourtage += num(t.feesCourtage);
    totalFeesBrvm += num(t.feesBrvm);
    totalFeesDcbr += num(t.feesDcbr);
    totalFeesTps += num(t.feesTps);
    totalFeesOther += num(t.feesOther);

    switch (t.type) {
      case "deposit":
        totalDeposits += num(t.grossAmount);
        break;
      case "withdrawal":
        totalWithdrawals += num(t.grossAmount);
        break;
      case "dividend":
        totalDividends += num(t.grossAmount);
        break;
      case "buy": {
        if (!t.securityCode) break;
        const st = (t.securityType ?? "stock") as SecurityType;
        const s = getOrInit(t.securityCode, t.securityName ?? t.securityCode, st);
        const qty = num(t.quantity);
        const px = num(t.price);
        const allFees =
          num(t.feesCourtage) +
          num(t.feesBrvm) +
          num(t.feesDcbr) +
          num(t.feesTps) +
          num(t.feesOther);
        s.units += qty;
        s.totalCost += qty * px + allFees;
        break;
      }
      case "sell": {
        if (!t.securityCode) break;
        const st = (t.securityType ?? "stock") as SecurityType;
        const s = getOrInit(t.securityCode, t.securityName ?? t.securityCode, st);
        const qty = num(t.quantity);
        const px = num(t.price);
        const allFees =
          num(t.feesCourtage) +
          num(t.feesBrvm) +
          num(t.feesDcbr) +
          num(t.feesTps) +
          num(t.feesOther);
        const pru = s.units > 0 ? s.totalCost / s.units : 0;
        const realized = qty * (px - pru) - allFees;
        s.realizedPL += realized;
        realizedPL += realized;
        const newUnits = s.units - qty;
        if (s.units > 0) {
          s.totalCost = s.totalCost * (Math.max(0, newUnits) / s.units);
        }
        s.units = newUnits;
        break;
      }
      case "split": {
        if (!t.securityCode) break;
        const ratio = num(t.quantity);
        if (ratio <= 0) break;
        const s = state.get(t.securityCode);
        if (!s) break;
        s.units = s.units * ratio;
        break;
      }
      default:
        break;
    }
  }

  // Frais recurrents (impact cash)
  const occurrences = expandRecurringFees(account.recurringFees ?? [], today);
  for (const o of occurrences) {
    cash -= o.amount;
    totalFeesOther += o.amount;
  }

  // Construction des positions
  const positions: AccountPosition[] = [];
  let totalMV = 0;
  for (const [code, s] of state) {
    if (s.units <= 1e-9) continue;
    const last = latestPrices.get(code) ?? null;
    const currentPrice = last?.price ?? (s.totalCost / s.units);
    const marketValue = s.units * currentPrice;
    const costBasis = s.totalCost;
    const unrealizedPL = marketValue - costBasis;
    const unrealizedPLPct = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
    positions.push({
      code,
      name: last?.name ?? s.name,
      securityType: s.securityType,
      sector: last?.sector ?? "—",
      units: s.units,
      avgCost: costBasis / s.units,
      costBasis,
      currentPrice,
      priceDate: last?.date ?? null,
      marketValue,
      unrealizedPL,
      unrealizedPLPct,
      weightPct: 0,
    });
    totalMV += marketValue;
  }
  for (const p of positions) {
    p.weightPct = totalMV > 0 ? (p.marketValue / totalMV) * 100 : 0;
  }
  positions.sort((a, b) => b.marketValue - a.marketValue);

  return {
    cash,
    positions,
    realizedPL,
    totalDeposits,
    totalWithdrawals,
    totalDividends,
    totalFeesCourtage,
    totalFeesBrvm,
    totalFeesDcbr,
    totalFeesTps,
    totalFeesOther,
  };
}

export function computeSnapshot(
  account: BrokerageAccount,
  transactions: BrokerageTransaction[],
  latestPrices: Map<string, LatestPrice>,
  today: string = new Date().toISOString().slice(0, 10),
): AccountSnapshot {
  const r = buildPositionsAndCash(account, transactions, latestPrices, today);
  const marketValue = r.positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue = r.cash + marketValue;
  const unrealizedPL = r.positions.reduce((s, p) => s + p.unrealizedPL, 0);
  const netInvested = r.totalDeposits - r.totalWithdrawals;
  const totalReturnPct =
    netInvested > 0 ? ((totalValue - netInvested) / netInvested) * 100 : 0;

  const byType = new Map<SecurityType, number>();
  for (const p of r.positions) {
    byType.set(p.securityType, (byType.get(p.securityType) ?? 0) + p.marketValue);
  }
  const allocationByType: AccountSnapshot["allocationByType"] = [];
  if (r.cash > 0) {
    allocationByType.push({
      type: "cash",
      value: r.cash,
      pct: totalValue > 0 ? (r.cash / totalValue) * 100 : 0,
    });
  }
  for (const [type, value] of byType) {
    allocationByType.push({
      type,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    });
  }
  allocationByType.sort((a, b) => b.value - a.value);

  const bySector = new Map<string, number>();
  for (const p of r.positions) {
    if (p.securityType !== "stock") continue;
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.marketValue);
  }
  const sectorTotal = Array.from(bySector.values()).reduce((s, v) => s + v, 0);
  const allocationBySector = Array.from(bySector.entries())
    .map(([sector, value]) => ({
      sector,
      value,
      pct: sectorTotal > 0 ? (value / sectorTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const totalFees =
    r.totalFeesCourtage +
    r.totalFeesBrvm +
    r.totalFeesDcbr +
    r.totalFeesTps +
    r.totalFeesOther;

  return {
    account,
    cash: r.cash,
    totalDeposits: r.totalDeposits,
    totalWithdrawals: r.totalWithdrawals,
    totalDividends: r.totalDividends,
    totalFeesCourtage: r.totalFeesCourtage,
    totalFeesBrvm: r.totalFeesBrvm,
    totalFeesDcbr: r.totalFeesDcbr,
    totalFeesTps: r.totalFeesTps,
    totalFeesOther: r.totalFeesOther,
    totalFees,
    positions: r.positions,
    marketValue,
    totalValue,
    netInvested,
    realizedPL: r.realizedPL,
    unrealizedPL,
    totalReturnPct,
    allocationByType,
    allocationBySector,
  };
}

// =============================================================================
// COURBE D'EQUITY
// =============================================================================

export function buildEquityCurve(
  account: BrokerageAccount,
  transactions: BrokerageTransaction[],
  histories: Map<string, { date: string; value: number }[]>,
  endDate: string,
): EquityPoint[] {
  if (transactions.length === 0) return [];
  const txs = [...transactions].sort((a, b) => {
    const cmp = a.txnDate.localeCompare(b.txnDate);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const start = txs[0].txnDate;

  const startMs = new Date(start + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T00:00:00Z").getTime();
  const step = 1000 * 60 * 60 * 24 * 7;

  const dates: string[] = [];
  for (let t = startMs; t <= endMs; t += step) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  if (dates.length === 0 || dates[dates.length - 1] !== endDate) {
    dates.push(endDate);
  }

  const recurring = expandRecurringFees(account.recurringFees ?? [], endDate);

  function priceAt(code: string, date: string): number | null {
    const h = histories.get(code);
    if (!h || h.length === 0) return null;
    let last: number | null = null;
    for (const p of h) {
      if (p.date <= date) last = p.value;
      else break;
    }
    return last;
  }

  const points: EquityPoint[] = [];
  for (const d of dates) {
    let cash = 0;
    let netInvested = 0;
    const units = new Map<string, number>();
    const fallbackPrice = new Map<string, number>();
    const cost = new Map<string, number>();

    for (const t of txs) {
      if (t.txnDate > d) break;
      cash += num(t.netAmount);
      if (t.type === "deposit") netInvested += num(t.grossAmount);
      else if (t.type === "withdrawal") netInvested -= num(t.grossAmount);
      else if (t.type === "buy" && t.securityCode) {
        const q = num(t.quantity);
        const p = num(t.price);
        const f =
          num(t.feesCourtage) +
          num(t.feesBrvm) +
          num(t.feesDcbr) +
          num(t.feesTps) +
          num(t.feesOther);
        units.set(t.securityCode, (units.get(t.securityCode) ?? 0) + q);
        cost.set(t.securityCode, (cost.get(t.securityCode) ?? 0) + q * p + f);
        if (q > 0) fallbackPrice.set(t.securityCode, p);
      } else if (t.type === "sell" && t.securityCode) {
        const q = num(t.quantity);
        const cur = units.get(t.securityCode) ?? 0;
        const newUnits = cur - q;
        const curCost = cost.get(t.securityCode) ?? 0;
        if (cur > 0) {
          cost.set(t.securityCode, curCost * (Math.max(0, newUnits) / cur));
        }
        units.set(t.securityCode, newUnits);
      } else if (t.type === "split" && t.securityCode) {
        const ratio = num(t.quantity);
        if (ratio > 0) {
          const cur = units.get(t.securityCode) ?? 0;
          units.set(t.securityCode, cur * ratio);
        }
      }
    }

    // Frais recurrents jusqu'a la date courante
    for (const o of recurring) {
      if (o.date <= d) cash -= o.amount;
    }

    let mv = 0;
    for (const [code, u] of units) {
      if (u <= 1e-9) continue;
      const px =
        priceAt(code, d) ??
        fallbackPrice.get(code) ??
        (units.get(code)! > 0 ? (cost.get(code) ?? 0) / units.get(code)! : 0);
      mv += u * px;
    }
    points.push({ date: d, value: cash + mv, netInvested });
  }
  return points;
}
