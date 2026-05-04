import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Actualite } from "./types";
import { STORAGE_BUCKET } from "./types";

/** Liste publiee, triee par published_at desc. Filtre optionnel par ticker. */
export async function listPublishedActualites(opts: {
  ticker?: string;
  limit?: number;
} = {}): Promise<Actualite[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("actualites")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.ticker) {
    q = q.eq("ticker", opts.ticker);
  }
  const { data } = await q;
  return (data as Actualite[] | null) ?? [];
}

export async function getActualite(id: string): Promise<Actualite | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("actualites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Actualite | null) ?? null;
}

/** Liste admin (incluant brouillons). */
export async function listAllActualites(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Actualite[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_actualites", {
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  return (data as Actualite[] | null) ?? [];
}

/** Construit une URL publique pour le download de la pièce jointe. */
export function attachmentPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}
