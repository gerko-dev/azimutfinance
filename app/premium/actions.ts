"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidPlanCode } from "@/lib/premium/plans";

export type CheckoutState = { error?: string; info?: string } | null;

/**
 * Etape 1 du checkout : verifie l'auth, valide le plan, et redirige vers
 * /premium/paiement?plan=... ou l'utilisateur verra les numeros mobile money
 * a payer et le formulaire de declaration de paiement.
 */
export async function initCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const planCode = String(formData.get("plan") ?? "");

  if (!isValidPlanCode(planCode)) {
    return { error: "Plan invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/connexion?redirect=${encodeURIComponent(`/premium/paiement?plan=${planCode}`)}`);
  }

  redirect(`/premium/paiement?plan=${planCode}`);
}
