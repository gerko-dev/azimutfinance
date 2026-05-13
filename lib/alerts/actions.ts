"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/auth/premium";
import type { ActionResult } from "@/lib/admin/types";
import type { AlertParams, AlertType } from "./types";

function s(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function num(v: FormDataEntryValue | null): number {
  const n = Number(
    String(v ?? "")
      .replace(/\s+/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : NaN;
}

const ALL_TYPES: AlertType[] = [
  "price_threshold",
  "daily_pct_change",
  "bond_maturity_approach",
  "news_mention",
  "index_threshold",
  "fx_threshold",
  "custom",
];

type RequireResult =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      user: { id: string };
    };

async function requireUserAndPremium(): Promise<RequireResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu dois être connecté." };

  // Premium+, Pro ou admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? "";
  const premium = await getPremiumStatus();
  const allowed =
    role === "pro" ||
    role.startsWith("adminlevel") ||
    premium.isPremium ||
    role === "premium";
  if (!allowed)
    return { error: "Les alertes sont réservées aux membres Premium." };

  return { supabase, user };
}

/** Construit l'objet params depuis le FormData selon le type. */
function buildParams(
  alertType: AlertType,
  fd: FormData,
): AlertParams | { error: string } {
  switch (alertType) {
    case "price_threshold": {
      const direction = s(fd.get("direction"));
      const price = num(fd.get("price"));
      if (direction !== "above" && direction !== "below")
        return { error: "Sens du seuil invalide." };
      if (!Number.isFinite(price) || price <= 0)
        return { error: "Prix invalide." };
      return { type: "price_threshold", direction, price };
    }
    case "daily_pct_change": {
      const direction = s(fd.get("direction"));
      const threshold_pct = num(fd.get("threshold_pct"));
      if (!["above", "below", "either"].includes(direction))
        return { error: "Sens du seuil invalide." };
      if (!Number.isFinite(threshold_pct) || threshold_pct <= 0)
        return { error: "Seuil % invalide." };
      return {
        type: "daily_pct_change",
        direction: direction as "above" | "below" | "either",
        threshold_pct,
      };
    }
    case "bond_maturity_approach": {
      const days_before = num(fd.get("days_before"));
      if (!Number.isFinite(days_before) || days_before <= 0)
        return { error: "Délai invalide." };
      const include_coupons = s(fd.get("include_coupons")) === "on";
      return {
        type: "bond_maturity_approach",
        days_before: Math.round(days_before),
        include_coupons,
      };
    }
    case "news_mention":
      return { type: "news_mention" };
    case "index_threshold": {
      const direction = s(fd.get("direction"));
      const value = num(fd.get("value"));
      if (direction !== "above" && direction !== "below")
        return { error: "Sens du seuil invalide." };
      if (!Number.isFinite(value))
        return { error: "Valeur invalide." };
      return { type: "index_threshold", direction, value };
    }
    case "fx_threshold": {
      const direction = s(fd.get("direction"));
      const value = num(fd.get("value"));
      if (direction !== "above" && direction !== "below")
        return { error: "Sens du seuil invalide." };
      if (!Number.isFinite(value))
        return { error: "Valeur invalide." };
      return { type: "fx_threshold", direction, value };
    }
    case "custom": {
      const note = s(fd.get("note"));
      const remind_at = s(fd.get("remind_at"));
      if (note.length === 0 || note.length > 280)
        return { error: "Note 1..280 caractères requise." };
      return {
        type: "custom",
        note,
        remind_at: remind_at || undefined,
      };
    }
  }
}

export async function upsertAlertAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserAndPremium();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const id = s(fd.get("id")) || null;
  const name = s(fd.get("name"));
  const alert_type = s(fd.get("alert_type")) as AlertType;
  const target_type = s(fd.get("target_type"));
  const target_code = s(fd.get("target_code")).toUpperCase();
  const active = s(fd.get("active")) === "on";

  if (!name) return { ok: false, error: "Nom requis." };
  if (!ALL_TYPES.includes(alert_type))
    return { ok: false, error: "Type d'alerte invalide." };
  if (
    !["stock", "bond", "index", "currency", "commodity", "any"].includes(
      target_type,
    )
  )
    return { ok: false, error: "Type de cible invalide." };
  if (!target_code)
    return { ok: false, error: "Code de cible requis (utilise * pour tout)." };

  const params = buildParams(alert_type, fd);
  if ("error" in params) return { ok: false, error: params.error };

  if (id) {
    const { error } = await supabase
      .from("alerts")
      .update({ name, alert_type, target_type, target_code, params, active })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/outils/alertes");
    return { ok: true, data: { id } };
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      user_id: user.id,
      name,
      alert_type,
      target_type,
      target_code,
      params,
      active,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outils/alertes");
  revalidatePath("/compte");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function toggleAlertAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const auth = await requireUserAndPremium();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("alerts")
    .update({ active })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outils/alertes");
  return { ok: true, data: undefined };
}

export async function snoozeAlertAction(
  id: string,
  hours: number,
): Promise<ActionResult> {
  const auth = await requireUserAndPremium();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from("alerts")
    .update({ snooze_until: until })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outils/alertes");
  return { ok: true, data: undefined };
}

export async function deleteAlertAction(id: string): Promise<ActionResult> {
  const auth = await requireUserAndPremium();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outils/alertes");
  return { ok: true, data: undefined };
}

export async function markAllAlertsReadAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  await supabase.rpc("alerts_mark_all_read");
  revalidatePath("/outils/alertes");
  return { ok: true, data: undefined };
}
