"use server";

// === Proposition d'allocation — recalcul ===
//
// Lecture seule : rien n'est persisté, la proposition se recalcule à chaque
// changement de paramètre. La garde reste la même que partout ailleurs — une
// action serveur est un point d'entrée HTTP que la garde du layout ne couvre
// pas.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construireProposition } from "./proposition-data";
import type { ParametresProposition, TableauProposition } from "./proposition-types";

export async function chargerPropositionAction(
  fundId: string,
  parametres: Partial<ParametresProposition> = {},
): Promise<ActionResult<TableauProposition>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const { data: fonds } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fonds) return { ok: false, error: "Fonds introuvable." };

  try {
    return { ok: true, data: await construireProposition(fundId, parametres) };
  } catch (err) {
    console.error("[proposition] calcul", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec du calcul de la proposition.",
    };
  }
}
