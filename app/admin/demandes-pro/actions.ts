"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAdminLevel } from "@/lib/admin/auth";
import type { ActionResult } from "@/lib/admin/types";

async function ensureAdmin2(): Promise<{ ok: true } | { ok: false; error: string }> {
  const level = await getMyAdminLevel();
  if (level === null) return { ok: false, error: "Réservé aux administrateurs." };
  if (level > 2)
    return { ok: false, error: "Niveau d'administration insuffisant (L2+ requis)." };
  return { ok: true };
}

export type ProDemoStatus = "new" | "contacted" | "converted" | "rejected";

export async function setProDemoStatusAction(
  fd: FormData,
): Promise<ActionResult> {
  const auth = await ensureAdmin2();
  if (!auth.ok) return { ok: false, error: auth.error };

  const id = String(fd.get("id") ?? "").trim();
  const status = String(fd.get("status") ?? "").trim() as ProDemoStatus;
  const internalNote = String(fd.get("internal_note") ?? "").trim();

  if (!id) return { ok: false, error: "Identifiant manquant." };
  if (!["new", "contacted", "converted", "rejected"].includes(status))
    return { ok: false, error: "Statut invalide." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_pro_demo_status", {
    p_id: id,
    p_status: status,
    p_internal_note: internalNote || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/demandes-pro");
  return { ok: true, data: undefined };
}
