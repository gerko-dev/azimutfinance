"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /**
   * Niveau d'abonnement requis. "member" (defaut) propose Inscription /
   * Connexion. "premium" propose un upgrade vers /compte.
   */
  tier?: "member" | "premium";
};

export default function MemberGateDialog({
  open,
  onClose,
  title,
  description,
  tier = "member",
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="text-2xl shrink-0">{tier === "premium" ? "⭐" : "🔓"}</div>
          <div className="min-w-0">
            <h3
              id="member-gate-title"
              className="text-base md:text-lg font-semibold text-slate-900"
            >
              {title}
            </h3>
            <p className="text-sm text-slate-600 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 transition"
          >
            Plus tard
          </button>
          {tier === "premium" ? (
            <Link
              href="/compte"
              className="px-3 py-1.5 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition"
            >
              Passer Premium
            </Link>
          ) : (
            <>
              <Link
                href="/connexion"
                className="px-3 py-1.5 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 transition"
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="px-3 py-1.5 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 transition"
              >
                S&apos;inscrire
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
