export type ConsentCategories = {
  functional: boolean;
  audience: boolean;
};

export type Consent = ConsentCategories & {
  v: 1;
  ts: number;
};

const COOKIE_NAME = "az_consent";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export const CONSENT_OPEN_EVENT = "azimut:open-cookie-prefs";
export const CONSENT_CHANGED_EVENT = "azimut:consent-changed";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)az_consent=([^;]+)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { v?: unknown }).v === 1 &&
      typeof (parsed as { functional?: unknown }).functional === "boolean" &&
      typeof (parsed as { audience?: unknown }).audience === "boolean"
    ) {
      return parsed as Consent;
    }
  } catch {
    /* cookie corrompu : on l'ignore et on redemandera */
  }
  return null;
}

export function writeConsent(cats: ConsentCategories): Consent {
  const consent: Consent = {
    v: 1,
    ts: Math.floor(Date.now() / 1000),
    functional: cats.functional,
    audience: cats.audience,
  };
  if (typeof document === "undefined") return consent;
  const value = encodeURIComponent(JSON.stringify(consent));
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(
    new CustomEvent<Consent>(CONSENT_CHANGED_EVENT, { detail: consent })
  );
  return consent;
}

export function clearConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}
