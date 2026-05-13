"use client";

import { useActionState } from "react";
import { initCheckoutAction, type CheckoutState } from "./actions";
import { PLAN_LIST, formatFcfa, type Plan } from "@/lib/premium/plans";

type Props = {
  isAuthenticated: boolean;
  isPremium: boolean;
  plans?: Plan[];
};

export default function PremiumPlanCards({
  isAuthenticated,
  isPremium,
  plans,
}: Props) {
  const list = plans && plans.length > 0 ? plans : PLAN_LIST;
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    initCheckoutAction,
    null,
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {list.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            isAuthenticated={isAuthenticated}
            isPremium={isPremium}
            pending={pending}
            formAction={formAction}
          />
        ))}
      </div>

      {state?.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </div>
      )}
      {state?.info && (
        <div className="mt-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {state.info}
        </div>
      )}
    </>
  );
}

function PlanCard({
  plan,
  isAuthenticated,
  isPremium,
  pending,
  formAction,
}: {
  plan: Plan;
  isAuthenticated: boolean;
  isPremium: boolean;
  pending: boolean;
  formAction: (formData: FormData) => void;
}) {
  const featured = plan.highlight;

  return (
    <div
      className={`relative rounded-2xl border bg-white p-6 md:p-8 flex flex-col ${
        featured
          ? "border-amber-300 shadow-lg ring-1 ring-amber-200"
          : "border-slate-200 shadow-sm"
      }`}
    >
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block text-[11px] uppercase tracking-wider font-semibold bg-amber-500 text-white px-3 py-1 rounded-full shadow">
          Meilleur prix
        </div>
      )}

      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {plan.label}
      </div>
      <div className="text-sm text-slate-600 mb-5">{plan.tagline}</div>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl md:text-4xl font-semibold text-slate-900 tabular-nums">
          {plan.priceFcfa.toLocaleString("fr-FR")}
        </span>
        <span className="text-sm text-slate-500">FCFA</span>
      </div>
      <div className="text-xs text-slate-500 mb-5">
        pour {plan.durationLabel} ·{" "}
        <span className="tabular-nums">
          {formatFcfa(plan.pricePerMonthFcfa)}
        </span>
        /mois
      </div>

      {plan.discountPct > 0 ? (
        <div className="inline-flex w-fit items-center gap-1 text-[11px] font-medium bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full mb-6">
          −{plan.discountPct}% vs. mensuel
        </div>
      ) : (
        <div className="h-[26px] mb-6" />
      )}

      <div className="mt-auto">
        {isPremium ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-slate-100 text-slate-500 text-sm font-medium cursor-not-allowed"
          >
            Déjà abonné
          </button>
        ) : isAuthenticated ? (
          <form action={formAction}>
            <input type="hidden" name="plan" value={plan.code} />
            <button
              type="submit"
              disabled={pending}
              className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed ${
                featured
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {pending ? "Initialisation…" : "Démarrer le paiement"}
            </button>
          </form>
        ) : (
          <a
            href={`/connexion?redirect=${encodeURIComponent("/premium")}`}
            className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-medium transition ${
              featured
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Se connecter pour s&apos;abonner
          </a>
        )}
      </div>
    </div>
  );
}
