"use client";

import { useMemo, useState, useTransition } from "react";
import { subscribeNewsletterAction } from "@/lib/newsletter/actions";
import { listAllCountries } from "@/lib/countries";

export default function NewsletterForm({
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [pending, startTransition] = useTransition();
  const countries = useMemo(() => listAllCountries(), []);
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; resubscribed: boolean }
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
      if (fullName.trim()) fd.set("full_name", fullName.trim());
      if (country) fd.set("country", country);
      fd.set("source", "newsletter-page");
      const res = await subscribeNewsletterAction(fd);
      if (res.ok) {
        setFeedback({ kind: "ok", resubscribed: res.data.resubscribed });
        if (!res.data.resubscribed) {
          setEmail("");
          setFullName("");
          setCountry("");
        }
      } else {
        setFeedback({ kind: "err", message: res.error });
      }
    });
  }

  if (feedback?.kind === "ok" && !feedback.resubscribed) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center">
        <div className="text-3xl mb-2">✓</div>
        <h3 className="text-base font-semibold text-emerald-900">
          Inscription confirmée !
        </h3>
        <p className="text-sm text-emerald-800 mt-1">
          Tu recevras la prochaine newsletter à ton adresse. Tu peux te désinscrire
          à tout moment via le lien en bas de chaque email.
        </p>
        <button
          type="button"
          onClick={() => setFeedback(null)}
          className="mt-3 text-xs text-emerald-700 hover:underline"
        >
          Inscrire un autre email
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 md:p-6">
      <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-1">
        S&apos;inscrire à la newsletter
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Gratuit · Désinscription en 1 clic · Pas de spam.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Email <span className="text-rose-600">*</span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Prénom / Nom <span className="text-slate-400">(facultatif)</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              disabled={pending}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pays <span className="text-slate-400">(facultatif)</span>
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={pending}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
            >
              <option value="">—</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {pending ? "Inscription…" : "Je m'inscris"}
        </button>

        {feedback?.kind === "ok" && feedback.resubscribed && (
          <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            Cet email était déjà connu — ton abonnement est désormais actif. À bientôt !
          </div>
        )}
        {feedback?.kind === "err" && (
          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            {feedback.message}
          </div>
        )}

        <p className="text-[10px] text-slate-400 leading-relaxed">
          En t&apos;inscrivant, tu acceptes de recevoir nos emails de synthèse de
          marché. Tes données ne sont jamais partagées avec des tiers et tu peux te{" "}
          <a href="/communaute/newsletter/desinscrire" className="underline hover:text-slate-600">
            désinscrire ici
          </a>{" "}
          à tout moment.
        </p>
      </div>
    </div>
  );
}
