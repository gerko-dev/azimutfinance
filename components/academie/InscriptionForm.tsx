"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inscrireFormation } from "@/lib/formations/actions";
import {
  PAYMENT_METHOD_LABEL,
  UEMOA_COUNTRIES,
} from "@/lib/formations";
import type { PaymentMethod } from "@/lib/formations/types";

const PAID_METHODS: PaymentMethod[] = [
  "orange_money",
  "wave",
  "virement",
  "sur_place",
];

export default function InscriptionForm({
  formationId,
  slug,
  isFree,
  priceFcfa,
  initial,
}: {
  formationId: string;
  slug: string;
  isFree: boolean;
  priceFcfa: number;
  initial: {
    fullName: string;
    email: string;
    country: string;
  };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(initial.country);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    isFree ? "gratuit" : "orange_money",
  );
  const [accept, setAccept] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!fullName.trim()) {
      setError("Veuillez renseigner votre nom complet.");
      return;
    }
    if (!email.trim()) {
      setError("Veuillez renseigner votre email.");
      return;
    }
    if (!phone.trim()) {
      setError("Le numéro de téléphone est obligatoire pour vous joindre.");
      return;
    }
    if (!accept) {
      setError("Vous devez accepter les conditions pour finaliser l'inscription.");
      return;
    }

    const fd = new FormData();
    fd.append("formation_id", formationId);
    fd.append("full_name", fullName.trim());
    fd.append("email", email.trim());
    fd.append("phone", phone.trim());
    fd.append("country", country);
    fd.append("payment_method", paymentMethod);

    startTransition(async () => {
      const res = await inscrireFormation(fd);
      if (res.ok) {
        router.push(`/academie/formations/${slug}/inscription/confirmation`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
      {error && (
        <div className="text-xs px-3 py-2 rounded border bg-rose-50 border-rose-200 text-rose-800">
          {error}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Vos coordonnées</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Nom complet *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Téléphone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+225 07 XX XX XX XX"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
            <div className="text-[10px] text-slate-400 mt-1">
              Préférable au format international.
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Pays
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              <option value="">— Choisir —</option>
              {UEMOA_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!isFree && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Mode de paiement</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            Choisissez votre canal. Un membre de l&apos;équipe vous contactera dans les 24 h ouvrées pour valider la réception du paiement.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PAID_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`text-xs px-3 py-2 rounded border transition text-left ${
                  paymentMethod === m
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
            {paymentMethod === "orange_money" && (
              <>
                Vous recevrez par email les instructions Orange Money (numéro
                marchand) pour régler {priceFcfa.toLocaleString("fr-FR")} FCFA.
              </>
            )}
            {paymentMethod === "wave" && (
              <>
                Un lien de paiement Wave vous sera envoyé pour régler{" "}
                {priceFcfa.toLocaleString("fr-FR")} FCFA.
              </>
            )}
            {paymentMethod === "virement" && (
              <>
                Vous recevrez un RIB par email pour effectuer le virement de{" "}
                {priceFcfa.toLocaleString("fr-FR")} FCFA. La place sera réservée
                à réception du paiement.
              </>
            )}
            {paymentMethod === "sur_place" && (
              <>
                Le paiement de {priceFcfa.toLocaleString("fr-FR")} FCFA peut être
                effectué en espèces lors de la première session.
              </>
            )}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          className="accent-slate-900 mt-0.5"
        />
        <span>
          J&apos;accepte d&apos;être contacté par AzimutFinance au sujet de cette
          formation et je certifie que les informations renseignées sont exactes.
        </span>
      </label>

      <div className="pt-3 border-t border-slate-100 flex justify-end">
        <button
          onClick={submit}
          disabled={isPending}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-5 py-2.5 rounded disabled:opacity-50"
        >
          {isPending
            ? "Inscription en cours…"
            : isFree
            ? "Confirmer mon inscription gratuite"
            : "Confirmer mon inscription"}
        </button>
      </div>
    </div>
  );
}
