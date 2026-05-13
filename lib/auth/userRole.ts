import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserRole = "member" | "premium" | "pro" | null;

/**
 * Recupere le role applicatif de l'utilisateur courant :
 * - null  : visiteur anonyme
 * - "member" / "premium" / "pro" : niveaux explicites
 * Les admins (adminlevel*) sont assimiles a "pro" pour la logique d'autorisation.
 *
 * Time-aware : si profiles.role vaut 'premium' mais l'abonnement actif n'est
 * pas (ou plus) valide a l'instant T, on retourne 'member'. Inversement, si
 * profiles.role est encore 'member' (trigger pas declenche) mais qu'un
 * abonnement actif couvre now(), on retourne 'premium'.
 *
 * 'pro' et 'admin*' ne sont pas soumis a la verification temporelle (ce sont
 * des roles attribues manuellement par un admin, sans notion de durée).
 */
export async function fetchUserRole(): Promise<UserRole> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: sub }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const rawRole = (profile as { role?: string } | null)?.role;

    // Roles non soumis a la verif temporelle
    if (rawRole === "pro") return "pro";
    if (typeof rawRole === "string" && rawRole.startsWith("adminlevel")) return "pro";

    // Verif temporelle pour Premium
    const periodEnd = (sub as { current_period_end?: string } | null)?.current_period_end;
    const hasActiveSub = periodEnd ? new Date(periodEnd).getTime() > Date.now() : false;

    if (hasActiveSub) return "premium";
    if (rawRole === "member" || rawRole === "premium") return "member";
    return "member";
  } catch {
    return null;
  }
}
