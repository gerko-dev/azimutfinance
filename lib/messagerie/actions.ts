"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, Message } from "./types";

const RPC_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: "Tu dois être connecté.",
  INVALID_USER: "Identifiant utilisateur invalide.",
  CANNOT_MESSAGE_SELF: "Tu ne peux pas t'envoyer un message à toi-même.",
  USER_NOT_FOUND: "Cet utilisateur n'existe pas ou plus.",
};

function translateError(message: string): string {
  for (const code of Object.keys(RPC_ERRORS)) {
    if (message.includes(code)) return RPC_ERRORS[code];
  }
  return message;
}

const MAX_MESSAGE_LENGTH = 4000;

/** Demarre une conversation 1-a-1 avec p_other_user_id (ou recupere l'existante). */
export async function startConversation(
  otherUserId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: RPC_ERRORS.NOT_AUTHENTICATED };

  if (!otherUserId) {
    return { ok: false, error: RPC_ERRORS.INVALID_USER };
  }

  const { data, error } = await supabase.rpc("start_conversation", {
    p_other_user_id: otherUserId,
  });
  if (error) {
    return { ok: false, error: translateError(error.message) };
  }
  revalidatePath("/messagerie");
  return { ok: true, data: { conversationId: data as string } };
}

/** Envoie un message dans une conversation existante. */
export async function sendMessage(input: {
  conversationId: string;
  body: string;
}): Promise<ActionResult<Message>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: RPC_ERRORS.NOT_AUTHENTICATED };

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Le message ne peut pas être vide." };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caractères).`,
    };
  }
  if (!input.conversationId) {
    return { ok: false, error: "Conversation invalide." };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      body,
    })
    .select("*")
    .single();
  if (error) {
    return { ok: false, error: error.message };
  }

  // Mise a jour atomique de last_read_at pour l'expediteur (lui-meme a lu son message)
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", user.id);

  revalidatePath("/messagerie");
  return { ok: true, data: data as Message };
}

/** Marque une conversation comme lue (last_read_at = now). */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: RPC_ERRORS.NOT_AUTHENTICATED };

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: undefined };
}
