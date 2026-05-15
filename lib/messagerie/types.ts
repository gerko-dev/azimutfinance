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

export type ConversationStatus = "pending" | "accepted";
export type ConversationKind = "direct" | "admin";

/** Conversation enrichie pour la sidebar */
export type ConversationSummary = {
  id: string;
  last_message_at: string;
  /**
   * Interlocuteur affiché. Conversation directe : l'autre membre. Canal admin
   * (kind='admin') : « Équipe AzimutFinance » côté membre, ou le membre
   * lui-même côté admin.
   */
  other: Profile;
  /** Aperçu du dernier message */
  lastMessage: {
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  /** Nombre de messages non lus pour l'utilisateur courant */
  unreadCount: number;
  /** 'pending' = demande de message non encore acceptée par le destinataire. */
  status: ConversationStatus;
  /** 'admin' = canal de contact avec l'équipe. */
  kind: ConversationKind;
  /** Initiateur de la conversation (distingue demande reçue / envoyée). */
  created_by: string | null;
  /**
   * Horodatage de masquage côté utilisateur courant (« supprimer pour moi »).
   * `null` = conversation jamais masquée. Sinon, seuls les messages postérieurs
   * sont affichés.
   */
  clearedAt: string | null;
};

/** Profil synthétique représentant l'équipe sur le canal admin. */
export const ADMIN_TEAM_PROFILE: Profile = {
  id: "admin-team",
  username: null,
  full_name: "Équipe AzimutFinance",
  avatar_url: null,
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const REPORT_CATEGORIES = [
  "spam",
  "harcelement",
  "insulte",
  "arnaque",
  "autre",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  spam: "Spam / publicité",
  harcelement: "Harcèlement",
  insulte: "Insultes / violence verbale",
  arnaque: "Arnaque / escroquerie",
  autre: "Autre",
};
