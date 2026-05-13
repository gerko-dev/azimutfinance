"use client";

import { useActionState } from "react";
import { submitProDemoAction, type ProDemoFormState } from "./actions";

type Props = {
  teamSizes: string[];
  useCases: string[];
  countries: string[];
};

export default function ProDemoForm({ teamSizes, useCases, countries }: Props) {
  const [state, formAction, pending] = useActionState<ProDemoFormState, FormData>(
    submitProDemoAction,
    null,
  );

  if (state && state.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 md:p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 text-2xl mb-3">
          ✓
        </div>
        <div className="text-base font-semibold text-emerald-900">
          Demande envoyée
        </div>
        <p className="text-sm text-emerald-800 mt-2 leading-relaxed">
          Merci. Notre équipe revient vers vous sous 48 h ouvrées à
          l&apos;adresse email indiquée. Vous pouvez aussi nous joindre
          directement à{" "}
          <a
            href="mailto:contact@azimutfinance.com"
            className="text-emerald-900 underline font-medium"
          >
            contact@azimutfinance.com
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="source" value="demande-demo-pro" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Institution" required>
          <input
            type="text"
            name="organization"
            required
            placeholder="Banque, société de gestion…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </Field>
        <Field label="Pays / zone">
          <select
            name="country"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            defaultValue=""
          >
            <option value="">— Sélectionner —</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nom du contact" required>
          <input
            type="text"
            name="contact_name"
            required
            placeholder="Prénom Nom"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </Field>
        <Field label="Fonction">
          <input
            type="text"
            name="contact_role"
            placeholder="DG, Head of Research, CIO…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </Field>

        <Field label="Email professionnel" required>
          <input
            type="email"
            name="email"
            required
            placeholder="contact@institution.com"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </Field>
        <Field label="Téléphone">
          <input
            type="tel"
            name="phone"
            placeholder="+225 …"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </Field>

        <Field label="Taille de l'équipe" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {teamSizes.map((s) => (
              <label
                key={s}
                className="inline-flex items-center gap-2 text-xs border border-slate-300 rounded-full px-3 py-1.5 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 has-[:checked]:text-blue-900"
              >
                <input
                  type="radio"
                  name="team_size"
                  value={s}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Cas d'usage (plusieurs choix possibles)"
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap gap-2">
            {useCases.map((u) => (
              <label
                key={u}
                className="inline-flex items-center gap-2 text-xs border border-slate-300 rounded-full px-3 py-1.5 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 has-[:checked]:text-blue-900"
              >
                <input
                  type="checkbox"
                  name="use_cases"
                  value={u}
                  className="sr-only"
                />
                {u}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Message (optionnel)" className="sm:col-span-2">
          <textarea
            name="message"
            rows={4}
            placeholder="Décrivez brièvement votre besoin, le périmètre souhaité, le calendrier…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
          />
        </Field>
      </div>

      {state && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
        <p className="text-[11px] text-slate-500 max-w-md">
          En soumettant ce formulaire, vous acceptez d&apos;être recontacté
          par notre équipe. Les données sont conservées de façon
          confidentielle.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 transition"
        >
          {pending ? "Envoi…" : "Envoyer la demande"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
