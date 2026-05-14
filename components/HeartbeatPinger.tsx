"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getVisitorId } from "@/lib/presence/visitorId";

/**
 * Heartbeat de présence. Tourne pour TOUT LE MONDE (visiteurs anonymes inclus) :
 *
 *  - `presence_ping_v2` (toutes les 30 s + à chaque changement de page) alimente
 *    le suivi global du trafic : total en ligne, dispatching par page, snapshots
 *    8 h. Les anonymes sont identifiés par un visitor_id local (cf. visitorId.ts).
 *  - `presence_ping` (legacy, authentifiés uniquement) continue d'alimenter
 *    l'onglet « Membres connectés » de /admin/presence — inchangé.
 *
 * Tout échec RPC est ignoré silencieusement (non critique, et les RPC v2
 * n'existent qu'une fois la migration supabase/presence_v2.sql appliquée).
 */
export default function HeartbeatPinger({ user }: { user: User | null }) {
  const pathname = usePathname();
  // Le ping périodique lit toujours la page courante via ce ref (mis à jour
  // hors rendu pour ne pas recréer l'intervalle à chaque navigation).
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // Heartbeat périodique (30 s) + au retour de visibilité de l'onglet.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const visitorId = getVisitorId();

    const ping = async () => {
      try {
        await supabase.rpc("presence_ping_v2", {
          p_page: pathRef.current,
          p_visitor_id: visitorId || null,
          p_user_agent: navigator.userAgent,
        });
        if (user) {
          // Legacy : présence orientée compte (onglet Membres connectés).
          await supabase.rpc("presence_ping", {
            p_user_agent: navigator.userAgent,
          });
        }
      } catch {
        // Non critique — on ignore.
      }
    };

    ping();
    const interval = setInterval(ping, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  // Re-ping immédiat à chaque changement de page → dispatching par page à jour.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const visitorId = getVisitorId();
    supabase
      .rpc("presence_ping_v2", {
        p_page: pathname,
        p_visitor_id: visitorId || null,
        p_user_agent: navigator.userAgent,
      })
      .then(
        () => {},
        () => {},
      );
  }, [pathname]);

  return null;
}
