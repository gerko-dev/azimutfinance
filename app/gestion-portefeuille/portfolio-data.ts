// Loaders serveur du module Portefeuille (lecture via RLS). Pas un fichier
// "use server" : simples fonctions appelées depuis des Server Components.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { referenceDuSite } from "./portfolio-match";
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

/**
 * Ligne persistée → position affichable.
 *
 * LE NOM AFFICHÉ EST CELUI DE L'INVENTAIRE. Le référentiel enregistre le
 * libellé tel que l'inventaire le nomme ; les deux coïncident donc, et le
 * gérant retrouve partout les noms qu'il emploie.
 *
 * Le nom officiel du site n'est pas perdu pour autant : il est conservé en
 * alias sur le titre, invisible mais actif au rapprochement — un export qui
 * emploierait un jour la dénomination officielle serait reconnu sans rien
 * ressaisir.
 *
 * Les CARACTÉRISTIQUES, elles, viennent bien du titre lié : coupon, échéance,
 * secteur, nominal. Le nom est une étiquette, pas une donnée de marché.
 */
function rowToSavedPosition(
  r: PositionRow,
  customParId: Map<string, CustomSecurity>,
): SavedPosition {
  const kind = (r.match_kind as MatchKind) ?? "unmatched";
  const matchId = r.match_id ?? "";

  const custom = r.custom_security_id ? customParId.get(r.custom_security_id) : undefined;
  const site = referenceDuSite(kind, matchId);
  // Le titre du référentiel porte le nom voulu. À défaut de titre local, on
  // laisse vide : l'écran retombe alors sur le libellé de l'inventaire, qui
  // est précisément ce qu'on veut voir.
  const nom = (custom?.name ?? "").trim();

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
    matchLabel: nom,
    matchHref: hrefForMatch(kind, matchId),
    customSecurityId: r.custom_security_id,
    matchCode: (custom?.code || site?.code || "").trim(),
    matchIsin: (custom?.isin || custom?.attributes?.isin || site?.isin || "").trim(),
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

  // Référentiel du compte, chargé UNE fois pour les trois inventaires : il
  // porte le nom affiché de chaque ligne rattachée.
  const customParId = new Map((await loadCustomSecurities()).map((c) => [c.id, c]));

  // Les trois inventaires se chargent DE FRONT. En file d'attente — un `for`
  // avec un `await` a l'interieur — chaque aller-retour attendait le precedent
  // pour interroger une table differente par un identifiant different : trois
  // latences payees l'une apres l'autre sans qu'aucune ne depende de la
  // suivante. Sur l'ecran d'allocation, ou changer d'axe recharge tout, cela se
  // voyait a chaque clic.
  const presents = (["debut", "intermediaire", "fin"] as PortfolioSlot[])
    .map((slot) => ({ slot, snap: bySlot.get(slot) }))
    .filter((x): x is { slot: PortfolioSlot; snap: SnapshotRow } => !!x.snap);

  const lignesParSlot = await Promise.all(
    presents.map(({ snap }) =>
      supabase
        .from("fund_portfolio_positions")
        .select(POSITION_COLS)
        .eq("snapshot_id", snap.id)
        .order("valuation", { ascending: false }),
    ),
  );

  return presents.map(({ slot, snap }, i) => ({
    id: snap.id,
    fundId: snap.fund_id,
    slot,
    asOfDate: snap.as_of_date,
    label: snap.label ?? "",
    totalValuation: Number(snap.total_valuation) || 0,
    createdAt: snap.created_at,
    positions: ((lignesParSlot[i].data ?? []) as PositionRow[]).map((r) =>
      rowToSavedPosition(r, customParId),
    ),
  }));
}
