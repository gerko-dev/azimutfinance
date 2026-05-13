"use client";

import { useActionState, useState } from "react";
import { declarePaymentAction, type DeclareState } from "./actions";
import type { PaymentMethodConfig } from "@/lib/premium/payment-methods";
import type { PlanCode } from "@/lib/premium/plans";

type Props = {
  planCode: PlanCode;
  methods: PaymentMethodConfig[];
};

export default function PaymentDeclarationForm({ planCode, methods }: Props) {
  const [state, formAction, pending] = useActionState<DeclareState, FormData>(
    declarePaymentAction,
    null,
  );
  const [selectedMethod, setSelectedMethod] = useState<string>(methods[0]?.code ?? "");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="plan" value={planCode} />

      <div>
        <label className="block text-sm font-medium text-slate-900 mb-2">
          Moyen de paiement utilisé
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {methods.map((m) => {
            const checked = selectedMethod === m.code;
            return (
              <label
                key={m.code}
                className={`flex items-center justify-center px-3 py-2 rounded-md border text-sm cursor-pointer transition ${
                  checked
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.code}
                  checked={checked}
                  onChange={() => setSelectedMethod(m.code)}
                  className="sr-only"
                />
                {m.label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="payer_phone"
          className="block text-sm font-medium text-slate-900 mb-2"
        >
          Numéro depuis lequel tu as payé
        </label>
        <input
          id="payer_phone"
          name="payer_phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="+225 07 00 00 00 00"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          C&apos;est ce numéro qui apparaît dans notre historique de réception.
        </p>
      </div>

      <div>
        <label
          htmlFor="transaction_ref"
          className="block text-sm font-medium text-slate-900 mb-2"
        >
          Référence de la transaction{" "}
          <span className="text-slate-400 font-normal">(optionnel mais recommandé)</span>
        </label>
        <input
          id="transaction_ref"
          name="transaction_ref"
          type="text"
          placeholder="Ex. WA-12345ABC ou code Orange"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          Tu la trouves dans le SMS de confirmation ou dans ton historique de
          paiement.
        </p>
      </div>

      <div>
        <label
          htmlFor="proof"
          className="block text-sm font-medium text-slate-900 mb-2"
        >
          Capture d&apos;écran du paiement{" "}
          <span className="text-slate-400 font-normal">(optionnel)</span>
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="block w-full text-sm text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="text-xs text-slate-500 mt-1">
          JPG / PNG / WebP / HEIC / PDF, max 5 Mo. Aide à accélérer la
          validation.
        </p>
      </div>

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Envoi en cours…" : "J'ai payé — envoyer la déclaration"}
      </button>
    </form>
  );
}
