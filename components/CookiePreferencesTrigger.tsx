"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/cookies/consent";

export default function CookiePreferencesTrigger() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT))
      }
      className="hover:text-white"
    >
      Gérer mes cookies
    </button>
  );
}
