import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminLevel } from "./types";

/**
 * Niveau admin de l'utilisateur courant : 1 (super-admin), 2, 3, ou null.
 * Renvoie null si non connecte ou non admin.
 */
export async function getMyAdminLevel(): Promise<AdminLevel | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("my_admin_level");
  if (typeof data !== "number") return null;
  if (data === 1 || data === 2 || data === 3) return data;
  return null;
}

/**
 * Garde-fou : redirige si l'utilisateur n'a pas au moins le niveau requis.
 * Renvoie le user + son niveau si OK.
 *
 * Usage cote server component :
 *   const { level } = await requireAdmin(2);
 */
export async function requireAdmin(minLevel: AdminLevel = 3): Promise<{
  userId: string;
  level: AdminLevel;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?redirect=/admin");
  }
  const level = await getMyAdminLevel();
  if (level === null) {
    redirect("/?error=not_admin");
  }
  if (level > minLevel) {
    // level 3 mais on demande minLevel = 1 ou 2 -> pas autorise
    redirect("/admin?error=insufficient_level");
  }
  return { userId: user.id, level };
}
