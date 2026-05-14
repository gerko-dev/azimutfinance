"use client";

import { useActionState, useState } from "react";
import {
  signInAction,
  resendConfirmationAction,
  type AuthState,
} from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";
import PasswordInput from "@/components/auth/PasswordInput";

type Props = {
  redirectTo: string;
  initialError?: string;
};

const INPUT_CLASS =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function LoginForm({ redirectTo, initialError }: Props) {
  const [state, action] = useActionState<AuthState, FormData>(
    signInAction,
    initialError ? { error: initialError } : null,
  );
  const [resendState, resendAction] = useActionState<AuthState, FormData>(
    resendConfirmationAction,
    null,
  );
  // Identifiant contrôlé : permet de le réinjecter dans le formulaire de renvoi
  // du mail de confirmation sans que l'utilisateur ait à le retaper.
  const [identifier, setIdentifier] = useState("");

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="redirect" value={redirectTo} />

        <div>
          <label
            htmlFor="identifier"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Email ou nom d&apos;utilisateur
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Mot de passe
            </label>
            <a
              href="/mot-de-passe-oublie"
              className="text-xs text-blue-700 hover:underline"
            >
              Oublié ?
            </a>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state?.error && (
          <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {state.error}
          </div>
        )}

        <SubmitButton label="Se connecter" pendingLabel="Connexion..." />
      </form>

      {/* Email non confirmé : on propose de renvoyer le lien de confirmation. */}
      {state?.code === "email_not_confirmed" &&
        (resendState?.success ? (
          <div className="px-3 py-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md">
            {resendState.success}
          </div>
        ) : (
          <form action={resendAction} className="space-y-2">
            <input type="hidden" name="identifier" value={identifier} />
            {resendState?.error && (
              <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
                {resendState.error}
              </div>
            )}
            <button
              type="submit"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700"
            >
              Renvoyer l&apos;email de confirmation
            </button>
          </form>
        ))}
    </div>
  );
}
