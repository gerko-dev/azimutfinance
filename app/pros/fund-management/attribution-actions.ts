"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import {
  BRVM_INDEX_CODES,
  loadIndexHistory,
  loadListedBonds,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { loadFunds } from "@/lib/fcp";
import { perfYTD } from "@/lib/fcpMath";
import { getSeries as tauxSeries, preloadTauxData } from "@/lib/tauxLoader";
import { loadLatestBalance } from "./balance-data";
import { loadCustomSecurities } from "./portfolio-data";
import { bondRefReturn } from "./bond-returns";

// Normalisation de nom de fonds (accents / ponctuation / FCP-SICAV ignorés).
const DIACRITICS = /[̀-ͯ]/g;
function normFundName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/\bfcp\b|\bsicav\b|\bfcpe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Une ligne d'attribution par classe d'actif.
export type AttributionRow = {
  classe: string; // "Actions" | "Obligations" | "OPCVM" | "DAT" | "Liquidité"
  poids: number; // % de l'actif
  performance: number | null; // %
  benchmark: number | null; // % (mapping standard)
  alpha: number | null; // performance − benchmark
};

// Ligne du tableau d'effet d'allocation (Brinson).
export type AllocationRow = {
  classe: string;
  valuation: number; // valorisation (FCFA)
  poids: number; // allocation actuelle (%)
  rbClass: number | null; // performance benchmark de la classe (%)
  wb: number; // allocation benchmark (%)
};

const INDEX_CODES = new Set<string>(BRVM_INDEX_CODES as readonly string[]);

// Classe d'actif visée par une référence de benchmark (pour les poids wb).
function refToClass(ref: string): string | null {
  const r = (ref ?? "").trim();
  if (INDEX_CODES.has(r)) return "action";
  if (
    r.startsWith("sovy:") ||
    r.startsWith("sovc:") ||
    r.startsWith("oblcote:") ||
    r.startsWith("obldefaut") ||
    r === "Rendement souverain UMOA-Titres" ||
    r === "Rendement souverain UMOA 3 ans" ||
    r === "Obligations cotées BRVM"
  )
    return "obligation";
  if (r === "Taux pension BCEAO") return "dat";
  return null; // inflation… non rattachés à une classe d'actif du portefeuille
}

type PosRow = { section: string; valuation: number | null };

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}
function atOrBefore<T extends { date: string }>(series: T[], d: string): T | null {
  let chosen: T | null = null;
  for (const p of series) {
    if (p.date <= d) chosen = p;
    else break;
  }
  return chosen;
}
function levelReturn(series: { date: string; value: number }[], d1: string, d2: string): number | null {
  const a = atOrBefore(series, d1);
  const b = atOrBefore(series, d2);
  return a && b && a.value > 0 ? (b.value / a.value - 1) * 100 : null;
}

const CLASS_LABEL: Record<string, string> = {
  action: "Actions",
  obligation: "Obligations",
  opcvm: "OPCVM",
  dat: "DAT",
  tresorerie: "Liquidité",
  autre: "Autres",
};
const CLASS_ORDER = ["action", "obligation", "opcvm", "dat", "tresorerie", "autre"];

async function positionsOf(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  snapshotId: string,
): Promise<PosRow[]> {
  const { data } = await supabase
    .from("fund_portfolio_positions")
    .select("section, valuation")
    .eq("snapshot_id", snapshotId);
  return (data ?? []) as PosRow[];
}

// Somme des valorisations par classe.
function sumByClass(positions: PosRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const p of positions) {
    acc[p.section] = (acc[p.section] ?? 0) + (p.valuation ?? 0);
  }
  return acc;
}

