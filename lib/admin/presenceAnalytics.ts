import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Photo instantanée du trafic site (RPC admin_presence_live). */
export type PresenceLive = {
  /** Total de sessions actives (ping < 90 s) — anonymes + authentifiés. */
  total: number;
  authenticated: number;
  anonymous: number;
  /** Dispatching : nombre de personnes par page (current_page). */
  by_page: { page: string; count: number }[];
  /** Dispatching : nombre de personnes par rôle. */
  by_role: { role: string; count: number }[];
};

/** Une ligne d'agrégat figé toutes les 8 h (RPC admin_presence_snapshots). */
export type PresenceSnapshotRow = {
  snapshot_at: string;
  role: string;
  online_count: number;
  sessions_count: number;
  avg_session_seconds: number | null;
};

const EMPTY_LIVE: PresenceLive = {
  total: 0,
  authenticated: 0,
  anonymous: 0,
  by_page: [],
  by_role: [],
};

/**
 * Photo live du trafic. Renvoie un état vide (sans planter) si la migration
 * supabase/presence_v2.sql n'a pas encore été appliquée — la RPC est alors
 * absente et Supabase renvoie une erreur, qu'on absorbe.
 */
export async function getPresenceLive(): Promise<PresenceLive> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_presence_live", {
    p_threshold_seconds: 90,
  });
  if (error || !data) return EMPTY_LIVE;
  return data as PresenceLive;
}

/** Historique des snapshots 8 h, le plus récent d'abord. */
export async function listPresenceSnapshots(
  limit = 90,
): Promise<PresenceSnapshotRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_presence_snapshots", {
    p_limit: limit,
  });
  if (error || !data) return [];
  return data as PresenceSnapshotRow[];
}
