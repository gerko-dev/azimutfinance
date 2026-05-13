import "server-only";

/**
 * Petit client Resend basé sur fetch (zéro dépendance).
 * Doc API : https://resend.com/docs/api-reference/emails/send-email
 *
 * Variables d'environnement requises :
 *   - RESEND_API_KEY      (clé secrète, jamais NEXT_PUBLIC_*)
 *   - RESEND_FROM         (expéditeur, ex. "AzimutFinance <noreply@azimutfinance.com>")
 *                          Si non défini, fallback sur l'expéditeur de test Resend.
 *
 * Sans RESEND_API_KEY, l'envoi est court-circuité (utile en dev local).
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

const DEFAULT_FROM = "AzimutFinance <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Pas d'erreur, on log et on continue — utile pour dev sans clé.
    console.warn(
      "[resend] RESEND_API_KEY manquant — email non envoyé.",
      input.subject,
      "→",
      input.to,
    );
    return { ok: false, error: "RESEND_API_KEY non configuré", skipped: true };
  }

  const from = process.env.RESEND_FROM || DEFAULT_FROM;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      const msg = body.message || body.name || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, id: body.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur réseau Resend",
    };
  }
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://azimutfinance.com"
  );
}
