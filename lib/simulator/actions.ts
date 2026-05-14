"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLatestPrice } from "./pricing";
import type {
  ActionResult,
  OrderSide,
  OrderType,
  OrderValidity,
  PlaceOrderResult,
  PlaceOrderV2Result,
  Portfolio,
  TransactionType,
} from "./types";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Tu dois être connecté pour passer un ordre.",
  INVALID_TYPE: "Type d'ordre invalide.",
  INVALID_AMOUNTS: "Quantité ou prix invalide.",
  INVALID_UNITS: "Le nombre d'unités doit être strictement positif.",
  SEASON_NOT_FOUND: "Saison introuvable.",
  SEASON_NOT_ACTIVE: "La saison n'est pas active.",
  SEASON_OUT_OF_PERIOD: "La saison est terminée ou pas encore commencée.",
  REGISTRATION_NOT_OPEN: "Les inscriptions pour cette saison ne sont pas (ou plus) ouvertes.",
  REGISTRATION_CLOSED:
    "Les inscriptions sont closes : la Course à l'introduction a déjà été lancée.",
  NO_PORTFOLIO: "Tu dois d'abord rejoindre la saison.",
  INSUFFICIENT_CASH: "Cash insuffisant pour exécuter l'ordre.",
  INSUFFICIENT_UNITS: "Tu ne détiens pas assez d'unités pour cet ordre.",
  INTRO_NOT_OPEN: "La Course à l'introduction n'est pas en cours sur cette saison.",
  INTRO_NOT_STARTED: "La Course à l'introduction n'a pas encore commencé.",
  INTRO_ENDED:
    "La Course à l'introduction est terminée. Le reste du pool est passé dans le carnet d'ordres.",
  POOL_CODE_NOT_FOUND: "Ce titre ne fait pas partie du pool de la Course.",
  POOL_INSUFFICIENT:
    "Plus assez d'actions disponibles dans le pool pour cette quantité (premier arrivé premier servi).",
  DIVERSIFICATION_LIMIT:
    "Cette quantité dépasse la limite de diversification (15 % max par titre, 20 % pour les large caps du marché). Réduis la quantité.",
  // === Carnet d'ordres (S3) ===
  INVALID_SIDE: "Sens d'ordre invalide (BUY ou SELL attendu).",
  INVALID_ORDER_TYPE: "Type d'ordre invalide (LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT).",
  INVALID_VALIDITY: "Validité invalide (DAY, GTC ou GTD).",
  LIMIT_PRICE_REQUIRED: "Un ordre LIMIT nécessite un prix limite.",
  STOP_PRICE_REQUIRED: "Un ordre stop/take-profit nécessite un prix de déclenchement.",
  EXPIRES_AT_REQUIRED: "Un ordre GTD doit avoir une date d'expiration.",
  TICK_PRICE_VIOLATION: "Le prix doit être un multiple de 5 FCFA (tick BRVM).",
  PRICE_OUT_OF_BAND:
    "Le prix doit rester dans la bande ±7,5 % autour du dernier cours BRVM.",
  ORDER_NOT_FOUND: "Ordre introuvable.",
  ORDER_NOT_OPEN: "Cet ordre n'est plus ouvert et ne peut pas être annulé.",
  NOT_AUTHORIZED: "Tu ne peux annuler que tes propres ordres.",
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
    .select(
      "id, initial_capital, status, starts_at, ends_at, registration_starts_at, registration_ends_at, total_pool_value",
    )
    .eq("id", seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return { ok: false, error: ERROR_MESSAGES.SEASON_NOT_FOUND };
  }

  // Statuts qui n'autorisent jamais l'inscription
  if (season.status === "ended" || season.status === "frozen") {
    return { ok: false, error: ERROR_MESSAGES.SEASON_OUT_OF_PERIOD };
  }
  // La Course à l'introduction est déjà lancée → plus de nouveaux joueurs
  // (le capital initial est figé et déjà distribué entre les portefeuilles
  // existants au prorata du pool).
  if (season.status === "intro" || season.total_pool_value != null) {
    return { ok: false, error: ERROR_MESSAGES.REGISTRATION_CLOSED };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Fenêtre d'inscription : si la saison a été créée en v2 avec une phase
  // d'inscription distincte, on l'utilise. Sinon (saisons v1) on retombe sur
  // la fenêtre de compétition pour rester rétro-compatible.
  const regStart = (season as { registration_starts_at?: string | null })
    .registration_starts_at;
  const regEnd = (season as { registration_ends_at?: string | null })
    .registration_ends_at;
  if (regStart && regEnd) {
    if (today < regStart || today > regEnd) {
      return { ok: false, error: ERROR_MESSAGES.REGISTRATION_NOT_OPEN };
    }
  } else {
    // Saison v1 : on garde le comportement legacy (inscription = compétition)
    if (season.status !== "active") {
      return { ok: false, error: ERROR_MESSAGES.SEASON_NOT_ACTIVE };
    }
    if (today < season.starts_at || today > season.ends_at) {
      return { ok: false, error: ERROR_MESSAGES.SEASON_OUT_OF_PERIOD };
    }
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

/**
 * Achat depuis le pool de la Course à l'introduction.
 *
 * Premier arrivé premier servi : la RPC verrouille la ligne du share_pool
 * pour la durée de la transaction. Pas de frais pendant la Course (pour que
 * la totalité du capital initial puisse être dépensée).
 */
export type BuyFromPoolResult = {
  transaction_id: string;
  units: number;
  price: number;
  cost: number;
  remaining_units: number;
  new_cash: number;
};

export async function buyFromPoolAction(input: {
  seasonId: string;
  code: string;
  units: number;
}): Promise<ActionResult<BuyFromPoolResult>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };
  }

  const units = Math.floor(Number(input.units));
  if (!units || units <= 0) {
    return { ok: false, error: ERROR_MESSAGES.INVALID_UNITS };
  }
  const code = input.code.trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "Code valeur invalide." };
  }

  const { data, error } = await supabase.rpc("simulator_buy_from_pool", {
    p_season_id: input.seasonId,
    p_code: code,
    p_units: units,
  });

  if (error) {
    return { ok: false, error: translateRpcError(error.message) };
  }

  revalidatePath("/academie/simulateur");
  return { ok: true, data: data as BuyFromPoolResult };
}

