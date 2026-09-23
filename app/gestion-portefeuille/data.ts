// Loaders serveur du module Fund management (lecture des fonds de
// l'utilisateur connecté via RLS). Ce n'est PAS un fichier "use server" :
// ce sont de simples fonctions appelées depuis des Server Components.
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowToFundRecord, type FundRecord, type ManagedFundRow } from "./types";
import { colonnesFonds, signalerColonneManquante } from "./fonds-colonnes";

// Les colonnes ne sont plus une constante : elles dépendent de l'état des
// migrations. Cf. `fonds-colonnes.ts` — une migration en retard ne doit pas
// éteindre le module.

/**
 * Fonds du gérant. MÉMOÏSÉ PAR REQUÊTE : la plupart des écrans du module
 * l'appellent, et l'écran de trésorerie le faisait lire deux fois — une pour
 * le tableau, une pour la grille de saisie. Chaque lecture coûte un
 * aller-retour, et la liste ne change pas pendant un rendu.
 */
export const loadMyFunds = cache(async (): Promise<FundRecord[]> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const lire = () =>
    supabase.from("managed_funds").select(colonnesFonds()).order("created_at", {
      ascending: true,
    });

  let { data, error } = await lire();
  // UNE COLONNE MANQUANTE FAIT TOMBER TOUTE LA REQUÊTE, et donc tout le
  // module : la liste vide se lisait « aucun fonds », et la trésorerie
  // annonçait « aucun inventaire » sur un portefeuille qui en comptait trois.
  // On réessaie sans la colonne que la migration n'a pas encore créée.
  if (error && signalerColonneManquante(error.message)) {
    ({ data, error } = await lire());
  }

  // Une erreur renvoyee comme liste vide se lit a l'ecran comme « aucun fonds »,
  // ce qui est indiscernable d'un compte sans fonds. On la trace.
  if (error) {
    console.error("[gestion-portefeuille] loadMyFunds:", error.message, error.details ?? "");
    return [];
  }
  if (!data) return [];
  return (data as unknown as ManagedFundRow[]).map(rowToFundRecord);
});

export async function loadFundById(id: string): Promise<FundRecord | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Sans session, l'appelant recevait un null indiscernable d'un fonds
  // inexistant — et affichait donc « Page introuvable » a un gerant dont le
  // cookie avait simplement expire. On trace.
  if (!user) {
    console.warn(`[gestion-portefeuille] loadFundById(${id}) : aucune session`);
    return null;
  }

  const lire = () =>
    supabase
      .from("managed_funds")
      .select(colonnesFonds())
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

  let { data, error } = await lire();
  if (error && signalerColonneManquante(error.message)) {
    ({ data, error } = await lire());
  }

  // Un fonds introuvable et une requete en echec produisent tous deux un 404
  // a l'ecran. Sans trace, impossible de les distinguer — et c'est pourtant
  // toute la difference entre « ce fonds n'existe pas » et « la base a
  // refuse la lecture ».
  if (error) {
    console.error(
      `[gestion-portefeuille] loadFundById(${id}) :`,
      error.message,
      error.details ?? "",
    );
    return null;
  }
  if (!data) {
    console.warn(
      `[gestion-portefeuille] loadFundById(${id}) : aucun fonds pour owner_id=${user.id}`,
    );
    return null;
  }
  return rowToFundRecord(data as unknown as ManagedFundRow);
}
