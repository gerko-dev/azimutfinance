// === Types partagés messagerie interne ===

export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ConversationParticipant = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
};

/** Conversation enrichie pour la sidebar */
export type ConversationSummary = {
  id: string;
  last_message_at: string;
  /** L'autre participant (1-a-1) */
  other: Profile;
  /** Aperçu du dernier message */
  lastMessage: {
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  /** Nombre de messages non lus pour l'utilisateur courant */
  unreadCount: number;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
