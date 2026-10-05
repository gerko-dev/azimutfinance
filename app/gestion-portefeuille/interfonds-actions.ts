"use server";

// === Opérations entre fonds — calcul à la demande ===
//
// Lecture seule : rien n'est persisté, le plan se recalcule au clic. La garde
// est la même que partout ailleurs — une action serveur est un point d'entrée
// HTTP à part entière, que la garde du layout ne protège pas.
//
// À LA DEMANDE, ET NON AU RENDU DE LA PAGE : l'appariement lit l'inventaire de
// TOUS les fonds gérés. Le calculer à chaque affichage ferait payer quinze
// chargements d'inventaire à qui n'ouvre qu'un portefeuille.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construireOperationsInterfonds } from "./interfonds-data";
import type { PlanInterfonds } from "./interfonds-types";

export async function chargerOperationsInterfondsAction(): Promise<
  ActionResult<PlanInterfonds>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  try {
    return { ok: true, data: await construireOperationsInterfonds() };
  } catch (err) {
    console.error("[interfonds] chargement", err);
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Échec du calcul des opérations entre fonds.",
    };
  }
}
