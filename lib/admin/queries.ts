import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AdminAuditEntry,
  AdminDashboardStats,
  AdminMember,
  AdminMessage,
  AdminPresenceEntry,
  AdminReport,
  AdminSeason,
  ReportStatusFilter,
} from "./types";

export async function getDashboardStats(): Promise<AdminDashboardStats | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error || !data) return null;
  // RPC retourne un array d'une seule ligne
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    total_users: Number(row.total_users ?? 0),
    total_admins: Number(row.total_admins ?? 0),
    total_messages: Number(row.total_messages ?? 0),
    total_conversations: Number(row.total_conversations ?? 0),
    total_transactions: Number(row.total_transactions ?? 0),
    active_seasons: Number(row.active_seasons ?? 0),
    audit_last_24h: Number(row.audit_last_24h ?? 0),
  };
}

export async function listMembers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_members", {
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  return (data as AdminMember[] | null) ?? [];
}

export async function listRecentMessages(limit = 100): Promise<AdminMessage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_recent_messages", {
    p_limit: limit,
  });
  return (data as AdminMessage[] | null) ?? [];
}

export async function listSeasons(): Promise<AdminSeason[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("simulator_seasons")
    .select("*")
    .order("starts_at", { ascending: false });
  return (data as AdminSeason[] | null) ?? [];
}

export async function listPresence(thresholdSeconds = 90): Promise<AdminPresenceEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_presence_list", {
    p_threshold_seconds: thresholdSeconds,
  });
  return (data as AdminPresenceEntry[] | null) ?? [];
}

export async function getOnlineCount(thresholdSeconds = 90): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_online_count", {
    p_threshold_seconds: thresholdSeconds,
  });
  return typeof data === "number" ? data : 0;
}

export type AdminMemberSummary = {
  profile: {
    id: string;
    email: string | null;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    country: string | null;
    experience_level: string | null;
    professional_sector: string | null;
    interests: string[] | null;
    investment_horizon: string | null;
    onboarded_at: string | null;
    created_at: string;
    updated_at: string;
  };
  presence: {
    last_seen_at: string;
    session_start_at: string;
    user_agent: string | null;
    is_online: boolean;
    online_seconds: number | null;
    offline_seconds: number | null;
  } | null;
  messagerie: {
    conversations_count: number;
    messages_sent: number;
    messages_received: number;
    last_message_at: string | null;
  };
  portfolios: Array<{
    portfolio_id: string;
    season_id: string;
    season_name: string;
    season_status: string;
    cash: number;
    joined_at: string;
    initial_capital: number;
    transaction_fee_pct: number;
    transactions_count: number;
    buy_count: number;
    sell_count: number;
  }>;
  audit: Array<{
    id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    metadata: Record<string, unknown> | null;
    reason: string | null;
    created_at: string;
    actor_role: string | null;
  }>;
  sanctions: {
    is_suspended: boolean;
    is_banned: boolean;
    suspended_until: string | null;
    suspension_reason: string | null;
    warning_count: number;
    history: Array<{
      action: string;
      reason: string | null;
      metadata: Record<string, unknown> | null;
      actor_role: string | null;
      created_at: string;
    }>;
  };
};

export async function getMemberSummary(
  userId: string,
): Promise<AdminMemberSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_member_summary", {
    p_user_id: userId,
  });
  if (error || !data) return null;
  return data as AdminMemberSummary;
}

export async function listAudit(opts: {
  limit?: number;
  offset?: number;
}): Promise<AdminAuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_audit", {
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  return (data as AdminAuditEntry[] | null) ?? [];
}

export async function listReports(opts: {
  status?: ReportStatusFilter;
  limit?: number;
  offset?: number;
}): Promise<AdminReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_list_reports", {
    p_status: opts.status ?? "open",
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  return (data as AdminReport[] | null) ?? [];
}

export async function getOpenReportsCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_open_reports_count");
  return typeof data === "number" ? data : 0;
}
