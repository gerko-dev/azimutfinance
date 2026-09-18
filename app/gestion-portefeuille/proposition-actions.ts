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
import { construireAnticipations } from "./anticipation-data";
import { construireProposition } from "./proposition-data";
import type { ParametresProposition, TableauProposition } from "./proposition-types";

export async function chargerPropositionAction(
  fundId: string,
  parametres: Partial<ParametresProposition> = {},
  tresorerieAInvestir = 0,
): Promise<ActionResult<TableauProposition>> {
  // Les cibles sont recalculees ici plutot que transportees depuis le client :
  // un tableau d'anticipations envoye par le navigateur serait une entree non
  // verifiee dans un calcul d'allocation.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  // Les ratios voyagent avec le controle d'appartenance : la part maximale par
  // ligne en vient, et une requete de plus pour le meme fonds serait une
  // latence de plus a chaque recalcul.
  const { data: fonds } = await supabase
    .from("managed_funds")
    .select("id, ratios")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fonds) return { ok: false, error: "Fonds introuvable." };

  try {
    return {
      ok: true,
      data: await construireProposition(fundId, parametres, {
        ratios: (fonds as { ratios?: unknown }).ratios as never,
        tresorerieAInvestir,
        anticipations:
          parametres.methode && parametres.methode !== "medaf"
            ? await construireAnticipations(fundId, "")
            : null,
      }),
    };
  } catch (err) {
    console.error("[proposition] calcul", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec du calcul de la proposition.",
    };
  }
}