/**
 * Place un ordre dans le carnet d'ordres virtuel (S3).
 *
 * Saison doit être en statut 'active' (post-Course). L'engine de matching
 * est exécuté côté serveur dans la transaction de l'INSERT, donc l'ordre
 * peut revenir avec status 'filled' ou 'partial' si la liquidité du book
 * permettait l'exécution immédiate.
 */
export async function placeOrderV2Action(input: {
  seasonId: string;
  code: string;
  side: OrderSide;
  orderType: OrderType;
  units: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  validity?: OrderValidity;
  expiresAt?: string | null;
  minUnits?: number;
}): Promise<ActionResult<PlaceOrderV2Result>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };

  const units = Math.floor(Number(input.units));
  if (!units || units <= 0) {
    return { ok: false, error: ERROR_MESSAGES.INVALID_UNITS };
  }
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Code valeur invalide." };

  // Cours BRVM de référence (dernier cours scrappé connu) — sert à la RPC
  // pour valider la bande ±7,5 % au placement.
  const { getLatestPrice } = await import("./pricing");
  const ref = getLatestPrice(code);
  const refPrice = ref?.price ? Math.round(ref.price) : null;

  const { data, error } = await supabase.rpc("simulator_place_order_v2", {
    p_season_id: input.seasonId,
    p_code: code,
    p_side: input.side,
    p_order_type: input.orderType,
    p_units: units,
    p_limit_price: input.limitPrice ?? null,
    p_stop_price: input.stopPrice ?? null,
    p_validity: input.validity ?? "DAY",
    p_expires_at: input.expiresAt ?? null,
    p_min_units: input.minUnits ?? 1,
    p_ref_price: refPrice,
  });
  if (error) return { ok: false, error: translateRpcError(error.message) };

  revalidatePath("/academie/simulateur");
  return { ok: true, data: data as PlaceOrderV2Result };
}

/**
 * Annule un ordre du carnet. Seul le propriétaire peut annuler (vérifié
 * côté RPC). Pour un BUY LIMIT, le cash réservé sur le reliquat est
 * remboursé automatiquement.
 */
export async function cancelOrderAction(
  orderId: string,
): Promise<ActionResult<{ refund: number }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };

  const { data, error } = await supabase.rpc("simulator_cancel_order", {
    p_order_id: orderId,
  });
  if (error) return { ok: false, error: translateRpcError(error.message) };

  revalidatePath("/academie/simulateur");
  return { ok: true, data: { refund: (data as { refund?: number })?.refund ?? 0 } };
}

/**
 * Toggle un titre dans la watchlist du joueur. Retourne true si ajouté,
 * false si supprimé.
 */
export async function toggleWatchlistAction(
  code: string,
): Promise<ActionResult<{ added: boolean }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERROR_MESSAGES.NOT_AUTHENTICATED };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Code valeur invalide." };

  const { data, error } = await supabase.rpc("simulator_toggle_watchlist", {
    p_code: trimmed,
  });
  if (error) return { ok: false, error: translateRpcError(error.message) };

  revalidatePath("/academie/simulateur", "layout");
  return { ok: true, data: { added: Boolean(data) } };
}
