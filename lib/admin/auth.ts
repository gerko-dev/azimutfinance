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
 * Garde-fou : redirige si l'utilisateur n'a pas le niveau de privilege requis.
 * Renvoie le user + son niveau si OK.
 *
 * ATTENTION a la numerotation inversee : N1 = super-admin (plus haut privilege),
 * N3 = editeur (plus bas). `maxLevelNumber` est donc le NUMERO de niveau le plus
 * eleve tolere : l'acces passe si `level <= maxLevelNumber`.
 *   - requireAdmin(1) -> super-admins uniquement
 *   - requireAdmin(2) -> N1 et N2
 *   - requireAdmin(3) -> tous les admins (defaut)
 *
 * Usage cote server component :
 *   const { level } = await requireAdmin(2);
 */
export async function requireAdmin(maxLevelNumber: AdminLevel = 3): Promise<{
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
  if (level > maxLevelNumber) {
    // ex : level 3 (editeur) mais on exige maxLevelNumber = 1 ou 2 -> pas autorise
    redirect("/admin?error=insufficient_level");
  }
  return { userId: user.id, level };
}
