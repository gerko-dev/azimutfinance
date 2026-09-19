"use server";

// === Paramètres des opérations de marché — écriture ===

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import type { ParametresMarche } from "./parametres-marche-types";

export async function enregistrerParametresMarcheAction(
  p: ParametresMarche,
): Promise<ActionResult<{ ok: true }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  // ── Contrôles ───────────────────────────────────────────────────────────
  //
  // Un délai négatif n'a pas de sens, et au-delà d'un mois on est en face
  // d'une faute de frappe plutôt que d'une convention. Les taux sont des
  // DÉCIMAUX : un 0,3 saisi pour 0,3 % multiplierait la commission par cent
  // sur toutes les opérations à venir.
  for (const [libelle, c] of [
    ["marché financier", p.mfr],
    ["marché des titres publics", p.mtp],
  ] as const) {
    if (!Number.isInteger(c.jours) || c.jours < 0 || c.jours > 30) {
      return {
        ok: false,
        error: `Le délai du ${libelle} doit être un nombre entier de 0 à 30 jours.`,
      };
    }
    if (c.base !== "ouvres" && c.base !== "calendaires") {
      return { ok: false, error: `Base de comptage inconnue pour le ${libelle}.` };
    }
  }
  for (const [libelle, v] of [
    ["BRVM", p.tauxBrvm],
    ["DC/BR", p.tauxDcbr],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return {
        ok: false,
        error:
          `La commission ${libelle} doit être un décimal entre 0 et 1 ` +
          `(0,003 pour 0,3 %). Reçu : ${v}.`,
      };
    }
  }

  const { error } = await supabase.from("market_settings").upsert(
    {
      owner_id: user.id,
      denouement_mfr_jours: p.mfr.jours,
      denouement_mfr_base: p.mfr.base,
      denouement_mtp_jours: p.mtp.jours,
      denouement_mtp_base: p.mtp.base,
      taux_brvm: p.tauxBrvm,
      taux_dcbr: p.tauxDcbr,
    },
    { onConflict: "owner_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/parametres");
  revalidatePath("/gestion-portefeuille/operations-marche");
  return { ok: true, data: { ok: true } };
}
