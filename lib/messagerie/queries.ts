import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConversationSummary, Message, Profile } from "./types";

/**
 * Liste les conversations de l'utilisateur courant, triees par last_message_at desc.
 * Inclut le profil de l'autre participant, le dernier message et le compteur non-lus.
 */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1) Toutes les conversations dont je suis participant
  const { data: myParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id);
  if (!myParts || myParts.length === 0) return [];

  const convIds = myParts.map((p) => p.conversation_id);
  const myReadMap = new Map<string, string>();
  for (const p of myParts) myReadMap.set(p.conversation_id, p.last_read_at);

  // 2) Conversations elles-memes (pour last_message_at)
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .in("id", convIds)
    .order("last_message_at", { ascending: false });
  if (!convs) return [];

  // 3) Tous les participants des conversations (pour identifier l'autre)
  const { data: allParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds);

  // Map conv_id -> autre user_id
  const otherByConv = new Map<string, string>();
  for (const p of allParts ?? []) {
    if (p.user_id !== user.id) otherByConv.set(p.conversation_id, p.user_id);
  }

  // 4) Profils des autres participants (via RPC pour ne pas heurter RLS profiles)
  const otherIds = Array.from(new Set(otherByConv.values()));
  const profileMap = new Map<string, Profile>();
  if (otherIds.length) {
    const { data: profiles } = await supabase.rpc("get_users_public", {
      p_user_ids: otherIds,
    });
    for (const p of (profiles as Profile[]) ?? []) {
      profileMap.set(p.id, {
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
      });
    }
  }

  // 5) Dernier message de chaque conversation : on charge tous les messages
  // en 1 requete et on prend le plus recent par conv (limite 1 par conv via fenetrage applicatif).
  const { data: lastMsgs } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, body, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(convIds.length * 5); // borne large
  const lastByConv = new Map<
    string,
    { body: string; sender_id: string; created_at: string }
  >();
  for (const m of lastMsgs ?? []) {
    const key = m.conversation_id as string;
    if (!lastByConv.has(key)) {
      lastByConv.set(key, {
        body: m.body as string,
        sender_id: m.sender_id as string,
        created_at: m.created_at as string,
      });
    }
  }

  // 6) Compteur non-lus : messages dans la conv apres mon last_read_at, hors ceux que j'envoie.
  // Faire 1 requete agregee par conversation est couteux. On fait une seule requete groupee.
  const { data: unreadMessages } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, created_at")
    .in("conversation_id", convIds);
  const unreadByConv = new Map<string, number>();
  for (const m of unreadMessages ?? []) {
    if (m.sender_id === user.id) continue; // mes propres messages ne comptent pas
    const lastRead = myReadMap.get(m.conversation_id as string) ?? "";
    if ((m.created_at as string) > lastRead) {
      const k = m.conversation_id as string;
      unreadByConv.set(k, (unreadByConv.get(k) ?? 0) + 1);
    }
  }

  // 7) Compose le resultat
  const summaries: ConversationSummary[] = convs.map((c) => {
    const otherId = otherByConv.get(c.id as string) ?? "";
    const profile: Profile = profileMap.get(otherId) ?? {
      id: otherId,
      username: null,
      full_name: null,
      avatar_url: null,
    };
    return {
      id: c.id as string,
      last_message_at: c.last_message_at as string,
      other: profile,
      lastMessage: lastByConv.get(c.id as string) ?? null,
      unreadCount: unreadByConv.get(c.id as string) ?? 0,
    };
  });

  return summaries;
}

/** Charge les messages d'une conversation, triés ascendant. */
export async function getThread(conversationId: string, limit = 200): Promise<Message[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  // On a recupere desc (plus recents en haut) ; on inverse pour afficher chronologiquement
  return ((data as Message[]) ?? []).slice().reverse();
}

/** Recupere une conversation par id, avec verification d'appartenance via RLS. */
export async function getConversation(conversationId: string): Promise<{
  id: string;
  other: Profile | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return null;

  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const otherId = parts?.find((p) => p.user_id !== user.id)?.user_id ?? null;
  let other: Profile | null = null;
  if (otherId) {
    const { data: profs } = await supabase.rpc("get_users_public", {
      p_user_ids: [otherId],
    });
    const prof = (profs as Profile[] | null)?.[0];
    if (prof) {
      other = {
        id: prof.id,
        username: prof.username,
        full_name: prof.full_name,
        avatar_url: prof.avatar_url,
      };
    }
  }
  return { id: data.id as string, other };
}

/** Recherche d'utilisateurs par username ou nom complet (via RPC SECURITY DEFINER). */
export async function searchProfiles(query: string, limit = 10): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient();
  const q = query.trim();
  if (!q) return [];
  const { data } = await supabase.rpc("search_users", {
    p_query: q,
    p_limit: limit,
  });
  return (data as Profile[] | null) ?? [];
}
