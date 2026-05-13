import "server-only";

import { getAppUrl } from "./resend";
import { loadEmailTemplate } from "./load";
import { renderEmail, type RenderedEmail } from "./render";
import { formatFcfa, type PlanCode, PLANS } from "@/lib/premium/plans";

function fmtDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ============================================================
// Email : abonnement Premium validé
// ============================================================

export async function premiumValidatedEmail(args: {
  fullName?: string | null;
  plan: PlanCode;
  amountFcfa: number;
  premiumUntil: Date;
}): Promise<RenderedEmail> {
  const template = await loadEmailTemplate("premium-validated");
  const plan = PLANS[args.plan];
  const appUrl = getAppUrl();
  return renderEmail(template, {
    full_name: args.fullName ?? "",
    plan_label: plan.label,
    amount: formatFcfa(args.amountFcfa),
    premium_until: fmtDateFr(args.premiumUntil),
    account_url: `${appUrl}/compte`,
    app_url: appUrl,
  });
}

// ============================================================
// Email : relance J-3 avant expiration
// ============================================================

export async function premiumExpiringSoonEmail(args: {
  fullName?: string | null;
  plan: PlanCode;
  premiumUntil: Date;
  daysLeft: number;
}): Promise<RenderedEmail> {
  const template = await loadEmailTemplate("premium-expiring-soon");
  const plan = PLANS[args.plan];
  const appUrl = getAppUrl();
  return renderEmail(template, {
    full_name: args.fullName ?? "",
    plan_label: plan.label,
    premium_until: fmtDateFr(args.premiumUntil),
    days_left: String(args.daysLeft),
    premium_url: `${appUrl}/premium`,
    app_url: appUrl,
  });
}

// ============================================================
// Email : paiement rejeté
// ============================================================

export async function premiumRejectedEmail(args: {
  fullName?: string | null;
  plan: PlanCode;
  amountFcfa: number;
  reason: string;
}): Promise<RenderedEmail> {
  const template = await loadEmailTemplate("premium-rejected");
  const plan = PLANS[args.plan];
  const appUrl = getAppUrl();
  return renderEmail(template, {
    full_name: args.fullName ?? "",
    plan_label: plan.label,
    amount: formatFcfa(args.amountFcfa),
    rejection_reason: args.reason,
    premium_url: `${appUrl}/premium`,
    app_url: appUrl,
  });
}
