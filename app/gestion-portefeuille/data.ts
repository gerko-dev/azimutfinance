// Loaders serveur du module Fund management (lecture des fonds de
// l'utilisateur connecté via RLS). Ce n'est PAS un fichier "use server" :
// ce sont de simples fonctions appelées depuis des Server Components.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowToFundRecord, type FundRecord, type ManagedFundRow } from "./types";

const FUND_COLS =
  "id, nom, abreviation, categorie, type, vl_initiale, devise, objectif_perf, benchmark, ratios";

export async function loadMyFunds(): Promise<FundRecord[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("managed_funds")
    .select(FUND_COLS)
    .order("created_at", { ascending: true });

  // Une erreur renvoyee comme liste vide se lit a l'ecran comme « aucun fonds »,
  // ce qui est indiscernable d'un compte sans fonds. On la trace.
  if (error) {
    console.error("[gestion-portefeuille] loadMyFunds:", error.message, error.details ?? "");
    return [];
  }
  if (!data) return [];
  return (data as ManagedFundRow[]).map(rowToFundRecord);
}

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

  const { data, error } = await supabase
    .from("managed_funds")
    .select(FUND_COLS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

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
  return rowToFundRecord(data as ManagedFundRow);
}
