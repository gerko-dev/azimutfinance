import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PLANS,
  isValidPlanCode,
  formatFcfa,
  type PlanCode,
} from "@/lib/premium/plans";
import { getEnabledPaymentMethods } from "@/lib/premium/payment-methods";
import PaymentDeclarationForm from "./PaymentDeclarationForm";

export const metadata = {
  title: "Paiement Premium — AzimutFinance",
};

export const dynamic = "force-dynamic";

export default async function PaiementPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const planCode = sp.plan ?? "";

  if (!isValidPlanCode(planCode)) {
    redirect("/premium");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/connexion?redirect=${encodeURIComponent(`/premium/paiement?plan=${planCode}`)}`);
  }

  const plan = PLANS[planCode as PlanCode];
  const methods = getEnabledPaymentMethods();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="text-xs text-slate-500 mb-3">
          <Link href="/premium" className="hover:text-slate-900">
            Premium
          </Link>
          <span className="mx-2">›</span>
          <span>Paiement</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-2">
          Paiement Premium · {plan.label}
        </h1>
        <p className="text-sm text-slate-600 mb-8">
          Montant à payer :{" "}
          <span className="font-semibold text-slate-900">
            {formatFcfa(plan.priceFcfa)}
          </span>{" "}
          · Durée : {plan.durationLabel}
        </p>

        {/* Étape 1 — instructions */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 mb-6">
          <div className="flex items-start gap-3 mb-5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center">
              1
            </span>
            <div>
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                Envoie {formatFcfa(plan.priceFcfa)} à l&apos;un de ces numéros
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Depuis ton application mobile money habituelle. Le numéro
                bénéficiaire et le nom doivent correspondre exactement.
              </p>
            </div>
          </div>

          {methods.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Aucun moyen de paiement configuré pour le moment. Contacte-nous à{" "}
              <a
                href="mailto:contact@azimutfinance.com"
                className="underline font-medium"
              >
                contact@azimutfinance.com
              </a>
              .
            </div>
          ) : (
            <ul className="space-y-3">
              {methods.map((m) => (
                <li
                  key={m.code}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {m.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Bénéficiaire : <span className="text-slate-700">{m.beneficiary}</span>
                      {m.fees ? <> · {m.fees}</> : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums select-all">
                      {m.phone}
                    </div>
                    <CopyHint phone={m.phone} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            <strong>Important :</strong> envoie exactement{" "}
            <span className="font-semibold tabular-nums">
              {formatFcfa(plan.priceFcfa)}
            </span>
            . Note bien la <strong>référence de transaction</strong> reçue par
            SMS — tu en auras besoin à l&apos;étape suivante.
          </div>
        </section>

        {/* Étape 2 — déclaration */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
          <div className="flex items-start gap-3 mb-5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center">
              2
            </span>
            <div>
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                Déclare ton paiement
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Un admin vérifie sous 24h (souvent en quelques heures) que la
                somme est bien arrivée, puis active ton accès Premium. Tu reçois
                un email de confirmation.
              </p>
            </div>
          </div>

          <PaymentDeclarationForm planCode={plan.code} methods={methods} />
        </section>

        <p className="text-xs text-slate-500 mt-6 text-center">
          Besoin d&apos;aide ?{" "}
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

function CopyHint({ phone }: { phone: string }) {
  return (
    <div className="text-[10px] text-slate-400 mt-0.5">
      Appuyer pour sélectionner · {phone.replace(/\s+/g, "").length} chiffres
    </div>
  );
}
