"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    // TODO : brancher sur l'endpoint newsletter (Resend / Supabase) une fois pret
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="bg-white/10 border border-white/20 rounded p-4 text-center">
        <p className="text-sm text-white">
          ✓ Inscription enregistrée. Vous recevrez le prochain numéro le 1er du mois.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
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
        className="w-full bg-white text-slate-900 hover:bg-slate-100 font-medium py-2.5 rounded text-sm transition"
      >
        Recevoir le magazine
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        Désabonnement en 1 clic. Lecture gratuite, sans publicité.
      </p>
    </form>
  );
}
