"use client";

import { useState, useTransition } from "react";
import { unsubscribeNewsletterAction } from "@/lib/newsletter/actions";

export default function UnsubscribeForm({
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; already: boolean }
    | { kind: "err"; message: string }
    | null
  >(null);

  function submit() {
    setFeedback(null);
    if (!email.trim()) {
      setFeedback({ kind: "err", message: "Adresse email requise." });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email.trim());
      const res = await unsubscribeNewsletterAction(fd);
      if (res.ok) {
        setFeedback({ kind: "ok", already: res.data.already });
      } else {
        setFeedback({ kind: "err", message: res.error });
      }
    });
  }

  if (feedback?.kind === "ok") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center">
        <div className="text-3xl mb-2">✓</div>
        <h3 className="text-base font-semibold text-emerald-900">
          {feedback.already
            ? "Aucun abonnement actif trouvé"
            : "Désinscription effectuée"}
        </h3>
        <p className="text-sm text-emerald-800 mt-1">
          {feedback.already
            ? "Cet email n'est pas (ou plus) abonné à la newsletter. Aucune action requise."
            : "Tu ne recevras plus la newsletter. Tu peux toujours te réinscrire plus tard sur la page Newsletter."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 md:p-6">
      <p className="text-sm text-slate-600 mb-4">
        Renseigne l&apos;adresse email avec laquelle tu reçois la newsletter.
        Nous la désactiverons immédiatement.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton.email@exemple.com"
            required
            maxLength={200}
            disabled={pending}
            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60 transition"
        >
          {pending ? "Désinscription…" : "Me désinscrire"}
        </button>
        {feedback?.kind === "err" && (
          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}
