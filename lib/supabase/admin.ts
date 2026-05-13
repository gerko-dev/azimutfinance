import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase service-role : bypasse RLS, a reserver aux routes serveur
 * verifiees (cron, webhook). NE JAMAIS exposer la cle dans NEXT_PUBLIC_*.
 *
 * Usage typique : routes /api/cron/... apres verification du Bearer.
 */
let _cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requiert NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  _cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _cached;
}
