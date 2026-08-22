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

  if (error || !data) return [];
  return (data as ManagedFundRow[]).map(rowToFundRecord);
}

export async function loadFundById(id: string): Promise<FundRecord | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("managed_funds")
    .select(FUND_COLS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToFundRecord(data as ManagedFundRow);
}