export async function computeAttributionAction(
  fundId: string,
): Promise<
  ActionResult<{
    rows: AttributionRow[];
    dateDebut: string | null;
    dateFin: string;
    source: "balance" | "inventaire";
    alloc: AllocationRow[]; // tableau d'effet d'allocation
    rbTotal: number | null; // performance du benchmark composite (Σ wb·Rb)
  }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // Valorisation par classe : TOUJOURS depuis l'inventaire de fin (poids ET
  // base de la performance). Le gain de période provient de la balance si elle
  // est importée ; sinon la performance est la variation début → fin.
  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, as_of_date, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0)
    return { ok: false, error: "Aucun inventaire enregistré pour ce fonds." };
  const list = snaps as { id: string; slot: string; as_of_date: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];
  const debutSnap = list.find((s) => s.slot === "debut") ?? null;
  const finPos = await positionsOf(supabase, finSnap.id);
  if (finPos.length === 0) return { ok: false, error: "Inventaire de fin vide." };
  const debutPos = debutSnap ? await positionsOf(supabase, debutSnap.id) : [];
  const finByClass = sumByClass(finPos);
  const debutByClass = sumByClass(debutPos);
  const dateFin = finSnap.as_of_date;

  const balance = await loadLatestBalance(fundId);
  const gainByClass = balance && balance.total > 0 ? (balance.gain as Record<string, number>) : null;
  const source: "balance" | "inventaire" = gainByClass ? "balance" : "inventaire";

  // Fenêtre du benchmark : balance → YTD (31/12/N-1 → fin) ; sinon début → fin.
  const dateDebut = gainByClass
    ? `${Number(dateFin.slice(0, 4)) - 1}-12-31`
    : (debutSnap?.as_of_date ?? null);

  // Benchmark : fenêtre dateDebut → dateFin (mapping standard par classe).
  const emissions = loadUmoaEmissions();
  const listedBonds = loadListedBonds();

  // Composantes du benchmark défini pour le fonds.
  const { data: fundRow } = await supabase
    .from("managed_funds")
    .select("benchmark")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  const comps = ((fundRow?.benchmark ?? []) as Array<{ weight: number | string; ref: string }>)
    .map((c) => ({ weight: Number(c.weight) || 0, ref: (c.ref ?? "").trim() }))
    .filter((c) => c.ref !== "" && c.weight > 0);

  // Poids du benchmark composite (wb) par classe (normalisé à 100).
  const wbByClass: Record<string, number> = {};
  let wbTot = 0;
  for (const c of comps) {
    const cls = refToClass(c.ref);
    if (!cls) continue;
    wbByClass[cls] = (wbByClass[cls] ?? 0) + c.weight;
    wbTot += c.weight;
  }
  if (wbTot > 0) for (const k of Object.keys(wbByClass)) wbByClass[k] = (wbByClass[k] / wbTot) * 100;

  // Benchmark obligataire = moyenne pondérée des composantes OBLIGATAIRES du
  // benchmark du fonds ; à défaut, rendement souverain UEMOA 5 ans.
  const obligationBenchmark = dateDebut
    ? (() => {
        const bond = comps.filter((c) => refToClass(c.ref) === "obligation");
        if (bond.length === 0)
          return bondRefReturn("sovy:UEMOA:5", dateDebut, dateFin, emissions, listedBonds);
        let num = 0;
        let w = 0;
        for (const c of bond) {
          const r = bondRefReturn(c.ref, dateDebut, dateFin, emissions, listedBonds);
          if (r != null) {
            num += c.weight * r;
            w += c.weight;
          }
        }
        return w > 0 ? num / w : null;
      })()
    : null;

  let bceaoRate: number | null = null;
  try {
    await preloadTauxData();
    const s = tauxSeries("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
    for (const p of s?.points ?? []) if (p.iso <= dateFin) bceaoRate = p.value;
  } catch {
    /* indisponible */
  }
  const benchDays = dateDebut ? daysBetween(dateDebut, dateFin) : 0;
  const accrual = (rateDecimal: number | null) =>
    rateDecimal == null || !dateDebut ? null : rateDecimal * (benchDays / 365) * 100;
  const brvmc = dateDebut ? levelReturn(loadIndexHistory("BRVMC"), dateDebut, dateFin) : null;

  // Benchmark OPCVM : moyenne des performances des FCP du MÊME TYPE (catégorie)
  // que les fonds détenus, pondérée par la répartition par type des OPCVM
  // détenus. Performance d'un FCP = perfYTD du site (même mode de calcul que la
  // page marches/fcp : VL au 31/12/N-1 → dernière VL disponible).
  const opcvmBenchmark = await (async (): Promise<number | null> => {
    const { data: opcvmPos } = await supabase
      .from("fund_portfolio_positions")
      .select("raw_label, match_id, match_kind, valuation, custom_security_id")
      .eq("snapshot_id", finSnap.id)
      .eq("section", "opcvm");
    const held = (opcvmPos ?? []) as {
      raw_label: string;
      match_id: string;
      match_kind: string;
      valuation: number | null;
      custom_security_id: string | null;
    }[];
    if (held.length === 0) return null;

    const funds = loadFunds();
    const customs = await loadCustomSecurities();
    const customById = new Map(customs.map((c) => [c.id, c]));

    // Performance moyenne du marché par CATÉGORIE (tous les FCP du site),
    // via perfYTD (calcul identique à /marches/fcp).
    const perfByCat = new Map<string, number[]>();
    for (const f of funds) {
      const p = perfYTD(f);
      if (!p.available) continue;
      if (!perfByCat.has(f.categorie)) perfByCat.set(f.categorie, []);
      perfByCat.get(f.categorie)!.push(p.totalReturn * 100);
    }
    const avgByCat = new Map<string, number>();
    for (const [cat, arr] of perfByCat)
      avgByCat.set(cat, arr.reduce((s, x) => s + x, 0) / arr.length);

    // Répartition des OPCVM détenus par catégorie.
    const catFor = (h: (typeof held)[number]): string | null => {
      if (h.match_kind === "fund") {
        const f = funds.find((x) => x.id === h.match_id);
        if (f) return f.categorie;
      }
      if (h.custom_security_id) {
        const c = customById.get(h.custom_security_id);
        const cat = c?.attributes?.categorie;
        if (cat) return cat;
      }
      const nn = normFundName(h.raw_label ?? "");
      const f = funds.find((x) => normFundName(x.nom) === nn || normFundName(x.nom).includes(nn));
      return f ? f.categorie : null;
    };

    let wBench = 0;
    let w = 0;
    for (const h of held) {
      const cat = catFor(h);
      const val = h.valuation ?? 0;
      if (!cat || val <= 0) continue;
      const avg = avgByCat.get(cat);
      if (avg == null) continue;
      wBench += val * avg;
      w += val;
    }
    return w > 0 ? wBench / w : null;
  })();

  const classBenchmark: Record<string, number | null> = {
    action: brvmc,
    obligation: obligationBenchmark,
    opcvm: opcvmBenchmark ?? brvmc, // FCP détenus ; repli BRVMC si BOC indispo
    dat: accrual(bceaoRate),
    tresorerie: dateDebut ? 0 : null,
    autre: null,
  };

  const totalFin = Object.values(finByClass).reduce((s, v) => s + v, 0) || 1;

  const rows: AttributionRow[] = [];
  for (const section of CLASS_ORDER) {
    const finVal = finByClass[section] ?? 0;
    const debutVal = debutByClass[section] ?? 0;
    if (finVal === 0 && debutVal === 0) continue;

    // Performance :
    //  - balance : gain de période de la classe / valorisation d'inventaire de
    //              DÉBUT (base = capital en début de période) ;
    //  - sinon   : variation de valorisation début → fin.
    const perf = gainByClass
      ? debutVal > 0 && gainByClass[section] != null
        ? (gainByClass[section] / debutVal) * 100
        : null
      : debutVal > 0
        ? (finVal / debutVal - 1) * 100
        : null;
    const bench = classBenchmark[section] ?? null;
    rows.push({
      classe: CLASS_LABEL[section] ?? section,
      poids: (finVal / totalFin) * 100,
      performance: perf,
      benchmark: bench,
      alpha: perf != null && bench != null ? perf - bench : null,
    });
  }

  // Performance du benchmark composite = Σ (wb · Rb_classe).
  let rbTotal: number | null = null;
  {
    let acc = 0;
    let covered = 0;
    for (const section of CLASS_ORDER) {
      const rb = classBenchmark[section];
      const wb = wbByClass[section] ?? 0;
      if (rb == null || wb === 0) continue;
      acc += (wb / 100) * rb;
      covered += wb;
    }
    if (covered > 0) rbTotal = acc;
  }

  const alloc: AllocationRow[] = [];
  for (const section of CLASS_ORDER) {
    const finVal = finByClass[section] ?? 0;
    const wb = wbByClass[section] ?? 0;
    if (finVal === 0 && wb === 0) continue;
    alloc.push({
      classe: CLASS_LABEL[section] ?? section,
      valuation: finVal,
      poids: (finVal / totalFin) * 100,
      rbClass: classBenchmark[section] ?? null,
      wb,
    });
  }

  return { ok: true, data: { rows, dateDebut, dateFin, source, alloc, rbTotal } };
}

