"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  readConsent,
  writeConsent,
  CONSENT_OPEN_EVENT,
  type ConsentCategories,
} from "@/lib/cookies/consent";

type Mode = "hidden" | "banner" | "preferences";

const DEFAULT_PREFS: ConsentCategories = { functional: true, audience: true };

export default function CookieConsent() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [prefs, setPrefs] = useState<ConsentCategories>(DEFAULT_PREFS);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setMode("banner");
    } else {
      setPrefs({
        functional: existing.functional,
        audience: existing.audience,
      });
    }

    const onOpen = () => {
      const current = readConsent();
      if (current) {
        setPrefs({
          functional: current.functional,
          audience: current.audience,
        });
      }
      setMode("preferences");
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  if (mode === "hidden") return null;

  const acceptAll = () => {
    writeConsent({ functional: true, audience: true });
    setPrefs({ functional: true, audience: true });
    setMode("hidden");
  };
  const rejectAll = () => {
    writeConsent({ functional: false, audience: false });
    setPrefs({ functional: false, audience: false });
    setMode("hidden");
  };
  const save = () => {
    writeConsent(prefs);
    setMode("hidden");
  };

  if (mode === "banner") {
    return (
      <div
        role="dialog"
        aria-label="Bannière de consentement aux cookies"
        className="fixed inset-x-0 bottom-0 z-50 bg-slate-900 text-slate-100 border-t border-slate-700 shadow-2xl"
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-center gap-4">
          <p className="text-sm leading-relaxed flex-1">
            Nous utilisons des cookies strictement nécessaires au fonctionnement
            du site. Avec votre accord, nous utilisons également des cookies
            fonctionnels et de mesure d&apos;audience.{" "}
            <Link
              href="/legal/cookies"
              className="underline text-blue-300 hover:text-blue-200"
            >
              En savoir plus
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2 md:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={rejectAll}
              className="text-sm px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white transition"
            >
              Tout refuser
            </button>
            <button
              type="button"
              onClick={() => setMode("preferences")}
              className="text-sm px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white transition"
            >
              Personnaliser
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="text-sm px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
            >
              Tout accepter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Préférences cookies"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
    >
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-full overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Préférences cookies
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Activez ou désactivez les catégories ci-dessous. Voir notre{" "}
              <Link
                href="/legal/cookies"
                className="text-blue-700 hover:underline"
              >
                politique de cookies
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("hidden")}
            aria-label="Fermer"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <Category
            title="Strictement nécessaires"
            description="Authentification, sécurité, mémorisation du consentement. Ces cookies ne peuvent pas être désactivés."
            locked
            checked
          />
          <Category
            title="Fonctionnels"
            description="Mémorisation des préférences (marchés favoris, filtres, devises, thème)."
            checked={prefs.functional}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, functional: v }))
            }
          />
          <Category
            title="Mesure d'audience"
            description="Statistiques agrégées sur la fréquentation. Aucun profilage publicitaire."
            checked={prefs.audience}
            onChange={(v) => setPrefs((p) => ({ ...p, audience: v }))}
          />
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={rejectAll}
            className="text-sm px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
          >
            Tout refuser
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="text-sm px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
          >
            Tout accepter
          </button>
          <button
            type="button"
            onClick={save}
            className="text-sm px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function Category({
  title,
  description,
  checked,
  locked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded border transition ${
        locked
          ? "bg-slate-50 border-slate-200 cursor-default"
          : "border-slate-200 hover:border-slate-300 cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 accent-blue-600"
      />
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
          {title}
          {locked && (
            <span className="text-[10px] uppercase font-medium text-slate-500 bg-slate-200 rounded px-1.5 py-0.5">
              Toujours actif
            </span>
          )}
        </div>
        <div className="text-xs text-slate-600 mt-1 leading-relaxed">
          {description}
        </div>
      </div>
    </label>
  );
}
