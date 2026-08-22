"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import {
  BRVM_INDEX_CODES,
  loadIndexHistory,
  loadListedBonds,
  loadUmoaEmissions,
} from "@/lib/dataLoader";
import { getSeries as tauxSeries, preloadTauxData } from "@/lib/tauxLoader";
import { getSeries as macroSeries } from "@/lib/macroLoader";
import { bondRefReturn } from "./bond-returns";

// Performance d'un benchmark composite sur deux fenêtres (période + YTD).
export type BenchmarkResult = {
  periode: number | null; // %
  ytd: number | null; // %
  coveragePeriode: number; // part de poids résolue (0..1)
  coverageYtd: number;
  unresolved: string[]; // références sans série exploitable
  bceaoRate: number | null; // taux directeur BCEAO au plus proche <= date fin (%)
};

type Comp = { weight: number; ref: string };

// Valeur d'une série datée au plus proche <= date.
function levelAtOrBefore(series: { date: string; value: number }[], d: string): number | null {
  let chosen: number | null = null;
  for (const p of series) {
    if (p.date <= d) chosen = p.value;
    else break;
  }
  return chosen;
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

const INDEX_CODES = new Set<string>(BRVM_INDEX_CODES as readonly string[]);

// Séries de taux préchargées (partagées entre composantes) : valeur d'un taux
// (décimal) au plus proche <= date. Les points mensuels ont un `iso` "YYYY-MM".
type RatePoint = { iso: string; value: number };
function rateAtOrBefore(points: RatePoint[], d: string): number | null {
  let chosen: number | null = null;
  for (const p of points) {
    if (p.iso <= d) chosen = p.value;
    else break;
  }
  return chosen;
}

// Contexte de données préchargées pour le calcul des composantes.
type BenchCtx = {
  emissions: ReturnType<typeof loadUmoaEmissions>;
  bceao: RatePoint[]; // taux directeur (décimal)
  inflation: RatePoint[]; // inflation YoY (% → converti en décimal)
  listedBonds: ReturnType<typeof loadListedBonds>;
};

// Rendement d'une composante sur [d1,d2], en % — ou null si non résolvable.
function componentReturn(ref: string, d1: string, d2: string, ctx: BenchCtx): number | null {
  const days = daysBetween(d1, d2);
  const accrual = (rateDecimal: number | null) =>
    rateDecimal == null ? null : rateDecimal * (days / 365) * 100;

  // Indices actions BRVM (niveau de prix).
  if (INDEX_CODES.has(ref)) {
    const s = loadIndexHistory(ref);
    if (!s || s.length === 0) return null;
    const a = levelAtOrBefore(s, d1);
    const b = levelAtOrBefore(s, d2);
    return a && b && a > 0 ? (b / a - 1) * 100 : null;
  }

  // Taux directeur BCEAO : portage du taux sur la fenêtre.
  if (ref === "Taux pension BCEAO") return accrual(rateAtOrBefore(ctx.bceao, d2));

  // Inflation UEMOA (glissement annuel) : portage sur la fenêtre.
  if (ref === "Inflation UEMOA") return accrual(rateAtOrBefore(ctx.inflation, d2));

  // Composantes obligataires (souverains, taux faciaux, obligations cotées,
  // rendement par défaut) : logique partagée.
  return bondRefReturn(ref, d1, d2, ctx.emissions, ctx.listedBonds);
}

export async function computeBenchmarkAction(
  fundId: string,
  dateDebut: string,
  dateFin: string,
  ytdRef: string,
): Promise<ActionResult<BenchmarkResult>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("benchmark")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };

  const raw = (fund.benchmark ?? []) as Array<{ weight: number | string; ref: string }>;
  const comps: Comp[] = raw
    .map((c) => ({ weight: Number(c.weight) || 0, ref: (c.ref ?? "").trim() }))
    .filter((c) => c.ref !== "");
  if (comps.length === 0)
    return { ok: false, error: "Aucun benchmark défini pour ce fonds (voir Paramètres)." };

  // Préchargement des séries partagées (taux BCEAO, inflation, gisement coté).
  const emissions = loadUmoaEmissions();
  const listedBonds = loadListedBonds();
  let bceao: RatePoint[] = [];
  let inflation: RatePoint[] = [];
  try {
    await preloadTauxData();
    const s = tauxSeries("1_Taux_directeurs_BCEAO", "Taux minimum appels offres", "UEMOA");
    bceao = (s?.points ?? []).map((p) => ({ iso: p.iso, value: p.value }));
  } catch {
    /* série indisponible */
  }
  try {
    const rows = macroSeries(
      "UMOA",
      "Inflation",
      "Taux d'inflation en glissement annuel-Indice global",
    );
    // macro.csv exprime l'inflation en % → conversion en décimal.
    inflation = (rows ?? []).map((r) => ({ iso: r.iso, value: r.value / 100 }));
  } catch {
    /* série indisponible */
  }
  const ctx: BenchCtx = { emissions, bceao, inflation, listedBonds };

  const windowReturn = (d1: string, d2: string): { ret: number | null; coverage: number; unresolved: string[] } => {
    let num = 0;
    let wResolved = 0;
    let wTotal = 0;
    const unresolved: string[] = [];
    for (const c of comps) {
      wTotal += c.weight;
      const r = componentReturn(c.ref, d1, d2, ctx);
      if (r == null) {
        unresolved.push(c.ref);
        continue;
      }
      num += c.weight * r;
      wResolved += c.weight;
    }
    if (wResolved === 0) return { ret: null, coverage: 0, unresolved };
    // Renormalise sur les composantes résolues.
    return { ret: num / wResolved, coverage: wTotal > 0 ? wResolved / wTotal : 0, unresolved };
  };

  const p = windowReturn(dateDebut, dateFin);
  const y = windowReturn(ytdRef, dateFin);

  // Taux directeur BCEAO au plus proche <= date fin, en % (pour le taux sans
  // risque par défaut).
  const bceaoDec = rateAtOrBefore(bceao, dateFin);
  const bceaoRate = bceaoDec == null ? null : bceaoDec * 100;

  return {
    ok: true,
    data: {
      periode: p.ret,
      ytd: y.ret,
      coveragePeriode: p.coverage,
      coverageYtd: y.coverage,
      unresolved: [...new Set([...p.unresolved, ...y.unresolved])],
      bceaoRate,
    },
  };
}
