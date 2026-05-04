"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, AppRole } from "./types";

const RPC_ERRORS: Record<string, string> = {
  NOT_AUTHORIZED: "Niveau d'administration insuffisant.",
  NOT_ADMIN: "Réservé aux administrateurs.",
  CANNOT_MODIFY_SELF: "Tu ne peux pas modifier ton propre rôle.",
  CANNOT_DELETE_SELF: "Tu ne peux pas supprimer ton propre compte.",
  CANNOT_MODIFY_ADMIN: "Seul le niveau 1 peut modifier le rôle d'un admin.",
  USER_NOT_FOUND: "Utilisateur introuvable.",
  MESSAGE_NOT_FOUND: "Message introuvable.",
  CONVERSATION_NOT_FOUND: "Conversation introuvable.",
  SEASON_NOT_FOUND: "Saison introuvable.",
  PORTFOLIO_NOT_FOUND: "Portefeuille introuvable.",
  INVALID_DATES: "Dates invalides.",
  INVALID_DATE: "Date invalide (doit être dans le futur).",
  INVALID_STATUS: "Statut invalide.",
  INVALID_TIER: "Tier invalide. Choisir parmi member, premium, pro.",
  REASON_REQUIRED: "Une raison est obligatoire.",
  L2_MAX_30_DAYS: "Le niveau 2 ne peut pas suspendre plus de 30 jours.",
  REPORT_NOT_FOUND: "Signalement introuvable.",
  ALREADY_RESOLVED: "Ce signalement a déjà été traité.",
  INVALID_ACTION: "Action invalide.",
};

function translateError(message: string): string {
  for (const code of Object.keys(RPC_ERRORS)) {
    if (message.includes(code)) return RPC_ERRORS[code];
  }
  return message;
}

// =============================================================================
// MEMBRES
// =============================================================================

