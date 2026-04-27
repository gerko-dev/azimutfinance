"use client";

import { signOutAction } from "@/lib/auth/actions";
import { useFormStatus } from "react-dom";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Déconnexion..." : "Se déconnecter"}
    </button>
  );
}

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Inner />
    </form>
  );
}
