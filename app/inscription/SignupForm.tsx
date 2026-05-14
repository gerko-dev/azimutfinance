"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthState } from "@/lib/auth/actions";
import SubmitButton from "@/components/auth/SubmitButton";
import PasswordInput from "@/components/auth/PasswordInput";

const INPUT_CLASS =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, null);

  if (state?.success) {
    return (
      <div className="space-y-3">
        <div className="px-4 py-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md">
          {state.success}
        </div>
        <p className="text-xs text-center text-slate-500">
          Mauvaise adresse email ?{" "}
          <Link
            href="/inscription"
            className="text-blue-700 hover:underline font-medium"
          >
            Recommencer l&apos;inscription
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Nom d&apos;utilisateur
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-slate-500">
          3 à 20 caractères : lettres, chiffres et « _ » (converti en minuscules).
        </p>
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Mot de passe
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

      <SubmitButton label="Créer mon compte" pendingLabel="Création..." />
    </form>
  );
}
