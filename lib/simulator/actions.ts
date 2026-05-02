"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrice } from "./pricing";
import type { ActionResult, Portfolio, PlaceOrderResult, TransactionType } from "./types";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Tu dois être connecté pour passer un ordre.",
  INVALID_TYPE: "Type d'ordre invalide.",
  INVALID_AMOUNTS: "Quantité ou prix invalide.",
  SEASON_NOT_FOUND: "Saison introuvable.",
  SEASON_NOT_ACTIVE: "La saison n'est pas active.",
  SEASON_OUT_OF_PERIOD: "La saison est terminée ou pas encore commencée.",
  NO_PORTFOLIO: "Tu dois d'abord rejoindre la saison.",
  INSUFFICIENT_CASH: "Cash insuffisant pour exécuter l'ordre.",
  INSUFFICIENT_UNITS: "Tu ne détiens pas assez d'unités pour cet ordre.",
};

function translateRpcError(message: string): string {
  // Les exceptions Postgres reviennent typiquement avec un message comme
  // "INSUFFICIENT_CASH" via raise exception. On matche.
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(code)) return ERROR_MESSAGES[code];
  }
  return message;
}

/** Rejoint la saison active : cree un portefeuille avec capital initial. */
export async function joinSeason(seasonId: string): Promise<ActionResult<Portfolio>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };
  }

  // Verifier saison
  const { data: season, error: seasonErr } = await supabase
    .from("simulator_seasons")
    .select("id, initial_capital, status, starts_at, ends_at")
    .eq("id", seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return { ok: false, error: ERROR_MESSAGES.SEASON_NOT_FOUND };
  }
  if (season.status !== "active") {
    return { ok: false, error: ERROR_MESSAGES.SEASON_NOT_ACTIVE };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (today < season.starts_at || today > season.ends_at) {
    return { ok: false, error: ERROR_MESSAGES.SEASON_OUT_OF_PERIOD };
  }

  // Insert (RLS verifie user_id = auth.uid())
  const { data, error } = await supabase
    .from("simulator_portfolios")
    .insert({
      user_id: user.id,
      season_id: seasonId,
      cash: season.initial_capital,
    })
    .select("*")
    .single();
  if (error) {
    // Erreur unique : deja dans la saison
    if (error.code === "23505") {
      // Recuperer le portefeuille existant
      const { data: existing } = await supabase
        .from("simulator_portfolios")
        .select("*")
        .eq("user_id", user.id)
        .eq("season_id", seasonId)
        .maybeSingle();
      if (existing) {
        return { ok: true, data: existing as Portfolio };
      }
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/academie/simulateur");
  return { ok: true, data: data as Portfolio };
}

/**
 * Place un ordre BUY ou SELL au dernier prix de cloture connu pour `code`.
 *
 * Le prix est resolu cote serveur via getLatestPrice (CSV) — pas de
 * possibilite pour le client de manipuler le prix d'execution.
 */
export async function placeOrder(input: {
  seasonId: string;
  type: TransactionType;
  code: string;
  units: number;
}): Promise<ActionResult<PlaceOrderResult>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };
  }

  // Validation cote serveur
  const units = Math.floor(Number(input.units));
  if (!units || units <= 0) {
    return { ok: false, error: "Indiquer un nombre d'unités valide (entier > 0)." };
  }
  if (input.type !== "BUY" && input.type !== "SELL") {
    return { ok: false, error: ERROR_MESSAGES.INVALID_TYPE };
  }
  const code = input.code.trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "Code valeur invalide." };
  }

  // Resolution du prix cote serveur
  const latest = getLatestPrice(code);
  if (!latest) {
    return { ok: false, error: "Aucun cours connu pour cette valeur." };
  }
  const price = Math.round(latest.price);

  // Appel RPC atomique
  const { data, error } = await supabase.rpc("simulator_place_order", {
    p_season_id: input.seasonId,
    p_type: input.type,
    p_code: code,
    p_units: units,
    p_price: price,
    p_price_date: latest.date,
  });

  if (error) {
    return { ok: false, error: translateRpcError(error.message) };
  }

  revalidatePath("/academie/simulateur");
  return { ok: true, data: data as PlaceOrderResult };
}
