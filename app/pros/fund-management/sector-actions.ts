"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import {
  loadStocks,
  loadIndexHistory,
  loadPriceHistory,
  loadListedBonds,
  loadBonds,
} from "@/lib/dataLoader";
import { generateBondLifecycleEvents } from "@/lib/listedBondsTypes";
import { loadLatestBalance } from "./balance-data";

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

// Secteur BRVM → indice sectoriel correspondant.
const SECTOR_INDEX: Record<string, string> = {
  "Consommation discrétionnaire": "BRVM-CD",
  "Services financiers": "BRVM-SF",
  Industriels: "BRVM-IN",
  "Services Publics": "BRVM-SP",
  "Consommation de base": "BRVM-CB",
  Télécommunications: "BRVM-TEL",
  Énergie: "BRVM-EN",
};

export type SectorRow = {
  secteur: string;
  valuation: number; // valorisation actions du fonds dans le secteur (FCFA)
  wp: number; // poids secteur dans les actions du fonds (%)
  wb: number; // poids secteur dans le BRVM (capitalisation, %)
  rbSector: number | null; // performance de l'indice sectoriel BRVM (%)
  rpSector: number | null; // perf du fonds dans le secteur (cours pondérés, %)
};

function levelAtOrBefore(series: { date: string; value: number }[], d: string): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (p.date <= d) v = p.value;
    else break;
  }
  return v;
}
function seriesReturn(
  series: { date: string; value: number }[],
  d1: string,
  d2: string,
): number | null {
  if (!series || series.length === 0) return null;
  const a = levelAtOrBefore(series, d1);
  const b = levelAtOrBefore(series, d2);
  return a && b && a > 0 ? (b / a - 1) * 100 : null;
}
function idxReturn(code: string, d1: string, d2: string): number | null {
  return seriesReturn(loadIndexHistory(code), d1, d2);
}
function num(s: string): number {
  const n = Number(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function computeSectorAllocationAction(fundId: string): Promise<
  ActionResult<{ rows: SectorRow[]; rbActions: number | null; dateDebut: string | null; dateFin: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // Inventaire de fin + fenêtre (YTD si balance, sinon début → fin).
  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, as_of_date, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0)
    return { ok: false, error: "Aucun inventaire enregistré." };
  const list = snaps as { id: string; slot: string; as_of_date: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];
  const debutSnap = list.find((s) => s.slot === "debut") ?? null;
  const dateFin = finSnap.as_of_date;
  const balance = await loadLatestBalance(fundId);
  const dateDebut =
    balance && balance.total > 0
      ? `${Number(dateFin.slice(0, 4)) - 1}-12-31`
      : (debutSnap?.as_of_date ?? null);

  // Positions actions de l'inventaire de fin.
  const { data: posData } = await supabase
    .from("fund_portfolio_positions")
    .select("match_id, valuation")
    .eq("snapshot_id", finSnap.id)
    .eq("section", "action");
  const positions = (posData ?? []) as { match_id: string; valuation: number | null }[];

  const stocks = loadStocks();
  const sectorByCode = new Map<string, string>();
  const capByCode = new Map<string, number>();
  for (const s of stocks) {
    const code = (s.code ?? "").trim().toUpperCase();
    sectorByCode.set(code, (s.sector ?? "").trim());
    capByCode.set(code, num(s.capitalization));
  }

  // Poids BRVM (wb) = capitalisation du secteur / capitalisation totale.
  const capBySector: Record<string, number> = {};
  let capTotal = 0;
  for (const s of stocks) {
    const sec = (s.sector ?? "").trim();
    if (!sec) continue;
    const cap = num(s.capitalization);
    capBySector[sec] = (capBySector[sec] ?? 0) + cap;
    capTotal += cap;
  }

  // Rendement d'une action (cours du site) sur la fenêtre.
  const stockReturn = (code: string): number | null => {
    if (!dateDebut) return null;
    return seriesReturn(loadPriceHistory(code), dateDebut, dateFin);
  };

  // Valorisation par secteur + rendement du fonds par secteur (pondéré par la
  // valorisation des lignes détenues, via les cours de marché).
  const valBySector: Record<string, number> = {};
  const rpNum: Record<string, number> = {};
  const rpDen: Record<string, number> = {};
  let totalActions = 0;
  for (const p of positions) {
    const code = (p.match_id ?? "").trim().toUpperCase();
    const sec = sectorByCode.get(code) ?? "Autres";
    const v = p.valuation ?? 0;
    valBySector[sec] = (valBySector[sec] ?? 0) + v;
    totalActions += v;
    const ret = stockReturn(code);
    if (ret != null && v > 0) {
      rpNum[sec] = (rpNum[sec] ?? 0) + v * ret;
      rpDen[sec] = (rpDen[sec] ?? 0) + v;
    }
  }
  const base = totalActions || 1;

  // Secteurs présents (dans le fonds ou avec poids BRVM), triés par valo desc.
  const secteurs = Object.keys(SECTOR_INDEX).filter(
    (s) => (valBySector[s] ?? 0) > 0 || (capBySector[s] ?? 0) > 0,
  );

  const rows: SectorRow[] = secteurs
    .map((sec) => ({
      secteur: sec,
      valuation: valBySector[sec] ?? 0,
      wp: ((valBySector[sec] ?? 0) / base) * 100,
      wb: capTotal > 0 ? ((capBySector[sec] ?? 0) / capTotal) * 100 : 0,
      rbSector: dateDebut ? idxReturn(SECTOR_INDEX[sec], dateDebut, dateFin) : null,
      rpSector: (rpDen[sec] ?? 0) > 0 ? rpNum[sec] / rpDen[sec] : null,
    }))
    .sort((a, b) => b.valuation - a.valuation);

  const rbActions = dateDebut ? idxReturn("BRVMC", dateDebut, dateFin) : null;

  return { ok: true, data: { rows, rbActions, dateDebut, dateFin } };
}

// Top actions par contribution à l'évolution du portefeuille actions sur la
// PÉRIODE (inventaire intermédiaire → inventaire fin), via la variation de cours.
export type TopStockRow = {
  nom: string;
  poids: number; // % des actions du fonds (valorisation fin)
  varPct: number | null; // variation de cours sur la période (%)
  varMontant: number | null; // gain de valeur lié au cours (FCFA)
  contribution: number | null; // part dans l'évolution totale des actions (%)
};

export type TopFlopSet = {
  top: TopStockRow[];
  flop: TopStockRow[];
  totalTop: number; // Σ PMV positives
  totalFlop: number; // Σ PMV négatives
};

// Consolidé : Top ET Flop, période ET YTD, en une seule passe (un seul aller
// serveur, positions et cours chargés une fois).
export async function computeTopFlopStocksAction(
  fundId: string,
  limit = 10,
): Promise<
  ActionResult<{ periode: TopFlopSet; ytd: TopFlopSet; datePeriode: string | null; dateFin: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, as_of_date, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0) return { ok: false, error: "Aucun inventaire enregistré." };
  const list = snaps as { id: string; slot: string; as_of_date: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];
  const dateFin = finSnap.as_of_date;
  const startSnap = list.find((s) => s.slot === "intermediaire") ?? list.find((s) => s.slot === "debut") ?? null;
  const datePeriode = startSnap?.as_of_date ?? null;
  const dateYtd = `${Number(dateFin.slice(0, 4)) - 1}-12-31`;

  const { data: posData } = await supabase
    .from("fund_portfolio_positions")
    .select("match_id, raw_label, valuation")
    .eq("snapshot_id", finSnap.id)
    .eq("section", "action");
  const positions = (posData ?? []) as {
    match_id: string;
    raw_label: string;
    valuation: number | null;
  }[];

  const stocks = loadStocks();
  const nameByCode = new Map(stocks.map((s) => [(s.code ?? "").trim().toUpperCase(), (s.name ?? "").trim()]));
  const totalVal = positions.reduce((s, p) => s + (p.valuation ?? 0), 0) || 1;

  const buildSet = (dateDebut: string | null): TopFlopSet => {
    const computed = positions.map((p) => {
      const code = (p.match_id ?? "").trim().toUpperCase();
      const val = p.valuation ?? 0;
      const varPct = dateDebut ? seriesReturn(loadPriceHistory(code), dateDebut, dateFin) : null;
      let varMontant: number | null = null;
      if (varPct != null && val > 0) {
        const r = varPct / 100;
        varMontant = 1 + r !== 0 ? (val * r) / (1 + r) : null;
      }
      return { nom: nameByCode.get(code) || p.raw_label || code, poids: (val / totalVal) * 100, varPct, varMontant };
    });
    const totalTop = computed.reduce((s, c) => s + Math.max(c.varMontant ?? 0, 0), 0);
    const totalFlop = computed.reduce((s, c) => s + Math.min(c.varMontant ?? 0, 0), 0);
    const slice = (mode: "top" | "flop"): TopStockRow[] => {
      const base = mode === "flop" ? totalFlop : totalTop;
      return computed
        .filter((c) => (mode === "flop" ? (c.varMontant ?? 0) < 0 : (c.varMontant ?? 0) > 0))
        .sort((a, b) =>
          mode === "flop"
            ? (a.varMontant ?? 0) - (b.varMontant ?? 0)
            : (b.varMontant ?? 0) - (a.varMontant ?? 0),
        )
        .slice(0, limit)
        .map((c) => ({ ...c, contribution: base !== 0 ? ((c.varMontant ?? 0) / base) * 100 : null }));
    };
    return { top: slice("top"), flop: slice("flop"), totalTop, totalFlop };
  };

  return {
    ok: true,
    data: { periode: buildSet(datePeriode), ytd: buildSet(dateYtd), datePeriode, dateFin },
  };
}

