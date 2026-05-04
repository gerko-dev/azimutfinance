import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserRole = "member" | "premium" | "pro" | null;

/**
 * Recupere le role applicatif de l'utilisateur courant :
 * - null  : visiteur anonyme
 * - "member" / "premium" / "pro" : niveaux explicites
 * Les admins (adminlevel*) sont assimiles a "pro" pour la logique d'autorisation.
 */
export async function fetchUserRole(): Promise<UserRole> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (data as { role?: string } | null)?.role;
    if (role === "member" || role === "premium" || role === "pro") return role;
    if (typeof role === "string" && role.startsWith("adminlevel")) return "pro";
    return "member";
  } catch {
    return null;
  }
}
