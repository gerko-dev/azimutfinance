"use server";

// === Sélection de titres — calcul à la demande ===
//
// Lecture seule : rien n'est persisté. La garde est la même que partout
// ailleurs — une action serveur est un point d'entrée HTTP à part entière, que
// la garde du layout ne protège pas.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construireTitresDetenus } from "./titres-detenus";
import type { InventaireTitres } from "./titres-detenus";

export async function chargerTitresDetenusAction(): Promise<
  ActionResult<InventaireTitres>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  try {
    return { ok: true, data: await construireTitresDetenus() };
  } catch (err) {
    console.error("[titres-detenus] chargement", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Échec de la lecture des titres.",
    };
  }
}
