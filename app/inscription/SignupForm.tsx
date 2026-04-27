"use client";

import { useActionState } from "react";
import { signUpAction, type AuthState } from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";

export default function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, null);

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
        <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-1">
          Nom complet <span className="text-slate-400 font-normal">(optionnel)</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-slate-500">Minimum 8 caractères.</p>
      </div>

      {state?.error && (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {state.error}
        </div>
      )}

      <SubmitButton label="Créer mon compte" pendingLabel="Création..." />
    </form>
  );
}
