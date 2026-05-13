import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PricingPlanRow,
  PromoCodeRow,
  TrialConfigRow,
  UserTrialWithProfile,
} from "@/lib/admin/types";
import { PLAN_LIST, planFromRow, type Plan } from "@/lib/premium/plans";

export async function listPricingPlans(opts?: {
  includeInactive?: boolean;
}): Promise<PricingPlanRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("pricing_plans")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("price_fcfa", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data as PricingPlanRow[] | null) ?? [];
}

/**
 * Liste des plans actifs au format UI (Plan[]), prets pour /premium.
 * Fallback sur PLAN_LIST si la table est vide ou la requete echoue.
 */
export async function getDynamicPlanList(): Promise<Plan[]> {
  const rows = await listPricingPlans();
  if (rows.length === 0) return PLAN_LIST;
  return rows.map(planFromRow);
}

export async function getPricingPlan(code: string): Promise<PricingPlanRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("pricing_plans")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return (data as PricingPlanRow | null) ?? null;
}

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as PromoCodeRow[] | null) ?? [];
}

export async function listTrialConfigs(): Promise<TrialConfigRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("trial_configs")
    .select("*")
    .order("name", { ascending: true });
  return (data as TrialConfigRow[] | null) ?? [];
}

export async function listUserTrials(limit = 100): Promise<UserTrialWithProfile[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("user_trials")
    .select("*")
    .order("granted_at", { ascending: false })
    .limit(limit);
  const trials = (rows as UserTrialWithProfile[] | null) ?? [];
  if (trials.length === 0) return [];

  const userIds = Array.from(new Set(trials.map((t) => t.user_id)));
  const { data: profilesRaw } = await supabase
    .from("profiles")
    .select("id, email, username, full_name")
    .in("id", userIds);
  const byId = new Map<string, { email: string | null; username: string | null; full_name: string | null }>();
  for (const p of (profilesRaw ?? []) as { id: string; email: string | null; username: string | null; full_name: string | null }[]) {
    byId.set(p.id, { email: p.email, username: p.username, full_name: p.full_name });
  }

  return trials.map((t) => {
    const prof = byId.get(t.user_id);
    return {
      ...t,
      email: prof?.email ?? null,
      username: prof?.username ?? null,
      full_name: prof?.full_name ?? null,
    };
  });
}
