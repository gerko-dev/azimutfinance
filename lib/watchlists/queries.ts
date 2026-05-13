import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Watchlist,
  WatchlistItem,
  WatchlistWithCount,
  WatchlistWithItems,
} from "./types";

export async function listMyWatchlists(): Promise<WatchlistWithCount[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("watchlists")
    .select("id, user_id, name, description, sort_order, is_default, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const lists = (rows as Watchlist[] | null) ?? [];
  if (lists.length === 0) return [];

  // Compteur d'items par liste
  const { data: countsRaw } = await supabase
    .from("watchlist_items")
    .select("watchlist_id")
    .in(
      "watchlist_id",
      lists.map((l) => l.id),
    );
  const counts = new Map<string, number>();
  for (const r of (countsRaw ?? []) as { watchlist_id: string }[]) {
    counts.set(r.watchlist_id, (counts.get(r.watchlist_id) ?? 0) + 1);
  }
  return lists.map((l) => ({ ...l, item_count: counts.get(l.id) ?? 0 }));
}

export async function getMyWatchlist(id: string): Promise<WatchlistWithItems | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("watchlists")
    .select("id, user_id, name, description, sort_order, is_default, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return null;
  const wl = row as Watchlist;

  const { data: items } = await supabase
    .from("watchlist_items")
    .select("id, watchlist_id, target_type, target_code, target_label, note, added_at")
    .eq("watchlist_id", wl.id)
    .order("added_at", { ascending: false });

  return { ...wl, items: (items as WatchlistItem[] | null) ?? [] };
}

/** Vérifie sur un item (target_type+code) dans laquelle des watchlists de l'utilisateur il figure. */
export async function getWatchlistsContaining(
  targetType: string,
  targetCode: string,
): Promise<{ watchlist_id: string; watchlist_name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watchlist_items")
    .select("watchlist_id, watchlists!inner(id, user_id, name)")
    .eq("target_type", targetType)
    .eq("target_code", targetCode)
    .eq("watchlists.user_id", user.id);

  return (
    ((data as
      | { watchlist_id: string; watchlists: { name: string } }[]
      | null) ?? [])
      .map((r) => ({
        watchlist_id: r.watchlist_id,
        watchlist_name: r.watchlists.name,
      }))
  );
}
