import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/premium/plans";

export type AccessLevel = {
  isAuthenticated: boolean;
  userId: string | null;
  /** Role brut depuis profiles.role, sans verif temporelle. */
  rawRole: string | null;
  /** Premium time-aware : abonnement actif ET periode courante valide. */
  isPremium: boolean;
  /** Pro ou Admin (roles permanents, sans expiration). */
  isPro: boolean;
  /** Verite finale pour le gating : Premium OU Pro. */
  hasPremiumAccess: boolean;
  /** Niveau admin (1..3) ou null. */
  adminLevel: 1 | 2 | 3 | null;
  /** Plan courant si Premium time-valide. */
  plan: PlanCode | null;
  /** Date d'expiration si Premium time-valide. */
  premiumUntil: Date | null;
};

const EMPTY: AccessLevel = {
  isAuthenticated: false,
  userId: null,
  rawRole: null,
  isPremium: false,
  isPro: false,
  hasPremiumAccess: false,
  adminLevel: null,
  plan: null,
  premiumUntil: null,
};

/**
 * Helper combine — une seule passe DB pour recuperer toutes les infos
 * d'autorisation. A privilegier dans les pages qui font le gating Premium.
 *
 * Time-aware : isPremium ne se fie pas a profiles.role mais a la presence
 * d'une ligne dans subscriptions avec status='active' et current_period_end > now().
 */
export async function getAccess(): Promise<AccessLevel> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return EMPTY;

    const [{ data: profile }, { data: sub }, { data: lvl }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("plan, current_period_end")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("my_admin_level"),
    ]);

    const rawRole = (profile as { role?: string } | null)?.role ?? null;

    const periodEnd = (sub as { current_period_end?: string; plan?: PlanCode } | null)?.current_period_end;
    const subPlan = (sub as { plan?: PlanCode } | null)?.plan ?? null;
    const premiumUntil = periodEnd ? new Date(periodEnd) : null;
    const isPremium = premiumUntil ? premiumUntil.getTime() > Date.now() : false;

    const isPro =
      rawRole === "pro" ||
      (typeof rawRole === "string" && rawRole.startsWith("adminlevel"));

    const adminLevel =
      typeof lvl === "number" && (lvl === 1 || lvl === 2 || lvl === 3)
        ? (lvl as 1 | 2 | 3)
        : null;

    return {
      isAuthenticated: true,
      userId: user.id,
      rawRole,
      isPremium,
      isPro,
      hasPremiumAccess: isPremium || isPro,
      adminLevel,
      plan: isPremium ? subPlan : null,
      premiumUntil: isPremium ? premiumUntil : null,
    };
  } catch {
    return EMPTY;
  }
}
