"use server";

// === Opérations à réaliser — recalcul ===
//
// Lecture seule : aucune opération n'est persistée, le plan se recalcule à la
// demande. La garde est néanmoins la même que partout ailleurs — une action
// serveur est un point d'entrée HTTP à part entière, que la garde du layout ne
// protège pas.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construirePlanOperations } from "./operations-data";
import type { PlanOperations } from "./operations-types";

/**
 * Recalcule le plan d'opérations en tenant compte d'une trésorerie à investir.
 *
 * Sans ce recalcul, le montant saisi dans l'onglet Allocation validée élargit
 * l'assiette de CE tableau seulement : les opérations, rendues au serveur avec
 * une trésorerie nulle, continuaient d'arbitrer à actif net constant et ne
 * proposaient donc rien pour l'argent à placer.
 */
export async function chargerOperationsAction(
  fundId: string,
  tresorerieAInvestir = 0,
): Promise<ActionResult<PlanOperations>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  // La RLS le garantit deja, mais un controle explicite rend le message
  // lisible plutot qu'un plan vide sans explication.
  const { data: fonds } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fonds) return { ok: false, error: "Fonds introuvable." };

  try {
    const plan = await construirePlanOperations(fundId, tresorerieAInvestir);
    return { ok: true, data: plan };
  } catch (err) {
    console.error("[operations] chargement", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec du calcul des opérations.",
    };
  }
}
