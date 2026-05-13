"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

export async function cancelMyPremiumAction(): Promise<
  ActionResult<{ subscriptionId: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data, error } = await supabase.rpc("cancel_my_premium");
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const subscriptionId =
    (row as { cancelled_subscription_id?: string } | null)
      ?.cancelled_subscription_id ?? "";

  revalidatePath("/compte");
  revalidatePath("/premium");
  return { ok: true, data: { subscriptionId } };
}
