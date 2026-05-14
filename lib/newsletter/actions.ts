"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidIso2 } from "@/lib/countries";
import type { ActionResult } from "@/lib/admin/types";

function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function s(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/**
 * Inscription publique à la newsletter. Permet aux visiteurs anonymes de
 * s'abonner. Si l'email est déjà inscrit en `active`, on retourne un message
 * neutre (pas une erreur). Si désabonné, on réactive.
 */
export async function subscribeNewsletterAction(
  fd: FormData,
): Promise<ActionResult<{ resubscribed: boolean }>> {
  const email = s(fd.get("email")).toLowerCase();
  const fullName = s(fd.get("full_name")) || null;
  const countryRaw = s(fd.get("country")).toUpperCase();
  const country = isValidIso2(countryRaw) ? countryRaw : null;
  const source = s(fd.get("source")) || "newsletter-page";

  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "Adresse email invalide." };
  }

  const supabase = await createSupabaseServerClient();

  // Récupère l'utilisateur courant si connecté (utile pour la colonne user_id)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vérifie l'existence (la RLS sur SELECT est admin-only, donc on tente
  // un INSERT puis on traite l'erreur 23505 unique-violation comme "déjà inscrit")
  const { error } = await supabase.from("newsletter_subscribers").insert({
    email,
    full_name: fullName,
    country,
    status: "active",
    source,
    user_id: user?.id ?? null,
  });

  if (!error) {
    return { ok: true, data: { resubscribed: false } };
  }

  // 23505 = unique_violation (email déjà présent)
  if (error.code === "23505") {
    // Email déjà connu : tenter la réactivation via la RPC security definer
    // (cas d'un ancien abonné qui s'était désinscrit). Si l'abonné est déjà
    // actif, la RPC retourne 0 — message neutre dans tous les cas.
    await supabase.rpc("newsletter_resubscribe", { p_email: email });
    return {
      ok: true,
      data: { resubscribed: true },
    };
  }

  return {
    ok: false,
    error: "Une erreur est survenue. Réessaie dans un instant.",
  };
}

/**
 * Marque un email comme désabonné. Côté RLS, l'UPDATE de newsletter_subscribers
 * est réservé aux admins L3+. Pour permettre une désinscription publique, on
 * passe par une RPC `newsletter_unsubscribe` (security definer) qui doit être
 * créée côté Supabase (voir supabase/newsletter_public_rpc.sql).
 *
 * Fallback : si la RPC n'existe pas encore, on renvoie un message demandant
 * d'écrire à contact@ pour désinscription manuelle.
 */
export async function unsubscribeNewsletterAction(
  fd: FormData,
): Promise<ActionResult<{ already: boolean }>> {
  const email = s(fd.get("email")).toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "Adresse email invalide." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("newsletter_unsubscribe", {
    p_email: email,
  });
  if (error) {
    return {
      ok: false,
      error:
        "Désinscription automatique indisponible pour le moment. Écris-nous à contact@azimutfinance.com et nous te retirons sous 24h.",
    };
  }
  return { ok: true, data: { already: data === 0 } };
}