// Détail des OPCVM détenus : performance propre de chaque FCP vs la moyenne de
// sa catégorie (peers), Alpha = perf fonds − perf benchmark. Perf = perfYTD du
// site (VL au 31/12/N-1 → dernière VL), identique à /marches/fcp.
export type OpcvmHoldingRow = {
  nom: string;
  categorie: string;
  perfFonds: number | null; // %
  perfBenchmark: number | null; // % (moyenne de la catégorie)
  alpha: number | null; // perfFonds − perfBenchmark
};

export async function computeOpcvmHoldingsAction(
  fundId: string,
): Promise<ActionResult<{ rows: OpcvmHoldingRow[] }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id, slot, created_at")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (!snaps || snaps.length === 0) return { ok: false, error: "Aucun inventaire enregistré." };
  const list = snaps as { id: string; slot: string }[];
  const finSnap = list.find((s) => s.slot === "fin") ?? list[0];

  const { data: opcvmPos } = await supabase
    .from("fund_portfolio_positions")
    .select("raw_label, match_id, match_kind, valuation, custom_security_id")
    .eq("snapshot_id", finSnap.id)
    .eq("section", "opcvm");
  const held = (opcvmPos ?? []) as {
    raw_label: string;
    match_id: string;
    match_kind: string;
    valuation: number | null;
    custom_security_id: string | null;
  }[];
  if (held.length === 0) return { ok: true, data: { rows: [] } };

  const funds = loadFunds();
  const customs = await loadCustomSecurities();
  const customById = new Map(customs.map((c) => [c.id, c]));

  // Perf par fonds + moyenne par catégorie (perfYTD, identique à /marches/fcp).
  const perfById = new Map<string, number>();
  const perfByCat = new Map<string, number[]>();
  for (const f of funds) {
    const p = perfYTD(f);
    if (!p.available) continue;
    const v = p.totalReturn * 100;
    perfById.set(f.id, v);
    if (!perfByCat.has(f.categorie)) perfByCat.set(f.categorie, []);
    perfByCat.get(f.categorie)!.push(v);
  }
  const avgByCat = new Map<string, number>();
  for (const [cat, arr] of perfByCat)
    avgByCat.set(cat, arr.reduce((s, x) => s + x, 0) / arr.length);

  const resolve = (h: (typeof held)[number]): { nom: string; categorie: string; perf: number | null } => {
    if (h.match_kind === "fund") {
      const f = funds.find((x) => x.id === h.match_id);
      if (f) return { nom: f.nom, categorie: f.categorie, perf: perfById.get(f.id) ?? null };
    }
    if (h.custom_security_id) {
      const c = customById.get(h.custom_security_id);
      if (c) return { nom: c.name, categorie: c.attributes?.categorie ?? "", perf: null };
    }
    const nn = normFundName(h.raw_label ?? "");
    const f = funds.find((x) => normFundName(x.nom) === nn || normFundName(x.nom).includes(nn));
    if (f) return { nom: f.nom, categorie: f.categorie, perf: perfById.get(f.id) ?? null };
    return { nom: h.raw_label || "?", categorie: "", perf: null };
  };

  const seen = new Set<string>();
  const rows: OpcvmHoldingRow[] = [];
  for (const h of held) {
    const r = resolve(h);
    const dedupKey = `${r.nom}|${r.categorie}`.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const perfBenchmark = r.categorie ? (avgByCat.get(r.categorie) ?? null) : null;
    const perfFonds = r.perf;
    const alpha =
      perfFonds != null && perfBenchmark != null ? perfFonds - perfBenchmark : null;
    rows.push({ nom: r.nom, categorie: r.categorie, perfFonds, perfBenchmark, alpha });
  }

  return { ok: true, data: { rows } };
}

