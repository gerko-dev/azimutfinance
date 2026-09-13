// Loader serveur de l'historique VL / actif net (lecture via RLS).
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NavPoint } from "./nav-types";

type NavRow = {
  as_of_date: string;
  vl: number | null;
  nombre_parts: number | null;
  actif_net: number | null;
  actif_brut: number | null;
};

export async function loadNavHistory(fundId: string): Promise<NavPoint[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Supabase plafonne le nombre de lignes par requête (1000 par défaut) :
  // on pagine pour récupérer tout l'historique (plusieurs milliers de points).
  const PAGE = 1000;
  const all: NavRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fund_nav_history")
      .select("as_of_date, vl, nombre_parts, actif_net, actif_brut")
      .eq("fund_id", fundId)
      .order("as_of_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as NavRow[]));
    if (data.length < PAGE) break;
  }

  return all.map((r) => ({
    date: r.as_of_date,
    vl: r.vl,
    parts: r.nombre_parts,
    actifNet: r.actif_net,
    actifBrut: r.actif_brut,
  }));
}
