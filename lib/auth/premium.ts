import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/premium/plans";

export type PremiumStatus = {
  isPremium: boolean;
  plan: PlanCode | null;
  premiumUntil: Date | null;
};

const EMPTY: PremiumStatus = {
  isPremium: false,
  plan: null,
  premiumUntil: null,
};

/**
 * Jours restants avant expiration de l'abonnement Premium.
 * Hors composant pour ne pas tomber sous la regle react-hooks/purity
 * (Date.now() est impur).
 */
export function daysUntil(date: Date | null): number {
  if (!date) return 0;
  return Math.max(
    0,
    Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

/**
 * Statut Premium de l'utilisateur courant, source de verite = table subscriptions.
 * On lit la derniere souscription 'active' et on verifie que current_period_end > now()
 * cote applicatif (au cas ou aucun cron de purge ne tourne).
 */
export async function getPremiumStatus(): Promise<PremiumStatus> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return EMPTY;

    const { data } = await supabase
      .from("subscriptions")
      .select("plan, current_period_end, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return EMPTY;

    const end = new Date(data.current_period_end as string);
    return {
      isPremium: end.getTime() > Date.now(),
      plan: data.plan as PlanCode,
      premiumUntil: end,
    };
  } catch {
    return EMPTY;
  }
}
