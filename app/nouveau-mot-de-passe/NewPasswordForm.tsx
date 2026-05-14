"use client";

import { useActionState } from "react";
import { updatePasswordAction, type AuthState } from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";
import PasswordInput from "@/components/auth/PasswordInput";

export default function NewPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(
    updatePasswordAction,
    null,
  );

  // En cas de succès, updatePasswordAction redirige vers /compte — pas d'état
  // de succès à afficher ici.
  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Nouveau mot de passe
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="mt-1 text-xs text-slate-500">Minimum 8 caractères.</p>
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Confirme le mot de passe
        </label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>

      {state?.error && (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {state.error}
        </div>
      )}

      <SubmitButton label="Mettre à jour" pendingLabel="Mise à jour..." />
    </form>
  );
}
