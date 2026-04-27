import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase utilisable cote navigateur ("use client").
 * Lit/ecrit les cookies de session via document.cookie.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