// Détail des DAT détenus : performance et benchmark repris de la ligne « DAT »
// de l'attribution (dérivé côté client à partir de l'attribution déjà chargée +
// des libellés DAT renvoyés par le rééquilibrage — évite un 2e calcul lourd).
export type DatHoldingRow = {
  nom: string;
  performance: number | null; // %
  benchmark: number | null; // %
  alpha: number | null;
};

// Rééquilibrage : valorisation par classe à l'inventaire précédent (intermédiaire)
// et actuel (fin). L'allocation validée (cible stratégique) est saisie côté UI ;
// la valeur cible et le TRO en découlent.
const REBALANCE_CLASSES = ["Actions", "Obligations", "OPCVM", "DAT", "Liquidité"] as const;
const SECTION_TO_REBALANCE: Record<string, (typeof REBALANCE_CLASSES)[number]> = {
  action: "Actions",
  obligation: "Obligations",
  opcvm: "OPCVM",
  dat: "DAT",
  tresorerie: "Liquidité",
  autre: "Liquidité",
  cash: "Liquidité",
};

export type RebalanceRow = {
  classe: string;
  valeurPrecedente: number;
  valeurActuelle: number;
};

export async function computeRebalancingAction(fundId: string): Promise<
  ActionResult<{
    rows: RebalanceRow[];
    totalPrecedente: number;
    totalActuelle: number;
    datePrecedente: string | null;
    dateActuelle: string;
    datNames: string[]; // libellés des DAT de l'inventaire de fin (tableau DAT)
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
  // Précédent = inventaire intermédiaire (à défaut : début).
  const prevSnap =
    list.find((s) => s.slot === "intermediaire") ?? list.find((s) => s.slot === "debut") ?? null;

  const finPos = await positionsOf(supabase, finSnap.id);
  const prevPos = prevSnap ? await positionsOf(supabase, prevSnap.id) : [];

  // Libellés des DAT (pour le tableau DAT côté client, évite un 2e calcul lourd).
  const { data: datPosData } = await supabase
    .from("fund_portfolio_positions")
    .select("raw_label")
    .eq("snapshot_id", finSnap.id)
    .eq("section", "dat");
  const datNames = ((datPosData ?? []) as { raw_label: string }[]).map((d) => d.raw_label || "DAT");

  const byClass = (positions: PosRow[]): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const c of REBALANCE_CLASSES) acc[c] = 0;
    for (const p of positions) {
      const cls = SECTION_TO_REBALANCE[p.section] ?? "Liquidité";
      acc[cls] += p.valuation ?? 0;
    }
    return acc;
  };
  const actuelle = byClass(finPos);
  const precedente = byClass(prevPos);

  const rows: RebalanceRow[] = REBALANCE_CLASSES.map((c) => ({
    classe: c,
    valeurPrecedente: precedente[c] ?? 0,
    valeurActuelle: actuelle[c] ?? 0,
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
      datNames,
    },
  };
}

// Bundle : attribution + rééquilibrage + OPCVM en un seul aller-retour client
// (les trois s'exécutent en parallèle côté serveur).
export async function computeAnalysisBundleAction(fundId: string): Promise<{
  attr: Awaited<ReturnType<typeof computeAttributionAction>>;
  reb: Awaited<ReturnType<typeof computeRebalancingAction>>;
  opcvm: Awaited<ReturnType<typeof computeOpcvmHoldingsAction>>;
}> {
  const [attr, reb, opcvm] = await Promise.all([
    computeAttributionAction(fundId),
    computeRebalancingAction(fundId),
    computeOpcvmHoldingsAction(fundId),
  ]);
  return { attr, reb, opcvm };
}
