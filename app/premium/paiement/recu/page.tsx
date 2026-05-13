import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS, formatFcfa } from "@/lib/premium/plans";
import { PAYMENT_METHOD_LABEL } from "@/lib/premium/payment-methods";

export const metadata = {
  title: "Déclaration enregistrée — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function PaiementRecuPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?redirect=/premium");
  }

  // Affiche la derniere declaration de l'utilisateur (peu importe le statut, pour
  // qu'il puisse revoir la page meme apres validation).
  const { data: latest } = await supabase
    .from("pending_payments")
    .select("plan, amount_fcfa, payment_method, payer_phone, transaction_ref, status, rejection_reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-10 text-center">
          <div className="text-5xl md:text-6xl mb-4">📩</div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 mb-2">
            Déclaration enregistrée
          </h1>
          <p className="text-sm md:text-base text-slate-600 max-w-md mx-auto mb-6">
            Merci ! Nous vérifions ton paiement et activons ton accès Premium
            dès qu&apos;il est confirmé — généralement en quelques heures, au
            plus 24h. Tu recevras un email de confirmation.
          </p>

          {latest && (
            <div className="text-left max-w-sm mx-auto bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-sm">
              <Row
                label="Plan"
                value={`${PLANS[latest.plan as keyof typeof PLANS].label} — ${formatFcfa(latest.amount_fcfa)}`}
              />
              <Row
                label="Moyen de paiement"
                value={
                  PAYMENT_METHOD_LABEL[
                    latest.payment_method as keyof typeof PAYMENT_METHOD_LABEL
                  ] ?? latest.payment_method
                }
              />
              <Row label="Numéro émetteur" value={latest.payer_phone} />
              {latest.transaction_ref && (
                <Row label="Référence" value={latest.transaction_ref} />
              )}
              <Row
                label="Déclarée le"
                value={new Date(latest.created_at).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              <Row
                label="Statut"
                value={
                  latest.status === "pending"
                    ? "⏳ En attente de validation"
                    : latest.status === "validated"
                      ? "✓ Validée — Premium actif"
                      : "✗ Rejetée"
                }
              />
              {latest.status === "rejected" && latest.rejection_reason && (
                <Row label="Motif" value={latest.rejection_reason} />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/compte"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
            >
              Aller à mon compte
            </Link>
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-900 transition"
            >
              ← Retour à l&apos;accueil
            </Link>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-6 text-center">
          Une erreur ? Contacte-nous à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="underline hover:text-slate-900"
          >
            contact@azimutfinance.com
          </a>
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-200 last:border-0">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-900 text-right">{value}</span>
    </div>
  );
}
