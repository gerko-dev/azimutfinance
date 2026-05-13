import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Alert, AlertTriggerWithAlert } from "./types";

export async function listMyAlerts(): Promise<Alert[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("alerts")
    .select(
      "id, user_id, name, alert_type, target_type, target_code, params, active, last_triggered_at, snooze_until, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  return (data as Alert[] | null) ?? [];
}

export async function listMyAlertTriggers(
  limit = 30,
): Promise<AlertTriggerWithAlert[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Note: pas de FK select Supabase pour ne pas se reposer sur les relations
  // automatiques. On charge les triggers puis on joint côté JS via une 2e requête.
  const { data: trigRaw } = await supabase
    .from("alert_triggers")
    .select(
      "id, alert_id, user_id, triggered_at, value_at_trigger, message, read_at, email_sent_at",
    )
    .eq("user_id", user.id)
    .order("triggered_at", { ascending: false })
    .limit(limit);
  const triggers =
    (trigRaw as {
      id: string;
      alert_id: string;
      user_id: string;
      triggered_at: string;
      value_at_trigger: Record<string, unknown> | null;
      message: string | null;
      read_at: string | null;
      email_sent_at: string | null;
    }[] | null) ?? [];
  if (triggers.length === 0) return [];

  const alertIds = Array.from(new Set(triggers.map((t) => t.alert_id)));
  const { data: alertsRaw } = await supabase
    .from("alerts")
    .select("id, name, alert_type, target_type, target_code")
    .in("id", alertIds);
  const byId = new Map<
    string,
    {
      name: string;
      alert_type: string;
      target_type: string;
      target_code: string;
    }
  >();
  for (const a of (alertsRaw as
    | {
        id: string;
        name: string;
        alert_type: string;
        target_type: string;
        target_code: string;
      }[]
    | null) ?? []) {
    byId.set(a.id, a);
  }

  return triggers.map((t) => {
    const a = byId.get(t.alert_id);
    return {
      ...t,
      alert_name: a?.name ?? "Alerte supprimée",
      alert_type: (a?.alert_type ?? "custom") as AlertTriggerWithAlert["alert_type"],
      target_type: (a?.target_type ?? "any") as AlertTriggerWithAlert["target_type"],
      target_code: a?.target_code ?? "—",
    };
  });
}

export async function getMyAlertsUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data } = await supabase.rpc("alerts_unread_count");
  return typeof data === "number" ? data : 0;
}