// Top/Flop des obligations par variation de valeur sur la PÉRIODE (inventaire
// intermédiaire → fin), à partir des prix de valorisation de l'inventaire.
// Décote = gain d'un titre valorisé au coût amorti (souverain non coté) ; PMV =
// gain de marché (obligation cotée). PMV = Var Montant − Décote.
export type BondRow = {
  nom: string;
  poids: number; // % des obligations du fonds (valorisation fin)
  varPct: number | null; // variation du prix de valorisation sur la période (%)
  varMontant: number | null; // variation de valeur (FCFA)
  decote: number; // part coût amorti (souverain non coté)
  pmv: number; // part marché (Var Montant − Décote)
};

export type BondTotals = { varMontant: number; decote: number; pmv: number };
export type BondTopFlopSet = {
  top: BondRow[];
  flop: BondRow[];
  totalsTop: BondTotals;
  totalsFlop: BondTotals;
};

// Consolidé : Top ET Flop, période ET YTD, en une seule passe.
export async function computeTopFlopBondsAction(
  fundId: string,
  limit = 10,
): Promise<
  ActionResult<{
    periode: BondTopFlopSet;
    ytd: BondTopFlopSet;
    datePeriode: string | null;
    dateFin: string;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, as_of_date, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0) return { ok: false, error: "Aucun inventaire enregistré." };
  const list = snaps as { id: string; slot: string; as_of_date: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];
  const dateFin = finSnap.as_of_date;
  const interSnap = list.find((s) => s.slot === "intermediaire") ?? null;
  const debutSnap = list.find((s) => s.slot === "debut") ?? null;
  const periodeSnap = interSnap ?? debutSnap;

  type PosRow = {
    match_kind: string;
    match_id: string;
    raw_code: string;
    raw_label: string;
    quantity: number | null;
    pru: number | null;
    price: number | null;
    valuation: number | null;
  };
  const loadBondPositions = async (snapId: string): Promise<PosRow[]> => {
    const { data } = await supabase
      .from("fund_portfolio_positions")
      .select("match_kind, match_id, raw_code, raw_label, quantity, pru, price, valuation")
      .eq("snapshot_id", snapId)
      .eq("section", "obligation");
    return (data ?? []) as PosRow[];
  };

  // Charge les positions des 3 inventaires en une fois (fin + les 2 starts).
  const [finPos, interPos, debutPos] = await Promise.all([
    loadBondPositions(finSnap.id),
    interSnap ? loadBondPositions(interSnap.id) : Promise.resolve([] as PosRow[]),
    debutSnap ? loadBondPositions(debutSnap.id) : Promise.resolve([] as PosRow[]),
  ]);

  const key = (p: PosRow) => (p.match_id || p.raw_code || p.raw_label || "").trim().toUpperCase();
  const priceMap = (pos: PosRow[]) => {
    const m = new Map<string, number | null>();
    for (const p of pos) m.set(key(p), p.price);
    return m;
  };

  // Données de marché partagées (chargées une fois).
  const bonds = loadListedBonds();
  const bondByRef = new Map<string, (typeof bonds)[number]>();
  for (const b of bonds) {
    if (b.isin) bondByRef.set(b.isin.trim().toUpperCase(), b);
    if (b.code) bondByRef.set(b.code.trim().toUpperCase(), b);
  }
  const residualNominalAt = (bond: (typeof bonds)[number], d: string): number => {
    let n = bond.nominalValue;
    const events = generateBondLifecycleEvents(bond)
      .filter((e) => e.eventType === "amortissement" || e.eventType === "remboursement")
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const e of events) if (e.date <= d) n = e.outstandingAfter;
    return n;
  };
  const matByIsin = new Map<string, string>();
  for (const b of loadBonds()) if (b.isin) matByIsin.set(b.isin.trim().toUpperCase(), b.maturityDate);

  const totalVal = finPos.reduce((s, p) => s + (p.valuation ?? 0), 0) || 1;

  const buildSet = (startPos: PosRow[], dateDebut: string | null): BondTopFlopSet => {
    const startPrice = priceMap(startPos);
    const periodDays = dateDebut ? daysBetween(dateDebut, dateFin) : 0;
    const computed = finPos.map((p) => {
      const val = p.valuation ?? 0;
      const qty = p.quantity ?? 0;
      const coursFin = p.price;
      const isCoutAmorti = p.match_kind === "sovereign";
      let varPct: number | null = null;
      let varMontant: number | null = null;
      let decote = 0;
      let pmv = 0;

      if (isCoutAmorti) {
        // Non coté : cours au pair → accrétion du coût amorti (PRU → pair).
        const pair = coursFin ?? 10000;
        const pru = p.pru;
        const mat = matByIsin.get((p.match_id || p.raw_code).trim().toUpperCase());
        varPct = 0; // le cours ne bouge pas
        if (pru != null && pru > 0 && mat && dateDebut && periodDays > 0) {
          const remain = daysBetween(dateDebut, mat);
          if (remain > 0) {
            decote = qty * (pair - pru) * (periodDays / remain);
            varMontant = decote;
          }
        }
      } else {
        // Coté : mouvement de marché. Début = inventaire, sinon PRU.
        const held = startPrice.has(key(p));
        let coursDebut = held ? (startPrice.get(key(p)) ?? null) : p.pru;
        const bond = bondByRef.get((p.match_id || p.raw_code).trim().toUpperCase());
        if (bond && bond.amortizationMode === "N" && dateDebut && coursDebut != null) {
          const nDeb = residualNominalAt(bond, dateDebut);
          const nFin = residualNominalAt(bond, dateFin);
          if (nDeb > 0 && nFin > 0) coursDebut = coursDebut * (nFin / nDeb);
        }
        if (coursFin != null && coursDebut != null && coursDebut > 0) {
          varPct = (coursFin / coursDebut - 1) * 100;
          varMontant = qty * (coursFin - coursDebut);
          pmv = varMontant;
        }
      }
      return {
        nom: p.raw_label || p.match_id || p.raw_code,
        poids: (val / totalVal) * 100,
        varPct,
        varMontant,
        decote,
        pmv,
      };
    });

    const sliceAndTotal = (mode: "top" | "flop"): { rows: BondRow[]; totals: BondTotals } => {
      const rows = computed
        .filter((c) => (mode === "flop" ? (c.varMontant ?? 0) < 0 : (c.varMontant ?? 0) > 0))
        .sort((a, b) =>
          mode === "flop"
            ? (a.varMontant ?? 0) - (b.varMontant ?? 0)
            : (b.varMontant ?? 0) - (a.varMontant ?? 0),
        )
        .slice(0, limit);
      const totals = rows.reduce(
        (acc, r) => ({
          varMontant: acc.varMontant + (r.varMontant ?? 0),
          decote: acc.decote + r.decote,
          pmv: acc.pmv + r.pmv,
        }),
        { varMontant: 0, decote: 0, pmv: 0 },
      );
      return { rows, totals };
    };
    const t = sliceAndTotal("top");
    const f = sliceAndTotal("flop");
    return { top: t.rows, flop: f.rows, totalsTop: t.totals, totalsFlop: f.totals };
  };

  const periodePositions = interSnap ? interPos : debutPos;
  return {
    ok: true,
    data: {
      periode: buildSet(periodePositions, periodeSnap?.as_of_date ?? null),
      ytd: buildSet(debutPos, debutSnap?.as_of_date ?? null),
      datePeriode: periodeSnap?.as_of_date ?? null,
      dateFin,
    },
  };
}

