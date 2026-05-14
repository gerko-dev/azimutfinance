"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeInitialPool,
  totalPoolUnits,
  totalPoolValue,
  type PoolEntry,
} from "./poolSnapshot";
import type { ActionResult } from "@/lib/admin/types";

const ERR: Record<string, string> = {
  NOT_AUTHORIZED: "Action réservée aux administrateurs L3+.",
  SEASON_NOT_FOUND: "Saison introuvable.",
  SEASON_ALREADY_OPENED: "Cette saison a déjà été ouverte.",
  EMPTY_POOL: "Aucune action éligible dans le pool (titres.csv vide ou pas de float/price).",
  NO_PARTICIPANTS:
    "Aucun joueur inscrit pour cette saison. Personne ne peut recevoir de capital initial.",
  INVALID_INTRO_WINDOW:
    "La fin de la Course doit être postérieure au début. Vérifie les deux timestamps.",
  INTRO_STILL_OPEN:
    "La fenêtre de la Course n'est pas encore terminée. Coche 'forcer la fin' pour clôturer prématurément.",
};

function translate(msg: string): string {
  for (const code of Object.keys(ERR)) {
    if (msg.includes(code)) return ERR[code];
  }
  return msg;
}

export type OpenSeasonResult = {
  initial_capital: number;
  participants: number;
  total_pool_value: number;
  total_pool_units: number;
  intro_start: string;
  intro_end: string;
};

export type CloseIntroResult = {
  orders_created: number;
  units_dumped: number;
  status: string;
  already_closed: boolean;
};

export type PoolPreview = {
  poolCount: number;
  totalUnits: number;
  totalValue: number;
  participants: number;
  estimatedCapitalPerParticipant: number | null;
  top: Array<{ code: string; units: number; value: number }>;
};

/**
 * Calcule un aperçu du pool de la Course à l'introduction sans rien écrire
 * en base. À afficher dans l'UI admin avant de cliquer sur "Lancer".
 */
export async function previewSeasonPoolAction(
  seasonId: string,
): Promise<ActionResult<PoolPreview>> {
  const pool = computeInitialPool();
  if (pool.length === 0) {
    return { ok: false, error: ERR.EMPTY_POOL };
  }
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("simulator_portfolios")
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId);
  if (error) {
    return { ok: false, error: error.message };
  }
  const participants = count ?? 0;
  const totalUnits = totalPoolUnits(pool);
  const totalValue = totalPoolValue(pool);
  const estimated = participants > 0 ? Math.floor(totalValue / participants) : null;

  const top = pool
    .map((e: PoolEntry) => ({ code: e.code, units: e.total_units, value: e.total_units * e.ref_price }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return {
    ok: true,
    data: {
      poolCount: pool.length,
      totalUnits,
      totalValue,
      participants,
      estimatedCapitalPerParticipant: estimated,
      top,
    },
  };
}

/**
 * Ouvre une saison en mode "Course à l'introduction" :
 *   1. Calcule le pool d'actions (titres.csv : code, float, price arrondi tick BRVM)
 *   2. Appelle la RPC simulator_open_season qui :
 *        - crée les rangs share_pool
 *        - calcule capital_initial = total_pool_value / nb_inscrits
 *        - crédite le cash sur chaque portefeuille
 *        - passe la saison en status='intro'
 *   3. Revalide les pages concernées
 *
 * Pré-requis :
 *   - L'utilisateur doit être admin L3+ (vérifié côté RPC)
 *   - La saison doit être en status='upcoming'
 *   - Les portefeuilles des inscrits doivent déjà exister (créés via joinSeason
 *     pendant la phase d'inscription préalable)
 */
export async function openSeasonAction(input: {
  seasonId: string;
  introStartAt: string; // ISO timestamptz
  introEndAt: string; // ISO timestamptz
}): Promise<ActionResult<OpenSeasonResult>> {
  const pool = computeInitialPool();
  if (pool.length === 0) {
    return { ok: false, error: ERR.EMPTY_POOL };
  }

  const startMs = Date.parse(input.introStartAt);
  const endMs = Date.parse(input.introEndAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return {
      ok: false,
      error: "Dates de la Course invalides. Format attendu : ISO timestamptz.",
    };
  }
  if (endMs <= startMs) {
    return { ok: false, error: ERR.INVALID_INTRO_WINDOW };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("simulator_open_season", {
    p_season_id: input.seasonId,
    p_pool: pool,
    p_intro_start_at: input.introStartAt,
    p_intro_end_at: input.introEndAt,
  });

  if (error) {
    return { ok: false, error: translate(error.message) };
  }

  revalidatePath("/academie/simulateur");
  revalidatePath("/admin/saisons");
  return { ok: true, data: data as OpenSeasonResult };
}

/**
 * Termine manuellement la Course à l'introduction :
 *   - dépose les remaining_units restants comme SELL LIMIT GTC sous le
 *     portfolio système (user_id NULL) ;
 *   - bascule le statut de la saison en 'active' (carnet d'ordres ouvert).
 *
 * Si `force=false` (défaut), la RPC refuse de fermer tant que NOW() est
 * antérieur à intro_phase_end_at. Avec `force=true`, on peut clôturer
 * prématurément (utile pour les tests ou si on a fait une erreur de date).
 */
export async function closeIntroPhaseAction(input: {
  seasonId: string;
  force?: boolean;
}): Promise<ActionResult<CloseIntroResult>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("simulator_close_intro_phase", {
    p_season_id: input.seasonId,
    p_force: input.force ?? false,
  });
  if (error) {
    return { ok: false, error: translate(error.message) };
  }
  revalidatePath("/academie/simulateur");
  revalidatePath("/admin/saisons");
  return { ok: true, data: data as CloseIntroResult };
}

/**
 * Met à jour le timestamp last_seen_at du portefeuille de l'utilisateur courant
 * pour la saison active. À appeler à chaque visite de la page ligue (côté
 * serveur via la layout / page principale).
 */
export async function pingLastSeenAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc("simulator_ping_last_seen");
}
