"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type {
  ActionResult,
  PricingPlanRow,
  PromoCodeRow,
  PromoDiscountType,
  TrialConfigRow,
  UserTrialRow,
} from "@/lib/admin/types";

async function ensureL1(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 1)
    return { ok: false, error: "Niveau d'administration insuffisant (L1 requis)." };
  return { ok: true };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function bool(v: FormDataEntryValue | null): boolean {
  const s = String(v ?? "").toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}
function int(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(v ?? "").replace(/\s+/g, ""));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/\s+/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ============================================================
// Plans
// ============================================================

export async function upsertPricingPlanAction(
  fd: FormData,
): Promise<ActionResult<PricingPlanRow>> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = str(fd.get("code")).toLowerCase();
  if (!code) return { ok: false, error: "Code requis (ex : m1, m6, y1)." };
  const label = str(fd.get("label"));
  if (!label) return { ok: false, error: "Libellé requis." };
  const durationLabel = str(fd.get("duration_label"));
  if (!durationLabel) return { ok: false, error: "Libellé de durée requis." };
  const durationMonths = int(fd.get("duration_months"), 0);
  if (durationMonths <= 0)
    return { ok: false, error: "La durée doit être supérieure à 0." };
  const priceFcfa = int(fd.get("price_fcfa"), -1);
  if (priceFcfa < 0) return { ok: false, error: "Prix FCFA invalide." };
  const discountPct = int(fd.get("discount_pct"), 0);
  if (discountPct < 0 || discountPct > 100)
    return { ok: false, error: "Réduction (%) doit être entre 0 et 100." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_upsert_pricing_plan", {
    p_code: code,
    p_label: label,
    p_duration_label: durationLabel,
    p_duration_months: durationMonths,
    p_price_fcfa: priceFcfa,
    p_discount_pct: discountPct,
    p_tagline: strOrNull(fd.get("tagline")),
    p_highlight: bool(fd.get("highlight")),
    p_active: bool(fd.get("active")),
    p_sort_order: int(fd.get("sort_order"), 0),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification");
  revalidatePath("/admin/tarification/plans");
  revalidatePath("/premium");
  return { ok: true, data: data as PricingPlanRow };
}

export async function togglePricingPlanAction(
  code: string,
  active: boolean,
): Promise<ActionResult> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_toggle_pricing_plan", {
    p_code: code,
    p_active: active,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification/plans");
  revalidatePath("/premium");
  return { ok: true, data: undefined };
}

export async function deletePricingPlanAction(code: string): Promise<ActionResult> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_pricing_plan", {
    p_code: code,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification/plans");
  revalidatePath("/premium");
  return { ok: true, data: undefined };
}

// ============================================================
// Codes promo
// ============================================================

function parsePlanList(raw: string | null): string[] | null {
  if (!raw) return null;
  const items = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return items.length === 0 ? null : items;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  // input type="datetime-local" donne YYYY-MM-DDTHH:mm — Supabase accepte un ISO
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function upsertPromoCodeAction(
  fd: FormData,
): Promise<ActionResult<PromoCodeRow>> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const idRaw = str(fd.get("id"));
  const id = idRaw === "" ? null : idRaw;
  const code = str(fd.get("code")).toUpperCase();
  if (!code) return { ok: false, error: "Code requis." };

  const discountType = str(fd.get("discount_type")) as PromoDiscountType;
  if (discountType !== "percent" && discountType !== "fixed")
    return { ok: false, error: "Type de réduction invalide." };

  const discountValue = int(fd.get("discount_value"), -1);
  if (discountValue < 0) return { ok: false, error: "Valeur de réduction invalide." };
  if (discountType === "percent" && discountValue > 100)
    return { ok: false, error: "Le pourcentage ne peut dépasser 100." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_upsert_promo_code", {
    p_id: id,
    p_code: code,
    p_description: strOrNull(fd.get("description")),
    p_discount_type: discountType,
    p_discount_value: discountValue,
    p_applicable_plans: parsePlanList(strOrNull(fd.get("applicable_plans"))),
    p_valid_from: parseDate(strOrNull(fd.get("valid_from"))),
    p_valid_until: parseDate(strOrNull(fd.get("valid_until"))),
    p_max_uses: intOrNull(fd.get("max_uses")),
    p_max_uses_per_user: int(fd.get("max_uses_per_user"), 1),
    p_active: bool(fd.get("active")),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification/promos");
  return { ok: true, data: data as PromoCodeRow };
}

export async function togglePromoCodeAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_toggle_promo_code", {
    p_id: id,
    p_active: active,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/tarification/promos");
  return { ok: true, data: undefined };
}

export async function deletePromoCodeAction(id: string): Promise<ActionResult> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_promo_code", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/tarification/promos");
  return { ok: true, data: undefined };
}

// ============================================================
// Essai gratuit (trial)
// ============================================================

export async function upsertTrialConfigAction(
  fd: FormData,
): Promise<ActionResult<TrialConfigRow>> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const idRaw = str(fd.get("id"));
  const id = idRaw === "" ? null : idRaw;
  const name = str(fd.get("name")).toLowerCase();
  if (!name) return { ok: false, error: "Nom requis." };
  const durationDays = int(fd.get("duration_days"), 0);
  if (durationDays <= 0)
    return { ok: false, error: "La durée doit être supérieure à 0 jour." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_upsert_trial_config", {
    p_id: id,
    p_name: name,
    p_duration_days: durationDays,
    p_auto_grant_on_signup: bool(fd.get("auto_grant_on_signup")),
    p_active: bool(fd.get("active")),
    p_description: strOrNull(fd.get("description")),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification/essai");
  return { ok: true, data: data as TrialConfigRow };
}

export async function grantTrialToUserAction(
  fd: FormData,
): Promise<ActionResult<UserTrialRow>> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };

  const userId = str(fd.get("user_id"));
  const trialConfigId = str(fd.get("trial_config_id"));
  if (!userId) return { ok: false, error: "Identifiant utilisateur requis." };
  if (!trialConfigId) return { ok: false, error: "Config d'essai requise." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_grant_trial_to_user", {
    p_user_id: userId,
    p_trial_config_id: trialConfigId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tarification/essai");
  return { ok: true, data: data as UserTrialRow };
}

export async function revokeTrialAction(userId: string): Promise<ActionResult> {
  const auth = await ensureL1();
  if (!auth.ok) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_trial", {
    p_user_id: userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/tarification/essai");
  return { ok: true, data: undefined };
}
