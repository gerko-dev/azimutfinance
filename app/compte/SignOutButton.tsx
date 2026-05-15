"use client";

import { signOutAction } from "@/lib/auth/actions";
import { useFormStatus } from "react-dom";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 text-sm bg-white/10 text-white border border-white/20 rounded-md hover:bg-white/20 disabled:opacity-50"
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