export async function setUserRole(input: {
  userId: string;
  role: AppRole;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_role", {
    p_user_id: input.userId,
    p_role: input.role,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function setMemberTier(input: {
  userId: string;
  tier: "member" | "premium" | "pro";
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_member_tier", {
    p_user_id: input.userId,
    p_tier: input.tier,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

// =============================================================================
// SANCTIONS : warn / suspend / unsuspend / ban
// =============================================================================

export async function warnUser(input: {
  userId: string;
  reason: string;
  message?: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_warn_user", {
    p_user_id: input.userId,
    p_reason: input.reason,
    p_message: input.message ?? null,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath(`/admin/membres/${input.userId}`);
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function suspendUser(input: {
  userId: string;
  until: string; // ISO timestamp
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_suspend_user", {
    p_user_id: input.userId,
    p_until: input.until,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath(`/admin/membres/${input.userId}`);
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function unsuspendUser(input: {
  userId: string;
  reason?: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_unsuspend_user", {
    p_user_id: input.userId,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath(`/admin/membres/${input.userId}`);
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function banUser(input: {
  userId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_ban_user", {
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath(`/admin/membres/${input.userId}`);
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function deleteUser(input: {
  userId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_user", {
    p_user_id: input.userId,
    p_reason: input.reason || "Pas de raison fournie",
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/membres");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

// =============================================================================
// MODERATION
// =============================================================================

export async function deleteMessage(input: {
  messageId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_message", {
    p_message_id: input.messageId,
    p_reason: input.reason || "Pas de raison fournie",
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/moderation");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function deleteConversation(input: {
  conversationId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_conversation", {
    p_conversation_id: input.conversationId,
    p_reason: input.reason || "Pas de raison fournie",
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/moderation");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function resolveReport(input: {
  reportId: string;
  action: "dismiss" | "action";
  resolutionAction?: string;
  resolutionNote?: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_report_id: input.reportId,
    p_action: input.action,
    p_resolution_action: input.resolutionAction ?? null,
    p_resolution_note: input.resolutionNote ?? null,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/signalements");
  revalidatePath("/admin");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export type ReportSanctionKind =
  | { kind: "none" }
  | { kind: "delete_message"; messageId: string; reason: string }
  | { kind: "warn"; userId: string; reason: string }
  | { kind: "suspend"; userId: string; reason: string; days: number }
  | { kind: "ban"; userId: string; reason: string };

/**
 * Applique une sanction puis marque le signalement comme traité, en une seule
 * opération côté serveur. Si la sanction échoue, le signalement reste ouvert.
 * Si la sanction réussit mais la résolution échoue, on renvoie une erreur
 * explicite — le modérateur pourra cliquer à nouveau sur "Marquer traité".
 */
export async function resolveReportWithSanction(input: {
  reportId: string;
  sanction: ReportSanctionKind;
  resolutionNote?: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  let resolutionAction = "no_action";
  let memberPathToRevalidate: string | null = null;

  switch (input.sanction.kind) {
    case "delete_message": {
      const { error } = await supabase.rpc("admin_delete_message", {
        p_message_id: input.sanction.messageId,
        p_reason: input.sanction.reason || "Suite à signalement",
      });
      if (error) return { ok: false, error: translateError(error.message) };
      resolutionAction = "message_deleted";
      break;
    }
    case "warn": {
      const { error } = await supabase.rpc("admin_warn_user", {
        p_user_id: input.sanction.userId,
        p_reason: input.sanction.reason,
        p_message: null,
      });
      if (error) return { ok: false, error: translateError(error.message) };
      resolutionAction = "user_warned";
      memberPathToRevalidate = `/admin/membres/${input.sanction.userId}`;
      break;
    }
    case "suspend": {
      const until = new Date();
      until.setDate(until.getDate() + input.sanction.days);
      const { error } = await supabase.rpc("admin_suspend_user", {
        p_user_id: input.sanction.userId,
        p_until: until.toISOString(),
        p_reason: input.sanction.reason,
      });
      if (error) return { ok: false, error: translateError(error.message) };
      resolutionAction = "user_suspended";
      memberPathToRevalidate = `/admin/membres/${input.sanction.userId}`;
      break;
    }
    case "ban": {
      const { error } = await supabase.rpc("admin_ban_user", {
        p_user_id: input.sanction.userId,
        p_reason: input.sanction.reason,
      });
      if (error) return { ok: false, error: translateError(error.message) };
      resolutionAction = "user_banned";
      memberPathToRevalidate = `/admin/membres/${input.sanction.userId}`;
      break;
    }
    case "none":
      resolutionAction = "no_action";
      break;
  }

  const { error: resolveErr } = await supabase.rpc("admin_resolve_report", {
    p_report_id: input.reportId,
    p_action: "action",
    p_resolution_action: resolutionAction,
    p_resolution_note: input.resolutionNote ?? null,
  });
  if (resolveErr) {
    return {
      ok: false,
      error:
        "Sanction appliquée mais la résolution du signalement a échoué : " +
        translateError(resolveErr.message),
    };
  }

  revalidatePath("/admin/signalements");
  revalidatePath("/admin");
  revalidatePath("/admin/audit");
  if (memberPathToRevalidate) revalidatePath(memberPathToRevalidate);
  if (input.sanction.kind === "delete_message") {
    revalidatePath("/admin/moderation");
  }
  return { ok: true, data: undefined };
}

// =============================================================================
// SAISONS
// =============================================================================

export async function createSeason(input: {
  name: string;
  startsAt: string;
  endsAt: string;
  initialCapital: number;
  feePct: number;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_create_season", {
    p_name: input.name,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_initial_capital: input.initialCapital,
    p_fee_pct: input.feePct,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/saisons");
  revalidatePath("/admin/audit");
  return { ok: true, data: { id: data as string } };
}

export async function setSeasonStatus(input: {
  seasonId: string;
  status: "upcoming" | "active" | "ended";
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_season_status", {
    p_season_id: input.seasonId,
    p_status: input.status,
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/saisons");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}

export async function resetPortfolio(input: {
  portfolioId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_reset_portfolio", {
    p_portfolio_id: input.portfolioId,
    p_reason: input.reason || "Pas de raison fournie",
  });
  if (error) return { ok: false, error: translateError(error.message) };
  revalidatePath("/admin/saisons");
  revalidatePath("/admin/audit");
  return { ok: true, data: undefined };
}
