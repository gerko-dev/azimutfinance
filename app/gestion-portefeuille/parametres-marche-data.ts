import "server-only";

// === Paramètres des opérations de marché : lecture ===
//
// Une ligne par gérant, et pas de ligne du tout tant qu'il n'a rien
// configuré : l'absence vaut alors les conventions de place en vigueur.
// C'est préférable à une ligne créée d'office, qui figerait les défauts du
// jour de l'inscription et ne suivrait plus leurs révisions.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  PARAMETRES_DEFAUT,
  versParametres,
  type LigneParametresMarche,
  type ParametresMarche,
} from "./parametres-marche-types";

const COLS =
  "denouement_mfr_jours, denouement_mfr_base, denouement_mtp_jours, " +
  "denouement_mtp_base, taux_brvm, taux_dcbr";

/**
 * Paramètres du gérant courant, ou les conventions par défaut.
 *
 * Mémoïsé par requête : l'écran des opérations et la validation côté serveur
 * les lisent tous deux pendant le même rendu.
 */
export const chargerParametresMarche = cache(async (): Promise<ParametresMarche> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return PARAMETRES_DEFAUT;

  const { data, error } = await supabase
    .from("market_settings")
    .select(COLS)
    .eq("owner_id", user.id)
    .maybeSingle();

  // Une erreur rendue comme « pas de réglage » se lit exactement comme un
  // gérant qui n'a rien configuré. On la trace, faute de quoi un paramètre
  // enregistré mais illisible s'appliquerait en silence à sa valeur par
  // défaut, et les montants changeraient sans raison visible.
  if (error) {
    console.error("[gestion-portefeuille] chargerParametresMarche:", error.message);
    return PARAMETRES_DEFAUT;
  }
  return versParametres((data ?? null) as LigneParametresMarche | null);
});
