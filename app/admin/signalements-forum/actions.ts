"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type { ActionResult } from "@/lib/admin/types";

async function ensureAdmin3(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 3)
    return { ok: false, error: "Niveau d'administration insuffisant." };
  return { ok: true };
}

export type ResolveAction = "dismiss" | "delete_content" | "lock_topic";

export async function resolveForumReportAction(
  fd: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin3();
  if (!auth.ok) return { ok: false, error: auth.error };

  const reportId = String(fd.get("report_id") ?? "").trim();
  const action = String(fd.get("action") ?? "").trim() as ResolveAction;
  const note = String(fd.get("note") ?? "").trim();

  if (!reportId) return { ok: false, error: "Identifiant manquant." };
  if (!["dismiss", "delete_content", "lock_topic"].includes(action))
    return { ok: false, error: "Action invalide." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_resolve_forum_report", {
    p_report_id: reportId,
    p_action: action,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/signalements-forum");
  return { ok: true, data: undefined };
}
