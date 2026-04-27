"use client";

import { useActionState } from "react";
import { resetPasswordRequestAction, type AuthState } from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";

export default function ResetForm() {
  const [state, action] = useActionState<AuthState, FormData>(
    resetPasswordRequestAction,
    null
  );

  if (state?.success) {
    return (
      <div className="px-4 py-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md">
        {state.success}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {state?.error && (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {state.error}
        </div>
      )}

      <SubmitButton label="Envoyer le lien" pendingLabel="Envoi..." />
    </form>
  );
}
