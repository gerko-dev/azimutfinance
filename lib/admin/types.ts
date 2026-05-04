// === Types admin ===

export type AppRole =
  | "member"
  | "premium"
  | "pro"
  | "adminlevel1"
  | "adminlevel2"
  | "adminlevel3";

export type AdminLevel = 1 | 2 | 3;

export const ROLE_LABEL: Record<AppRole, string> = {
  member: "Membre",
  premium: "Premium",
  pro: "Pro",
  adminlevel1: "Admin · Niveau 1",
  adminlevel2: "Admin · Niveau 2",
  adminlevel3: "Modérateur · Niveau 3",
};

export const ROLE_COLOR: Record<AppRole, string> = {
  member: "#475569",
  premium: "#1d4ed8",
  pro: "#7c3aed",
  adminlevel1: "#dc2626",
  adminlevel2: "#b45309",
  adminlevel3: "#059669",
};

export type AdminMember = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: AppRole;
  country: string | null;
  created_at: string;
  onboarded_at: string | null;
};

export type AdminMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_email: string | null;
  body: string;
  created_at: string;
};

export type AdminAuditEntry = {
  id: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  actor_email: string | null;
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type SanctionEvent = {
  action: "warn_user" | "suspend_user" | "unsuspend_user" | "ban_user";
  reason: string | null;
  metadata: Record<string, unknown> | null;
  actor_role: AppRole | null;
  created_at: string;
};

export type SanctionsStatus = {
  is_suspended: boolean;
  is_banned: boolean;
  suspended_until: string | null;
  suspension_reason: string | null;
  warning_count: number;
  history: SanctionEvent[];
};

export type AdminPresenceEntry = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  last_seen_at: string;
  session_start_at: string;
  user_agent: string | null;
  is_online: boolean;
  online_seconds: number | null;
  offline_seconds: number | null;
};

export type AdminDashboardStats = {
  total_users: number;
  total_admins: number;
  total_messages: number;
  total_conversations: number;
  total_transactions: number;
  active_seasons: number;
  audit_last_24h: number;
};

export type AdminSeason = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  initial_capital: number;
  transaction_fee_pct: number;
  status: "upcoming" | "active" | "ended";
  created_at: string;
};

export type ReportCategory = "spam" | "harcelement" | "insulte" | "arnaque" | "autre";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type ReportStatusFilter = ReportStatus | "all";

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  spam: "Spam",
  harcelement: "Harcèlement",
  insulte: "Insultes",
  arnaque: "Arnaque",
  autre: "Autre",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Ouvert",
  actioned: "Traité",
  dismissed: "Rejeté",
};

export type AdminReport = {
  id: string;
  message_id: string;
  conversation_id: string | null;
  category: ReportCategory;
  note: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  resolution_note: string | null;
  reporter_id: string;
  reporter_username: string | null;
  reporter_email: string | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_email: string | null;
  resolver_id: string | null;
  resolver_username: string | null;
  body_preview: string | null;
  message_created_at: string | null;
  reports_total: number;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
