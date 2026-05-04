"use client";

import { useState, useTransition } from "react";
import { subscribeNewsletter } from "@/lib/magazine/actions";

export default function NewsletterForm({ source = "magazine" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<"new" | "already" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;

    const fd = new FormData();
    fd.append("email", email.trim());
    fd.append("source", source);

    startTransition(async () => {
      const res = await subscribeNewsletter(fd);
      if (res.ok) {
        setSubmitted(res.data.alreadySubscribed ? "already" : "new");
      } else {
        setError(res.error);
      }
    });
  }

  if (submitted) {
    return (
      <div className="bg-white/10 border border-white/20 rounded p-4 text-center">
        <p className="text-sm text-white">
          {submitted === "already"
            ? "✓ Vous êtes déjà abonné à la newsletter."
            : "✓ Inscription enregistrée. Vous recevrez le prochain numéro le 1er du mois."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && (
        <div className="text-xs px-3 py-2 rounded bg-rose-500/20 border border-rose-300/30 text-rose-100">
          {error}
        </div>
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="votre@email.com"
        className="w-full bg-white/10 border border-white/20 rounded px-3 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-white/40"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-white text-slate-900 hover:bg-slate-100 font-medium py-2.5 rounded text-sm transition disabled:opacity-60"
      >
        {isPending ? "Inscription en cours…" : "Recevoir le magazine"}
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        Désabonnement en 1 clic. Lecture gratuite, sans publicité.
      </p>
    </form>
  );
}
