"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import type { Watchlist, WatchlistTargetType } from "./types";
import { validateTarget } from "./validate";

function s(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createWatchlistAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const name = s(fd.get("name"));
  const description = s(fd.get("description"));
  if (!name) return { ok: false, error: "Nom requis." };
  if (name.length > 60)
    return { ok: false, error: "Nom trop long (60 caractères max)." };

  const { data, error } = await supabase
    .from("watchlists")
    .insert({
      user_id: user.id,
      name,
      description: description || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/watchlist");
  revalidatePath("/compte");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function renameWatchlistAction(
  fd: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const id = s(fd.get("id"));
  const name = s(fd.get("name"));
  const description = s(fd.get("description"));
  if (!id) return { ok: false, error: "Identifiant manquant." };
  if (!name) return { ok: false, error: "Nom requis." };

  const { error } = await supabase
    .from("watchlists")
    .update({ name, description: description || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/watchlist");
  return { ok: true, data: undefined };
}

export async function deleteWatchlistAction(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/watchlist");
  revalidatePath("/compte");
  return { ok: true, data: undefined };
}

export async function addToWatchlistAction(
  watchlistId: string,
  targetType: WatchlistTargetType,
  targetCode: string,
  targetLabel: string | null,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // Valide que la cible existe dans les datasets (sinon refuse)
  const check = validateTarget(targetType, targetCode);
  if (!check.ok) return { ok: false, error: check.error };

  // Verifier que la watchlist appartient au user
  const { data: wl } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wl) return { ok: false, error: "Liste introuvable." };

  const { error } = await supabase.from("watchlist_items").insert({
    watchlist_id: watchlistId,
    target_type: targetType,
    target_code: targetCode.toUpperCase(),
    target_label: targetLabel ?? check.label,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Déjà dans cette liste." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/outils/watchlist");
  return { ok: true, data: undefined };
}

export async function removeFromWatchlistAction(
  itemId: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // RLS s'occupe de la verif user
  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/watchlist");
  return { ok: true, data: undefined };
}

export async function updateItemNoteAction(
  itemId: string,
  note: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const trimmed = note.trim();
  if (trimmed.length > 280)
    return { ok: false, error: "Note trop longue (280 caractères max)." };

  const { error } = await supabase
    .from("watchlist_items")
    .update({ note: trimmed || null })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/watchlist");
  return { ok: true, data: undefined };
}

/**
 * Helper utilisé par le bouton ★ depuis une page détail : crée la 1ère
 * watchlist par défaut si l'utilisateur n'en a aucune, puis y ajoute l'item.
 */
export async function quickAddToDefaultWatchlistAction(
  targetType: WatchlistTargetType,
  targetCode: string,
  targetLabel: string | null,
): Promise<ActionResult<{ watchlistId: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // Valide la cible
  const check = validateTarget(targetType, targetCode);
  if (!check.ok) return { ok: false, error: check.error };
  const resolvedLabel = targetLabel ?? check.label;

  // Cherche une liste existante (par défaut sinon la plus ancienne)
  const { data: existing } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  let listId: string;
  const rows = (existing as { id: string }[] | null) ?? [];
  if (rows.length > 0) {
    listId = rows[0].id;
  } else {
    // Crée une liste par défaut "Ma watchlist"
    const { data: created, error } = await supabase
      .from("watchlists")
      .insert({
        user_id: user.id,
        name: "Ma watchlist",
        is_default: true,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Création impossible." };
    }
    listId = (created as { id: string }).id;
  }

  const { error: insertErr } = await supabase.from("watchlist_items").insert({
    watchlist_id: listId,
    target_type: targetType,
    target_code: targetCode.toUpperCase(),
    target_label: resolvedLabel,
  });
  if (insertErr) {
    if (insertErr.code === "23505")
      return { ok: false, error: "Déjà dans ta watchlist." };
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/outils/watchlist");
  return { ok: true, data: { watchlistId: listId } };
}

export type WatchlistOption = Pick<Watchlist, "id" | "name" | "is_default">;

export async function listMyWatchlistOptions(): Promise<WatchlistOption[]> {
  const { supabase, user } = await requireUser();
  if (!user) return [];
  const { data } = await supabase
    .from("watchlists")
    .select("id, name, is_default")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return (data as WatchlistOption[] | null) ?? [];
}
