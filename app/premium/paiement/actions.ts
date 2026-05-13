"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidPlanCode, PLANS } from "@/lib/premium/plans";
import { isValidPaymentMethod } from "@/lib/premium/payment-methods";

export type DeclareState = {
  error?: string;
} | null;

const PROOFS_BUCKET = "payment-proofs";
const ALLOWED_PROOF_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 Mo

function sanitizePhone(s: string): string {
  // Garde + et chiffres, retire espaces / tirets
  return s.replace(/[^\d+]/g, "").slice(0, 24);
}

export async function declarePaymentAction(
  _prev: DeclareState,
  formData: FormData,
): Promise<DeclareState> {
  const planCode = String(formData.get("plan") ?? "");
  const method = String(formData.get("method") ?? "");
  const payerPhoneRaw = String(formData.get("payer_phone") ?? "").trim();
  const transactionRef = String(formData.get("transaction_ref") ?? "").trim();
  const proof = formData.get("proof");

  if (!isValidPlanCode(planCode)) return { error: "Plan invalide." };
  if (!isValidPaymentMethod(method)) return { error: "Moyen de paiement invalide." };

  const payerPhone = sanitizePhone(payerPhoneRaw);
  if (payerPhone.length < 8) {
    return { error: "Numéro de téléphone invalide (au moins 8 chiffres)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?redirect=/premium");
  }

  const plan = PLANS[planCode];

  // Upload optionnel de la capture / PDF
  let proofPath: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    if (!ALLOWED_PROOF_MIME.has(proof.type)) {
      return { error: "Format de justificatif non supporté (JPG, PNG, WebP, HEIC, PDF)." };
    }
    if (proof.size > MAX_PROOF_BYTES) {
      return { error: "Justificatif trop volumineux (max 5 Mo)." };
    }
    const ext = (() => {
      if (proof.type === "image/jpeg") return "jpg";
      if (proof.type === "image/png") return "png";
      if (proof.type === "image/webp") return "webp";
      if (proof.type === "image/heic") return "heic";
      if (proof.type === "application/pdf") return "pdf";
      return "bin";
    })();
    const random = Math.random().toString(36).slice(2, 10);
    const path = `${user.id}/${Date.now()}-${random}.${ext}`;
    const buffer = await proof.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(PROOFS_BUCKET)
      .upload(path, buffer, {
        contentType: proof.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) {
      return { error: `Échec de l'envoi du justificatif : ${upErr.message}` };
    }
    proofPath = path;
  }

  const { error: insErr } = await supabase.from("pending_payments").insert({
    user_id: user.id,
    plan: plan.code,
    amount_fcfa: plan.priceFcfa,
    payment_method: method,
    payer_phone: payerPhone,
    transaction_ref: transactionRef || null,
    proof_path: proofPath,
    status: "pending",
  });

  if (insErr) {
    return { error: `Erreur lors de l'enregistrement : ${insErr.message}` };
  }

  revalidatePath("/admin/abonnements");
  redirect("/premium/paiement/recu");
}
