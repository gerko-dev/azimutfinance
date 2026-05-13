"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail, getAppUrl } from "@/lib/email/resend";

export type ProDemoFormState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | null;

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function emailEscape(s: string): string {
  return s.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

export async function submitProDemoAction(
  _prev: ProDemoFormState,
  fd: FormData,
): Promise<ProDemoFormState> {
  const organization = str(fd.get("organization"));
  const contactName = str(fd.get("contact_name"));
  const contactRole = str(fd.get("contact_role"));
  const email = str(fd.get("email"));
  const phone = str(fd.get("phone"));
  const country = str(fd.get("country"));
  const teamSize = str(fd.get("team_size"));
  const message = str(fd.get("message"));
  const useCases = fd.getAll("use_cases").map((v) => String(v)).filter(Boolean);
  const source = str(fd.get("source")) || "pros_demo";

  if (!organization) return { ok: false, error: "Nom de l'institution requis." };
  if (!contactName) return { ok: false, error: "Nom du contact requis." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Adresse email invalide." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_pro_demo_request", {
    p_organization: organization,
    p_contact_name: contactName,
    p_contact_role: contactRole || null,
    p_email: email,
    p_phone: phone || null,
    p_country: country || null,
    p_team_size: teamSize || null,
    p_use_cases: useCases.length > 0 ? useCases : null,
    p_message: message || null,
    p_source: source,
  });

  if (error) return { ok: false, error: error.message };

  const id = String(data ?? "");

  // Email de notification a l'equipe — ne fait pas echouer la soumission
  try {
    const useCasesLine =
      useCases.length > 0 ? useCases.join(", ") : "(non précisé)";
    const html = `
      <h2>Nouvelle demande de démo Pro</h2>
      <p><strong>${emailEscape(organization)}</strong> — ${emailEscape(contactName)}${
        contactRole ? " · " + emailEscape(contactRole) : ""
      }</p>
      <ul>
        <li>Email : <a href="mailto:${emailEscape(email)}">${emailEscape(email)}</a></li>
        ${phone ? `<li>Téléphone : ${emailEscape(phone)}</li>` : ""}
        ${country ? `<li>Pays : ${emailEscape(country)}</li>` : ""}
        ${teamSize ? `<li>Taille équipe : ${emailEscape(teamSize)}</li>` : ""}
        <li>Cas d'usage : ${emailEscape(useCasesLine)}</li>
      </ul>
      ${message ? `<p><strong>Message :</strong><br>${emailEscape(message).replace(/\n/g, "<br>")}</p>` : ""}
      <p style="color:#64748b;font-size:12px;margin-top:24px">
        Source : ${emailEscape(source)} · ID : ${emailEscape(id)}<br>
        Géré dans <a href="${getAppUrl()}/admin/demandes-pro">/admin/demandes-pro</a>
      </p>
    `;
    const text =
      `Nouvelle demande de démo Pro\n\n` +
      `${organization} — ${contactName}${contactRole ? " · " + contactRole : ""}\n` +
      `Email: ${email}\n` +
      (phone ? `Téléphone: ${phone}\n` : "") +
      (country ? `Pays: ${country}\n` : "") +
      (teamSize ? `Taille équipe: ${teamSize}\n` : "") +
      `Cas d'usage: ${useCasesLine}\n` +
      (message ? `\nMessage:\n${message}\n` : "") +
      `\nGéré dans ${getAppUrl()}/admin/demandes-pro`;

    await sendEmail({
      to: "contact@azimutfinance.com",
      subject: `[Demo Pro] ${organization} — ${contactName}`,
      html,
      text,
      replyTo: email,
    });
  } catch (e) {
    console.error("[pros/demo] email notif rate:", e);
  }

  return { ok: true, id };
}
