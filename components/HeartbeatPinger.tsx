"use client";

import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Envoie un heartbeat toutes les 30 s a la table user_presence pour tracker
 * qui est en ligne. Ne fait rien si l'utilisateur n'est pas authentifie.
 */
export default function HeartbeatPinger({ user }: { user: User | null }) {
  useEffect(() => {
    if (!user) return;
    const supabase = createSupabaseBrowserClient();

    const ping = async () => {
      try {
        await supabase.rpc("presence_ping", { p_user_agent: navigator.userAgent });
      } catch {
        // Silently ignore — pas critique
      }
    };

    // Premier ping immediat
    ping();

    // Heartbeat toutes les 30 s
    const interval = setInterval(ping, 30_000);

    // Ping aussi quand l'onglet redevient visible
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  return null;
}
