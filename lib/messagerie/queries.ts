import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ADMIN_TEAM_PROFILE,
  type ConversationKind,
  type ConversationStatus,
  type ConversationSummary,
  type Message,
  type Profile,
} from "./types";

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
    .select("conversation_id, last_read_at, cleared_at")
    .eq("user_id", user.id);
  if (!myParts || myParts.length === 0) return [];

  const convIds = myParts.map((p) => p.conversation_id);
  const myReadMap = new Map<string, string>();
  const myClearedMap = new Map<string, string>();
  for (const p of myParts) {
    myReadMap.set(p.conversation_id, p.last_read_at);
    if (p.cleared_at) myClearedMap.set(p.conversation_id, p.cleared_at as string);
  }

  // 2) Conversations elles-memes (last_message_at, status, kind, created_by)
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, last_message_at, status, kind, created_by")
    .in("id", convIds)
    .order("last_message_at", { ascending: false });
  if (!convs) return [];

  // Masquage « supprimer pour moi » : on retire les conversations dont le
  // dernier message n'est pas posterieur a mon cleared_at.
  const visibleConvs = convs.filter((c) => {
    const cleared = myClearedMap.get(c.id as string);
    return !cleared || (c.last_message_at as string) > cleared;
  });
  if (visibleConvs.length === 0) return [];

  // 3) Tous les participants des conversations
  const { data: allParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds);

  // Map conv_id -> liste des participants
  const partsByConv = new Map<string, string[]>();
  for (const p of allParts ?? []) {
    const arr = partsByConv.get(p.conversation_id) ?? [];
    arr.push(p.user_id);
    partsByConv.set(p.conversation_id, arr);
  }

  // 4) Profils dont on a besoin :
  //    - conv directe  : l'autre participant
  //    - canal admin   : si je ne suis PAS l'initiateur (= je suis admin),
  //                      le profil du membre (created_by). Si je suis le
  //                      membre, on affiche le profil synthetique "equipe".
  const neededIds = new Set<string>();
  for (const c of visibleConvs) {
    if (c.kind === "admin") {
      if (c.created_by && c.created_by !== user.id) neededIds.add(c.created_by);
    } else {
      const otherId = (partsByConv.get(c.id) ?? []).find((id) => id !== user.id);
      if (otherId) neededIds.add(otherId);
    }
  }
  const profileMap = new Map<string, Profile>();
  if (neededIds.size > 0) {
    const { data: profiles } = await supabase.rpc("get_users_public", {
      p_user_ids: Array.from(neededIds),
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
    const cleared = myClearedMap.get(key);
    if (cleared && (m.created_at as string) <= cleared) continue;
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
    const k = m.conversation_id as string;
    const cleared = myClearedMap.get(k);
    if (cleared && (m.created_at as string) <= cleared) continue; // masqués
    const lastRead = myReadMap.get(k) ?? "";
    if ((m.created_at as string) > lastRead) {
      unreadByConv.set(k, (unreadByConv.get(k) ?? 0) + 1);
    }
  }

  // 7) Compose le resultat
  const summaries: ConversationSummary[] = visibleConvs.map((c) => {
    const kind = ((c.kind as string) ?? "direct") as ConversationKind;
    const status = ((c.status as string) ?? "accepted") as ConversationStatus;
    const createdBy = (c.created_by as string | null) ?? null;

    let other: Profile;
    if (kind === "admin") {
      // Côté membre (initiateur) : « Équipe AzimutFinance ».
      // Côté admin : le membre qui a ouvert le canal.
      other =
        createdBy === user.id
          ? ADMIN_TEAM_PROFILE
          : profileMap.get(createdBy ?? "") ?? {
              id: createdBy ?? "",
              username: null,
              full_name: "Membre",
              avatar_url: null,
            };
    } else {
      const otherId =
        (partsByConv.get(c.id as string) ?? []).find((id) => id !== user.id) ??
        "";
      other = profileMap.get(otherId) ?? {
        id: otherId,
        username: null,
        full_name: null,
        avatar_url: null,
      };
    }

    return {
      id: c.id as string,
      last_message_at: c.last_message_at as string,
      other,
      lastMessage: lastByConv.get(c.id as string) ?? null,
      unreadCount: unreadByConv.get(c.id as string) ?? 0,
      status,
      kind,
      created_by: createdBy,
      clearedAt: myClearedMap.get(c.id as string) ?? null,
    };
  });

  return summaries;
}

/**
 * Charge les messages d'une conversation, triés ascendant. Respecte le
 * masquage « supprimer pour moi » : les messages antérieurs au cleared_at de
 * l'utilisateur courant sont exclus.
 */
export async function getThread(conversationId: string, limit = 200): Promise<Message[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId);

  if (user) {
    const { data: part } = await supabase
      .from("conversation_participants")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (part?.cleared_at) {
      query = query.gt("created_at", part.cleared_at as string);
    }
  }

  const { data, error } = await query
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
  status: ConversationStatus;
  kind: ConversationKind;
  created_by: string | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("id, status, kind, created_by")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return null;

  const kind = ((data.kind as string) ?? "direct") as ConversationKind;
  const status = ((data.status as string) ?? "accepted") as ConversationStatus;
  const createdBy = (data.created_by as string | null) ?? null;

  let other: Profile | null = null;
  if (kind === "admin") {
    // Côté membre : « Équipe AzimutFinance ». Côté admin : le membre.
    if (createdBy === user.id) {
      other = ADMIN_TEAM_PROFILE;
    } else if (createdBy) {
      const { data: profs } = await supabase.rpc("get_users_public", {
        p_user_ids: [createdBy],
      });
      const prof = (profs as Profile[] | null)?.[0];
      other = prof
        ? {
            id: prof.id,
            username: prof.username,
            full_name: prof.full_name,
            avatar_url: prof.avatar_url,
          }
        : { id: createdBy, username: null, full_name: "Membre", avatar_url: null };
    }
  } else {
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);
    const otherId = parts?.find((p) => p.user_id !== user.id)?.user_id ?? null;
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
  }
  return { id: data.id as string, other, status, kind, created_by: createdBy };
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
