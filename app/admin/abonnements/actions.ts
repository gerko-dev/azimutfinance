"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type { ActionResult } from "@/lib/admin/types";
import { sendEmail } from "@/lib/email/resend";
import {
  premiumValidatedEmail,
  premiumRejectedEmail,
} from "@/lib/email/templates";
import type { PlanCode } from "@/lib/premium/plans";

async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 2) return { ok: false, error: "Niveau d'administration insuffisant (L2+ requis)." };
  return { ok: true };
}

async function ensureAdmin1(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 1)
    return { ok: false, error: "Réservé aux super-administrateurs (L1)." };
  return { ok: true };
}

type PendingForEmail = {
  user_id: string;
  plan: PlanCode;
  amount_fcfa: number;
};

type ProfileForEmail = {
  email: string | null;
  full_name: string | null;
};

async function fetchPendingForEmail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  pendingId: string,
): Promise<{ pending: PendingForEmail; profile: ProfileForEmail } | null> {
  const { data: pending } = await supabase
    .from("pending_payments")
    .select("user_id, plan, amount_fcfa")
    .eq("id", pendingId)
    .maybeSingle();
  if (!pending) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", (pending as PendingForEmail).user_id)
    .maybeSingle();

  return {
    pending: pending as PendingForEmail,
    profile: (profile as ProfileForEmail) ?? { email: null, full_name: null },
  };
}

export async function validatePendingPaymentAction(
  formData: FormData,
): Promise<ActionResult<{ premiumUntil: string }>> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const pendingId = String(formData.get("pending_id") ?? "").trim();
  if (!pendingId) return { ok: false, error: "Identifiant manquant." };

  const supabase = await createSupabaseServerClient();

  // On lit le pending AVANT l'appel RPC pour avoir email/nom — apres l'update
  // la row est "validated" mais on peut toujours la relire.
  const ctx = await fetchPendingForEmail(supabase, pendingId);

  const { data, error } = await supabase.rpc("admin_validate_pending_payment", {
    p_pending_id: pendingId,
  });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const premiumUntil = (row as { premium_until?: string } | null)?.premium_until ?? "";

  // Envoi email — n'echoue pas l'action si Resend rate
  if (ctx && ctx.profile.email && premiumUntil) {
    const email = await premiumValidatedEmail({
      fullName: ctx.profile.full_name,
      plan: ctx.pending.plan,
      amountFcfa: ctx.pending.amount_fcfa,
      premiumUntil: new Date(premiumUntil),
    });
    const send = await sendEmail({
      to: ctx.profile.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: "contact@azimutfinance.com",
    });
    if (!send.ok && !send.skipped) {
      console.error("[abonnements] Email validation rate:", send.error);
    }
  }

  revalidatePath("/admin/abonnements");
  return { ok: true, data: { premiumUntil } };
}

export async function adminCancelSubscriptionAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!subscriptionId)
    return { ok: false, error: "Identifiant d'abonnement manquant." };
  if (!reason) return { ok: false, error: "Motif d'annulation requis." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_cancel_subscription", {
    p_subscription_id: subscriptionId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/abonnements");
  return { ok: true, data: undefined };
}

export async function rejectPendingPaymentAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const pendingId = String(formData.get("pending_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!pendingId) return { ok: false, error: "Identifiant manquant." };
  if (!reason) return { ok: false, error: "Motif de rejet requis." };

  const supabase = await createSupabaseServerClient();
  const ctx = await fetchPendingForEmail(supabase, pendingId);

  const { error } = await supabase.rpc("admin_reject_pending_payment", {
    p_pending_id: pendingId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  if (ctx && ctx.profile.email) {
    const email = await premiumRejectedEmail({
      fullName: ctx.profile.full_name,
      plan: ctx.pending.plan,
      amountFcfa: ctx.pending.amount_fcfa,
      reason,
    });
    const send = await sendEmail({
      to: ctx.profile.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: "contact@azimutfinance.com",
    });
    if (!send.ok && !send.skipped) {
      console.error("[abonnements] Email rejet rate:", send.error);
    }
  }

  revalidatePath("/admin/abonnements");
  return { ok: true, data: undefined };
}
