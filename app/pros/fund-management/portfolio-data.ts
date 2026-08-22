// Loaders serveur du module Portefeuille (lecture via RLS). Pas un fichier
// "use server" : simples fonctions appelées depuis des Server Components.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hrefForMatch,
  type CustomSecurity,
  type MatchKind,
  type PortfolioSection,
  type PortfolioSlot,
  type PortfolioSnapshot,
  type SavedPosition,
} from "./portfolio-types";

type CustomSecurityRow = {
  id: string;
  kind: string;
  code: string;
  name: string;
  isin: string;
  currency: string;
  attributes: Record<string, string> | null;
};

function rowToCustomSecurity(r: CustomSecurityRow): CustomSecurity {
  return {
    id: r.id,
    kind: (r.kind as PortfolioSection) ?? "autre",
    code: r.code ?? "",
    name: r.name ?? "",
    isin: r.isin ?? "",
    currency: r.currency ?? "XOF",
    attributes: r.attributes ?? {},
  };
}

const CUSTOM_COLS = "id, kind, code, name, isin, currency, attributes";

export async function loadCustomSecurities(): Promise<CustomSecurity[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("custom_securities")
    .select(CUSTOM_COLS)
    .order("code", { ascending: true });

  if (error || !data) return [];
  return (data as CustomSecurityRow[]).map(rowToCustomSecurity);
}

type PositionRow = {
  id: string;
  section: string;
  raw_code: string;
  raw_label: string;
  quantity: number | null;
  pru: number | null;
  cost: number | null;
  price: number | null;
  accrued_interest: number | null;
  valuation: number | null;
  match_kind: string;
  match_id: string;
  custom_security_id: string | null;
};

// Le libellé/href du titre reconnu ne sont pas stockés : recalculés ici depuis
// match_kind + match_id (l'href) et raw_label (fallback libellé).
function rowToSavedPosition(r: PositionRow): SavedPosition {
  const kind = (r.match_kind as MatchKind) ?? "unmatched";
  const matchId = r.match_id ?? "";
  return {
    id: r.id,
    section: (r.section as PortfolioSection) ?? "autre",
    rawCode: r.raw_code ?? "",
    rawLabel: r.raw_label ?? "",
    quantity: r.quantity,
    pru: r.pru,
    cost: r.cost,
    price: r.price,
    accruedInterest: r.accrued_interest,
    valuation: r.valuation,
    matchKind: kind,
    matchId,
    matchLabel: "",
    matchHref: hrefForMatch(kind, matchId),
    customSecurityId: r.custom_security_id,
  };
}

const POSITION_COLS =
  "id, section, raw_code, raw_label, quantity, pru, cost, price, accrued_interest, valuation, match_kind, match_id, custom_security_id";

type SnapshotRow = {
  id: string;
  fund_id: string;
  slot: string;
  as_of_date: string;
  label: string;
  total_valuation: number;
  created_at: string;
};

// Les inventaires d'un fonds : le plus récent par slot (début / intermédiaire /
// fin), avec leurs positions. Renvoie 0 à 3 snapshots.
export async function loadFundPortfolios(fundId: string): Promise<PortfolioSnapshot[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: snaps, error } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, fund_id, slot, as_of_date, label, total_valuation, created_at")
    .eq("fund_id", fundId)
    .order("created_at", { ascending: false });

  if (error || !snaps || snaps.length === 0) return [];

  // Le plus récent par slot (tolère d'éventuels doublons hérités).
  const bySlot = new Map<string, SnapshotRow>();
  for (const s of snaps as SnapshotRow[]) {
    if (!bySlot.has(s.slot)) bySlot.set(s.slot, s);
  }

  const result: PortfolioSnapshot[] = [];
  for (const slot of ["debut", "intermediaire", "fin"] as PortfolioSlot[]) {
    const snap = bySlot.get(slot);
    if (!snap) continue;
    const { data: rows } = await supabase
      .from("fund_portfolio_positions")
      .select(POSITION_COLS)
      .eq("snapshot_id", snap.id)
      .order("valuation", { ascending: false });
    result.push({
      id: snap.id,
      fundId: snap.fund_id,
      slot,
      asOfDate: snap.as_of_date,
      label: snap.label ?? "",
      totalValuation: Number(snap.total_valuation) || 0,
      createdAt: snap.created_at,
      positions: ((rows ?? []) as PositionRow[]).map(rowToSavedPosition),
    });
  }
  return result;
}