// Rééquilibrage sectoriel de la classe Actions : valorisation par secteur BRVM à
// l'inventaire précédent (intermédiaire) et actuel (fin). Même logique que le
// rééquilibrage par classe, restreint aux positions actions.
const SECTOR_ORDER = [
  "Industriels",
  "Consommation discrétionnaire",
  "Consommation de base",
  "Énergie",
  "Services Publics",
  "Télécommunications",
  "Services financiers",
];

export type SectorRebalanceRow = {
  classe: string; // libellé du secteur (réutilise le champ `classe` de RebalanceRow)
  valeurPrecedente: number;
  valeurActuelle: number;
};

export async function computeSectorRebalancingAction(fundId: string): Promise<
  ActionResult<{
    rows: SectorRebalanceRow[];
    totalPrecedente: number;
    totalActuelle: number;
    datePrecedente: string | null;
    dateActuelle: string;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, as_of_date, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0) return { ok: false, error: "Aucun inventaire enregistré." };
  const list = snaps as { id: string; slot: string; as_of_date: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];
  const prevSnap =
    list.find((s) => s.slot === "intermediaire") ?? list.find((s) => s.slot === "debut") ?? null;

  const loadActionPos = async (snapId: string) => {
    const { data } = await supabase
      .from("fund_portfolio_positions")
      .select("match_id, valuation")
      .eq("snapshot_id", snapId)
      .eq("section", "action");
    return (data ?? []) as { match_id: string; valuation: number | null }[];
  };
  const finPos = await loadActionPos(finSnap.id);
  const prevPos = prevSnap ? await loadActionPos(prevSnap.id) : [];

  const sectorByCode = new Map<string, string>();
  for (const s of loadStocks())
    sectorByCode.set((s.code ?? "").trim().toUpperCase(), (s.sector ?? "").trim());

  const bySector = (positions: { match_id: string; valuation: number | null }[]) => {
    const acc: Record<string, number> = {};
    for (const p of positions) {
      const sec = sectorByCode.get((p.match_id ?? "").trim().toUpperCase()) || "Autres";
      acc[sec] = (acc[sec] ?? 0) + (p.valuation ?? 0);
    }
    return acc;
  };
  const actuelle = bySector(finPos);
  const precedente = bySector(prevPos);

  // Secteurs connus (ordre canonique) présents dans l'un des inventaires, puis
  // « Autres » si résiduel — pour que le total colle à la classe Actions.
  const secteurs = [...SECTOR_ORDER, "Autres"].filter(
    (sec) => (actuelle[sec] ?? 0) > 0 || (precedente[sec] ?? 0) > 0,
  );
  const rows: SectorRebalanceRow[] = secteurs.map((sec) => ({
    classe: sec,
    valeurPrecedente: precedente[sec] ?? 0,
    valeurActuelle: actuelle[sec] ?? 0,
  }));
  const totalActuelle = rows.reduce((s, r) => s + r.valeurActuelle, 0);
  const totalPrecedente = rows.reduce((s, r) => s + r.valeurPrecedente, 0);

  return {
    ok: true,
    data: {
      rows,
      totalPrecedente,
      totalActuelle,
      datePrecedente: prevSnap?.as_of_date ?? null,
      dateActuelle: finSnap.as_of_date,
    },
  };
}
