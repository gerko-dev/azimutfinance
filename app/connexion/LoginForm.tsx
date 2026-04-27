"use client";

import { useActionState } from "react";
import { signInAction, type AuthState } from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";

type Props = {
  redirectTo: string;
  initialError?: string;
};

export default function LoginForm({ redirectTo, initialError }: Props) {
  const [state, action] = useActionState<AuthState, FormData>(
    signInAction,
    initialError ? { error: initialError } : null
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />

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
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Mot de passe
          </label>
          <a href="/mot-de-passe-oublie" className="text-xs text-blue-700 hover:underline">
            Oublié ?
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {state?.error && (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {state.error}
        </div>
      )}

      <SubmitButton label="Se connecter" pendingLabel="Connexion..." />
    </form>
  );
}
