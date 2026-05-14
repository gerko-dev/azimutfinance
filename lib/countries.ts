/**
 * Liste ISO-3166-1 alpha-2 (~249 codes) avec libellés français résolus
 * via Intl.DisplayNames. Triée alphabétiquement.
 *
 * Utilisable côté client (Intl est dispo dans les navigateurs modernes)
 * comme côté serveur (Node 18+).
 */

const ISO_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK",
  "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
  "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR",
  "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
  "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
  "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
  "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
  "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF",
  "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW",
  "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type Iso2Country = (typeof ISO_CODES)[number];

export type CountryOption = {
  code: Iso2Country;
  label: string;
};

let _cache: CountryOption[] | null = null;

function buildList(): CountryOption[] {
  let resolver: ((code: string) => string | undefined) | null = null;
  try {
    const dn = new Intl.DisplayNames(["fr"], { type: "region" });
    resolver = (c) => dn.of(c) ?? undefined;
  } catch {
    resolver = null;
  }
  const out: CountryOption[] = ISO_CODES.map((code) => ({
    code,
    label: (resolver?.(code) ?? code) as string,
  }));
  out.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return out;
}

/** Liste complète triée alphabétiquement (libellés FR). */
export function listAllCountries(): CountryOption[] {
  if (_cache) return _cache;
  _cache = buildList();
  return _cache;
}

/** Vrai si la chaîne est un code ISO-3166-1 alpha-2 valide. */
export function isValidIso2(code: string): code is Iso2Country {
  return (ISO_CODES as readonly string[]).includes(code);
}
