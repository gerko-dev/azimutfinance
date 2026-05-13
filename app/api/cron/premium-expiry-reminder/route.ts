import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { premiumExpiringSoonEmail } from "@/lib/email/templates";
import type { PlanCode } from "@/lib/premium/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/premium-expiry-reminder
 *
 * Trouve les abonnements actifs qui expirent dans les 3 prochains jours et
 * n'ont pas encore recu de relance, envoie l'email "premium-expiring-soon"
 * a l'utilisateur, et marque reminder_sent_at.
 *
 * Auth : header `Authorization: Bearer <CRON_SECRET>` (env var).
 *
 * Idempotent : un utilisateur ne recoit la relance qu'une fois par cycle
 * d'abonnement (colonne reminder_sent_at).
 *
 * Cadence recommandee : 1x par jour. Configurable via cron-job.org gratuit
 * ou Vercel Cron (vercel.json). Voir README pour la doc.
 */

const WINDOW_DAYS = 3;

type SubRow = {
  id: string;
  user_id: string;
  plan: PlanCode;
  current_period_end: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export async function GET(req: Request) {
  // ---- Auth ----
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré sur le serveur." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const endWindow = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // ---- Lecture des abonnements concernes ----
  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan, current_period_end")
    .eq("status", "active")
    .is("reminder_sent_at", null)
    .gte("current_period_end", now.toISOString())
    .lte("current_period_end", endWindow.toISOString())
    .order("current_period_end", { ascending: true })
    .limit(500);

  if (subsErr) {
    return NextResponse.json(
      { error: `Lecture subscriptions : ${subsErr.message}` },
      { status: 500 },
    );
  }

  const subRows = (subs ?? []) as SubRow[];
  if (subRows.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      sent: 0,
      failed: 0,
      message: "Aucun abonnement à relancer.",
    });
  }

  // ---- Lecture batch des profils ----
  const userIds = Array.from(new Set(subRows.map((s) => s.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const profileById = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) profileById.set(p.id, p);

  // ---- Envoi + tracking ----
  let sent = 0;
  let failed = 0;
  const errors: Array<{ subscription_id: string; error: string }> = [];

  for (const sub of subRows) {
    const profile = profileById.get(sub.user_id);
    if (!profile?.email) {
      failed += 1;
      errors.push({ subscription_id: sub.id, error: "Pas d'email pour ce user." });
      continue;
    }

    const end = new Date(sub.current_period_end);
    const daysLeft = Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    try {
      const email = await premiumExpiringSoonEmail({
        fullName: profile.full_name,
        plan: sub.plan,
        premiumUntil: end,
        daysLeft,
      });

      const res = await sendEmail({
        to: profile.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: "contact@azimutfinance.com",
      });

      if (!res.ok && !res.skipped) {
        failed += 1;
        errors.push({ subscription_id: sub.id, error: res.error });
        continue;
      }

      // Marque la relance comme envoyee (meme si skipped pour ne pas re-tenter
      // tant que RESEND_API_KEY n'est pas configuré — sinon boucle infinie)
      const { error: updErr } = await supabase
        .from("subscriptions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", sub.id);

      if (updErr) {
        failed += 1;
        errors.push({ subscription_id: sub.id, error: `update: ${updErr.message}` });
        continue;
      }

      if (res.ok) sent += 1;
    } catch (e) {
      failed += 1;
      errors.push({
        subscription_id: sub.id,
        error: e instanceof Error ? e.message : "Erreur inconnue",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: subRows.length,
    sent,
    failed,
    window_days: WINDOW_DAYS,
    errors: errors.slice(0, 10),
  });
}
