import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, getAppUrl } from "@/lib/email/resend";
import { loadAllActions, type ActionRow } from "@/lib/dataLoader";
import type { Alert, AlertType } from "@/lib/alerts/types";
import { describeAlert } from "@/lib/alerts/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/evaluate-alerts
 *
 * Evalue toutes les alertes actives et insere un alert_triggers pour celles
 * qui se declenchent. Envoie un email par trigger (anti-spam : la prochaine
 * evaluation respecte snooze_until / last_triggered_at).
 *
 * Cadence : 1x par jour minimum, idealement apres le rafraichissement des
 * donnees BRVM (fin de journee).
 *
 * Auth : header `Authorization: Bearer <CRON_SECRET>` (env var).
 *
 * Couvre les types : price_threshold, daily_pct_change. Les autres types
 * (bond_maturity_approach, news_mention, index_threshold, fx_threshold,
 * custom) renvoient simplement leur compteur de "non implementes" pour
 * traitement ulterieur.
 */

const COOLDOWN_HOURS = 24; // ne pas re-trigger la meme alerte avant 24h

type AlertRow = Alert & { profile_email?: string | null; full_name?: string | null };

export async function GET(req: Request) {
  // 1. Auth
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const summary = {
    scanned: 0,
    triggered: 0,
    emails_sent: 0,
    skipped_cooldown: 0,
    skipped_inactive_user: 0,
    not_implemented: 0,
  };

  // 2. Charge les alertes actives non snooze
  const nowIso = new Date().toISOString();
  const { data: rawAlerts } = await admin
    .from("alerts")
    .select(
      "id, user_id, name, alert_type, target_type, target_code, params, active, last_triggered_at, snooze_until, created_at, updated_at",
    )
    .eq("active", true)
    .or(`snooze_until.is.null,snooze_until.lt.${nowIso}`);

  const alerts = (rawAlerts as Alert[] | null) ?? [];
  summary.scanned = alerts.length;

  // 3. Bulk-fetch des profils + emails pour les notifs
  const userIds = Array.from(new Set(alerts.map((a) => a.user_id)));
  const profileByUser = new Map<
    string,
    { email: string | null; full_name: string | null; role: string }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name, role")
      .in("id", userIds);
    for (const p of (profiles ?? []) as {
      id: string;
      email: string | null;
      full_name: string | null;
      role: string;
    }[]) {
      profileByUser.set(p.id, {
        email: p.email,
        full_name: p.full_name,
        role: p.role,
      });
    }
  }

  // 4. Précharge la liste des actions BRVM (utilisé pour price_threshold + daily_pct_change)
  const actions = loadAllActions();
  const actionByCode = new Map<string, ActionRow>();
  for (const a of actions) actionByCode.set(a.code.toUpperCase(), a);

  // 5. Évalue chaque alerte
  for (const a of alerts) {
    const profile = profileByUser.get(a.user_id);
    if (!profile) {
      summary.skipped_inactive_user++;
      continue;
    }

    // Cooldown : si la dernière notif est < COOLDOWN_HOURS, on skip
    if (a.last_triggered_at) {
      const last = new Date(a.last_triggered_at).getTime();
      if (Date.now() - last < COOLDOWN_HOURS * 3600 * 1000) {
        summary.skipped_cooldown++;
        continue;
      }
    }

    const evalResult = evaluateAlert(a, actionByCode);
    if (!evalResult) continue;
    if (evalResult === "not_implemented") {
      summary.not_implemented++;
      continue;
    }

    // 6. Trigger
    const triggeredAt = new Date().toISOString();
    const { data: trigInserted } = await admin
      .from("alert_triggers")
      .insert({
        alert_id: a.id,
        user_id: a.user_id,
        triggered_at: triggeredAt,
        value_at_trigger: evalResult.value,
        message: evalResult.message,
      })
      .select("id")
      .single();

    if (!trigInserted) continue;

    // Met à jour last_triggered_at
    await admin
      .from("alerts")
      .update({ last_triggered_at: triggeredAt })
      .eq("id", a.id);

    summary.triggered++;

    // 7. Email
    if (profile.email) {
      const subj = `[Alerte] ${a.name}`;
      const html = renderEmail(a, evalResult.message);
      const text = `${a.name}\n\n${evalResult.message}\n\nGérer vos alertes : ${getAppUrl()}/outils/alertes`;
      const send = await sendEmail({
        to: profile.email,
        subject: subj,
        html,
        text,
      });
      if (send.ok) {
        await admin
          .from("alert_triggers")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", (trigInserted as { id: string }).id);
        summary.emails_sent++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

// ============================================================
//  Eval logic
// ============================================================

type EvalResult =
  | { message: string; value: Record<string, unknown> }
  | "not_implemented"
  | null;

function evaluateAlert(
  a: Alert,
  actionByCode: Map<string, ActionRow>,
): EvalResult {
  const p = a.params as Record<string, unknown>;
  const type = a.alert_type as AlertType;

  if (type === "price_threshold") {
    if (a.target_type !== "stock") return null;
    const action = actionByCode.get(a.target_code.toUpperCase());
    if (!action) return null;
    const direction = p.direction as "above" | "below" | undefined;
    const threshold = Number(p.price);
    if (!Number.isFinite(threshold) || !direction) return null;
    const price = action.price;
    const hit =
      direction === "above" ? price >= threshold : price <= threshold;
    if (!hit) return null;
    return {
      message: `${action.code} ${describeAlert(a)} — prix actuel ${price.toLocaleString("fr-FR")} FCFA`,
      value: { price, threshold, direction },
    };
  }

  if (type === "daily_pct_change") {
    if (a.target_type !== "stock") return null;
    const action = actionByCode.get(a.target_code.toUpperCase());
    if (!action) return null;
    const threshold = Number(p.threshold_pct);
    const direction = (p.direction as string) ?? "either";
    if (!Number.isFinite(threshold)) return null;
    const pct = action.changePercent * 100;
    const abs = Math.abs(pct);
    let hit = false;
    if (direction === "above") hit = pct >= threshold;
    else if (direction === "below") hit = pct <= -threshold;
    else hit = abs >= threshold;
    if (!hit) return null;
    return {
      message: `${action.code} variation jour ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% (seuil ${threshold}%)`,
      value: { changePercent: pct, threshold, direction },
    };
  }

  // Autres types non implémentés dans cette v1
  return "not_implemented";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail(a: Alert, message: string): string {
  const url = `${getAppUrl()}/outils/alertes`;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#0f172a;margin:0 0 8px">${escapeHtml(a.name)}</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 16px">${escapeHtml(message)}</p>
      <a href="${url}" style="display:inline-block;background:#1d4ed8;color:white;padding:10px 16px;border-radius:6px;font-size:13px;text-decoration:none">
        Gérer mes alertes
      </a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">
        Vous recevez cet email car vous avez configuré une alerte sur
        AzimutFinance. Désactivez l'alerte depuis votre tableau de bord pour
        ne plus recevoir ce type de notification.
      </p>
    </div>
  `;
}
